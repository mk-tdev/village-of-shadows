import * as THREE from "three";
import { StaticBatch } from "./architecture";
import { modelParts, type Assets, type ModelName } from "./assets";
import { COUNCIL, JETTY, LAMPS, POND, PROPS, type PropKind } from "./world";

type Mats = Record<"timber" | "door" | "stone" | "thatch" | "siding" | "plaster" | "chapel" | "slate" | "shutter" | "plasterMoss", THREE.MeshStandardMaterial>;

const MODEL_FOR: Partial<Record<PropKind, ModelName>> = {
  barrel: "Barrel_01", barrels: "wooden_barrels_01", crate: "wooden_crate_01", crate2: "wooden_crate_02", bucket: "wooden_bucket_01",
  stump: "tree_stump_01", stump2: "tree_stump_02", boulder: "boulder_01", statue: "gothic_statue", deadtree: "dead_tree_trunk",
  deadtree2: "dead_tree_trunk_02", rocks: "rock_moss_set_01", bench: "painted_wooden_bench", table: "wooden_picnic_table",
  wine: "wine_barrel_01", ladder: "wooden_ladder", axe: "wooden_axe", wheel: "spinning_wheel_01", basket: "wicker_basket_01",
  stool: "wooden_stool_01", broom: "wooden_broom", firepit: "stone_fire_pit", gate: "large_iron_gate",
};
const seeded = (i: number, salt = 1) => ((Math.sin(i * 127.1 + salt * 311.7) * 43758.5453) % 1 + 1) % 1;

export const COUNCIL_SEAT_HEIGHT = .54;
/** Seven chairs around the fire; index 0 is the player's empty seat facing north. */
export const COUNCIL_CHAIRS = Array.from({ length: 7 }, (_, i) => {
  const a = i / 7 * Math.PI * 2;
  return { x: Math.sin(a) * 3.8, z: COUNCIL.z + Math.cos(a) * 3.8, yaw: a + Math.PI };
});

