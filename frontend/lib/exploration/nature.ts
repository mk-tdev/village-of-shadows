import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Assets, ModelName } from "./assets";
import { modelParts } from "./assets";
import { BOUNDS, BUILDINGS, CHAPEL, COUNCIL, MARKET, POND, STREETS, canWalk, surfaceAt, type Point } from "./world";

const seeded = (i: number, salt = 1) => ((Math.sin(i * 127.1 + salt * 311.7) * 43758.5453) % 1 + 1) % 1;
const hash = (x: number, z: number) => seeded(Math.floor(x) * 57 + Math.floor(z) * 131, 9);
function smoothNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Flat inside the palisade; rolls into wooded hills beyond it so the horizon is never a plane edge. */
export function heightAt(x: number, z: number) {
  const outside = Math.max(BOUNDS.minX - 2 - x, x - BOUNDS.maxX - 2, BOUNDS.minZ - 2 - z, z - BOUNDS.maxZ - 2, 0);
  if (outside <= 0) return 0;
  const n = smoothNoise(x * .045, z * .045) * .7 + smoothNoise(x * .12, z * .12) * .3;
  const road = Math.abs(x) < 4 && z > BOUNDS.maxZ ? .25 : 1;
  return Math.min(1, outside / 26) ** 1.4 * (4 + n * 14) * road;
}

export type Wind = { value: number };

