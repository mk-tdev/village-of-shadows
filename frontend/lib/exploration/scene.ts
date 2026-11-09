import * as THREE from "three";
import { COUNCIL, COUNCIL_SEAT, LANDMARKS, SPAWN, atCouncil, canWalk, districtAt, movePlayer, nearbyLandmark, supportHeightAt, surfaceAt, type Obstacle, type Point, type Surface } from "./world";
import { advanceJump, cameraDistance, followCameraHeight, groundedJump, RUN_SPEED, WALK_SPEED } from "./locomotion";
import { createTraveller, type CameraView, type TravellerName } from "./traveller";
import { advanceEncounter, canStartEncounter, encounterActive, newEncounter, VICTIM, type EncounterPhase } from "./encounter";
import { createCreatureEncounter } from "./creature";
import { createKeepsakes } from "./props";
import { createCouncilFire } from "./fire";
import { createAssets } from "./assets";
import { buildArchitecture } from "./architecture";
import { buildNature } from "./nature";
import { buildWilderness } from "./wilderness";
import { buildAbbey, type AbbeyCue, type AbbeyFrame } from "./abbey";
import { ABBEY_TRAIL, BELFRY_TOP, BELL, TOWER } from "./world";
import { buildDressing, COUNCIL_CHAIRS, COUNCIL_SEAT_HEIGHT } from "./dressing";
import { createAtmosphere, DAY_FOG_COLOR, FOG_COLOR, MOON_DIRECTION, SUN_DIRECTION } from "./atmosphere";
import { createPost } from "./post";
import { createCast, handLantern, patrol, seated, standing, type CharacterName, type Villager, type Character } from "./characters";

export type NearbyVillager = { id: string; name: string; line: string };
export type SceneSnapshot = { point: Point; bearing: number; nearby: string | null; council: boolean; moving: boolean; encounter: EncounterPhase; ward: number; district: string; villager: NearbyVillager | null; loading: number; abbey: Omit<AbbeyFrame, "interior"> };
export type SceneSettings = { playing: boolean; lantern: boolean; reducedMotion: boolean; brightness: number; found: string[]; view: CameraView; traveller: TravellerName; running: boolean; daytime: boolean };
type SceneEvents = {
  abbey: (cue: AbbeyCue, source: Point) => void;
  ready: () => void;
  snapshot: (state: SceneSnapshot) => void;
  action: (key: "interact" | "journal" | "pause" | "lantern" | "view") => void;
  avatarError: () => void;
  step: (running: boolean, surface: Surface) => void;
  omen: () => void;
  encounter: (phase: EncounterPhase) => void;
  spatial: (player: Point, yaw: number, wolf: Point, interior: number) => void;
  thunder: (delay: number, strength: number) => void;
  error: () => void;
};

const LIGHT_POOL = 6;