export function buildDressing(scene: THREE.Scene, assets: Assets, mat: Mats) {
  const batch = new StaticBatch();
  const iron = assets.track(new THREE.MeshStandardMaterial({ color: "#1b1e1d", roughness: .45, metalness: .85 }));
  const lampGlass = assets.track(new THREE.MeshStandardMaterial({ color: "#d99843", emissive: "#ffa040", emissiveIntensity: 3.2 }));
  const hay = assets.surface("thatch_roof_angled", { metres: 1.4, color: "#a39062", normal: 1.6 });
  const cloth = assets.track(new THREE.MeshStandardMaterial({ color: "#4a3f35", roughness: 1, side: THREE.DoubleSide }));
  const paper = assets.track(new THREE.MeshStandardMaterial({ color: "#b3a78c", roughness: 1 }));
  const objects: THREE.Object3D[] = [];
  const lampPoints: THREE.Vector3[] = [];

  // Lamp posts and wall lanterns. The lamp light itself comes from the runtime light pool.
  for (const lamp of LAMPS) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(lamp.x, 0, lamp.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lamp.yaw ?? 0), new THREE.Vector3(1, 1, 1));
    let head: [number, number, number];
    if (lamp.kind === "post") {
      batch.box(mat.stone, [.5, .3, .5], [0, .15, 0], undefined, m);
      batch.cylinder(iron, .05, .08, 3, [0, 1.6, 0], 8, undefined, m);
      batch.box(iron, [.6, .06, .06], [.25, 3, 0], undefined, m);
      batch.box(iron, [.05, .3, .05], [.15, 2.82, 0], [0, 0, .8], m);
      head = [.5, 2.62, 0];
      batch.cylinder(iron, .02, .02, .22, [.5, 2.9, 0], 4, undefined, m);
    } else if (lamp.kind === "wall") {
      batch.box(iron, [.08, .45, .05], [0, 2.8, .02], undefined, m);
      batch.box(iron, [.05, .05, .5], [0, 2.95, .25], undefined, m);
      head = [0, 2.55, .45];
    } else {
      batch.cylinder(iron, .01, .01, .9, [0, 3.6, 0], 4, undefined, m);
      head = [0, 2.95, 0];
    }
    const h = new THREE.Vector3(...head).applyMatrix4(m);
    batch.cylinder(iron, .2, .23, .08, [head[0], head[1] - .25, head[2]], 8, undefined, m);
    batch.add(iron, new THREE.ConeGeometry(.26, .22, 8), [head[0], head[1] + .3, head[2]], undefined, m);
    batch.cylinder(lampGlass, .09, .09, .36, head, 8, undefined, m);
    for (const [dx, dz] of [[-.16, -.16], [.16, -.16], [-.16, .16], [.16, .16]]) batch.box(iron, [.025, .48, .025], [head[0] + dx, head[1], head[2] + dz], undefined, m);
    lampPoints.push(h);
  }

  // The well: stone drum, rim at the height the key rests on, and a little shingled roof with a crank.
  const well = new THREE.Vector3(2.5, 0, -3);
  batch.add(mat.stone, new THREE.CylinderGeometry(1.02, 1.1, 1, 18, 1, true), [well.x, .5, well.z]);
  batch.add(mat.stone, new THREE.TorusGeometry(.98, .16, 8, 24), [well.x, .98, well.z], [Math.PI / 2, 0, 0]);
  for (const x of [-1.15, 1.15]) batch.box(mat.timber, [.16, 2.8, .16], [well.x + x, 1.4, well.z]);
  batch.box(mat.timber, [2.6, .14, .14], [well.x, 2.35, well.z]);
  for (const s of [-1, 1]) batch.box(mat.slate, [2.9, .1, 1.1], [well.x, 2.95, well.z + s * .42], [s * .62, 0, 0]);
  batch.cylinder(mat.timber, .07, .07, 1.9, [well.x, 2.1, well.z], 8, [0, 0, Math.PI / 2]);
  batch.box(iron, [.04, .4, .04], [well.x + 1.1, 1.9, well.z + .2]);
  batch.cylinder(iron, .008, .008, 1.4, [well.x, 1.35, well.z], 4);
  batch.add(mat.stone, new THREE.CircleGeometry(.9, 18), [well.x, .25, well.z], [-Math.PI / 2, 0, 0]);
  const water = new THREE.Mesh(new THREE.CircleGeometry(.85, 24), assets.track(new THREE.MeshStandardMaterial({ color: "#020707", roughness: .05, metalness: .9 })));
  water.rotation.x = -Math.PI / 2; water.position.set(well.x, .3, well.z); scene.add(water); objects.push(water);

  // Council chairs.
  for (const c of COUNCIL_CHAIRS) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(c.x, 0, c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw), new THREE.Vector3(1, 1, 1));
    batch.box(mat.door, [.62, .08, .56], [0, COUNCIL_SEAT_HEIGHT - .04, 0], undefined, m);
    for (const sx of [-1, 1]) {
      batch.box(mat.timber, [.07, 1.12, .07], [sx * .26, .56, -.24], undefined, m);
      batch.box(mat.timber, [.07, .5, .07], [sx * .26, .25, .22], undefined, m);
    }
    batch.box(mat.door, [.6, .16, .06], [0, 1.0, -.25], undefined, m);
    batch.box(mat.door, [.6, .1, .05], [0, .76, -.25], undefined, m);
  }

  // Procedural village props that Poly Haven does not provide.
  const procedural = (kind: PropKind, x: number, z: number, yaw: number, i: number) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    if (kind === "cart") {
      batch.box(mat.door, [1.4, .1, 2.3], [0, .78, 0], [0, 0, .04], m);
      for (const s of [-1, 1]) batch.box(mat.timber, [.08, .45, 2.3], [s * .7, 1.0, 0], undefined, m);
      batch.box(mat.timber, [1.4, .45, .08], [0, 1.0, -1.15], undefined, m);
      for (const s of [-1, 1]) {
        batch.add(mat.timber, new THREE.TorusGeometry(.48, .05, 6, 16), [s * .8, .5, .2], [0, Math.PI / 2, 0], m);
        for (let k = 0; k < 6; k++) batch.box(mat.timber, [.04, .9, .04], [s * .8, .5, .2], [k * Math.PI / 6, 0, 0], m);
      }
      for (const s of [-1, 1]) batch.box(mat.timber, [.07, .07, 1.8], [s * .3, .55, 1.9], [-.25, 0, 0], m);
      batch.add(hay, new THREE.SphereGeometry(.7, 10, 6), [0, 1.1, -.2], undefined, m);
    } else if (kind === "hay") {
      batch.add(hay, new THREE.CylinderGeometry(.6, 1.05, 1.6, 12), [0, .8, 0], [0, i, 0], m);
      batch.add(hay, new THREE.ConeGeometry(.62, .8, 12), [0, 2, 0], [0, i, 0], m);
    } else if (kind === "scarecrow") {
      batch.box(mat.timber, [.1, 2.4, .1], [0, 1.2, 0], undefined, m);
      batch.box(mat.timber, [1.6, .09, .09], [0, 1.85, 0], [0, 0, .08], m);
      batch.add(cloth, new THREE.CylinderGeometry(.22, .4, .9, 8, 1, true), [0, 1.55, 0], undefined, m);
      batch.add(hay, new THREE.SphereGeometry(.2, 8, 6), [0, 2.25, 0], undefined, m);
      batch.add(cloth, new THREE.ConeGeometry(.3, .35, 8), [0, 2.5, 0], [.2, 0, .1], m);
    } else if (kind === "pillory") {
      batch.box(mat.stone, [1.6, .3, 1.6], [0, .15, 0], undefined, m);
      for (const s of [-1, 1]) batch.box(mat.timber, [.16, 2, .16], [s * .7, 1.2, 0], undefined, m);
      batch.box(mat.door, [1.6, .4, .14], [0, 1.6, 0], undefined, m);
      batch.box(mat.timber, [1.7, .14, .2], [0, 2.2, 0], undefined, m);
    } else if (kind === "noticeboard") {
      for (const s of [-1, 1]) batch.box(mat.timber, [.12, 2.1, .12], [s * .7, 1.05, 0], undefined, m);
      batch.box(mat.door, [1.5, 1, .06], [0, 1.5, 0], undefined, m);
      batch.add(mat.slate, new THREE.BoxGeometry(1.8, .06, .45), [0, 2.15, 0], [.2, 0, 0], m);
      for (let k = 0; k < 4; k++) batch.box(paper, [.3, .38, .01], [-.5 + k * .32, 1.5 + (seeded(k, 2) - .5) * .3, .04], [0, 0, (seeded(k, 3) - .5) * .2], m);
    } else if (kind === "anvil") {
      batch.add(mat.timber, new THREE.CylinderGeometry(.3, .32, .55, 10), [0, .27, 0], undefined, m);
      batch.box(iron, [.55, .22, .22], [0, .66, 0], undefined, m);
      batch.box(iron, [.25, .14, .16], [0, .5, 0], undefined, m);
      batch.add(iron, new THREE.ConeGeometry(.1, .3, 6), [.4, .7, 0], [0, 0, -Math.PI / 2], m);
    } else if (kind === "woodpile") {
      for (let r = 0; r < 4; r++) for (let k = 0; k < 7 - r; k++) batch.add(mat.timber, new THREE.CylinderGeometry(.12, .12, 1.2, 7), [-.75 + k * .24 + r * .12, .12 + r * .21, 0], [Math.PI / 2, 0, 0], m);
      batch.add(mat.slate, new THREE.BoxGeometry(2, .06, 1.6), [0, 1.2, 0], [.15, 0, 0], m);
    } else if (kind === "grave_open") {
      batch.box(mat.stone, [1.0, .25, 2.1], [0, -.1, 0], undefined, m);
      batch.add(cloth, new THREE.PlaneGeometry(.9, 2), [0, -.18, 0], [-Math.PI / 2, 0, 0], m);
      batch.add(hay, new THREE.SphereGeometry(.7, 8, 6), [1.1, .1, 0], undefined, m);
      batch.box(mat.timber, [.06, 1.3, .06], [1.2, .6, .4], [.3, 0, .3], m);
      batch.box(iron, [.25, .32, .03], [1.38, .05, .58], [.3, 0, .3], m);
    }
  };

  const groups = new Map<ModelName, { x: number; z: number; yaw: number; scale: number; kind: PropKind }[]>();
  PROPS.forEach((p, i) => {
    const name = MODEL_FOR[p.kind];
    if (name) { const list = groups.get(name) ?? []; list.push({ x: p.x, z: p.z, yaw: p.yaw ?? seeded(i, 2) * 6.28, scale: p.scale ?? 1, kind: p.kind }); groups.set(name, list); }
    else procedural(p.kind, p.x, p.z, p.yaw ?? 0, i);
  });
  // Fire pit under the council flames.
  groups.set("stone_fire_pit", [{ x: COUNCIL.x, z: COUNCIL.z, yaw: 0, scale: 1.25, kind: "firepit" }]);
  const t = new THREE.Object3D();
  const loaded = Promise.all([...groups].map(async ([name, items]) => {
    const gltf = await assets.model(name);
    const { parts, box } = modelParts(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, items.length);
      items.forEach((p, i) => {
        let s = p.scale, y = -box.min.y * s, rx = 0, rz = 0;
        if (p.kind === "gate") s = 3.4 / Math.max(size.x, size.z);
        if (p.kind === "ladder" || p.kind === "broom") { rx = -.28; }
        if (p.kind === "gate") { rx = -.22; } // torn from its hinges, leaning on the wall
        if (p.kind === "axe") { y = .52; rz = .5; }
        y = p.kind === "axe" ? .52 : -box.min.y * s;
        t.position.set(p.x, y, p.z);
        t.rotation.set(rx, p.kind === "gate" ? 0 : p.yaw, rz, "YXZ");
        t.scale.setScalar(s); t.updateMatrix();
        mesh.setMatrixAt(i, t.matrix.clone().multiply(part.matrix));
      });
      mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere();
      scene.add(mesh); objects.push(mesh);
    }
  })).catch(() => { /* Missing props leave the procedural village intact. */ });

  // Mill pond: dark water with scrolling rain-ripple normals, a reed bank and a jetty.
  const rippleCanvas = document.createElement("canvas"); rippleCanvas.width = rippleCanvas.height = 256;
  const rctx = rippleCanvas.getContext("2d")!; rctx.fillStyle = "rgb(128,128,255)"; rctx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 160; k++) {
    const x = seeded(k, 61) * 256, y = seeded(k, 62) * 256, r = 3 + seeded(k, 63) * 9;
    const g = rctx.createRadialGradient(x, y, r * .55, x, y, r);
    g.addColorStop(0, "rgba(128,128,255,0)"); g.addColorStop(.5, "rgba(165,150,255,.5)"); g.addColorStop(1, "rgba(100,110,255,0)");
    rctx.fillStyle = g; rctx.beginPath(); rctx.arc(x, y, r, 0, Math.PI * 2); rctx.fill();
  }
  const ripples = assets.track(new THREE.CanvasTexture(rippleCanvas)); ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping; ripples.repeat.set(5, 5);
  const waterMat = assets.track(new THREE.MeshStandardMaterial({ color: "#071012", roughness: .06, metalness: .25, normalMap: ripples, normalScale: new THREE.Vector2(.35, .35) }));
  const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.radius + .3, 48), waterMat);
  pond.rotation.x = -Math.PI / 2; pond.position.set(POND.x, .03, POND.z); pond.receiveShadow = true; scene.add(pond); objects.push(pond);
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * Math.PI * 2, r = POND.radius + .2 + seeded(k, 64) * .5;
    batch.add(mat.stone, new THREE.DodecahedronGeometry(.25 + seeded(k, 65) * .3, 0), [POND.x + Math.cos(a) * r, .05, POND.z + Math.sin(a) * r], [seeded(k, 66), seeded(k, 67) * 6, 0]);
  }
  const jm = new THREE.Matrix4().makeTranslation(JETTY.x - 1, 0, JETTY.z);
  for (let k = 0; k < 8; k++) batch.box(mat.timber, [.32, .07, JETTY.d], [-1.5 + k * .38, .32, 0], [0, 0, (seeded(k, 68) - .5) * .04], jm);
  for (const [px, pz] of [[-1.6, -.7], [-1.6, .7], [1.4, -.7], [1.4, .7]]) batch.cylinder(mat.timber, .07, .08, 1, [px, -.1, pz], 6, undefined, jm);

  // Animated waterwheel beside the mill.
  const wheel = new THREE.Group(); wheel.position.set(23.6, 2.6, -38); scene.add(wheel); objects.push(wheel);
  const wb = new StaticBatch();
  for (const s of [-.35, .35]) wb.add(mat.timber, new THREE.TorusGeometry(2.2, .08, 6, 28), [s, 0, 0], [0, Math.PI / 2, 0]);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    wb.box(mat.timber, [.1, 4.3, .1], [0, 0, 0], [a, 0, 0]);
    wb.box(mat.door, [.8, .5, .06], [0, Math.cos(a) * 2.15, Math.sin(a) * 2.15], [a, 0, 0]);
  }
  wb.cylinder(iron, .14, .14, 1.2, [0, 0, 0], 10, [0, 0, Math.PI / 2]);
  wb.build(wheel);
  objects.push(...batch.build(scene));

  return {
    lampPoints, loaded,
    update(time: number, reduced: boolean) { if (!reduced) { wheel.rotation.x = -time * .35; ripples.offset.set(time * .013, time * .021); } },
    dispose() { objects.forEach(o => { scene.remove(o); if (o instanceof THREE.InstancedMesh) o.dispose(); if (o instanceof THREE.Mesh) o.geometry.dispose(); o.traverse(c => { if (c instanceof THREE.Mesh) c.geometry.dispose(); }); }); },
  };
}