/** Wind sway in the vertex stage, weighted by local height. Shared by trees, grass and plants. */
export function windify(material: THREE.MeshStandardMaterial, time: Wind, strength: number, heightScale: number) {
  material.onBeforeCompile = shader => {
    shader.uniforms.windTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float windTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 windOrigin = vec4(0., 0., 0., 1.);
        #ifdef USE_INSTANCING
          windOrigin = instanceMatrix * windOrigin;
        #endif
        float windWeight = pow(max(position.y, 0.) / ${heightScale.toFixed(2)}, 1.6);
        float gust = sin(windTime * 1.3 + windOrigin.x * .21 + windOrigin.z * .17) * .6 + sin(windTime * 3.1 + windOrigin.x * .9) * .25;
        transformed.x += gust * windWeight * ${strength.toFixed(3)};
        transformed.z += cos(windTime * 1.1 + windOrigin.z * .3) * windWeight * ${(strength * .5).toFixed(3)};`);
  };
  material.customProgramCacheKey = () => `wind-${strength}-${heightScale}`;
  return material;
}

function softStrip(points: Point[], width: number, y: number) {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const cols = [-.5, -.32, .32, .5], alpha = [0, 1, 1, 0];
  // Extend each end so it fades rather than stopping on a hard edge.
  const ext = (a: Point, b: Point, d: number) => { const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: a.x + (a.x - b.x) / l * d, z: a.z + (a.z - b.z) / l * d }; };
  const pts = [ext(points[0], points[1], 1.2), ...points, ext(points.at(-1)!, points.at(-2)!, 1.2)];
  pts.forEach((p, i) => {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x, dz = next.z - prev.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const endFade = i === 0 || i === pts.length - 1 ? 0 : 1;
    cols.forEach((c, j) => {
      const x = p.x + nx * c * width, z = p.z + nz * c * width;
      pos.push(x, y, z); uv.push(x, z); col.push(1, 1, 1, alpha[j] * endFade);
    });
  });
  for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < 3; j++) {
    const a = i * 4 + j, b = a + 1, c = a + 4, d = a + 5;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function softDisc(center: Point, radius: number, y: number) {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const rings = [0, .7, 1], seg = 40;
  pos.push(center.x, y, center.z); uv.push(center.x, center.z); col.push(1, 1, 1, 1);
  for (let r = 1; r < rings.length; r++) for (let s = 0; s < seg; s++) {
    const a = s / seg * Math.PI * 2, rr = radius * (r === 1 ? .7 : 1 + (seeded(s, 3) - .5) * .25);
    const x = center.x + Math.cos(a) * rr, z = center.z + Math.sin(a) * rr;
    pos.push(x, y, z); uv.push(x, z); col.push(1, 1, 1, r === 1 ? 1 : 0);
  }
  for (let s = 0; s < seg; s++) {
    const n = (s + 1) % seg;
    idx.push(0, 1 + n, 1 + s);
    idx.push(1 + s, 1 + n, 1 + seg + s, 1 + n, 1 + seg + n, 1 + seg + s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function conifer(seed: number) {
  const parts: THREE.BufferGeometry[] = [];
  const h = 1;
  const trunk = new THREE.CylinderGeometry(.018, .045, .4, 6).translate(0, .2, 0);
  paint(trunk, new THREE.Color("#2b241e"), new THREE.Color("#2b241e"));
  parts.push(trunk.toNonIndexed());
  const tiers = 6 + Math.floor(seeded(seed, 1) * 3);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const radius = (.24 - t * .19) * (.9 + seeded(seed + i, 2) * .25);
    const height = .2 - t * .06;
    const cone = new THREE.ConeGeometry(radius, height, 11, 2, true);
    const p = cone.getAttribute("position");
    for (let v = 0; v < p.count; v++) {
      const y = p.getY(v);
      if (y < height / 2 - .001) {
        // Jagged, drooping skirt instead of a perfect cone.
        const a = Math.atan2(p.getZ(v), p.getX(v));
        const jag = 1 + (seeded(Math.round(a * 30) + i * 7 + seed * 13, 4) - .5) * .5;
        p.setX(v, p.getX(v) * jag); p.setZ(v, p.getZ(v) * jag); p.setY(v, y - (jag - 1) * .05);
      }
    }
    cone.computeVertexNormals();
    cone.rotateY(seeded(seed + i, 5) * 3).translate(0, .14 + t * .8 * h + height / 2, 0);
    paint(cone, new THREE.Color("#0d1512"), new THREE.Color("#2a3b31").lerp(new THREE.Color("#3a4636"), seeded(seed, 6)));
    parts.push(cone.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}

function deadTree(seed: number) {
  const parts: THREE.BufferGeometry[] = [];
  const grow = (base: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number, salt: number) => {
    const end = base.clone().addScaledVector(dir, length);
    const g = new THREE.CylinderGeometry(radius * .62, radius, length, 5).translate(0, length / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)).translate(base.x, base.y, base.z);
    parts.push(g.toNonIndexed());
    if (depth <= 0) return;
    const count = depth > 2 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const s = salt * 7 + i * 3 + depth;
      const next = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), seeded(s, 1) * 6.28)
        .add(new THREE.Vector3((seeded(s, 2) - .5) * 1.4, .2 + seeded(s, 3) * .5, (seeded(s, 4) - .5) * 1.4)).normalize();
      grow(end.clone().lerp(base, i * .18), next, length * (.55 + seeded(s, 5) * .2), radius * .58, depth - 1, s);
    }
  };
  grow(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), .38, .035, 4, seed);
  const g = mergeGeometries(parts)!;
  paint(g, new THREE.Color("#1c1a17"), new THREE.Color("#3a3832"));
  return g;
}

function paint(g: THREE.BufferGeometry, low: THREE.Color, high: THREE.Color) {
  const p = g.getAttribute("position");
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  const c = new Float32Array(p.count * 3), color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    color.copy(low).lerp(high, (p.getY(i) - min.y) / Math.max(.001, max.y - min.y));
    c.set([color.r, color.g, color.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
}

function grassClump() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const h = .25 + seeded(i, 1) * .35, a = seeded(i, 2) * 6.28, lean = .1 + seeded(i, 3) * .25;
    const blade = new THREE.BufferGeometry();
    const w = .022, pts = [[-w, 0], [w, 0], [-w * .7, h * .5], [w * .7, h * .5], [0, h]];
    const pos: number[] = [];
    const tri = (a: number[], b: number[], c: number[]) => pos.push(...[a, b, c].flatMap(([x, y]) => [x, y, (y / h) ** 2 * lean]));
    tri(pts[0], pts[1], pts[2]); tri(pts[1], pts[3], pts[2]); tri(pts[2], pts[3], pts[4]);
    blade.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    blade.rotateY(a).translate((seeded(i, 4) - .5) * .25, 0, (seeded(i, 5) - .5) * .25);
    blade.computeVertexNormals();
    parts.push(blade);
  }
  const g = mergeGeometries(parts)!;
  // Upward-facing normals light grass like a surface instead of flat cards.
  const n = g.getAttribute("normal");
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  paint(g, new THREE.Color("#141a12"), new THREE.Color("#5c6446"));
  return g;
}

function onRoad(x: number, z: number) {
  if (Math.hypot(x - POND.x, z - POND.z) < POND.radius + .6) return true;
  const s = surfaceAt({ x, z });
  return s === "stone" || s === "dirt" || s === "wood";
}
function nearBuilding(x: number, z: number, margin: number) {
  if (Math.abs(x - CHAPEL.x) < CHAPEL.w / 2 + margin && Math.abs(z - CHAPEL.z) < CHAPEL.d / 2 + margin) return true;
  return BUILDINGS.some(h => Math.abs(x - h.x) < h.w / 2 + margin && Math.abs(z - h.z) < h.d / 2 + margin);
}

export function buildNature(scene: THREE.Scene, assets: Assets, wind: Wind, quality: "high" | "low") {
  const objects: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const add = <T extends THREE.Object3D>(o: T) => { scene.add(o); objects.push(o); return o; };

  // Terrain.
  const size = 280, segments = 140;
  const terrain = new THREE.PlaneGeometry(size, size, segments, segments).rotateX(-Math.PI / 2).translate(0, 0, -15);
  const tp = terrain.getAttribute("position"), tuv = terrain.getAttribute("uv");
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    tp.setY(i, heightAt(x, z) - .02);
    tuv.setXY(i, x, z);
  }
  terrain.computeVertexNormals(); geometries.push(terrain);
  const groundMat = assets.surface("forest_ground_04", { metres: 3.2, color: "#8e9284" });
  const ground = add(new THREE.Mesh(terrain, groundMat)); ground.receiveShadow = true;

  // Streets and squares are soft-edged decals over the ground.
  const decal = (name: Parameters<Assets["surface"]>[0], metres: number, color: string, order: number) => {
    const m = assets.surface(name, { metres, color });
    Object.assign(m, { transparent: true, vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 - order, polygonOffsetUnits: -1 - order });
    // Wet stone: a lower roughness floor lets lamps and the moon streak across it.
    if (name.includes("cobble")) m.roughness = .55;
    return m;
  };
  const stone = decal("cobblestone_floor_08", 2.2, "#a4a8a6", 2), square = decal("cobblestone_square", 2.4, "#9a9e9b", 2), mud = decal("muddy_tracks", 3, "#8c8475", 1);
  for (const street of STREETS) {
    const g = softStrip(street.points, street.width + (street.surface === "stone" ? 1.2 : .8), .01); geometries.push(g);
    const mesh = add(new THREE.Mesh(g, street.surface === "stone" ? stone : mud)); mesh.receiveShadow = true; mesh.renderOrder = 1;
  }
  const marketGeo = softStrip([{ x: MARKET.x - MARKET.w / 2, z: MARKET.z }, { x: MARKET.x + MARKET.w / 2, z: MARKET.z }], MARKET.d + 2, .012); geometries.push(marketGeo);
  add(new THREE.Mesh(marketGeo, square)).receiveShadow = true;
  const clearing = softDisc(COUNCIL, 9, .008); geometries.push(clearing);
  add(new THREE.Mesh(clearing, mud)).receiveShadow = true;
  const southRoad = softStrip([{ x: 0, z: 26 }, { x: .5, z: 50 }, { x: -3, z: 80 }], 5, .02);
  const sr = southRoad.getAttribute("position"); for (let i = 0; i < sr.count; i++) sr.setY(i, heightAt(sr.getX(i), sr.getZ(i)) + .03);
  geometries.push(southRoad); add(new THREE.Mesh(southRoad, mud)).receiveShadow = true;

  // Forest: conifers and dead trees on the hills beyond the palisade.
  const pine = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, color: "#b8c4bb" });
  windify(pine, wind, .04, 1); assets.track(pine);
  const bark = assets.track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  windify(bark, wind, .02, 1);
  const pineVariants = [conifer(1), conifer(2), conifer(3)], deadVariants = [deadTree(4), deadTree(5)];
  geometries.push(...pineVariants, ...deadVariants);
  const count = quality === "high" ? 900 : 420;
  const placements: { x: number; z: number; s: number; dead: boolean }[] = [];
  for (let i = 0; placements.length < count && i < count * 6; i++) {
    const x = (seeded(i, 21) - .5) * 250, z = -15 + (seeded(i, 22) - .5) * 250;
    const outside = Math.max(BOUNDS.minX - x, x - BOUNDS.maxX, BOUNDS.minZ - z, z - BOUNDS.maxZ);
    if (outside < 3.5) continue;
    if (z > BOUNDS.maxZ && Math.abs(x) < 5) continue; // the road out of the gate
    if (outside > 30 && seeded(i, 23) < .55) continue; // thin the far forest
    placements.push({ x, z, s: 9 + seeded(i, 24) * 13, dead: seeded(i, 25) < .14 });
  }
  const t = new THREE.Object3D();
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, items: typeof placements, shadow: boolean) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
    items.forEach((p, i) => {
      t.position.set(p.x, heightAt(p.x, p.z) - .1, p.z); t.rotation.set(0, seeded(i, 26) * 6.28, (seeded(i, 27) - .5) * .06);
      t.scale.set(p.s * (.85 + seeded(i, 28) * .3), p.s, p.s * (.85 + seeded(i, 29) * .3)); t.updateMatrix(); mesh.setMatrixAt(i, t.matrix);
    });
    mesh.count = items.length; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    return add(mesh);
  };
  pineVariants.forEach((g, v) => instanced(g, pine, placements.filter((p, i) => !p.dead && i % 3 === v), true));
  deadVariants.forEach((g, v) => instanced(g, bark, placements.filter((p, i) => p.dead && i % 2 === v).map(p => ({ ...p, s: p.s * .9 })), true));

  // Grass clumps on soft ground only, denser along walls and fences.
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, color: "#aab09a" });
  windify(grassMat, wind, .12, .5); assets.track(grassMat);
  const clumpGeo = grassClump(); geometries.push(clumpGeo);
  const grassCount = quality === "high" ? 11000 : 4500;
  const grass = new THREE.InstancedMesh(clumpGeo, grassMat, grassCount);
  let g = 0;
  for (let i = 0; g < grassCount && i < grassCount * 5; i++) {
    const x = BOUNDS.minX - 4 + seeded(i, 31) * (BOUNDS.maxX - BOUNDS.minX + 8), z = BOUNDS.minZ - 4 + seeded(i, 32) * (BOUNDS.maxZ - BOUNDS.minZ + 8);
    if (onRoad(x, z) || nearBuilding(x, z, .1) || smoothNoise(x * .3, z * .3) < .35) continue;
    t.position.set(x, heightAt(x, z), z); t.rotation.set(0, seeded(i, 33) * 6.28, 0);
    const s = .8 + seeded(i, 34) * .9 + (nearBuilding(x, z, 1.2) ? .5 : 0); t.scale.set(s, s, s); t.updateMatrix();
    grass.setMatrixAt(g++, t.matrix);
  }
  grass.count = g; grass.receiveShadow = true; grass.computeBoundingSphere(); add(grass);

  // Poly Haven undergrowth: ferns and nettles hugging walls, shrubs at the palisade.
  const plants: { name: ModelName; spots: { x: number; z: number; s: number; r: number }[]; wind: number }[] = [
    { name: "fern_02", spots: [], wind: .05 }, { name: "nettle_plant", spots: [], wind: .06 }, { name: "shrub_02", spots: [], wind: .03 },
  ];
  for (let i = 0; i < 900; i++) {
    const x = BOUNDS.minX - 1 + seeded(i, 41) * (BOUNDS.maxX - BOUNDS.minX + 2), z = BOUNDS.minZ - 1 + seeded(i, 42) * (BOUNDS.maxZ - BOUNDS.minZ + 2);
    if (onRoad(x, z)) continue;
    const wall = nearBuilding(x, z, 1.4) && !nearBuilding(x, z, .25);
    const edge = x < BOUNDS.minX + 1.5 || x > BOUNDS.maxX - 1.5 || z < BOUNDS.minZ + 1.5 || z > BOUNDS.maxZ - 1;
    if (!wall && !edge) continue;
    if (!canWalk({ x, z }) && !edge) continue;
    const kind = edge && seeded(i, 43) < .5 ? 2 : seeded(i, 44) < .7 ? 0 : 1;
    // Budget: these are dense scanned meshes (4k–15k triangles each).
    if (plants[kind].spots.length >= [90, 26, 30][kind]) continue;
    plants[kind].spots.push({ x, z, s: .7 + seeded(i, 45) * .6, r: seeded(i, 46) * 6.28 });
  }
  const loaded = Promise.all(plants.map(async plant => {
    const gltf = await assets.model(plant.name);
    const { parts } = modelParts(gltf.scene);
    for (const part of parts) {
      const material = part.material as THREE.MeshStandardMaterial;
      windify(material, wind, plant.wind, .8);
      const mesh = new THREE.InstancedMesh(part.geometry, material, Math.max(1, plant.spots.length));
      plant.spots.forEach((p, i) => {
        t.position.set(p.x, 0, p.z); t.rotation.set(0, p.r, 0); t.scale.setScalar(p.s); t.updateMatrix();
        mesh.setMatrixAt(i, t.matrix.clone().multiply(part.matrix));
      });
      mesh.count = plant.spots.length; mesh.castShadow = false; mesh.receiveShadow = true; mesh.computeBoundingSphere();
      add(mesh);
    }
  })).catch(() => { /* Undergrowth is optional dressing. */ });

  return {
    loaded,
    dispose() { geometries.forEach(geo => geo.dispose()); objects.forEach(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); scene.remove(o); }); },
  };
}