/** Owns only the local scene and transient movement. React owns progression/UI. */
export function createVillage(canvas: HTMLCanvasElement, events: SceneEvents) {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const quality: "high" | "low" = coarse || (navigator.hardwareConcurrency ?? 8) < 6 ? "low" : "high";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio, quality === "high" ? 1.5 : 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.FogExp2(FOG_COLOR, .028);
  scene.environmentIntensity = .32;
  const camera = new THREE.PerspectiveCamera(62, 1, .08, 420);
  camera.rotation.order = "YXZ";
  const timer = new THREE.Timer();
  timer.connect(document);
  let settings: SceneSettings = { playing: false, lantern: true, reducedMotion: false, brightness: 1, found: [], view: "first", traveller: "woodsman_man", running: false, daytime: false };
  // 0 = night, 1 = day; eased so the toggle reads as the sky turning, not a cut.
  let day = 0, dayPrimed = false;
  let jump = groundedJump(), jumpRequested = false, facing = Math.PI;
  let ringRequested = false, interior = 0;
  let abbeyFrame: AbbeyFrame = { phase: "dormant", ward: 0, bell: null, interior: 0 };
  let point = { ...SPAWN };
  let velocity = { x: 0, z: 0 };
  let yaw = 0;
  let pitch = -.035;
  let sitting: { from: Point; yaw: number; pitch: number; progress: number; resolve: () => void } | null = null;
  let seated_ = false;
  let elapsed = 0, world = 0;
  let lastSnapshot = 0;
  let footDistance = 0;
  let bob = 0;
  let animation = 0;
  let destroyed = false;
  let walkTarget: Point | null = null;
  let omenSeen = false;
  let omenUntil = 0;
  let encounter = newEncounter();
  let wolfPosition: Point = { ...VICTIM };
  let loadProgress = 0;
  const keys = new Set<string>();
  const touchKeys = new Set<string>();

  const loading = new THREE.LoadingManager();
  loading.onProgress = (_url, loaded, total) => { loadProgress = total ? loaded / total : 0; };
  loading.onLoad = () => { if (!destroyed) { loadProgress = 1; events.ready(); } };
  const assets = createAssets(renderer, loading);
  assets.environment(env => { scene.environment = env; });

  // Moonlight follows the player so a tight shadow frustum stays sharp across the larger map.
  const hemi = new THREE.HemisphereLight("#9fb6c4", "#2a2e26", .55);
  scene.add(hemi);
  const moonLight = new THREE.DirectionalLight("#b9cede", 1.9);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.setScalar(quality === "high" ? 2048 : 1024);
  Object.assign(moonLight.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
  moonLight.shadow.bias = -.0006; moonLight.shadow.normalBias = .04;
  scene.add(moonLight, moonLight.target);
  // Night and day endpoints for every light the time-of-day toggle blends between.
  const NIGHT = { sky: new THREE.Color("#9fb6c4"), ground: new THREE.Color("#2a2e26"), hemi: .55, light: new THREE.Color("#b9cede"), key: 1.9, env: .32, fog: .028, exposure: 1.2, bloom: .55 };
  const DAY = { sky: new THREE.Color("#bcd6ee"), ground: new THREE.Color("#6a5a3e"), hemi: 1.25, light: new THREE.Color("#ffe5c0"), key: 4.4, env: 1, fog: .0055, exposure: 1.05, bloom: .2 };
  const lightDirection = new THREE.Vector3();
  const fog = scene.fog as THREE.FogExp2;

  const architecture = buildArchitecture(scene, assets);
  const wind = { value: 0 };
  const nature = buildNature(scene, assets, wind, quality);
  const dressing = buildDressing(scene, assets, architecture.materials);
  const wilderness = buildWilderness(scene, assets, quality);
  const cast = createCast(assets);
  const abbey = buildAbbey(scene, assets, cast);
  dressing.lampPoints.push(...abbey.lamps);
  dressing.lampPoints.push(...wilderness.lampPoints);
  const atmosphere = createAtmosphere(scene, [...architecture.glows, ...abbey.glows, ...dressing.lampPoints.map(position => ({ position, color: new THREE.Color("#ffae5a"), size: 2.2 }))], architecture.chimneys);
  const keepsakes = createKeepsakes(scene, architecture.materials.door);
  const fire = createCouncilFire(scene, COUNCIL.z);
  const traveller = createTraveller(scene, cast, events.avatarError);
  traveller.select(settings.traveller);
  const creature = createCreatureEncounter(scene, loading, cast, events.error);
  const post = createPost(renderer, scene, camera, quality);

  // Pooled lamp lights: many lamp sites, only the nearest few are real lights.
  const pool = Array.from({ length: LIGHT_POOL }, () => {
    const light = new THREE.PointLight("#ffac54", 0, 13, 1.7); scene.add(light);
    return { light, site: -1, target: 0 };
  });
  const dynamicLights: (() => THREE.Vector3 | null)[] = [];
  function assignLights() {
    const sites = [...dressing.lampPoints.map(p => p.clone()), ...dynamicLights.map(f => f()).filter((p): p is THREE.Vector3 => !!p)];
    const ranked = sites.map((p, i) => ({ i, d: p.distanceToSquared(camera.position) })).sort((a, b) => a.d - b.d).slice(0, LIGHT_POOL);
    const wanted = new Set(ranked.map(r => r.i));
    for (const slot of pool) if (!wanted.has(slot.site)) slot.target = 0;
    for (const r of ranked) {
      if (pool.some(s => s.site === r.i && s.target > 0)) continue;
      const free = pool.find(s => s.target === 0 && s.light.intensity < .5) ?? pool.find(s => s.target === 0);
      if (free) { free.site = r.i; free.target = 15; free.light.position.copy(sites[r.i]); }
    }
    return sites;
  }
  let lightSites: THREE.Vector3[] = [];

  // Villagers: the council around the fire and a few souls still out in the dark.
  const villagers: Villager[] = [];
  const COUNCIL_CAST: CharacterName[] = ["villager_woman_a", "villager_man_b", "huntress_woman", "woodsman_man", "hooded_woman", "hooded_man"];
  const handMaterials = { iron: assets.track(new THREE.MeshStandardMaterial({ color: "#1b1d1c", roughness: .5, metalness: .8 })), glow: assets.track(new THREE.MeshStandardMaterial({ color: "#ffb45e", emissive: "#ffae52", emissiveIntensity: 4 })) };
  // Kept below the bloom threshold so the lantern in hand never floods the frame.
  const heldGlow = assets.track(new THREE.MeshStandardMaterial({ color: "#2a1a0c", emissive: "#c47a35", emissiveIntensity: 1 }));
  const tint = (c: Character, color: string) => c.materials.forEach(m => m.color.multiply(new THREE.Color(color)));
  let omenFigure: Character | null = null;
  void (async () => {
    try {
      const council = await Promise.all(COUNCIL_CAST.map(name => cast.spawn(name, 1.72)));
      council.forEach((c, i) => {
        const chair = COUNCIL_CHAIRS[i + 1];
        scene.add(c.root);
        villagers.push(seated(c, { ...chair, height: COUNCIL_SEAT_HEIGHT }, i));
      });
      const [lamplighter, keeper, smith, mourner, woodsman, omen] = await Promise.all([
        cast.spawn("hooded_man", 1.8), cast.spawn("villager_woman_a", 1.66), cast.spawn("villager_man_b", 1.82),
        cast.spawn("hooded_woman", 1.7), cast.spawn("woodsman_man", 1.78), cast.spawn("hooded_man", 1.95),
      ]);
      if (destroyed) return;
      tint(lamplighter, "#6f6a60"); tint(keeper, "#9c8f86"); tint(smith, "#8a8178"); tint(mourner, "#55524e"); tint(woodsman, "#7d7b70");
      lamplighter.attach("hand_r", handLantern(handMaterials), new THREE.Vector3(0, -.12, 0));
      const walker = patrol(lamplighter, [{ x: 18.5, z: -2.5 }, { x: 25, z: -2.5 }, { x: 25, z: 3.5 }, { x: 18.5, z: 3.5 }], { id: "lamplighter", name: "the lamplighter", line: "“Every lamp I light, another goes dark behind me. Go to the fire. Don’t stop for anyone who calls your name.”" });
      if (walker.light) dynamicLights.push(walker.light);
      villagers.push(
        walker,
        standing(keeper, { x: 19.9, z: -9.3, yaw: .25 }, "Idle_FoldArms_Loop", { id: "tavernkeeper", name: "the tavern keeper", line: "“We barred the door at sunset. I only opened it to count who was missing. It was more than one.”" }),
        standing(smith, { x: 28.6, z: -1.8, yaw: Math.PI / 2 }, "Interact", { id: "smith", name: "the smith", line: "“Silver. I’ve been melting down every spoon in the village. Ask yourself why the watchman refused his.”" }, "Idle_No_Loop"),
        standing(mourner, { x: -20.4, z: -22.9, yaw: Math.PI }, "Crouch_Idle_Loop", { id: "mourner", name: "the mourner", line: "“They dug it for him this morning. He walked past it at noon, whistling.”" }, "Idle_LookAround"),
        standing(woodsman, { x: -13.4, z: -46.5, yaw: -.6 }, "Idle_LookAround", { id: "woodsman", name: "the woodsman", line: "“Tracks come out of the forest on four feet. They go back in on two.”" }),
      );
      [lamplighter, keeper, smith, mourner, woodsman].forEach(c => scene.add(c.root));
      // The omen: a tall hooded figure glimpsed between houses for a moment.
      omenFigure = omen; tint(omen, "#1a1d1f"); omen.root.position.set(-5.2, 0, -16.5); omen.root.rotation.y = .35; omen.play("Idle_Loop", 0); omen.root.visible = false; scene.add(omen.root);
    } catch { /* Villagers are atmosphere; the route still works without them. */ }
  })();
  const villagerObstacles = (): Obstacle[] => villagers.filter(v => !v.id.startsWith("council")).map(v => ({ ...v.position(), radius: .35 }));

  // First-person lantern.
  const lamp = new THREE.PointLight("#ffd08b", 12, 12, 1.6);
  scene.add(lamp);
  const hand = handLantern({ iron: handMaterials.iron, glow: heldGlow }); hand.scale.setScalar(.85);
  camera.add(hand); hand.position.set(.27, -.27, -.62); scene.add(camera);

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false); post.setSize(width, height, pixelRatio);
    camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function clearInput() { keys.clear(); touchKeys.clear(); jumpRequested = false; walkTarget = null; }
  function unlock() { if (document.pointerLockElement === canvas) document.exitPointerLock(); }
  function keydown(event: KeyboardEvent) {
    if (!settings.playing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const key = event.key.toLowerCase();
    // Let focused buttons keep their normal Space/Enter behaviour.
    if (event.target instanceof HTMLButtonElement && (key === " " || key === "enter")) return;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "e", "f", "j", "v", " ", "escape"].includes(key)) event.preventDefault();
    if (!event.repeat) {
      if (key === "e") events.action("interact");
      if (key === "j") events.action("journal");
      if (key === "f") events.action("lantern");
      if (key === "v") events.action("view");
      if (key === " ") jumpRequested = true;
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
    if (dragging && Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) < 7 && settings.playing && document.pointerLockElement !== canvas) {
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

  const playerEye = new THREE.Vector3();
  let lightClock = 0;
  let nearestVillager: Villager | null = null;
  function frame() {
    if (destroyed) return;
    animation = requestAnimationFrame(frame);
    timer.update();
    renderer.info.reset();
    const dt = Math.min(timer.getDelta(), .05);
    world += dt; // ambient clock: fire, wind and sky keep breathing on the intro screen
    if (settings.playing) elapsed += dt;
    let moving = false;
    const running = keys.has("shift") || settings.running;
    const held = (key: string) => keys.has(key) || touchKeys.has(key);
    if (settings.playing) {
      if (held("arrowleft")) yaw += dt * 1.5;
      if (held("arrowright")) yaw -= dt * 1.5;
      const forward = Number(held("w") || held("arrowup")) - Number(held("s") || held("arrowdown"));
      const strafe = Number(held("d")) - Number(held("a"));
      let dx = -Math.sin(yaw) * forward + Math.cos(yaw) * strafe;
      let dz = -Math.cos(yaw) * forward - Math.sin(yaw) * strafe;
      let speed = running ? RUN_SPEED : WALK_SPEED;
      if (walkTarget) {
        dx = walkTarget.x - point.x; dz = walkTarget.z - point.z;
        if (Math.hypot(dx, dz) < .15) { walkTarget = null; dx = dz = 0; }
        else speed = Math.min(speed, Math.hypot(dx, dz) / dt);
      }
      const length = Math.hypot(dx, dz);
      // Light acceleration gives footsteps weight without feeling floaty.
      const want = length > 0 ? { x: dx / length * speed, z: dz / length * speed } : { x: 0, z: 0 };
      const k = 1 - Math.exp(-dt * (length > 0 ? 10 : 14));
      velocity = { x: velocity.x + (want.x - velocity.x) * k, z: velocity.z + (want.z - velocity.z) * k };
      if (Math.hypot(velocity.x, velocity.z) > .02) {
        const next = movePlayer(point, velocity.x * dt, velocity.z * dt, [...creature.obstacles(), ...villagerObstacles(), ...abbey.obstacles()], jump.height);
        const distance = Math.hypot(next.x - point.x, next.z - point.z);
        moving = distance > .001; footDistance += distance; bob += distance; point = next;
        if (moving) facing = Math.atan2(velocity.x, velocity.z);
        if (!moving) { walkTarget = null; velocity = { x: 0, z: 0 }; }
        if (footDistance > (running ? 1.65 : 1.1) && jump.grounded) { events.step(running, surfaceAt(point)); footDistance = 0; }
      }
      const wasAirborne = !jump.grounded;
      jump = advanceJump(jump, dt, supportHeightAt(point), jumpRequested);
      jumpRequested = false;
      if (wasAirborne && jump.grounded) { events.step(false, surfaceAt(point)); footDistance = 0; }
      if (point.z < 10 && !omenSeen) { omenSeen = true; omenUntil = elapsed + 2.2; events.omen(); }
    }
    const wolfDx = wolfPosition.x - point.x, wolfDz = wolfPosition.z - point.z;
    const wolfDistance = Math.hypot(wolfDx, wolfDz);
    const facingWolf = wolfDistance > 0 && (-Math.sin(yaw) * wolfDx - Math.cos(yaw) * wolfDz) / wolfDistance > .65;
    const warding = settings.lantern && facingWolf && wolfDistance < 9;
    const previousPhase = encounter.phase;
    encounter = advanceEncounter(encounter, dt, { playing: settings.playing, trigger: canStartEncounter(point, yaw), warding, distance: wolfDistance, escaped: point.z < -19 || wolfDistance > 19 });
    if (encounter.phase !== previousPhase) {
      if (encounter.phase === "hunting") wolfPosition = { x: VICTIM.x, z: VICTIM.z + .5 };
      if (encounter.phase === "caught") { clearInput(); settings.playing = false; }
      events.encounter(encounter.phase);
    }
    if (encounter.phase === "hunting" && settings.playing && wolfDistance > .001) {
      const speed = encounter.time < 2.8 ? 0 : warding ? (wolfDistance < 3 ? -1 : 0) : 2.3;
      wolfPosition = movePlayer(wolfPosition, -wolfDx / wolfDistance * dt * speed, -wolfDz / wolfDistance * dt * speed);
    }
    creature.pose(encounter.phase === "waiting" ? { ...encounter, time: elapsed } : encounter, wolfPosition, point, settings.reducedMotion);
    if (omenFigure) {
      omenFigure.root.visible = settings.playing && elapsed < omenUntil && !settings.reducedMotion;
      if (omenFigure.root.visible) { omenFigure.mixer.update(dt); omenFigure.lookAt(camera.position, dt); }
    }
    if (sitting) {
      sitting.progress = Math.min(1, sitting.progress + dt / (settings.reducedMotion ? .12 : 1.25));
      const t = THREE.MathUtils.smoothstep(sitting.progress, 0, 1);
      point = { x: THREE.MathUtils.lerp(sitting.from.x, COUNCIL_SEAT.x, t), z: THREE.MathUtils.lerp(sitting.from.z, COUNCIL_SEAT.z, t) };
      yaw = THREE.MathUtils.lerp(sitting.yaw, 0, t); pitch = THREE.MathUtils.lerp(sitting.pitch, -.06, t);
      if (sitting.progress === 1) { seated_ = true; const resolve = sitting.resolve; sitting = null; resolve(); }
    }
    const eyeHeight = seated_ ? 1.05 : sitting ? THREE.MathUtils.lerp(1.68, 1.05, THREE.MathUtils.smoothstep(sitting.progress, 0, 1)) : 1.68;
    const bobOn = moving && jump.grounded && !settings.reducedMotion;
    const stride = bob * (running ? 2.2 : 2.9);
    camera.position.set(point.x + (bobOn ? Math.cos(stride * .5) * .018 : 0), jump.height + eyeHeight + (bobOn ? Math.abs(Math.sin(stride * .5)) * (running ? .05 : .03) - .015 : 0), point.z);
    camera.rotation.set(pitch, yaw, bobOn ? Math.sin(stride * .5) * .006 : 0);
    const third = settings.view === "third" && !sitting && !seated_;
    const boom = third ? cameraDistance(d => canWalk({ x: point.x + Math.sin(yaw) * d, z: point.z + Math.cos(yaw) * d }, [], jump.height + followCameraHeight(pitch, d) - .15)) : 0;
    if (third && boom > .8) {
      camera.position.set(point.x + Math.sin(yaw) * boom, jump.height + followCameraHeight(pitch, boom), point.z + Math.cos(yaw) * boom);
      camera.lookAt(point.x - Math.sin(yaw) * .7, jump.height + 1.3, point.z - Math.cos(yaw) * .7);
    }
    traveller.update(point, jump.height, facing, moving, running, !jump.grounded, settings.playing ? dt : 0, third && boom > .8, settings.lantern, settings.reducedMotion);
    const targetFov = running && moving && !settings.reducedMotion ? 68 : 62;
    if (Math.abs(camera.fov - targetFov) > .05) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    hand.visible = settings.lantern && (!third || boom <= .8);
    hand.rotation.z = bobOn ? Math.sin(stride * .5) * .05 : 0;
    hand.position.y = -.27 + (bobOn ? Math.abs(Math.sin(stride * .5)) * .02 : 0);
    // Light, interaction and sound stay at the traveller, not the follow camera.
    lamp.position.set(point.x - Math.sin(yaw) * .6, jump.height + 1.4, point.z - Math.cos(yaw) * .6);
    lamp.intensity = settings.lantern ? (12 + (settings.reducedMotion ? 0 : Math.sin(world * 7) * .5 + Math.sin(world * 13.3) * .3)) * (1 - day * .5) : 0;
    heldGlow.emissiveIntensity = settings.lantern ? 1 : 0;

    // Moon shadows centred on the player, snapped to texels to avoid shimmering.
    const texel = 64 / moonLight.shadow.mapSize.x;
    const cx = Math.round(point.x / texel) * texel, cz = Math.round(point.z / texel) * texel;
    moonLight.target.position.set(cx, 0, cz);
    // The same shadow-casting light is the moon by night and the sun by day.
    const dayTarget = settings.daytime ? 1 : 0;
    if (!dayPrimed || settings.reducedMotion) { day = dayTarget; dayPrimed = true; }
    else day += (dayTarget - day) * Math.min(1, dt * 1.6);
    if (Math.abs(day - dayTarget) < .001) day = dayTarget;
    lightDirection.copy(MOON_DIRECTION).lerp(SUN_DIRECTION, day).normalize();
    moonLight.position.set(cx + lightDirection.x * 70, lightDirection.y * 70, cz + lightDirection.z * 70);
    moonLight.color.copy(NIGHT.light).lerp(DAY.light, day);
    hemi.color.copy(NIGHT.sky).lerp(DAY.sky, day);
    hemi.groundColor.copy(NIGHT.ground).lerp(DAY.ground, day);
    fog.color.copy(FOG_COLOR).lerp(DAY_FOG_COLOR, day);
    fog.density = THREE.MathUtils.lerp(NIGHT.fog, DAY.fog, day);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(NIGHT.exposure, DAY.exposure, day) * settings.brightness;
    post.bloom.strength = THREE.MathUtils.lerp(NIGHT.bloom, DAY.bloom, day);
    post.grade.day.value = day;

    lightClock -= dt;
    if (lightClock <= 0) { lightSites = assignLights(); lightClock = .3; }
    pool.forEach((slot, i) => {
      if (slot.site >= 0 && lightSites[slot.site]) slot.light.position.copy(lightSites[slot.site]);
      const flicker = settings.reducedMotion ? 0 : Math.sin(world * 5 + i * 1.7) * 1.1 + Math.sin(world * 11.3 + i) * .5;
      // Lamps still burn by day, but the sun drowns most of their reach.
      const goal = slot.target > 0 ? (slot.target + flicker) * (1 - day * .75) : 0;
      slot.light.intensity += (goal - slot.light.intensity) * Math.min(1, dt * 5);
    });

    playerEye.set(point.x, jump.height + 1.68, point.z);
    nearestVillager = null;
    let nearestD = 2.4;
    for (const v of villagers) {
      v.update(dt * (settings.playing || !elapsed ? 1 : 0), world, playerEye, settings.reducedMotion);
      const p = v.position(), d = Math.hypot(p.x - point.x, p.z - point.z);
      if (v.line && d < nearestD) { nearestD = d; nearestVillager = v; }
    }

    wind.value = settings.reducedMotion ? 0 : world;
    keepsakes.forEach((item, i) => { item.visible = !settings.found.includes(LANDMARKS[i].id); });
    fire.update(world, camera, settings.reducedMotion);
    dressing.update(world, settings.reducedMotion);
    wilderness.update(elapsed, settings.reducedMotion);
    abbeyFrame = abbey.update(elapsed, { p: point, height: jump.height, yaw, running: moving && running, reduced: settings.reducedMotion, lantern: settings.lantern, playing: settings.playing, found: settings.found, ring: ringRequested }, events.abbey);
    ringRequested = false;
    // Under the abbey roofs the sky stops lighting you: only candles and your lantern remain.
    interior += (abbeyFrame.interior - interior) * Math.min(1, dt * 2.5);
    hemi.intensity = THREE.MathUtils.lerp(NIGHT.hemi, DAY.hemi, day) * (1 - interior * .82);
    scene.environmentIntensity = THREE.MathUtils.lerp(NIGHT.env, DAY.env, day) * (1 - interior * .8);
    const flash = atmosphere.update(world, camera, settings.reducedMotion, (delay, strength) => { if (settings.playing) events.thunder(delay, strength); }, interior, day);
    moonLight.intensity = (THREE.MathUtils.lerp(NIGHT.key, DAY.key, day) + flash * 9) * (1 - interior * .6);
    const danger = ["hunting", "pouncing"].includes(encounter.phase) || abbeyFrame.phase === "hunting" ? 1 : ["feeding", "transforming"].includes(encounter.phase) || abbeyFrame.phase === "tolling" ? .45 : 0;
    post.grade.danger.value += (danger - post.grade.danger.value) * Math.min(1, dt * 2);
    post.grade.time.value = world;
    post.grade.grain.value = (settings.reducedMotion ? .3 : 1) * (1 - day * .6);

    if (world - lastSnapshot > .12) {
      events.spatial(point, yaw, wolfPosition, interior);
      const active = encounterActive(encounter.phase);
      events.snapshot({
        point: { ...point }, bearing: ((-yaw * 180 / Math.PI) % 360 + 360) % 360,
        nearby: active || !jump.grounded ? null : nearbyLandmark(point, settings.found)?.id ?? null,
        council: !active && jump.grounded && jump.height < .1 && atCouncil(point), moving, encounter: encounter.phase, ward: encounter.lightTime / 2.6,
        district: districtAt(point), villager: active || !nearestVillager ? null : { id: nearestVillager.id, name: nearestVillager.name, line: nearestVillager.line },
        loading: loadProgress, abbey: { phase: abbeyFrame.phase, ward: abbeyFrame.ward, bell: abbeyFrame.bell },
      });
      lastSnapshot = world;
    }
    post.render(dt);
  }
  frame();
  // Dev-only camera hook for visual QA scripts; stripped from production builds.
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __village?: unknown }).__village = {
      teleport(x: number, z: number, y = 0, p = -.035) { point = { x, z }; yaw = y; facing = y + Math.PI; pitch = p; velocity = { x: 0, z: 0 }; jump = groundedJump(); },
      state: () => ({ point: { ...point }, jump: { ...jump }, view: settings.view, traveller: settings.traveller, camera: camera.position.toArray(), playing: settings.playing, encounter: { ...encounter } }),
      keeper(anchor: number) { abbey.debugStalk(anchor); },
      breakdown() {
        const rows: [string, number, number, boolean][] = [];
        scene.traverse(o => {
          if (!(o instanceof THREE.Mesh) || !o.visible) return;
          const g = o.geometry, tris = (g.index ? g.index.count : g.getAttribute("position").count) / 3;
          const n = o instanceof THREE.InstancedMesh ? o.count : 1;
          rows.push([`${o.type}:${(o.material as THREE.Material).name || (o.material as THREE.Material).type}:${o.name || o.parent?.name || ""}`, Math.round(tris), Math.round(tris * n), o.castShadow]);
        });
        const noImage: string[] = [];
        scene.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) for (const [k, v] of Object.entries(m)) if (v instanceof THREE.Texture && !v.image) noImage.push(`${m.name || m.type}.${k}`); });
        return { top: rows.sort((a, b) => b[2] - a[2]).slice(0, 25), noImage: [...new Set(noImage)].slice(0, 20) };
      },
      info: () => ({ fps: 0, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    };
  }

  return {
    ringBell() { if (settings.playing) ringRequested = true; },
    retryAbbey() {
      abbey.retry();
      point = { x: BELL.x - .6, z: TOWER.z }; velocity = { x: 0, z: 0 };
      jump = { height: BELFRY_TOP, velocity: 0, grounded: true };
      yaw = Math.PI / 2; facing = yaw + Math.PI; pitch = -.18; clearInput();
    },
    startAtAbbey() {
      const [fork, trail] = ABBEY_TRAIL;
      point = { ...fork };
      yaw = Math.atan2(fork.x - trail.x, fork.z - trail.z);
      facing = yaw + Math.PI;
      // Skip the village entrance omen; the abbey encounters are still ahead.
      omenSeen = true;
    },
    configure(next: SceneSettings) {
      settings = next;
      traveller.select(next.traveller);
      if (!next.playing) { clearInput(); dragging = null; unlock(); }
    },
    sit() {
      if (seated_) return Promise.resolve();
      if (sitting || !jump.grounded || jump.height > .1 || !atCouncil(point) || encounterActive(encounter.phase)) return Promise.reject(new Error("Reach the empty council chair first."));
      settings.playing = false; clearInput(); unlock();
      return new Promise<void>(resolve => { sitting = { from: { ...point }, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch, progress: 0, resolve }; });
    },
    reset() { abbey.reset(); seated_ = false; sitting = null; jump = groundedJump(); point = { ...SPAWN }; velocity = { x: 0, z: 0 }; yaw = 0; facing = Math.PI; pitch = -.035; elapsed = 0; omenSeen = false; omenUntil = 0; encounter = newEncounter(); wolfPosition = { ...VICTIM }; events.encounter("waiting"); clearInput(); },
    retryEncounter() { jump = groundedJump(); point = { x: 0, z: 3.8 }; velocity = { x: 0, z: 0 }; yaw = 0; facing = Math.PI; pitch = -.035; encounter = newEncounter(); wolfPosition = { ...VICTIM }; events.encounter("waiting"); clearInput(); },
    jump() { if (settings.playing) jumpRequested = true; },
    hold(direction: "forward" | "back" | "left" | "right", active: boolean) {
      const key = { forward: "w", back: "s", left: "arrowleft", right: "arrowright" }[direction];
      if (active && settings.playing) { touchKeys.add(key); walkTarget = null; } else touchKeys.delete(key);
    },
    step(direction: "forward" | "back" | "left" | "right") {
      if (!settings.playing) return;
      if (direction === "left" || direction === "right") { yaw += direction === "left" ? Math.PI / 8 : -Math.PI / 8; return; }
      const sign = direction === "forward" ? 1 : -1;
      const start = walkTarget ?? point;
      walkTarget = { x: start.x - Math.sin(yaw) * 2 * sign, z: start.z - Math.cos(yaw) * 2 * sign };
    },
    async lockPointer() { await canvas.requestPointerLock(); },
    dispose() {
      destroyed = true; cancelAnimationFrame(animation); observer.disconnect(); timer.dispose(); unlock();
      window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility); document.removeEventListener("pointerlockchange", lockchange);
      canvas.removeEventListener("pointerdown", pointerdown); window.removeEventListener("pointermove", pointermove);
      canvas.removeEventListener("pointerup", pointerup); canvas.removeEventListener("pointercancel", cancelPointer); canvas.removeEventListener("webglcontextlost", contextlost);
      villagers.forEach(v => v.character.dispose()); omenFigure?.dispose(); abbey.dispose();
      traveller.dispose(); creature.dispose(); nature.dispose(); dressing.dispose(); wilderness.dispose(); atmosphere.dispose(); post.dispose(); cast.dispose();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      assets.dispose(); renderer.dispose();
    },
  };
}

export type VillageScene = ReturnType<typeof createVillage>;
