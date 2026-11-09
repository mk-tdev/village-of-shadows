import * as T from "three";
import { StaticBatch } from "./architecture";
import type { Assets } from "./assets";
import { handLantern, type Cast, type Character } from "./characters";
import { dressAsNun, type NunCostume } from "./nun";
import { ABBEY_TIMING, abbeyActive, advanceAbbey, newAbbey, type AbbeyPhase, type AbbeyState } from "./abbey-story";
import {
  ABBEY, ABBEY_ANCHORS, ABBEY_GATE as gate, ABBEY_GRAVES, ABBEY_WALLS, BELFRY_TOP, BELL, NAVE, OSSUARY, RINGING_GRAVE, TOWER,
  facingPoint, insideAbbey, interiorAt, movePlayer, onBelfry, pickAnchor, supportHeightAt, type Point,
} from "./world";

export type AbbeyCue = "crows" | "bell" | "rope" | "vanish" | "ring" | "hunt" | "banished" | "caught";
type Cue = (name: AbbeyCue, source: Point) => void;
export type AbbeyFrame = { phase: AbbeyPhase; ward: number; bell: "ring" | "silent" | null; interior: number };

const seeded = (i: number, salt = 1) => ((Math.sin(i * 127.1 + salt * 311.7) * 43758.5453) % 1 + 1) % 1;
const stairEnd = TOWER.start + TOWER.count * TOWER.run;

function bellGeometry(scale: number) {
  const profile = [[0, .02], [.2, .02], [.27, -.04], [.31, -.2], [.34, -.48], [.44, -.78], [.55, -.92], [.56, -.98], [.5, -.97], [.42, -.9]]
    .map(([r, y]) => new T.Vector2(r * scale, y * scale));
  return new T.LatheGeometry(profile, 28);
}

