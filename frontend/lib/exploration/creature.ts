import * as THREE from "three";
import { createWolf } from "./wolf";
import { ENCOUNTER_DURATIONS, VICTIM, WATCHMAN, type EncounterState } from "./encounter";
import { handLantern, type Cast, type Character } from "./characters";

/**
 * The watchman (a rigged CC0 villager) convulses and swells until the Blender
 * werewolf takes over; the victim is knocked down and dies. All animation is
 * sampled from the encounter clock, so pausing freezes every pose exactly.
 */
export function createCreatureEncounter(scene: THREE.Scene, loading: THREE.LoadingManager, cast: Cast, onError: () => void) {
  const root = new THREE.Group();
  scene.add(root);
  const iron = new THREE.MeshStandardMaterial({ color: "#1b1d1c", roughness: .5, metalness: .8 });
  const glow = new THREE.MeshStandardMaterial({ color: "#ffb45e", emissive: "#ffae52", emissiveIntensity: 4 });
  const wound = new THREE.MeshStandardMaterial({ color: "#2b0d0b", roughness: .25, metalness: .1 });
  const manBody = new THREE.Group(); manBody.position.set(WATCHMAN.x, 0, WATCHMAN.z); root.add(manBody);
  const victimBody = new THREE.Group(); victimBody.position.set(VICTIM.x, 0, VICTIM.z); victimBody.rotation.y = -.7; root.add(victimBody);
  let watchman: Character | null = null, victim: Character | null = null;
  const grow: { bone: THREE.Bone; base: THREE.Vector3; amount: number }[] = [];
  let disposed = false;
  Promise.all([cast.spawn("villager_man_a", 1.78), cast.spawn("villager_woman_b", 1.68)]).then(([man, woman]) => {
    if (disposed) { man.dispose(); woman.dispose(); return; }
    watchman = man; victim = woman;
    manBody.add(man.root); victimBody.add(woman.root);
    woman.attach("hand_l", handLantern({ iron, glow }), new THREE.Vector3(0, -.12, 0));
    man.attach("hand_r", handLantern({ iron, glow }), new THREE.Vector3(0, -.12, 0));
    // Bones that swell during the transformation (shoulders, back, arms, hands).
    for (const [name, amount] of [["spine_02", .35], ["spine_03", .45], ["clavicle_l", .5], ["clavicle_r", .5], ["upperarm_l", .4], ["upperarm_r", .4], ["hand_l", .7], ["hand_r", .7], ["neck_01", .3]] as const) {
      const bone = man.bones.get(name);
      if (bone) grow.push({ bone, base: bone.scale.clone(), amount });
    }
  }).catch(onError);
  const wolf = createWolf(root, loading, onError);
  const fallenLantern = new THREE.Group(); root.add(fallenLantern);
  const lanternProp = handLantern({ iron, glow }); lanternProp.scale.setScalar(1.6); fallenLantern.add(lanternProp);
  const victimLight = new THREE.PointLight("#ffb45e", 8, 6, 1.6); root.add(victimLight);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(.75, 28), wound);
  pool.rotation.x = -Math.PI / 2; pool.position.set(VICTIM.x, .02, VICTIM.z + .3); pool.receiveShadow = true; root.add(pool);
  const rim = new THREE.PointLight("#aec8d4", 14, 10, 1.4);
  rim.position.set(-2.5, 4.5, -9); root.add(rim);
  let huntStart = { ...VICTIM }, fleeStart = { ...VICTIM };
  let previous = "waiting";
  const target = new THREE.Vector3();

  function pose(state: EncounterState, wolfPosition: { x: number; z: number }, player: { x: number; z: number }, reducedMotion: boolean) {
    const { phase, time } = state;
    if (phase !== previous) {
      if (phase === "hunting") huntStart = { ...wolfPosition };
      if (phase === "fleeing") fleeStart = { ...wolfPosition };
      previous = phase;
    }
    const transformed = !["waiting", "stirring", "transforming"].includes(phase);
    const progress = phase === "transforming" ? THREE.MathUtils.smoothstep(time / ENCOUNTER_DURATIONS.transforming, 0, 1) : transformed ? 1 : 0;
    const t = reducedMotion ? 0 : time;
    manBody.position.set(WATCHMAN.x, 0, WATCHMAN.z);
    manBody.rotation.set(0, 0, 0);
    if (watchman) {
      // The watchman stares at the player while waiting; a convulsion becomes the change.
      if (phase === "waiting") watchman.sample("Idle_Lantern_Loop", (state.time ?? 0));
      else if (phase === "stirring") watchman.sample("Zombie_Scratch", t, true);
      else watchman.sample("Zombie_Idle_Loop", t * (1 + progress * 1.5));
      for (const g of grow) g.bone.scale.copy(g.base).multiplyScalar(1 + g.amount * progress);
      const tremor = reducedMotion ? 0 : Math.sin(time * 31) * .05 * Math.sin(progress * Math.PI);
      watchman.root.rotation.set(progress * .35, 0, tremor);
      watchman.root.scale.setScalar(1 + progress * .28);
      for (const m of watchman.materials) m.color.setScalar(1 - progress * .75);
      target.set(player.x, 1.6, player.z);
      if (phase === "waiting" || phase === "stirring") watchman.lookAt(target, .1, 1.3);
      if (phase === "transforming") manBody.rotation.y = Math.sin(progress * Math.PI) * .35;
    }
    const fallen = transformed;
    if (victim) {
      if (!fallen) victim.sample(phase === "transforming" ? "Idle_Talking_Loop" : "Idle_Loop", t);
      else if (phase === "pouncing") victim.sample(time < .45 ? "Hit_Knockback" : "Death01", time < .45 ? time : (time - .45) * 2.2, false);
      else victim.sample("Death01", 99, false);
      if (!fallen) { target.set(WATCHMAN.x, 1.6, WATCHMAN.z); victim.lookAt(target, .1); }
    }
    const fall = phase === "pouncing" ? THREE.MathUtils.smoothstep(time, .2, .7) : fallen ? 1 : 0;
    victimBody.rotation.set(0, -.7 + fall * .4, 0);
    fallenLantern.position.set(VICTIM.x + .55 + fall * .45, 1.0 * (1 - fall) + .12, VICTIM.z + .6);
    fallenLantern.rotation.z = fall * 1.35;
    fallenLantern.visible = fall > 0;
    const lit = !fallen || phase === "pouncing";
    glow.emissiveIntensity = lit ? 4 : 0;
    victimLight.position.copy(fallenLantern.visible ? fallenLantern.position : victimBody.position.clone().setY(1.1));
    victimLight.intensity = lit ? 8 : 0;
    pool.visible = ["feeding", "hunting", "fleeing", "aftermath", "caught"].includes(phase);
    pool.scale.setScalar(phase === "feeding" ? Math.min(1, time / 4) : 1);
    if (phase === "pouncing") {
      const k = Math.min(1, time / ENCOUNTER_DURATIONS.pouncing);
      manBody.position.set(THREE.MathUtils.lerp(WATCHMAN.x, VICTIM.x, k), reducedMotion ? 0 : Math.sin(k * Math.PI) * .75, THREE.MathUtils.lerp(WATCHMAN.z, VICTIM.z + .4, k));
      manBody.rotation.y = Math.atan2(VICTIM.x - WATCHMAN.x, VICTIM.z - WATCHMAN.z);
    }
    if (phase === "feeding") { manBody.position.set(VICTIM.x, -.1, VICTIM.z + .5); manBody.rotation.y = Math.PI; }
    if (phase === "hunting" || phase === "fleeing") {
      const position = phase === "hunting" ? wolfPosition : { x: fleeStart.x - time * 3.8, z: fleeStart.z - time * 4 };
      manBody.position.set(position.x, 0, position.z);
      const aim = phase === "hunting" ? player : { x: position.x - 4, z: position.z - 5 };
      manBody.rotation.y = Math.atan2(aim.x - position.x, aim.z - position.z);
      if (phase === "hunting" && time < .6) manBody.position.lerp(new THREE.Vector3(huntStart.x, 0, huntStart.z + .5), 1 - time / .6);
    }
    wolf.pose(state, manBody.position, manBody.rotation.y, progress, reducedMotion);
    if (watchman) watchman.root.visible = !["aftermath", "caught"].includes(phase) && progress <= .52;
    rim.intensity = !["aftermath", "caught"].includes(phase) ? 14 : 4;
  }
  return {
    pose,
    dispose: () => { disposed = true; watchman?.dispose(); victim?.dispose(); wolf.dispose(); iron.dispose(); glow.dispose(); wound.dispose(); pool.geometry.dispose(); },
    obstacles: () => [
      ...(!["aftermath", "caught"].includes(previous) ? [{ x: manBody.position.x, z: manBody.position.z, radius: .65 }] : []),
      { x: VICTIM.x, z: VICTIM.z, radius: .5 },
    ],
  };
}
