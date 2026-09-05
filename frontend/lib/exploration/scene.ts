import * as THREE from "three";
import { COUNCIL, COTTAGES, LANDMARKS, SPAWN, atCouncil, movePlayer, nearbyLandmark, type Point } from "./world";
import { advanceEncounter, canStartEncounter, encounterActive, newEncounter, VICTIM, type EncounterPhase } from "./encounter";
import { createCreatureEncounter } from "./creature";

export type SceneSnapshot = { point: Point; bearing: number; nearby: string | null; council: boolean; moving: boolean; encounter: EncounterPhase; ward: number };
export type SceneSettings = { playing: boolean; lantern: boolean; reducedMotion: boolean; brightness: number; found: string[] };
type SceneEvents = {
  ready: () => void;
  snapshot: (state: SceneSnapshot) => void;
  action: (key: "interact" | "journal" | "pause" | "lantern") => void;
  step: (running: boolean) => void;
  omen: () => void;
  encounter: (phase: EncounterPhase) => void;
  error: () => void;
};

const seeded = (i: number, salt = 1) => ((Math.sin(i * 127.1 + salt * 311.7) * 43758.5453) % 1 + 1) % 1;

/** Owns only the local scene and transient movement. React owns progression/UI. */
export function createVillage(canvas: HTMLCanvasElement, events: SceneEvents) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#303e45");
  scene.fog = new THREE.FogExp2("#303e45", .044);
  const camera = new THREE.PerspectiveCamera(64, 1, .08, 85);
  camera.rotation.order = "YXZ";
  const clock = new THREE.Timer();
  clock.connect(document);
  let settings: SceneSettings = { playing: false, lantern: true, reducedMotion: false, brightness: 1, found: [] };
  let point = { ...SPAWN };
  let yaw = 0;
  let pitch = -.035;
  let elapsed = 0;
  let lastSnapshot = 0;
  let footDistance = 0;
  let animation = 0;
  let destroyed = false;
  let walkTarget: Point | null = null;
  let omenSeen = false;
  let omenUntil = 0;
  let encounter = newEncounter();
  let wolfPosition: Point = { ...VICTIM };
  const keys = new Set<string>();
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const standard = (color: string, roughness = .92) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness });
    materials.push(material);
    return material;
  };
  const wood = standard("#777b76");
  const roof = standard("#444e50");
  const beam = standard("#242927");
  const stone = standard("#646d6d");
  const iron = standard("#171d1c", .55);
  const earth = standard("#303c36");
  const warm = new THREE.MeshStandardMaterial({ color: "#d99843", emissive: "#ff9a32", emissiveIntensity: 1.15 });
  const windowGlow = new THREE.MeshStandardMaterial({ color: "#7a552d", emissive: "#d48a35", emissiveIntensity: .65 });
  materials.push(warm, windowGlow);
  const loading = new THREE.LoadingManager();
  loading.onLoad = () => { if (!destroyed) events.ready(); };
  const textureLoader = new THREE.TextureLoader(loading);
  const timber = textureLoader.load("/exploration/weathered-timber.png", () => {
    if (destroyed) timber.dispose();
  }, undefined, () => { /* Geometry/material color remains a usable offline fallback. */ });
  timber.colorSpace = THREE.SRGBColorSpace;
  timber.wrapS = timber.wrapT = THREE.RepeatWrapping;
  timber.repeat.set(1.5, 1);
  timber.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  textures.push(timber);
  wood.map = timber;
  wood.bumpMap = timber;
  wood.bumpScale = .13;
  roof.map = timber;
  roof.bumpMap = timber;
  roof.bumpScale = .2;

  function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function cylinder(parent: THREE.Object3D, top: number, bottom: number, height: number, position: [number, number, number], material: THREE.Material, segments = 8) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  scene.add(new THREE.HemisphereLight("#a8c6d5", "#363b2e", 1.7));
  const moonLight = new THREE.DirectionalLight("#b4ccdb", 2.1);
  moonLight.position.set(-14, 25, -20);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  Object.assign(moonLight.shadow.camera, { left: -25, right: 25, top: 35, bottom: -35, near: 1, far: 80 });
  moonLight.shadow.bias = -.001;
  scene.add(moonLight);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 16), new THREE.MeshBasicMaterial({ color: "#899ba2", fog: false }));
  moon.position.set(9, 21, -58);
  scene.add(moon);

  // Soft atmosphere sprites break up the flat horizon without post-processing.
  const hazeCanvas = document.createElement("canvas");
  hazeCanvas.width = hazeCanvas.height = 128;
  const hazeContext = hazeCanvas.getContext("2d")!;
  const gradient = hazeContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(172,194,199,.45)");
  gradient.addColorStop(.35, "rgba(142,165,174,.15)");
  gradient.addColorStop(1, "rgba(142,165,174,0)");
  hazeContext.fillStyle = gradient; hazeContext.fillRect(0, 0, 128, 128);
  const hazeTexture = new THREE.CanvasTexture(hazeCanvas); textures.push(hazeTexture);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTexture, color: "#a1b7bf", transparent: true, depthWrite: false, fog: false, opacity: .5 }));
  halo.position.set(9, 21, -57); halo.scale.set(22, 22, 1); scene.add(halo);
  const fogBanks: THREE.Sprite[] = [];
  for (let i = 0; i < 12; i++) {
    const bank = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTexture, color: "#8eaaae", transparent: true, depthWrite: false, opacity: .23 }));
    bank.position.set((seeded(i, 31) - .5) * 15, .6 + seeded(i, 32) * 1.5, 14 - i * 5);
    bank.scale.set(19, 3 + seeded(i, 33) * 3, 1); scene.add(bank); fogBanks.push(bank);
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 115), earth);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -.07, -10);
  ground.receiveShadow = true;
  scene.add(ground);

  const paving = standard("#b0b8b5", .65);
  const pavingTexture = textureLoader.load("/exploration/wet-cobblestone.png", () => {
    if (destroyed) pavingTexture.dispose();
  }, undefined, () => {});
  pavingTexture.colorSpace = THREE.SRGBColorSpace;
  pavingTexture.wrapS = pavingTexture.wrapT = THREE.RepeatWrapping;
  pavingTexture.repeat.set(2.6, 22);
  pavingTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  textures.push(pavingTexture);
  paving.map = pavingTexture; paving.bumpMap = pavingTexture; paving.bumpScale = .16;
  const path = new THREE.Mesh(new THREE.PlaneGeometry(8, 66), paving);
  path.rotation.x = -Math.PI / 2; path.position.set(0, -.018, -8); path.receiveShadow = true; scene.add(path);

  // Instancing keeps dense cobbles and forest detail inexpensive to render.
  const cobbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), stone, 750);
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < 750; i++) {
    const z = 24 - seeded(i, 2) * 64;
    const x = (seeded(i, 3) - .5) * 7.6 + Math.sin(z * .1) * .5;
    transform.position.set(x, -.025, z);
    transform.rotation.set(0, seeded(i, 5) * 7, 0);
    transform.scale.set(.08 + seeded(i, 6) * .16, .03 + seeded(i, 7) * .035, .12 + seeded(i, 8) * .16);
    transform.updateMatrix();
    cobbles.setMatrixAt(i, transform.matrix);
    cobbles.setColorAt(i, tint.setHSL(.54, .045, .22 + seeded(i, 9) * .12));
  }
  cobbles.receiveShadow = true;
  scene.add(cobbles);

  function cottage(h: typeof COTTAGES[number], chapel = false) {
    const group = new THREE.Group();
    group.position.set(h.x, 0, h.z);
    scene.add(group);
    box(group, [h.w + .3, .5, h.d + .3], [0, .2, 0], stone);
    box(group, [h.w, h.h, h.d], [0, h.h / 2, 0], wood);
    const rise = h.w * .47;
    const length = Math.hypot(h.w / 2 + .55, rise);
    for (const side of [-1, 1]) {
      const panel = box(group, [length, .24, h.d + 1.1], [side * (h.w / 4 + .16), h.h + rise / 2, 0], roof);
      panel.rotation.z = -side * Math.atan2(rise, h.w / 2 + .55);
      for (const z of [-h.d / 2 - .02, h.d / 2 + .02]) {
        box(group, [.2, h.h, .2], [side * h.w / 2, h.h / 2, z], beam);
      }
    }
    // Seal the triangular gables with textured faces.
    const shape = new THREE.Shape();
    shape.moveTo(-h.w / 2, 0); shape.lineTo(h.w / 2, 0); shape.lineTo(0, rise); shape.closePath();
    const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h.d, bevelEnabled: false }), wood);
    gable.position.set(0, h.h, -h.d / 2);
    group.add(gable);
    for (let y = .7; y < h.h; y += 1.05) {
      box(group, [h.w + .08, .075, h.d + .08], [0, y, 0], beam);
    }
    box(group, [1.25, 2.3, .14], [0, 1.15, h.d / 2 + .08], beam);
    for (const side of [-1, 1]) {
      box(group, [.86, 1.05, .12], [side * h.w * .29, 2.2, h.d / 2 + .09], windowGlow);
      box(group, [.09, 1.12, .17], [side * h.w * .29, 2.2, h.d / 2 + .18], beam);
      box(group, [.95, .09, .17], [side * h.w * .29, 2.2, h.d / 2 + .18], beam);
    }
    const inward = h.x < 0 ? 1 : -1;
    box(group, [.13, 1.05, .85], [inward * (h.w / 2 + .08), 2.1, 0], windowGlow);
    box(group, [.2, 1.15, .09], [inward * (h.w / 2 + .14), 2.1, 0], beam);
    box(group, [.2, .09, .98], [inward * (h.w / 2 + .14), 2.1, 0], beam);
    box(group, [.65, 2.4, .8], [-h.w * .28, h.h + rise, -1], stone);
    if (chapel) {
      box(group, [2.1, 4.3, 2.1], [0, h.h + 2.9, 0], stone);
      for (const x of [-.8, .8]) for (const z of [-.8, .8]) box(group, [.2, 2.3, .2], [x, h.h + 5.6, z], beam);
      const steeple = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.5, 4), roof);
      steeple.position.set(0, h.h + 8.2, 0); steeple.rotation.y = Math.PI / 4; group.add(steeple);
      cylinder(group, .27, .55, .6, [0, h.h + 5.3, 0], iron);
    }
  }
  COTTAGES.forEach(h => cottage(h));
  cottage({ x: -7, z: -25, w: 6, d: 8, h: 5.8 }, true);
  box(scene, [.15, 2.8, 1.6], [-3.92, 1.4, -24], beam);

  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .38, 1, 6), beam, 240);
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.025, .1, 1, 5), beam, 480);
  for (let i = 0; i < 240; i++) {
    const x = (i % 2 ? -1 : 1) * (12 + seeded(i, 11) * 22);
    const z = 30 - seeded(i, 12) * 100;
    const h = 7 + seeded(i, 13) * 12;
    transform.position.set(x, h / 2, z); transform.rotation.set(.04, 0, (seeded(i, 14) - .5) * .15); transform.scale.set(1, h, 1); transform.updateMatrix(); trunks.setMatrixAt(i, transform.matrix);
    for (let b = 0; b < 2; b++) {
      transform.position.set(x + (b ? 1 : -1), h * (.57 + b * .15), z);
      transform.rotation.set(.4, seeded(i, 15) * 6, b ? -.7 : .8); transform.scale.set(1, 3.2, 1); transform.updateMatrix(); branches.setMatrixAt(i * 2 + b, transform.matrix);
    }
  }
  scene.add(trunks, branches);
  for (const [x, z] of [[-4.4, 18], [4.6, -1], [-4.6, -11], [4.8, -26]]) {
    const tree = cylinder(scene, .2, .55, 15, [x, 7.5, z], wood, 9);
    tree.rotation.z = x * .008;
    for (let i = 0; i < 5; i++) {
      const limb = cylinder(scene, .02, .16, 4.5, [x + (i % 2 ? 1 : -1), 6 + i * 1.6, z], beam, 6);
      limb.rotation.z = i % 2 ? -.8 : .8; limb.rotation.x = i * .7;
    }
  }

  // Broken fences frame the path without blocking the walkable lane.
  const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(.11, 1, .12), wood, 140);
  for (let i = 0; i < 140; i++) {
    transform.position.set((i % 2 ? -1 : 1) * 4.2, .45, 23 - Math.floor(i / 2) * .8);
    transform.rotation.set(0, 0, (seeded(i, 16) - .5) * .32); transform.scale.set(1, .6 + seeded(i, 17) * .6, 1); transform.updateMatrix(); fence.setMatrixAt(i, transform.matrix);
  }
  scene.add(fence);
  for (const side of [-1, 1]) box(scene, [.1, .1, 55], [side * 4.2, .58, -4], wood);

  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(.09, 1, 3), standard("#414137"), 1100);
  for (let i = 0; i < 1100; i++) {
    const height = .15 + seeded(i, 41) * .45;
    transform.position.set((i % 2 ? -1 : 1) * (3.7 + seeded(i, 42) * 6), height / 2, 24 - seeded(i, 43) * 64);
    transform.rotation.set((seeded(i, 44) - .5) * .4, seeded(i, 45) * 6, (seeded(i, 46) - .5) * .6);
    transform.scale.set(1, height, 1); transform.updateMatrix(); grass.setMatrixAt(i, transform.matrix);
  }
  scene.add(grass);

  const lamps: { light: THREE.PointLight; base: number }[] = [];
  function lantern(x: number, z: number, lit = true) {
    cylinder(scene, .045, .08, 2.8, [x, 1.4, z], iron);
    box(scene, [.48, .06, .06], [x + .2, 2.75, z], iron);
    cylinder(scene, .2, .23, .08, [x + .42, 2.15, z], iron);
    cylinder(scene, .23, .18, .09, [x + .42, 2.65, z], iron);
    cylinder(scene, .085, .085, .37, [x + .42, 2.39, z], warm);
    for (const dx of [-.15, .15]) box(scene, [.025, .46, .025], [x + .42 + dx, 2.4, z], iron);
    if (lit) {
      const light = new THREE.PointLight("#ffac54", 15, 10, 1.65);
      light.position.set(x + .42, 2.4, z); scene.add(light); lamps.push({ light, base: 15 });
    }
  }
  lantern(-2.6, 13); lantern(3.6, 1); lantern(-3.4, -12); lantern(-1.8, -24);
  const well = new THREE.Mesh(new THREE.CylinderGeometry(.95, 1.05, .95, 16, 1, true), stone);
  well.position.set(2.5, .45, -3); scene.add(well);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.98, .15, 6, 20), stone);
  rim.rotation.x = Math.PI / 2; rim.position.set(2.5, .96, -3); scene.add(rim);
  const water = new THREE.Mesh(new THREE.CircleGeometry(.85, 24), new THREE.MeshStandardMaterial({ color: "#030a0b", roughness: .13, metalness: .7 }));
  water.rotation.x = -Math.PI / 2; water.position.set(2.5, .12, -3); scene.add(water);
  for (const x of [1.35, 3.65]) box(scene, [.12, 2.6, .15], [x, 1.3, -3], wood);
  box(scene, [2.6, .15, .17], [2.5, 2.6, -3], wood);
  cylinder(scene, .015, .015, 2.6, [2.5, 1.3, -3], beam);

  const seals = LANDMARKS.map(l => {
    const seal = new THREE.Mesh(new THREE.TorusGeometry(.18, .045, 6, 24), warm);
    seal.position.set(l.x, 1.1, l.z + .8); scene.add(seal); return seal;
  });

  // The council is the final destination, visually legible through the fog.
  cylinder(scene, 1.1, 1.3, .3, [COUNCIL.x, .1, COUNCIL.z], stone, 14);
  const fire = new THREE.Mesh(new THREE.ConeGeometry(.48, 1.2, 7), warm);
  fire.position.set(0, .7, COUNCIL.z); scene.add(fire);
  const firelight = new THREE.PointLight("#ff9346", 35, 16, 1.7);
  firelight.position.set(0, 2, COUNCIL.z); scene.add(firelight);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    const x = Math.sin(a) * 3.8; const z = COUNCIL.z + Math.cos(a) * 3.8;
    cylinder(scene, .4, .55, .75, [x, .35, z], wood);
  }

  function character(name: string, x: number, z: number, color = "#9da8a2") {
    const texture = textureLoader.load(`/characters/full/${name}.webp`, () => {
      if (destroyed) texture.dispose();
    }, undefined, () => {});
    texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const person = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, alphaTest: .08 }));
    person.position.set(x, 1.17, z); person.scale.set(1.56, 2.34, 1); scene.add(person); return person;
  }
  ["mara", "tomas", "elin", "bram", "sable", "corvin"].forEach((name, i) => {
    const angle = (i + 1) / 7 * Math.PI * 2;
    character(name, Math.sin(angle) * 4.1, COUNCIL.z + Math.cos(angle) * 4.1);
  });

  // A distant silhouette is a brief environmental event, not a combat enemy.
  const watcher = character("corvin", -2.5, -16, "#142125");
  watcher.visible = false;
  const creature = createCreatureEncounter(scene);

  const lamp = new THREE.PointLight("#ffd08b", 14, 12, 1.6);
  scene.add(lamp);
  const hand = new THREE.Group();
  cylinder(hand, .1, .13, .08, [0, -.2, 0], iron);
  cylinder(hand, .13, .1, .07, [0, .2, 0], iron);
  cylinder(hand, .045, .045, .3, [0, 0, 0], warm);
  for (const x of [-.09, .09]) box(hand, [.018, .4, .018], [x, 0, 0], iron);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.095, .012, 6, 20, Math.PI), iron); handle.position.y = .23; hand.add(handle);
  camera.add(hand); hand.position.set(.41, -.44, -.85); hand.scale.setScalar(.62); scene.add(camera);

  const rainPositions = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) { rainPositions[i * 3] = (seeded(i, 20) - .5) * 35; rainPositions[i * 3 + 1] = seeded(i, 21) * 15; rainPositions[i * 3 + 2] = (seeded(i, 22) - .5) * 55; }
  const rainGeometry = new THREE.BufferGeometry(); rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({ color: "#d0dce0", size: .024, transparent: true, opacity: .25 }));
  scene.add(rain);

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function clearInput() { keys.clear(); walkTarget = null; }
  function unlock() { if (document.pointerLockElement === canvas) document.exitPointerLock(); }
  function keydown(event: KeyboardEvent) {
    if (!settings.playing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "e", "f", "j", "escape"].includes(key)) event.preventDefault();
    if (!event.repeat) {
      if (key === "e") events.action("interact");
      if (key === "j") events.action("journal");
      if (key === "f") events.action("lantern");
      if (key === "escape") events.action("pause");
    }
    keys.add(key); walkTarget = null;
  }
  function keyup(event: KeyboardEvent) { keys.delete(event.key.toLowerCase()); }
  function blur() { clearInput(); if (settings.playing) events.action("pause"); }
  function visibility() { if (document.hidden) blur(); }
  let dragging: { x: number; y: number; startX: number; startY: number } | null = null;
  function pointerdown(event: PointerEvent) {
    if (!settings.playing) return;
    canvas.focus();
    dragging = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  }
  function pointermove(event: PointerEvent) {
    if (!settings.playing) return;
    let dx = 0, dy = 0;
    if (document.pointerLockElement === canvas) { dx = event.movementX; dy = event.movementY; }
    else if (dragging) { dx = event.clientX - dragging.x; dy = event.clientY - dragging.y; dragging.x = event.clientX; dragging.y = event.clientY; }
    else return;
    yaw -= dx * .003; pitch = THREE.MathUtils.clamp(pitch - dy * .0025, -.9, .85);
  }
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function pointerup(event: PointerEvent) {
    if (dragging && Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) < 7 && settings.playing) {
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      if (raycaster.ray.intersectPlane(groundPlane, hit) && Math.hypot(hit.x - point.x, hit.z - point.z) < 14) walkTarget = { x: hit.x, z: hit.z };
    }
    dragging = null;
  }
  function cancelPointer() { dragging = null; }
  function lockchange() { if (!document.pointerLockElement && settings.playing) blur(); }
  function contextlost(event: Event) { event.preventDefault(); settings.playing = false; events.error(); }
  window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", visibility); document.addEventListener("pointerlockchange", lockchange);
  canvas.addEventListener("pointerdown", pointerdown); window.addEventListener("pointermove", pointermove);
  canvas.addEventListener("pointerup", pointerup); canvas.addEventListener("pointercancel", cancelPointer); canvas.addEventListener("webglcontextlost", contextlost);

  function frame() {
    if (destroyed) return;
    animation = requestAnimationFrame(frame);
    clock.update();
    const dt = Math.min(clock.getDelta(), .05);
    if (settings.playing) elapsed += dt;
    let moving = false;
    const running = keys.has("shift");
    if (settings.playing) {
      if (keys.has("arrowleft")) yaw += dt * 1.5;
      if (keys.has("arrowright")) yaw -= dt * 1.5;
      const forward = Number(keys.has("w") || keys.has("arrowup")) - Number(keys.has("s") || keys.has("arrowdown"));
      const strafe = Number(keys.has("d")) - Number(keys.has("a"));
      let dx = -Math.sin(yaw) * forward + Math.cos(yaw) * strafe;
      let dz = -Math.cos(yaw) * forward - Math.sin(yaw) * strafe;
      let speed = running ? 4.5 : 2.5;
      if (walkTarget) {
        dx = walkTarget.x - point.x; dz = walkTarget.z - point.z;
        if (Math.hypot(dx, dz) < .15) { walkTarget = null; dx = dz = 0; }
        else speed = Math.min(speed, Math.hypot(dx, dz) / dt);
      }
      const length = Math.hypot(dx, dz);
      if (length > 0) {
        const next = movePlayer(point, dx / length * speed * dt, dz / length * speed * dt, creature.obstacles());
        const distance = Math.hypot(next.x - point.x, next.z - point.z);
        moving = distance > .001; footDistance += distance; point = next;
        if (!moving) walkTarget = null;
        if (footDistance > (running ? 1.5 : 1.15)) { events.step(running); footDistance = 0; }
      }
      if (settings.found.length > 0 && point.z < 10 && !omenSeen) { omenSeen = true; omenUntil = elapsed + 2; events.omen(); }
    }
    const wolfDx = wolfPosition.x - point.x, wolfDz = wolfPosition.z - point.z;
    const wolfDistance = Math.hypot(wolfDx, wolfDz);
    const facingWolf = wolfDistance > 0 && (-Math.sin(yaw) * wolfDx - Math.cos(yaw) * wolfDz) / wolfDistance > .65;
    const warding = settings.lantern && facingWolf && wolfDistance < 9;
    const previousPhase = encounter.phase;
    encounter = advanceEncounter(encounter, dt, { playing: settings.playing, trigger: canStartEncounter(point, yaw, settings.found), warding, distance: wolfDistance, escaped: point.z < -19 || wolfDistance > 19 });
    if (encounter.phase !== previousPhase) {
      if (encounter.phase === "hunting") wolfPosition = { x: VICTIM.x, z: VICTIM.z + .5 };
      if (encounter.phase === "caught") { clearInput(); settings.playing = false; }
      events.encounter(encounter.phase);
    }
    if (encounter.phase === "hunting" && settings.playing && wolfDistance > .001) {
      const speed = warding ? (wolfDistance < 3 ? -1 : 0) : 2.3;
      wolfPosition = movePlayer(wolfPosition, -wolfDx / wolfDistance * dt * speed, -wolfDz / wolfDistance * dt * speed);
    }
    creature.pose(encounter, wolfPosition, point, settings.reducedMotion);
    watcher.visible = settings.playing && elapsed < omenUntil && !settings.reducedMotion;
    camera.position.set(point.x, 1.68 + (moving && !settings.reducedMotion ? Math.sin(elapsed * (running ? 12 : 8)) * .025 : 0), point.z);
    camera.rotation.set(pitch, yaw, 0);
    hand.visible = settings.lantern;
    hand.rotation.z = moving && !settings.reducedMotion ? Math.sin(elapsed * 5) * .04 : 0;
    lamp.position.copy(camera.position); lamp.position.y -= .45;
    lamp.intensity = settings.lantern ? 14 + (settings.reducedMotion ? 0 : Math.sin(elapsed * 7) * .5) : 0;
    lamps.forEach(({ light, base }, i) => { light.intensity = base + (settings.reducedMotion ? 0 : Math.sin(elapsed * 5 + i) * 1.2); });
    seals.forEach((seal, i) => { seal.visible = !settings.found.includes(LANDMARKS[i].id); seal.rotation.y = settings.reducedMotion ? 0 : elapsed * .4; });
    fire.scale.y = settings.reducedMotion ? 1 : 1 + Math.sin(elapsed * 7) * .1;
    rain.visible = !settings.reducedMotion;
    rain.position.set(point.x, -(elapsed * 2 % 8), point.z);
    fogBanks.forEach((bank, i) => { if (!settings.reducedMotion) bank.position.x = Math.sin(elapsed * .045 + i * 2) * 4; });
    if (elapsed - lastSnapshot > .12 || lastSnapshot === 0) {
      events.snapshot({ point: { ...point }, bearing: ((-yaw * 180 / Math.PI) % 360 + 360) % 360, nearby: encounterActive(encounter.phase) ? null : nearbyLandmark(point, settings.found)?.id ?? null, council: !encounterActive(encounter.phase) && atCouncil(point, settings.found), moving, encounter: encounter.phase, ward: encounter.lightTime / 2.6 });
      lastSnapshot = elapsed || -.001;
    }
    renderer.render(scene, camera);
  }
  frame();

  return {
    configure(next: SceneSettings) {
      settings = next;
      renderer.toneMappingExposure = 1.35 * next.brightness;
      if (!next.playing) { clearInput(); dragging = null; unlock(); }
    },
    reset() { point = { ...SPAWN }; yaw = 0; pitch = -.035; elapsed = 0; lastSnapshot = 0; omenSeen = false; omenUntil = 0; encounter = newEncounter(); wolfPosition = { ...VICTIM }; events.encounter("waiting"); clearInput(); },
    retryEncounter() { point = { x: 0, z: 3.8 }; yaw = 0; pitch = -.035; encounter = newEncounter(); wolfPosition = { ...VICTIM }; lastSnapshot = 0; events.encounter("waiting"); clearInput(); },
    step(direction: "forward" | "back" | "left" | "right") {
      if (!settings.playing) return;
      if (direction === "left" || direction === "right") { yaw += direction === "left" ? Math.PI / 8 : -Math.PI / 8; return; }
      const sign = direction === "forward" ? 1 : -1;
      const start = walkTarget ?? point;
      walkTarget = { x: start.x - Math.sin(yaw) * 2 * sign, z: start.z - Math.cos(yaw) * 2 * sign };
    },
    async lockPointer() { await canvas.requestPointerLock(); },
    dispose() {
      destroyed = true; cancelAnimationFrame(animation); observer.disconnect(); clock.dispose(); unlock();
      window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility); document.removeEventListener("pointerlockchange", lockchange);
      canvas.removeEventListener("pointerdown", pointerdown); window.removeEventListener("pointermove", pointermove);
      canvas.removeEventListener("pointerup", pointerup); canvas.removeEventListener("pointercancel", cancelPointer); canvas.removeEventListener("webglcontextlost", contextlost);
      const geometries = new Set<THREE.BufferGeometry>();
      const usedMaterials = new Set<THREE.Material>(materials);
      scene.traverse(object => {
        if (object instanceof THREE.Sprite) usedMaterials.add(object.material);
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => usedMaterials.add(m));
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      geometries.forEach(g => g.dispose()); usedMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose();
    },
  };
}

export type VillageScene = ReturnType<typeof createVillage>;