/** An optional encounter, entirely local to this walk. No council/session state. */
export function buildAbbey(scene: T.Scene, assets: Assets, cast: Cast) {
  const root = new T.Group(); scene.add(root);
  const batch = new StaticBatch();
  const mat = {
    wall: assets.surface("rustic_stone_wall", { metres: 2.2, color: "#8c928a" }),
    nave: assets.surface("castle_brick_07", { metres: 2, color: "#8e958f" }),
    plaster: assets.surface("worn_mossy_plasterwall", { metres: 2.6, color: "#7c8274" }),
    floor: assets.surface("cobblestone_square", { metres: 1.6, color: "#6f7470" }),
    wood: assets.surface("dark_wooden_planks", { metres: 1.2, color: "#6a5643" }),
    slate: assets.surface("roof_slates_02", { metres: 1.8, color: "#6f777b" }),
    soil: assets.surface("muddy_tracks", { metres: 1.5, color: "#5f574b" }),
  };
  const plain = (color: string, roughness = .9, metalness = 0) => assets.track(new T.MeshStandardMaterial({ color, roughness, metalness }));
  const bronze = plain("#5f4b2e", .42, .75), iron = plain("#18191b", .5, .8), bone = plain("#9d937a", .8), black = plain("#0d0e10", 1);
  const cloth = plain("#cfc8b6", 1), page = plain("#d8cfb4", 1), rope = plain("#4a3d2c", 1);
  const flame = assets.track(new T.MeshStandardMaterial({ color: "#ffcf86", emissive: "#ffb257", emissiveIntensity: 2.6 }));
  const glassCold = assets.track(new T.MeshStandardMaterial({ color: "#0b1622", emissive: "#2f4b63", emissiveIntensity: .45 }));
  const glassRed = assets.track(new T.MeshStandardMaterial({ color: "#1d0b10", emissive: "#7a2734", emissiveIntensity: .8 }));
  const lamps: T.Vector3[] = [];
  const glows: { position: T.Vector3; color: T.Color; size: number }[] = [];

  function candles(x: number, y: number, z: number, count = 3, site = true) {
    for (let i = 0; i < count; i++) {
      const ox = (seeded(i + x, 3) - .5) * .28, oz = (seeded(i + z, 4) - .5) * .28, h = .14 + seeded(i + x + z, 5) * .2;
      batch.cylinder(cloth, .025, .028, h, [x + ox, y + h / 2, z + oz], 6);
      batch.add(flame, new T.SphereGeometry(.022, 6, 4).scale(1, 1.8, 1), [x + ox, y + h + .03, z + oz]);
    }
    if (site) lamps.push(new T.Vector3(x, y + .5, z));
  }

  // --- The fork: a crooked fingerpost hung with a small bell.
  batch.box(mat.wood, [.22, 2.4, .22], [-45, 1.2, -71], [0, 0, .05]);
  batch.box(mat.wood, [1.6, .28, .1], [-45.6, 1.95, -71], [0, .3, .12]);
  batch.box(iron, [.04, .3, .04], [-46.1, 1.62, -71.2]);
  batch.add(bronze, bellGeometry(.28), [-46.1, 1.48, -71.2]);
  candles(-45, 2.4, -71, 1);

  // --- The sisters' cemetery: headstones and crosses, a bell on a post for every third grave.
  const graveBells: { pivot: T.Group; source: Point; start: number; ringing: boolean }[] = [];
  ABBEY_GRAVES.forEach((g, i) => {
    const special = g === RINGING_GRAVE;
    const lean = (seeded(i, 7) - .5) * .22;
    if (special) {
      batch.add(mat.soil, new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(.62, .28, 1.05), [g.x, 0, g.z]);
      batch.box(mat.wood, [.09, 1.45, .09], [g.x, .72, g.z - .95]);
      batch.box(mat.wood, [.6, .09, .09], [g.x, 1.12, g.z - .95]);
    } else if (seeded(i, 8) < .45) {
      batch.box(mat.wall, [.95, .18, 1.75], [g.x, .09, g.z]);
      batch.add(mat.wall, new T.CylinderGeometry(.36, .36, .15, 14, 1, false, 0, Math.PI), [g.x, .82, g.z - .62], [Math.PI / 2 + lean, 0, 0]);
      batch.box(mat.wall, [.72, .82, .15], [g.x, .41, g.z - .62], [lean, 0, 0]);
    } else {
      batch.box(mat.wood, [.08, 1.25, .08], [g.x, .6, g.z - .6], [lean, 0, lean * .5]);
      batch.box(mat.wood, [.52, .08, .08], [g.x, .92, g.z - .6], [lean, 0, lean * .5]);
      batch.add(mat.soil, new T.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(.45, .14, .85), [g.x, 0, g.z]);
    }
    if (!special && i % 3 !== 1) return;
    const px = g.x + (g.x < -53 ? .5 : -.5);
    batch.box(mat.wood, [.08, 1.85, .08], [px, .92, g.z + .55]);
    batch.box(mat.wood, [.46, .07, .07], [px + (g.x < -53 ? -.2 : .2), 1.82, g.z + .55]);
    const pivot = new T.Group(); pivot.position.set(px + (g.x < -53 ? -.38 : .38), 1.78, g.z + .55); root.add(pivot);
    const b = new StaticBatch();
    b.add(bronze, bellGeometry(.22), [0, 0, 0]);
    b.cylinder(rope, .008, .008, 1.55, [0, -.9, 0], 4);
    b.build(pivot);
    graveBells.push({ pivot, source: g, start: -Infinity, ringing: special });
  });

  // --- Gatehouse: dressed arch, turret caps, lit niches and the gate leaves thrown open.
  const { x, z } = gate;
  for (const side of [-1, 1]) {
    batch.add(mat.slate, new T.ConeGeometry(2.6, 3.6, 4), [x + 4 * side, 8.6, z], [0, Math.PI / 4, 0]);
    batch.box(mat.wall, [.9, 1.3, .2], [x + 4 * side, 5.2, z + 1.85]);
    candles(x + 4 * side, 4.55, z + 1.95, 2);
    const hinge = new T.Matrix4().makeTranslation(x + side * 2.5, 0, z - .3).multiply(new T.Matrix4().makeRotationY(side * -1.25));
    for (let k = 0; k < 9; k++) batch.box(iron, [.05, 3.6, .05], [-side * (.15 + k * .27), 1.8, 0], undefined, hinge);
    for (const y of [.4, 1.8, 3.3]) batch.box(iron, [2.4, .07, .07], [-side * 1.2, y, 0], undefined, hinge);
  }
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * i / 16;
    batch.box(mat.wall, [.56, .82, 2], [x + 2.75 * Math.cos(a), 4 + 2.75 * Math.sin(a), z], [0, 0, a - Math.PI / 2]);
  }
  batch.box(mat.wood, [6, .3, .34], [x, 5.9, z + .85]);
  batch.cylinder(rope, .02, .02, .55, [x + .4, 5.62, z + .85], 5);

  // --- Compound, nave, ossuary, sisters' walk and belfry stair from the shared collision data.
  for (const w of ABBEY_WALLS) {
    if (w.kind === "pew") {
      const back = w.z < NAVE.z + 9 ? -1 : 1;
      batch.box(mat.wood, [w.w, .08, .42], [w.x, .46, w.z]);
      batch.box(mat.wood, [w.w, .55, .07], [w.x, .74, w.z + back * .3]);
      for (const s of [-1, 1]) batch.box(mat.wood, [.07, .95, .7], [w.x + s * (w.w / 2 - .05), .47, w.z]);
      continue;
    }
    if (w.kind === "altar") {
      batch.box(w.x < -60 ? bone : mat.nave, [w.w, w.h, w.d], [w.x, w.h / 2, w.z]);
      if (w.x > -60) batch.box(cloth, [w.w + .1, .03, w.d + .1], [w.x, w.h + .015, w.z]);
      continue;
    }
    const material = w.kind === "outer" ? mat.wall : w.kind === "ossuary" ? mat.plaster : mat.nave;
    if (w.kind === "stair" && w.w > w.d) {
      // Solid along the stair; the belfry landing opens to the night above a parapet.
      const x0 = w.x - w.w / 2, closed = stairEnd - x0;
      batch.box(material, [closed, w.h, w.d], [x0 + closed / 2, w.h / 2, w.z], undefined, undefined, w.x * .37);
      const open = w.w - closed, ox = stairEnd + open / 2;
      batch.box(material, [open, BELFRY_TOP + 1.1, w.d], [ox, (BELFRY_TOP + 1.1) / 2, w.z]);
      batch.box(material, [open, .9, w.d + .1], [ox, w.h - .45, w.z]);
      for (const px of [stairEnd + .2, stairEnd + open - .2]) batch.box(material, [.45, w.h, w.d + .1], [px, w.h / 2, w.z]);
      continue;
    }
    batch.box(material, [w.w, w.h, w.d], [w.x, w.h / 2, w.z], undefined, undefined, w.x * .37);
    if (w.kind === "outer") {
      const along = w.w > w.d, length = Math.max(w.w, w.d);
      for (let k = 0; k < length; k += 1.6) batch.box(mat.wall, along ? [.8, .55, w.d + .1] : [w.w + .1, .55, .8], [along ? w.x - length / 2 + k + .4 : w.x, w.h + .27, along ? w.z : w.z - length / 2 + k + .4]);
    }
  }
  // Lintels close the doorways above head height.
  batch.box(mat.nave, [3.4, NAVE.h - 3.4, .8], [NAVE.x, 3.4 + (NAVE.h - 3.4) / 2, NAVE.z + NAVE.d / 2]);
  batch.box(mat.nave, [.8, NAVE.h - 3, 3.4], [NAVE.x - NAVE.w / 2, 3 + (NAVE.h - 3) / 2, OSSUARY.z]);
  batch.box(mat.nave, [.8, NAVE.h - 4.2, 3.8], [NAVE.x + NAVE.w / 2, 4.2 + (NAVE.h - 4.2) / 2, TOWER.z]);
  batch.box(mat.wood, [1.4, 2.8, .1], [NAVE.x - .75, 1.4, NAVE.z + NAVE.d / 2 + .5], [0, -1.1, 0]);
  batch.box(mat.wood, [1.4, 2.8, .1], [NAVE.x + 1.6, 1.4, NAVE.z + NAVE.d / 2 + .9], [0, .5, 0]);
  // Ossuary vault: a low barrel roof.
  batch.add(mat.plaster, new T.CylinderGeometry(OSSUARY.d / 2 + .3, OSSUARY.d / 2 + .3, OSSUARY.w + .6, 18, 1, true, -Math.PI / 2, Math.PI), [OSSUARY.x - .1, OSSUARY.h - .4, OSSUARY.z], [0, 0, Math.PI / 2]);
  batch.box(mat.slate, [OSSUARY.w + .8, .3, OSSUARY.d + 1], [OSSUARY.x - .1, OSSUARY.h + OSSUARY.d / 2 - .2, OSSUARY.z]);
  // Floors under roofs.
  batch.box(mat.floor, [NAVE.w, .06, NAVE.d], [NAVE.x, .01, NAVE.z]);
  batch.box(mat.floor, [OSSUARY.w, .06, OSSUARY.d], [OSSUARY.x, .01, OSSUARY.z]);
  batch.box(mat.floor, [TOWER.start - NAVE.x - NAVE.w / 2, .06, TOWER.width + .4], [(NAVE.x + NAVE.w / 2 + TOWER.start) / 2, .01, TOWER.z]);
  // Nave roof: steep slate gable along the nave, with gable ends.
  const pitch = .62, half = NAVE.w / 2 + .6, rise = (NAVE.w / 2) * Math.tan(pitch), length = half / Math.cos(pitch);
  for (const s of [-1, 1]) batch.box(mat.slate, [length, .24, NAVE.d + 1.2], [NAVE.x + s * half / 2, NAVE.h + rise - half * Math.tan(pitch) / 2 + .12, NAVE.z], [0, 0, -s * pitch]);
  const gableShape = new T.Shape(); gableShape.moveTo(-NAVE.w / 2, 0); gableShape.lineTo(NAVE.w / 2, 0); gableShape.lineTo(0, rise); gableShape.closePath();
  for (const gz of [NAVE.z - NAVE.d / 2 - .4, NAVE.z + NAVE.d / 2 - .4]) batch.add(mat.nave, new T.ExtrudeGeometry(gableShape, { depth: .8, bevelEnabled: false }), [NAVE.x, NAVE.h, gz]);
  batch.box(mat.wood, [.3, .3, NAVE.d + 1.2], [NAVE.x, NAVE.h + rise + .1, NAVE.z]);
  for (let k = 0; k < 6; k++) batch.box(mat.wood, [NAVE.w, .22, .22], [NAVE.x, NAVE.h - .4, NAVE.z - NAVE.d / 2 + 1.5 + k * 3]);
  // Bell-cote over the nave door and rose window above the altar.
  batch.box(mat.nave, [1.6, 2.6, 1.2], [NAVE.x, NAVE.h + rise + 1, NAVE.z + NAVE.d / 2 - .6]);
  batch.add(mat.slate, new T.ConeGeometry(1.3, 1.8, 4), [NAVE.x, NAVE.h + rise + 3.1, NAVE.z + NAVE.d / 2 - .6], [0, Math.PI / 4, 0]);
  batch.add(glassRed, new T.CircleGeometry(1.4, 24), [NAVE.x, 6.2, NAVE.z - NAVE.d / 2 + .42]);
  for (let k = 0; k < 8; k++) batch.box(mat.nave, [.1, 2.8, .1], [NAVE.x, 6.2, NAVE.z - NAVE.d / 2 + .45], [0, 0, k * Math.PI / 8]);
  glows.push({ position: new T.Vector3(NAVE.x, 6.2, NAVE.z - NAVE.d / 2 + 1.2), color: new T.Color("#9a3445"), size: 3.2 });
  // Tall lancet windows along both sides, glowing faintly with moonlight.
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
    const wz = NAVE.z + NAVE.d / 2 - 3 - k * 4, wx = NAVE.x + side * (NAVE.w / 2 - .42);
    if (side > 0 && Math.abs(wz - TOWER.z) < 2.6) continue;
    for (const face of [0, side * .84]) batch.box(glassCold, [.06, 2.8, .9], [wx + face, 4.2, wz]);
    batch.add(glassCold, new T.CylinderGeometry(.45, .45, .06, 12, 1, false, 0, Math.PI), [wx, 5.6, wz], [Math.PI / 2, Math.PI / 2, 0]);
    batch.box(mat.nave, [.5, NAVE.h, .5], [wx - side * .1, NAVE.h / 2, wz + 2]);
  }
  // Altar dressing: plain wooden cross, candles, lectern with the open register.
  batch.box(mat.wood, [.16, 2.6, .12], [NAVE.x, 3.1, NAVE.z - NAVE.d / 2 + .5]);
  batch.box(mat.wood, [1.3, .16, .12], [NAVE.x, 3.8, NAVE.z - NAVE.d / 2 + .5]);
  candles(NAVE.x - 1.1, 1.1, NAVE.z - NAVE.d / 2 + 1.5, 5); candles(NAVE.x + 1.1, 1.1, NAVE.z - NAVE.d / 2 + 1.5, 5, false);
  for (const s of [-1, 1]) { batch.cylinder(iron, .04, .12, 1.4, [NAVE.x + s * 2.4, .7, NAVE.z - NAVE.d / 2 + 2], 6); candles(NAVE.x + s * 2.4, 1.4, NAVE.z - NAVE.d / 2 + 2, 4, s < 0); }
  candles(NAVE.x - 5.6, 0, NAVE.z + 3, 6); candles(NAVE.x + 5.6, 0, NAVE.z - 5, 5);
  const lectern = new T.Matrix4().makeTranslation(NAVE.x + .9, 0, NAVE.z - 5.2).multiply(new T.Matrix4().makeRotationY(-.4));
  batch.cylinder(mat.wood, .06, .09, 1.05, [0, .52, 0], 6, undefined, lectern);
  batch.box(mat.wood, [.55, .05, .42], [0, 1.08, 0], [-.35, 0, 0], lectern);
  const book = new T.Group(); book.position.set(NAVE.x + .9, 1.15, NAVE.z - 5.2); book.rotation.set(-.35, -.4, 0, "YXZ"); root.add(book);
  const bookBatch = new StaticBatch();
  for (const s of [-1, 1]) bookBatch.box(page, [.22, .025, .3], [s * .115, 0, 0], [0, 0, s * .06]);
  bookBatch.build(book);

  // --- Ossuary: skulls stacked in wall niches, a bone altar and the stolen clapper.
  const skull = new T.SphereGeometry(.11, 10, 8).scale(1, .92, 1.12);
  const skulls: T.Matrix4[] = [];
  const ox0 = OSSUARY.x - OSSUARY.w / 2 + .35, ox1 = OSSUARY.x + OSSUARY.w / 2 - .45;
  for (let row = 0; row < 7; row++) for (let k = 0; k < 26; k++) {
    const y = .25 + row * .24;
    const t = k / 25;
    for (const zSide of [-1, 1]) {
      const sx = ox0 + t * (ox1 - ox0), sz = OSSUARY.z + zSide * (OSSUARY.d / 2 - .38);
      skulls.push(new T.Matrix4().compose(new T.Vector3(sx, y, sz), new T.Quaternion().setFromEuler(new T.Euler(0, zSide > 0 ? Math.PI : 0, (seeded(row * 31 + k, 2) - .5) * .3)), new T.Vector3(1, 1, 1)));
    }
  }
  // The bone altar's face is built of skulls too.
  for (let row = 0; row < 4; row++) for (let k = 0; k < 9; k++) skulls.push(new T.Matrix4().compose(new T.Vector3(OSSUARY.x - 2.4 + .58, .14 + row * .24, OSSUARY.z - 1.05 + k * .26), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2), new T.Vector3(1, 1, 1)));
  const skullMesh = new T.InstancedMesh(skull, bone, skulls.length);
  const socket = new T.SphereGeometry(.03, 6, 5).scale(1, 1.15, .7);
  const sockets = new T.InstancedMesh(socket, black, skulls.length * 3);
  const local = [new T.Matrix4().makeTranslation(-.038, .015, .1), new T.Matrix4().makeTranslation(.038, .015, .1), new T.Matrix4().makeScale(.6, .8, .6).premultiply(new T.Matrix4().makeTranslation(0, -.035, .115))];
  skulls.forEach((m, i) => {
    const s = .85 + seeded(i, 9) * .3; m.multiply(new T.Matrix4().makeScale(s, s, s));
    skullMesh.setMatrixAt(i, m); local.forEach((l, j) => sockets.setMatrixAt(i * 3 + j, m.clone().multiply(l)));
  });
  skullMesh.castShadow = skullMesh.receiveShadow = true; root.add(skullMesh, sockets);
  for (let row = 0; row < 8; row++) for (const zSide of [-1, 1]) batch.box(mat.wood, [ox1 - ox0 + .3, .05, .32], [(ox0 + ox1) / 2, .12 + row * .24, OSSUARY.z + zSide * (OSSUARY.d / 2 - .4)]);
  for (let k = 0; k < 40; k++) batch.cylinder(bone, .025, .03, .5, [OSSUARY.x - 2.4 + (seeded(k, 1) - .5) * .9, 1.07 + (k % 4) * .06, OSSUARY.z + (seeded(k, 2) - .5) * 2.1], 5, [0, seeded(k, 3) * 3, Math.PI / 2]);
  candles(OSSUARY.x - 2.4, 1.05, OSSUARY.z - .9, 3); candles(OSSUARY.x + 2.2, 0, OSSUARY.z + 3, 2, false);
  const clapper = new T.Group(); clapper.position.set(OSSUARY.x - 2.3, 1.12, OSSUARY.z); clapper.rotation.z = Math.PI / 2; root.add(clapper);
  const cb = new StaticBatch();
  cb.cylinder(iron, .03, .03, .62, [0, 0, 0], 6); cb.add(iron, new T.SphereGeometry(.09, 10, 8), [0, -.34, 0]);
  cb.add(cloth, new T.SphereGeometry(.16, 8, 6).scale(1, .3, 1.4), [0, .1, 0]); cb.build(clapper);

  // --- Sisters' walk: arcade piers and arches toward the courtyard, then the stair.
  for (const w of ABBEY_WALLS.filter(w => w.kind === "pier")) {
    const arch = new T.QuadraticBezierCurve3(new T.Vector3(w.x - 2.75 + .35, 3.2, w.z), new T.Vector3(w.x - 1.375, 4.6, w.z), new T.Vector3(w.x - .35, 3.2, w.z));
    batch.add(mat.nave, new T.TubeGeometry(arch, 10, .2, 5, false), [0, 0, 0]);
  }
  batch.box(mat.slate, [TOWER.start - NAVE.x - NAVE.w / 2 + .4, .2, TOWER.width + 1.8], [(NAVE.x + NAVE.w / 2 + TOWER.start) / 2, ABBEY_WALLS.find(w => w.kind === "hall")!.h + .45, TOWER.z - .1], [-.18, 0, 0]);
  // Stair treads, roof and the belfry openings above the landing.
  const top = BELFRY_TOP;
  for (let i = 0; i < TOWER.count; i++) {
    const h = (i + 1) * TOWER.rise, sx = TOWER.start + (i + .5) * TOWER.run;
    batch.box(mat.nave, [TOWER.run, h, TOWER.width], [sx, h / 2, TOWER.z]);
    if (i % 6 === 3) candles(sx, h, TOWER.z + TOWER.width / 2 - .25, 2, i % 12 === 3);
  }
  batch.box(mat.nave, [TOWER.landing, top, TOWER.width], [stairEnd + TOWER.landing / 2, top / 2, TOWER.z]);
  batch.box(mat.slate, [stairEnd - TOWER.start + .6, .25, TOWER.width + 1.2], [(TOWER.start + stairEnd) / 2, top + 4.6, TOWER.z]);
  batch.add(mat.slate, new T.ConeGeometry(3.6, 4.4, 4), [stairEnd + TOWER.landing / 2, top + 7.4, TOWER.z], [0, Math.PI / 4, 0]);
  for (let k = 0; k < 5; k++) batch.box(glassCold, [.4, .9, .06], [TOWER.start + 1.5 + k * 2.1, 1.6 + k * 1.15, TOWER.z - TOWER.width / 2 - .02]);
  // The bell, hung from a beam; its clapper is restored once the player has found it.
  batch.box(mat.wood, [TOWER.landing + .4, .35, .35], [BELL.x, BELL.y + .25, BELL.z]);
  const bellPivot = new T.Group(); bellPivot.position.set(BELL.x, BELL.y, BELL.z); root.add(bellPivot);
  const bb = new StaticBatch(); bb.add(bronze, bellGeometry(1.25), [0, 0, 0]); bb.build(bellPivot);
  const bellTongue = new T.Group(); bellPivot.add(bellTongue);
  const tb = new StaticBatch(); tb.cylinder(iron, .035, .035, .9, [0, -.5, 0], 6); tb.add(iron, new T.SphereGeometry(.1, 10, 8), [0, -.98, 0]); tb.build(bellTongue);
  batch.cylinder(rope, .015, .015, 3.4, [BELL.x + 1.1, top + 1.9, BELL.z + 1.45], 5);
  candles(stairEnd + .3, top, TOWER.z - 1.4, 3);
  batch.build(root);

  // --- Crows on headstones, crosses and bell posts; they burst into the air together.
  const birds = ABBEY_GRAVES.filter((_, i) => i % 3 === 0).slice(0, 8).map((g, i) => {
    const home = new T.Vector3(g.x + (seeded(i, 1) - .5) * .4, .92 + seeded(i, 2) * .3, g.z - .6);
    const bird = new T.Group(); root.add(bird);
    const b = new StaticBatch();
    b.add(black, new T.SphereGeometry(.15, 9, 7).scale(.7, .8, 1.5), [0, .12, 0]);
    b.add(black, new T.SphereGeometry(.085, 8, 7), [0, .24, .15]);
    b.add(bronze, new T.ConeGeometry(.03, .12, 5), [0, .23, .26], [Math.PI / 2, 0, 0]);
    b.box(black, [.12, .03, .22], [0, .1, -.24], [.25, 0, 0]);
    b.build(bird);
    const wings = [-1, 1].map(s => {
      const wing = new T.Group(); wing.position.set(s * .07, .15, 0); bird.add(wing);
      const w = new StaticBatch(); w.add(black, new T.SphereGeometry(1, 7, 5).scale(.24, .025, .11), [s * .2, 0, -.03]); w.build(wing); return wing;
    });
    return { bird, home, wings, yaw: seeded(i, 3) * 6.28 };
  });

  // --- The sisters: one hanged at the gate, one who keeps the bell.
  const hangedRoot = new T.Group(); hangedRoot.position.set(x + .4, 0, z + .85); root.add(hangedRoot);
  const keeperRoot = new T.Group(); keeperRoot.visible = false; root.add(keeperRoot);
  const keeperLight = new T.PointLight(0xffb06a, 0, 5.5, 1.6); root.add(keeperLight);
  let hanged: Character | null = null, keeper: Character | null = null, hangedCostume: NunCostume | null = null, keeperCostume: NunCostume | null = null, keeperLamp: T.Group | null = null;
  let disposed = false;
  const keeperFlame = assets.track(new T.MeshStandardMaterial({ color: "#3a2410", emissive: "#d98a3e", emissiveIntensity: 1.1 }));
  const lampMaterials = { iron, glow: keeperFlame };
  void Promise.all([cast.spawn("villager_woman_a", 1.7), cast.spawn("villager_woman_b", 1.78)]).then(([a, b]) => {
    if (disposed) { a.dispose(); b.dispose(); return; }
    hanged = a; keeper = b;
    hangedRoot.add(a.root); keeperRoot.add(b.root);
    a.sample("Idle_Loop", .3);
    hangedCostume = dressAsNun(a, { faceVeil: true });
    b.play("Idle_Lantern_Loop", 0); b.mixer.update(0);
    keeperCostume = dressAsNun(b, { faceVeil: true });
    keeperLamp = handLantern(lampMaterials);
    b.attach("hand_r", keeperLamp, new T.Vector3(0, -.12, 0));
  }).catch(() => { /* The abbey still works without its sisters. */ });

  let state: AbbeyState = newAbbey();
  let keeperPos: Point & { y: number } = { x: TOWER.start + .4, z: TOWER.z, y: 0 };
  let previousSightings = 0, previousPhase: AbbeyPhase = "dormant", lastT = 0, flight = -Infinity, ropeCut = false;
  const gaze = new T.Vector3(), forward = new T.Vector3(0, 0, 1), right = new T.Vector3(1, 0, 0);
  const bellSwing = { start: -Infinity };

  function reset() {
    state = newAbbey(); previousSightings = 0; previousPhase = "dormant"; flight = -Infinity; ropeCut = false; bellSwing.start = -Infinity;
    graveBells.forEach(b => { b.start = -Infinity; });
    keeperRoot.visible = false; hangedRoot.visible = true;
  }

  /**
   * Advance the abbey for one frame. Returns UI-facing state. `ring` is the
   * player's request to ring the bell (only honoured on the belfry with the clapper).
   */
  function update(t: number, input: { p: Point; height: number; yaw: number; running: boolean; reduced: boolean; lantern: boolean; playing: boolean; found: readonly string[]; ring: boolean }, cue: Cue): AbbeyFrame {
    const { p, height, yaw, reduced } = input;
    const dt = Math.min(.05, Math.max(0, t - lastT)); lastT = t;
    const near = p.x < -38 && p.z < -66;
    root.visible = near || insideAbbey(p);
    const hasClapper = input.found.includes("clapper");
    clapper.visible = !hasClapper;
    bellTongue.visible = hasClapper;
    const belfry = onBelfry(p, height);
    if (!root.visible) return { phase: state.phase, ward: 0, bell: null, interior: 0 };

    // Story clock.
    const keeperVisible = state.phase === "stalking" ? state.hidden === 0 : abbeyActive(state.phase) && state.phase === "hunting";
    const target = state.phase === "hunting" ? keeperPos : ABBEY_ANCHORS[state.anchor];
    const heightGap = Math.abs((state.phase === "hunting" ? keeperPos.y : 0) - height);
    const lit = input.lantern && keeperVisible && heightGap < 2.5 && facingPoint(p, yaw, target, state.phase === "hunting" ? 10 : 15, .78);
    const distance = Math.hypot(target.x - p.x, target.z - p.z) + (heightGap > 1.5 ? 10 : 0);
    const wantsRing = input.ring && belfry && hasClapper && state.phase === "stalking";
    state = advanceAbbey(state, dt, {
      playing: input.playing, inside: insideAbbey(p) && p.z < -103.5, lit, distance, ring: wantsRing, escaped: !insideAbbey(p),
      nextAnchor: () => pickAnchor(p, yaw, state.anchor),
    });
    if (state.phase !== previousPhase) {
      if (state.phase === "stalking" && previousPhase === "dormant") cue("rope", gate);
      if (state.phase === "tolling") { cue("ring", BELL); bellSwing.start = t; graveBells.forEach(b => { b.start = t + seeded(b.source.z, 2) * 1.5; }); }
      if (state.phase === "hunting") { keeperPos = { x: TOWER.start + .4, z: TOWER.z, y: 0 }; cue("hunt", keeperPos); }
      if (state.phase === "banished") { cue("banished", keeperPos); flight = t; }
      if (state.phase === "caught") cue("caught", p);
      previousPhase = state.phase;
    }
    if (state.sightings !== previousSightings) { previousSightings = state.sightings; cue("vanish", target); }

    // The hanged sister vanishes from the rope once the Keeper begins to walk.
    if (state.phase !== "dormant") ropeCut = true;
    hangedRoot.visible = !ropeCut;
    if (hanged && hangedRoot.visible) {
      hanged.sample("Idle_Loop", .3);
      // Rope at the neck: head lolls sideways, arms hang limp.
      hanged.turnBone("neck_01", forward, .55); hanged.turnBone("Head", right, .35);
      hanged.turnBone("upperarm_l", forward, -.35); hanged.turnBone("upperarm_r", forward, .35);
      hangedRoot.position.y = 5.62 - 1.62;
      hangedRoot.rotation.set(0, reduced ? .4 : .4 + Math.sin(t * .31) * .35, reduced ? 0 : Math.sin(t * .9) * .035);
      hangedCostume?.update(t, true);
    }

    // The Keeper.
    if (keeper) {
      if (state.phase === "hunting") {
        const dx = p.x - keeperPos.x, dz = p.z - keeperPos.z, d = Math.hypot(dx, dz);
        const speed = lit ? (d < 3.2 ? -.9 : 0) : 1.55;
        if (d > .05 && input.playing) {
          const next = movePlayer(keeperPos, dx / d * speed * dt, dz / d * speed * dt, [], keeperPos.y);
          keeperPos = { ...next, y: supportHeightAt(next) };
        }
        keeper.play(speed > 0 ? "Walk_Formal_Loop" : "Idle_Lantern_Loop", .4, false, .55);
        keeperRoot.position.set(keeperPos.x, keeperPos.y, keeperPos.z);
        keeperRoot.rotation.y = Math.atan2(dx, dz);
      } else if (state.phase === "stalking") {
        const a = ABBEY_ANCHORS[state.anchor];
        keeperRoot.position.set(a.x, 0, a.z);
        keeperRoot.rotation.y = a.yaw;
        keeper.play("Idle_Lantern_Loop", 0);
      }
      keeperRoot.visible = keeperVisible;
      if (keeperVisible) {
        keeper.mixer.update(input.playing && !reduced ? dt : 0);
        keeper.lookAt(gaze.set(p.x, height + 1.6, p.z), Math.max(dt, .016), 1.25);
        keeperCostume?.update(t, reduced, state.phase === "hunting" ? 1 : 0);
        keeperLamp?.getWorldPosition(keeperLight.position);
        keeperLight.intensity = 1.6 + (reduced ? 0 : Math.sin(t * 9) * .3);
      } else keeperLight.intensity = 0;
    }

    // Grave bells: a single tug as you pass; all of them, wildly, once the tower bell rings.
    graveBells.forEach(b => {
      const d = Math.hypot(b.source.x - p.x, b.source.z - p.z);
      if (!Number.isFinite(b.start) && d < 3.6 && state.phase !== "tolling") { b.start = t; cue("bell", b.source); }
      const age = t - b.start;
      const storm = (state.phase === "tolling" || state.phase === "hunting") && age > 0;
      const amp = b.ringing && state.phase === "dormant" ? .18 + Math.sin(t * .7) * .1 : storm ? .7 : Number.isFinite(b.start) && age > 0 ? .6 * Math.exp(-age * 1.3) : 0;
      b.pivot.rotation.z = reduced ? 0 : amp * Math.sin((Number.isFinite(age) ? age : t) * (b.ringing ? 11 : 9) + b.source.z);
    });
    // The tower bell swings when rung.
    const bellAge = t - bellSwing.start;
    bellPivot.rotation.z = reduced || !Number.isFinite(bellSwing.start) ? 0 : .5 * Math.exp(-bellAge * .35) * Math.sin(bellAge * 2.6);

    // Crows burst from the graves when approached, and again when the Keeper is banished.
    const birdsHome = birds[3].home;
    if (!Number.isFinite(flight) && Math.hypot(birdsHome.x - p.x, birdsHome.z - p.z) < (input.running ? 9 : 5)) { flight = t; cue("crows", birdsHome); }
    birds.forEach(({ bird, home, wings, yaw: y0 }, i) => {
      const f = Number.isFinite(flight) ? Math.max(0, t - flight - i * .07) : 0;
      const from = state.phase === "banished" ? new T.Vector3(keeperPos.x, keeperPos.y + 1.4, keeperPos.z) : home;
      bird.visible = f < 5 && !(reduced && f > 0);
      if (!bird.visible) return;
      bird.position.copy(from);
      if (f > 0) { bird.position.x += Math.sin(i * 2.3) * f * 3; bird.position.y += f * (2.2 + i * .2); bird.position.z += Math.cos(i * 1.7) * f * 3; }
      bird.rotation.y = f ? i * .8 : y0 + (reduced ? 0 : Math.sin(t * .6 + i) * .4);
      wings.forEach((w, j) => { w.rotation.z = (j ? 1 : -1) * (f ? Math.sin(f * 18 + i) * .9 : -.15); });
    });
    return {
      phase: state.phase,
      ward: state.phase === "hunting" ? state.light / ABBEY_TIMING.ward : 0,
      bell: belfry && (state.phase === "stalking" || state.phase === "dormant") ? (hasClapper ? "ring" : "silent") : null,
      interior: interiorAt(p),
    };
  }

  return {
    lamps, glows, reset, update,
    /** Retry after being caught: back on the landing, the Keeper at the foot of the stair. */
    retry() { state = { ...newAbbey(), phase: "hunting" }; previousPhase = "hunting"; keeperPos = { x: TOWER.start + .4, z: TOWER.z, y: 0 }; },
    /** Dev-only: show the Keeper standing at an anchor. */
    debugStalk(anchor: number) { state = { ...newAbbey(), phase: "stalking", anchor }; previousPhase = "stalking"; ropeCut = true; },
    obstacles(): (Point & { radius: number })[] { return state.phase === "hunting" ? [{ x: keeperPos.x, z: keeperPos.z, radius: .4 }] : []; },
    dispose() {
      disposed = true; hangedCostume?.dispose(); keeperCostume?.dispose(); hanged?.dispose(); keeper?.dispose();
      skullMesh.dispose(); sockets.dispose(); skull.dispose(); socket.dispose(); scene.remove(root);
    },
  };
}
export { ABBEY };
