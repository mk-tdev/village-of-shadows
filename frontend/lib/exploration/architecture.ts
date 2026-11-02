import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Assets } from "./assets";
import { BUILDINGS, CHAPEL, FENCES, GRAVES, GRAVEYARD, STALLS, WALLS, BOUNDS, PADDOCK, type Building } from "./world";

const seeded = (i: number, salt = 1) => ((Math.sin(i * 127.1 + salt * 311.7) * 43758.5453) % 1 + 1) % 1;
const FACING = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 } as const;

/**
 * Accumulates static geometry per material and merges it once. UVs are
 * box-projected in local metres before transformation, so every tiled PBR
 * surface keeps a consistent texel density without hand UV work.
 */
export class StaticBatch {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  add(material: THREE.Material, source: THREE.BufferGeometry, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0], parent?: THREE.Matrix4, uvOffset = 0) {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    const pos = geometry.getAttribute("position"), nor = geometry.getAttribute("normal");
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      let u: number, v: number;
      if (ay >= ax && ay >= az) { u = pos.getX(i); v = pos.getZ(i); }
      else if (ax >= az) { u = pos.getZ(i); v = pos.getY(i); }
      else { u = pos.getX(i); v = pos.getY(i); }
      uv[i * 2] = u + uvOffset; uv[i * 2 + 1] = v + uvOffset * .37;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.m.compose(this.p.set(...position), this.q.setFromEuler(this.e.set(...rotation, "YXZ")), this.s.set(1, 1, 1));
    if (parent) this.m.premultiply(parent);
    geometry.applyMatrix4(this.m);
    for (const name of Object.keys(geometry.attributes)) if (!["position", "normal", "uv"].includes(name)) geometry.deleteAttribute(name);
    const list = this.buckets.get(material) ?? [];
    list.push(geometry); this.buckets.set(material, list);
  }

  box(material: THREE.Material, size: [number, number, number], position: [number, number, number], rotation?: [number, number, number], parent?: THREE.Matrix4, uvOffset = 0) {
    this.add(material, new THREE.BoxGeometry(...size), position, rotation, parent, uvOffset);
  }

  cylinder(material: THREE.Material, top: number, bottom: number, height: number, position: [number, number, number], segments = 8, rotation?: [number, number, number], parent?: THREE.Matrix4) {
    this.add(material, new THREE.CylinderGeometry(top, bottom, height, segments), position, rotation, parent);
  }

  build(scene: THREE.Object3D, options: { shadows?: boolean } = {}) {
    const meshes: THREE.Mesh[] = [];
    for (const [material, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = options.shadows !== false; mesh.receiveShadow = true;
      scene.add(mesh); meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

export type Glow = { position: THREE.Vector3; color: THREE.Color; size: number };
export type Chimney = THREE.Vector3;

/** Every building, the chapel, walls, fences and the palisade, merged into a few draw calls. */
export function buildArchitecture(scene: THREE.Scene, assets: Assets) {
  const mat = {
    plaster: assets.surface("plastered_wall_04", { metres: 2.4, color: "#c9c3b4" }),
    plasterMoss: assets.surface("worn_mossy_plasterwall", { metres: 2.6, color: "#b9b4a4" }),
    timber: assets.surface("weathered_planks", { metres: 1.4, color: "#3f3a33", normal: .8 }),
    siding: assets.surface("weathered_plank_siding", { metres: 2.2, color: "#8b8378" }),
    door: assets.surface("dark_wooden_planks", { metres: 1.2, color: "#77685a" }),
    shutter: assets.surface("wood_shutter", { metres: 1, color: "#78786b" }),
    thatch: assets.surface("thatch_roof_angled", { metres: 2.2, color: "#9c8d74", normal: 1.4 }),
    slate: assets.surface("roof_slates_02", { metres: 1.8, color: "#8d9599" }),
    stone: assets.surface("rustic_stone_wall", { metres: 2, color: "#a3a39b" }),
    chapel: assets.surface("castle_brick_07", { metres: 2.4, color: "#a4a49c" }),
  };
  const iron = assets.track(new THREE.MeshStandardMaterial({ color: "#1d201f", roughness: .5, metalness: .8 }));
  const glassLit = assets.track(new THREE.MeshStandardMaterial({ color: "#3a2410", emissive: "#ffa04a", emissiveIntensity: 2.2, roughness: .3 }));
  const glassDark = assets.track(new THREE.MeshStandardMaterial({ color: "#0b1114", roughness: .08, metalness: .4 }));
  const stained = assets.track(new THREE.MeshStandardMaterial({ color: "#26101a", emissive: "#7b3550", emissiveIntensity: .55, roughness: .2 }));
  const forge = assets.track(new THREE.MeshStandardMaterial({ color: "#3a1206", emissive: "#ff5a12", emissiveIntensity: 3 }));
  const batch = new StaticBatch();
  const glows: Glow[] = [];
  const chimneys: Chimney[] = [];
  const warm = new THREE.Color("#ffa04a");
  const toWorld = (m: THREE.Matrix4, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);

  function window(m: THREE.Matrix4, x: number, y: number, z: number, side: 1 | -1, lit: boolean, seed: number, axis: "z" | "x" = "z", w = .9, h = 1.1) {
    // A window on a face whose outward normal is ±z (front/back) or ±x (gable sides).
    const rot: [number, number, number] = axis === "z" ? [0, side > 0 ? 0 : Math.PI, 0] : [0, side * Math.PI / 2, 0];
    const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)).premultiply(m);
    batch.box(lit ? glassLit : glassDark, [w, h, .06], [0, 0, .02], undefined, local);
    batch.box(mat.timber, [w + .22, .12, .16], [0, h / 2 + .04, .06], undefined, local);
    batch.box(mat.timber, [w + .32, .1, .26], [0, -h / 2 - .04, .1], undefined, local);
    batch.box(mat.timber, [.1, h, .14], [-w / 2 - .05, 0, .06], undefined, local);
    batch.box(mat.timber, [.1, h, .14], [w / 2 + .05, 0, .06], undefined, local);
    batch.box(mat.timber, [.05, h, .1], [0, 0, .05], undefined, local);
    batch.box(mat.timber, [w, .05, .1], [0, 0, .05], undefined, local);
    const shutters = seeded(seed, 7);
    for (const s of [-1, 1]) {
      if (shutters < .25 && s > 0) continue; // a missing shutter
      const open = shutters > .55 || !lit;
      // Hinged at the outer frame edge; open shutters swing out against the wall.
      const angle = open ? s * (2 + seeded(seed + s, 9) * 1) : s * .05;
      const hinge = new THREE.Matrix4().makeTranslation(s * (w / 2 + .12), 0, .1).multiply(new THREE.Matrix4().makeRotationY(angle)).premultiply(local);
      batch.box(mat.shutter, [w / 2 + .02, h + .05, .05], [-s * (w / 4 + .01), 0, 0], undefined, hinge);
    }
    if (lit) glows.push({ position: toWorld(local, 0, 0, .35), color: warm, size: 1.6 });
  }

  function door(m: THREE.Matrix4, x: number, z: number, width = 1.1, height = 2.15, ajar = 0) {
    const local = new THREE.Matrix4().makeTranslation(x, .6, z).premultiply(m);
    batch.box(mat.timber, [width + .3, .16, .2], [0, height + .08, .04], undefined, local);
    for (const s of [-1, 1]) batch.box(mat.timber, [.14, height, .2], [s * (width / 2 + .07), height / 2, .04], undefined, local);
    const hinge = new THREE.Matrix4().makeTranslation(-width / 2, 0, .02).multiply(new THREE.Matrix4().makeRotationY(-ajar)).premultiply(local);
    batch.box(mat.door, [width, height, .08], [width / 2, height / 2, 0], undefined, hinge);
    for (const y of [.35, height - .35]) batch.box(iron, [width * .8, .05, .02], [width / 2, y, .05], undefined, hinge);
    batch.box(mat.stone, [width + .6, .18, .7], [0, -.51, .38], undefined, local);
    if (ajar > .1) batch.box(glassDark, [width - .05, height - .05, .02], [0, height / 2, -.08], undefined, local);
  }

  function gableRoof(m: THREE.Matrix4, W: number, D: number, eave: number, kind: Building["roof"], seed: number, pitch = .86) {
    const roof = kind === "thatch" ? mat.thatch : mat.slate;
    const thick = kind === "thatch" ? .36 : .16;
    const over = kind === "thatch" ? .55 : .4;
    const run = D / 2 + over;
    const rise = (D / 2) * Math.tan(pitch);
    const length = run / Math.cos(pitch);
    for (const s of [-1, 1]) {
      // Panel centre sits halfway down the slope, lifted by half its thickness along the roof normal.
      const y = eave + rise - run * Math.tan(pitch) / 2 + Math.cos(pitch) * thick / 2;
      const z = s * (run / 2 + Math.sin(pitch) * thick / 2);
      batch.box(roof, [W + over * 1.6, thick, length], [0, y, z], [s * pitch, 0, 0], m, seed);
    }
    batch.box(mat.timber, [W + over * 1.6 + .1, .2, .2], [0, eave + rise + thick * .6, 0], undefined, m);
    // Plastered gables with a king post.
    const shape = new THREE.Shape();
    shape.moveTo(-D / 2, 0); shape.lineTo(D / 2, 0); shape.lineTo(0, rise); shape.closePath();
    for (const s of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: .2, bevelEnabled: false });
      batch.add(kind === "thatch" ? mat.plaster : mat.siding, g, [s * W / 2 - (s > 0 ? .2 : 0), eave, 0], [0, Math.PI / 2, 0], m, seed);
      batch.box(mat.timber, [.14, rise * .9, .14], [s * (W / 2 + .03), eave + rise * .45, 0], undefined, m);
      batch.box(mat.timber, [.14, .14, D * .9], [s * (W / 2 + .03), eave + .07, 0], undefined, m);
    }
    return rise;
  }

  function timberFrame(m: THREE.Matrix4, W: number, D: number, y0: number, h: number, seed: number, front = true) {
    const out = .04;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(mat.timber, [.24, h, .24], [sx * W / 2, y0 + h / 2, sz * D / 2], undefined, m);
    for (const y of [y0 + .1, y0 + h - .08]) {
      for (const sz of [-1, 1]) batch.box(mat.timber, [W + .1, .18, .14], [0, y, sz * (D / 2 + out)], undefined, m);
      for (const sx of [-1, 1]) batch.box(mat.timber, [.14, .18, D + .1], [sx * (W / 2 + out), y, 0], undefined, m);
    }
    const studs = Math.max(2, Math.round(W / 1.5));
    for (let i = 1; i < studs; i++) {
      const x = -W / 2 + W * i / studs;
      for (const sz of [-1, 1]) if (sz < 0 || !front || Math.abs(x) > .9) batch.box(mat.timber, [.13, h, .12], [x, y0 + h / 2, sz * (D / 2 + out)], undefined, m);
    }
    // Diagonal braces at the corners give the frame its silhouette.
    const brace = Math.hypot(1.1, h * .8), angle = Math.atan2(1.1, h * .8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (seeded(seed + sx * 3 + sz, 11) < .2) continue;
      batch.box(mat.timber, [.12, brace, .11], [sx * (W / 2 - .6), y0 + h / 2, sz * (D / 2 + out)], [0, 0, sx * angle], m);
    }
  }

  function house(h: Building) {
    const turned = h.facing === "e" || h.facing === "w";
    const W = turned ? h.d : h.w, D = turned ? h.w : h.d;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(h.x, 0, h.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), FACING[h.facing]), new THREE.Vector3(1, 1, 1));
    const wood = h.kind === "barn" || h.kind === "mill" || h.kind === "hut";
    const wall = wood ? mat.siding : seeded(h.seed, 2) > .5 ? mat.plasterMoss : mat.plaster;
    batch.box(mat.stone, [W + .25, .62, D + .25], [0, .31, 0], undefined, m, h.seed);
    const h1 = h.stories === 2 ? Math.min(2.8, (h.h - .6) * .55) : h.h - .6;
    batch.box(wall, [W, h1, D], [0, .6 + h1 / 2, 0], undefined, m, h.seed);
    if (!wood) timberFrame(m, W, D, .6, h1, h.seed);
    let top = .6 + h1, Dt = D;
    if (h.stories === 2) {
      const h2 = h.h - top, jetty = .32;
      Dt = D + jetty * 2;
      batch.box(wall, [W, h2, Dt], [0, top + h2 / 2, 0], undefined, m, h.seed + 3);
      if (!wood) timberFrame(m, W, Dt, top, h2, h.seed + 1);
      for (let x = -W / 2 + .3; x < W / 2; x += .8) for (const s of [-1, 1]) batch.box(mat.timber, [.13, .16, .5], [x, top - .05, s * (D / 2 + .15)], undefined, m);
      top = h.h;
    }
    const rise = gableRoof(m, W, Dt, top, h.roof, h.seed, h.kind === "barn" ? .78 : .86);
    // Front door; barns get a wide plank door instead.
    if (h.kind === "barn") {
      const local = new THREE.Matrix4().makeTranslation(0, .6, D / 2 + .05).premultiply(m);
      for (const s of [-1, 1]) {
        const hinge = new THREE.Matrix4().makeTranslation(s * 1.7, 0, 0).multiply(new THREE.Matrix4().makeRotationY(s * -.5)).premultiply(local);
        batch.box(mat.door, [1.7, 3.4, .1], [-s * .85, 1.7, 0], undefined, hinge);
        batch.box(mat.timber, [.12, 4.3, .1], [-s * .85, 1.7, .06], [0, 0, s * .45], hinge);
      }
      batch.box(glassDark, [3.3, 3.3, .05], [0, 1.65, -.1], undefined, local);
      batch.box(mat.door, [1.2, 1.2, .08], [0, h1 + .1, .02], undefined, local);
    } else {
      door(m, h.kind === "tavern" ? 0 : -W * .12, D / 2 + .02, h.kind === "tavern" ? 1.7 : 1.1, h.kind === "tavern" ? 2.4 : 2.15, h.kind === "hut" ? .55 : 0);
    }
    // Windows: two per floor on the front, one on the back and each side.
    const lit = (i: number) => h.lit && seeded(h.seed + i, 5) > .3;
    const y1 = .6 + Math.min(h1 * .58, 1.75);
    const fronts = h.kind === "tavern" ? [-4.4, -2.4, 2.4, 4.4] : [W * .3];
    if (h.kind !== "barn") fronts.forEach((x, i) => window(m, x, y1, D / 2 + .02, 1, lit(i), h.seed + i));
    window(m, -W * .28, y1, -D / 2 - .02, -1, lit(9), h.seed + 9);
    if (h.stories === 2) [-W * .28, W * .28].forEach((x, i) => {
      window(m, x, top - (top - .6 - h1) / 2, Dt / 2 + .02, 1, lit(i + 3), h.seed + i + 3, "z", .8, 1);
      window(m, x, top - (top - .6 - h1) / 2, -Dt / 2 - .02, -1, lit(i + 5), h.seed + i + 5, "z", .8, 1);
    });
    for (const s of [-1, 1] as const) if (h.kind !== "barn" && seeded(h.seed, 13 + s) > .35) window(m, s * (W / 2 + .02), y1, 0, s, lit(20 + s), h.seed + 20 + s, "x", .75, .95);
    // Chimney with smoke; not on barns.
    if (h.kind !== "barn" && h.kind !== "mausoleum") {
      const cx = W / 2 - .9, cz = -Dt * .18;
      const height = rise + 1.6;
      batch.box(mat.stone, [.85, height, .85], [cx, top + height / 2 - .2, cz], undefined, m, h.seed);
      batch.box(mat.stone, [1, .18, 1], [cx, top + height - .15, cz], undefined, m);
      chimneys.push(toWorld(m, cx, top + height, cz));
    }
    if (h.kind === "tavern") {
      // Hanging sign bracket.
      const local = new THREE.Matrix4().makeTranslation(3.4, 3.1, D / 2 + .05).premultiply(m);
      batch.box(iron, [.06, .06, 1.3], [0, 0, .62], undefined, local);
      batch.box(mat.door, [.05, .7, .9], [0, -.45, 1], undefined, local);
      for (const z of [.65, 1.35]) batch.box(iron, [.02, .25, .02], [0, -.05, z], undefined, local);
    }
    if (h.kind === "smithy") {
      // Open lean-to forge facing the square.
      const local = new THREE.Matrix4().makeTranslation(0, 0, D / 2).premultiply(m);
      batch.box(mat.slate, [W * .9, .14, 2.6], [0, 3.05, 1.2], [-.25, 0, 0], local);
      for (const s of [-1, 1]) batch.box(mat.timber, [.2, 2.8, .2], [s * W * .4, 1.4, 2.3], undefined, local);
      batch.box(mat.stone, [1.6, 1, 1.2], [-W * .22, .5, 1.1], undefined, local);
      batch.box(forge, [1.1, .1, .8], [-W * .22, 1.02, 1.1], undefined, local);
      glows.push({ position: toWorld(local, -W * .22, 1.3, 1.1), color: new THREE.Color("#ff6a1f"), size: 2.4 });
    }
    if (h.kind === "mill") {
      // Wooden flume feeding the wheel (the wheel itself animates separately).
      const local = new THREE.Matrix4().makeTranslation(-W * .18, 0, D / 2).premultiply(m);
      batch.box(mat.siding, [.9, .35, 4], [0, 4.6, 1.6], [0, 0, 0], local);
      for (const z of [1.2, 3.2]) batch.box(mat.timber, [.18, 4.5, .18], [0, 2.25, z], undefined, local);
    }
  }

  function mausoleum(h: Building) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(h.x, 0, h.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), FACING[h.facing]), new THREE.Vector3(1, 1, 1));
    const W = h.d, D = h.w;
    batch.box(mat.chapel, [W + .6, .4, D + 1.4], [0, .2, .4], undefined, m);
    batch.box(mat.chapel, [W, h.h, D], [0, .4 + h.h / 2, 0], undefined, m);
    for (const s of [-1, 1]) batch.cylinder(mat.chapel, .2, .24, h.h, [s * (W / 2 - .3), .4 + h.h / 2, D / 2 + .55], 12, undefined, m);
    batch.box(mat.chapel, [W + .4, .4, D + 1.3], [0, .4 + h.h + .2, .35], undefined, m);
    gableRoof(new THREE.Matrix4().makeTranslation(0, 0, .3).premultiply(m), W + .2, D + 1.2, h.h + .8, "slate", h.seed, .5);
    batch.box(iron, [1.1, 2, .08], [0, 1.4, D / 2 + .04], undefined, m);
    for (let x = -.45; x <= .45; x += .15) batch.box(iron, [.04, 2, .1], [x, 1.4, D / 2 + .1], undefined, m);
  }

  function chapel() {
    const { x, z, w, d, h } = CHAPEL;
    // Front faces east (+x) toward the lane.
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1));
    const W = d, D = w;
    batch.box(mat.stone, [W + .4, .5, D + .4], [0, .25, 0], undefined, m);
    batch.box(mat.chapel, [W, h, D], [0, .5 + h / 2, 0], undefined, m, 3);
    // Buttresses and tall arched (pointed) stained windows on the long sides.
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) {
      batch.box(mat.chapel, [.5, h * .8, .7], [i * W * .32 - W * .16 * Math.sign(i || 1) * 0, .5 + h * .4, s * (D / 2 + .3)], [-s * .06, 0, 0], m);
      if (i < 1) {
        const local = new THREE.Matrix4().compose(new THREE.Vector3(i * W * .32 + W * .16, 2.9, s * (D / 2 + .02)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s > 0 ? 0 : Math.PI, 0)), new THREE.Vector3(1, 1, 1)).premultiply(m);
        batch.box(stained, [.7, 2.2, .05], [0, 0, 0], undefined, local);
        batch.box(stained, [.5, .5, .05], [0, 1.2, 0], [0, 0, Math.PI / 4], local);
        batch.box(mat.stone, [.95, .16, .3], [0, -1.15, .08], undefined, local);
        glows.push({ position: toWorld(local, 0, .2, .4), color: new THREE.Color("#a65572"), size: 1.4 });
      }
    }
    gableRoof(m, W, D, .5 + h, "slate", 7, 1.0);
    // Bell tower over the entrance, with an open belfry and spire.
    const tower = new THREE.Matrix4().makeTranslation(W / 2 - 1.3, 0, 0).premultiply(m);
    batch.box(mat.chapel, [2.4, h + 3.4, 2.4], [0, .5 + (h + 3.4) / 2, 0], undefined, tower, 5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(mat.chapel, [.4, 2.2, .4], [sx * 1, h + 5, sz * 1], undefined, tower);
    batch.box(mat.chapel, [2.7, .3, 2.7], [0, h + 6.2, 0], undefined, tower);
    batch.add(mat.slate, new THREE.ConeGeometry(2, 4.8, 4), [0, h + 8.7, 0], [0, Math.PI / 4, 0], tower);
    batch.cylinder(iron, .3, .6, .7, [0, h + 4.9, 0], 16, undefined, tower);
    batch.box(iron, [.06, 1.2, .06], [0, h + 11.6, 0], undefined, tower);
    batch.box(iron, [.6, .06, .06], [0, h + 11.8, 0], undefined, tower);
    // Double door facing the lane.
    door(m, 0, D / 2 + .02, 1.6, 2.7);
  }

  BUILDINGS.forEach(h => (h.kind === "mausoleum" ? mausoleum(h) : house(h)));
  chapel();

  // Low walls, fences, stalls and the palisade use the same rectangles as collision.
  for (const w of WALLS) {
    batch.box(mat.stone, [w.w + .1, 1.1, w.d], [w.x, .55, w.z], undefined, undefined, w.x);
    batch.box(mat.stone, [w.w + .3, .14, w.d + .2], [w.x, 1.15, w.z]);
  }
  for (const s of [-1, 1]) {
    batch.box(mat.stone, [.6, 2.2, .6], [GRAVEYARD.gate.from + .2 + (s > 0 ? GRAVEYARD.gate.to - GRAVEYARD.gate.from - .4 : 0), 1.1, GRAVEYARD.maxZ]);
  }
  const rail = (f: { x: number; z: number; w: number; d: number }, i: number) => {
    const along = f.w > f.d ? "x" : "z", length = Math.max(f.w, f.d);
    const posts = Math.max(2, Math.round(length / 1.6));
    for (let p = 0; p <= posts; p++) {
      const t = -length / 2 + length * p / posts;
      const tilt = (seeded(i * 31 + p, 4) - .5) * .18;
      batch.box(mat.timber, [.14, 1.15, .14], [f.x + (along === "x" ? t : 0), .55, f.z + (along === "z" ? t : 0)], [tilt, 0, tilt * .6]);
    }
    for (const y of [.45, .9]) batch.box(mat.timber, along === "x" ? [length, .09, .07] : [.07, .09, length], [f.x, y + (seeded(i, y * 10) - .5) * .08, f.z], [0, 0, (seeded(i, y) - .5) * .05]);
  };
  FENCES.forEach(rail);
  STALLS.forEach((s, i) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(mat.timber, [.12, 2.3, .12], [s.x + sx * s.w / 2, 1.15, s.z + sz * s.d / 2]);
    batch.box(mat.door, [s.w, .1, s.d], [s.x, .9, s.z]);
    batch.box(mat.timber, [s.w + .2, .8, .1], [s.x, .45, s.z + s.d / 2]);
    batch.box(mat.thatch, [s.w + .5, .12, s.d + .6], [s.x, 2.35, s.z], [(i % 2 ? 1 : -1) * .18, 0, 0]);
  });
  // Graves: headstones, crosses and slabs.
  for (const g of GRAVES) {
    const rot: [number, number, number] = [g.tilt, g.yaw, g.tilt * .4];
    if (g.kind === 0) { batch.box(mat.chapel, [.7, .9, .16], [g.x, .4, g.z], rot); batch.add(mat.chapel, new THREE.CylinderGeometry(.35, .35, .16, 12, 1, false, 0, Math.PI), [g.x, .85, g.z], [Math.PI / 2 + g.tilt, g.yaw, 0]); }
    if (g.kind === 1) { batch.box(mat.timber, [.12, 1.2, .1], [g.x, .55, g.z], rot); batch.box(mat.timber, [.6, .1, .1], [g.x, .85, g.z], rot); }
    if (g.kind === 2) { batch.box(mat.chapel, [.14, 1.1, .14], [g.x, .5, g.z], rot); batch.box(mat.chapel, [.55, .14, .14], [g.x, .78, g.z], rot); batch.box(mat.stone, [.8, .12, 1.6], [g.x, .06, g.z + .9]); }
    if (g.kind === 3) { batch.box(mat.chapel, [.6, 1.25, .2], [g.x, .58, g.z], rot); }
  }
  // Palisade of sharpened stakes around the bounds, with the closed south gate.
  const stakes: [number, number][] = [];
  const edge = 1.2;
  for (let x = BOUNDS.minX - edge; x <= BOUNDS.maxX + edge; x += .42) { stakes.push([x, BOUNDS.minZ - edge]); if (Math.abs(x) > 2.4) stakes.push([x, BOUNDS.maxZ + edge]); }
  for (let z = BOUNDS.minZ - edge; z <= BOUNDS.maxZ + edge; z += .42) { stakes.push([BOUNDS.minX - edge, z]); stakes.push([BOUNDS.maxX + edge, z]); }
  const stakeGeo = mergeGeometries([new THREE.CylinderGeometry(.19, .21, 3.2, 7).translate(0, 1.6, 0).toNonIndexed(), new THREE.ConeGeometry(.19, .5, 7).translate(0, 3.45, 0).toNonIndexed()])!;
  const palisade = new THREE.InstancedMesh(stakeGeo, mat.timber, stakes.length);
  const t = new THREE.Object3D();
  stakes.forEach(([x, z], i) => {
    t.position.set(x, -.1, z); t.rotation.set((seeded(i, 1) - .5) * .06, seeded(i, 2) * 6, (seeded(i, 3) - .5) * .06);
    t.scale.set(1, .85 + seeded(i, 4) * .3, 1); t.updateMatrix(); palisade.setMatrixAt(i, t.matrix);
  });
  palisade.castShadow = palisade.receiveShadow = true; scene.add(palisade);
  // Gatehouse: posts, lintel and two closed doors.
  for (const s of [-1, 1]) batch.box(mat.timber, [.5, 5, .5], [s * 2.6, 2.5, BOUNDS.maxZ + edge]);
  batch.box(mat.timber, [6.2, .45, .6], [0, 4.6, BOUNDS.maxZ + edge]);
  batch.box(mat.thatch, [6.8, .25, 2.2], [0, 5.1, BOUNDS.maxZ + edge], [.0, 0, 0]);
  for (const s of [-1, 1]) {
    batch.box(mat.door, [2.4, 3.6, .14], [s * 1.2, 1.8, BOUNDS.maxZ + edge]);
    batch.box(mat.timber, [.12, 4, .1], [s * 1.2, 1.8, BOUNDS.maxZ + edge - .1], [0, 0, s * .6]);
  }
  batch.box(mat.timber, [4.6, .22, .22], [0, 1.7, BOUNDS.maxZ + edge - .2]);
  // Paddock trough.
  batch.box(mat.timber, [2, .5, .6], [(PADDOCK.minX + PADDOCK.maxX) / 2, .25, PADDOCK.minZ + 2]);

  const meshes = batch.build(scene);
  return { meshes: [...meshes, palisade], glows, chimneys, materials: mat };
}
