import * as THREE from "three";
import { StaticBatch } from "./architecture";
import { modelParts, type Assets } from "./assets";
import { FALLS, TEMPLE, RUINS, RUIN_WALLS, TEMPLE_COLUMNS } from "./world";

const random = (n: number, salt = 1) => { const f = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453; return f - Math.floor(f); };

/** Local, batched ruins and a GPU-animated waterfall; no additional remote assets. */
export function buildWilderness(scene: THREE.Scene, assets: Assets, quality: "high" | "low") {
  const batch = new StaticBatch();
  const stone = assets.surface("castle_brick_07", { metres: 2.2, color: "#89958b" });
  const rock = assets.surface("rustic_stone_wall", { metres: 3.8, color: "#657775", normal: 1.4 });
  const wood = assets.surface("dark_wooden_planks", { metres: 1.5, color: "#665c50" });
  const moss = assets.surface("worn_mossy_plasterwall", { metres: 2, color: "#67705a" });
  const brass = assets.track(new THREE.MeshStandardMaterial({ color: "#817452", roughness: .7, metalness: .55 }));
  const candle = assets.track(new THREE.MeshStandardMaterial({ color: "#ffd492", emissive: "#f0ab52", emissiveIntensity: 2.5 }));
  const lampPoints: THREE.Vector3[] = [];
  let disposed = false;

  // Roofless rooms stay walkable; rendered wall segments share collision data.
  for (const wall of RUIN_WALLS) {
    batch.box(stone, [wall.w, wall.h, wall.d], [wall.x, wall.h / 2, wall.z]);
    const length = Math.max(wall.w, wall.d), alongX = wall.w > wall.d;
    for (let i = 0; i < length; i++) {
      const h = .15 + random(i + wall.x, 3) * .5, offset = i - length / 2 + .5;
      batch.box(moss, [alongX ? .85 : wall.w, h, alongX ? wall.d : .85], [wall.x + (alongX ? offset : 0), wall.h + h / 2, wall.z + (alongX ? 0 : offset)], [0, 0, (random(i, 4) - .5) * .07]);
    }
  }
  // Temple: open colonnade, fallen lintels and a broken lunar relief.
  batch.box(stone, [11, .08, 13], [TEMPLE.x, .02, TEMPLE.z]);
  for (const c of TEMPLE_COLUMNS) {
    batch.box(stone, [1.3, .24, 1.3], [c.x, .12, c.z]);
    batch.cylinder(stone, .42, .55, c.h, [c.x, c.h / 2, c.z], 12);
    batch.box(moss, [1.2, .28, 1.2], [c.x, c.h, c.z]);
    for (let ring = 0; ring < c.h; ring += .8) batch.add(moss, new THREE.TorusGeometry(.47, .025, 4, 12), [c.x, ring + .3, c.z], [Math.PI / 2, 0, 0]);
  }
  batch.box(stone, [9.8, .7, 1.1], [TEMPLE.x, 5.65, -81]);
  batch.add(stone, new THREE.TorusGeometry(3.1, .4, 8, 32, Math.PI), [TEMPLE.x, 5.9, -81]);
  batch.add(brass, new THREE.TorusGeometry(1.3, .13, 8, 32, Math.PI * 1.6), [TEMPLE.x, 3.3, -93.45], [0, 0, .6]);
  // A leaning slab and roots around the walls, without obstructing the central aisle.
  for (let i = 0; i < 24; i++) {
    const x = TEMPLE.x + (i % 2 ? -6.2 : 6.2), z = -93 + random(i, 5) * 14;
    batch.add(wood, new THREE.CylinderGeometry(.035, .16, 2 + random(i, 6) * 2, 5), [x, .35, z], [.9, random(i, 7) * 3, .3]);
  }
  for (const x of [TEMPLE.x - 2, TEMPLE.x + 2]) {
    batch.cylinder(stone, .3, .48, 1.4, [x, .7, -90], 10);
    for (let j = 0; j < 3; j++) {
      batch.cylinder(wood, .07, .08, .35, [x + (j - 1) * .15, 1.5, -90], 6);
      batch.add(candle, new THREE.SphereGeometry(.065, 6, 6), [x + (j - 1) * .15, 1.72, -90]);
    }
    lampPoints.push(new THREE.Vector3(x, 1.8, -90));
  }

  // Abandoned houses: exposed rafters, collapsed roof timbers, empty windows.
  for (const x of [RUINS.x - 6, RUINS.x + 6]) {
    for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
      if (i === 2 && side > 0) continue;
      batch.box(wood, [.14, .18, 4], [x + side * 1.5, 3.4, -71 - i * 1.8], [0, Math.PI / 2, side * -.6]);
    }
    batch.box(wood, [.2, .22, 7], [x, 4.4, -74]);
    batch.box(wood, [.2, 3.2, .2], [x - 2.8, 1.6, -70]);
    batch.box(wood, [3.8, .16, .5], [x, .3, -76], [0, .35, .1]);
    batch.box(wood, [1.4, .1, 1], [x - 1, .8, -75]);
    for (const s of [-.55, .55]) batch.box(wood, [.08, .8, .08], [x - 1 + s, .4, -75]);
    batch.box(moss, [1.4, 1, .06], [x, 1.8, -77.72]);
    for (let i = 0; i < 3; i++) batch.box(wood, [1.8, .13, .08], [x, 1.4 + i * .45, -77.65], [0, 0, (i - 1) * .16]);
  }

  // Scanned CC0 rock surfaces replace the lightweight fallback when available.
  const rockBatch = new StaticBatch();
  const boulders: { x: number; y: number; z: number; w: number; h: number; d: number; yaw: number }[] = [];
  for (let i = 0; i < 19; i++) {
    const x = FALLS.x - 12 + i * 1.4, h = 7 + random(i, 12) * 5;
    const g = new THREE.DodecahedronGeometry(1, 1); g.scale(2.2, h / 2, 2.8);
    const z = FALLS.z - 8 - random(i, 13), yaw = random(i, 14) * 2;
    rockBatch.add(rock, g, [x, h / 2 - .2, z], [0, yaw, .06]);
    boulders.push({ x, y: -.2, z, w: 4.4, h, d: 5.6, yaw });
  }
  for (let i = 0; i < 42; i++) {
    const a = i / 42 * Math.PI * 2, r = FALLS.radius + .2;
    const g = new THREE.DodecahedronGeometry(.5 + random(i, 15) * .6, 1); g.scale(1.2, .7, 1);
    const x = FALLS.x + Math.cos(a) * r, z = FALLS.z + Math.sin(a) * r, yaw = random(i, 16) * 6;
    rockBatch.add(rock, g, [x, .1, z], [0, yaw, .1]);
    boulders.push({ x, y: -.15, z, w: 1.4, h: .65, d: 1.2, yaw });
  }
  const fallbackRocks = rockBatch.build(scene);
  // The moss-rock scan is ~9k triangles (the large boulder is ~54k); reuse
  // this lower-cost mesh for the repeated cliff and bank, including mobile.
  void assets.model("rock_moss_set_01").then(gltf => {
    if (disposed) return;
    const { parts, box } = modelParts(gltf.scene), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const offset = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
    const transform = new THREE.Object3D();
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, boulders.length);
      boulders.forEach((b, i) => {
        transform.position.set(b.x, b.y, b.z); transform.rotation.set(0, b.yaw, 0);
        transform.scale.set(b.w / size.x, b.h / size.y, b.d / size.z); transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix.clone().multiply(offset).multiply(part.matrix));
      });
      mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
    }
    fallbackRocks.forEach(mesh => { scene.remove(mesh); mesh.geometry.dispose(); });
  }).catch(() => { /* The generated cliff still defines the waterfall if its scan is unavailable. */ });
  batch.build(scene);

  const time = { value: 0 };
  const waterMaterial = assets.track(new THREE.ShaderMaterial({
    uniforms: { time, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) }, fog: true,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 waterUv;
      #include <fog_pars_vertex>
      void main(){ waterUv=uv; vec3 p=position; p.x*=.75+(1.-uv.y)*.45; p.z+=sin(p.y*2.2+p.x*3.0)*.09;
        vec4 mvPosition=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; varying vec2 waterUv;
      #include <fog_pars_fragment>
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p), f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){vec2 p=waterUv;
        float flow=noise(vec2(p.x*35.,p.y*8.+time*3.));
        float fine=noise(vec2(p.x*90.,p.y*22.+time*8.));
        float edge=smoothstep(.015,.16,p.x+flow*.06)*smoothstep(.015,.16,1.-p.x-fine*.06);
        edge*=smoothstep(0.,.04,p.y)*smoothstep(0.,.025,1.-p.y);
        float foam=flow*.65+fine*.35;
        vec3 col=mix(vec3(.14,.28,.30),vec3(.67,.82,.83),foam);
        gl_FragColor=vec4(col,edge*(.16+foam*.52));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  }));
  for (let i = 0; i < 3; i++) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3.6 - i * .5, 9.4 - i * .5, 12, 20), waterMaterial);
    sheet.position.set(FALLS.x + (i - 1) * .9, 4.8 - i * .15, FALLS.z - 5.2 + i * .35);
    sheet.rotation.x = -.06 + i * .025; scene.add(sheet);
  }
  const pool = new THREE.Mesh(new THREE.CircleGeometry(FALLS.radius, 64), assets.track(new THREE.MeshStandardMaterial({ color: "#19363a", roughness: .2, metalness: .4 })));
  pool.rotation.x = -Math.PI / 2; pool.position.set(FALLS.x, .04, FALLS.z); scene.add(pool);
  const rings: THREE.Mesh[] = [];
  const foam = assets.track(new THREE.MeshBasicMaterial({ color: "#b2d2cf", transparent: true, opacity: .18, depthWrite: false }));
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(.92, 1, 48), foam.clone());
    assets.track(ring.material); ring.rotation.x = -Math.PI / 2; ring.position.set(FALLS.x, .065, FALLS.z - 2); scene.add(ring); rings.push(ring);
  }
  const count = quality === "high" ? 100 : 40;
  const sprayPositions = new Float32Array(count * 3), spray = new THREE.BufferGeometry();
  spray.setAttribute("position", new THREE.BufferAttribute(sprayPositions, 3));
  const mist = assets.track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `void main(){vec4 p=modelViewMatrix*vec4(position,1.); gl_PointSize=min(220.,1100./max(1.,-p.z)); gl_Position=projectionMatrix*p;}`,
    fragmentShader: `void main(){float a=1.-smoothstep(0.,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.49,.65,.67,a*.045);}`,
  }));
  const sprayCloud = new THREE.Points(spray, mist); sprayCloud.frustumCulled = false; scene.add(sprayCloud);
  return {
    lampPoints,
    update(clock: number, reduced: boolean) {
      const t = reduced ? 0 : clock; time.value = t;
      rings.forEach((r, i) => { const phase = (t * .22 + i / 6) % 1; r.scale.setScalar(.4 + phase * 4); (r.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * .16; });
      for (let i = 0; i < count; i++) {
        const life = (t * .14 + random(i, 21)) % 1;
        sprayPositions[i * 3] = FALLS.x + (random(i, 22) - .5) * (4 + life * 9);
        sprayPositions[i * 3 + 1] = .2 + life * 2.8;
        sprayPositions[i * 3 + 2] = FALLS.z - 3 + random(i, 23) * 3 + life * 4;
      }
      spray.attributes.position.needsUpdate = true;
    },
    dispose() { disposed = true; },
  };
}
