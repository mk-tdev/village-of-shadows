import * as THREE from "three";
import { ENCOUNTER_DURATIONS, VICTIM, WATCHMAN, type EncounterState } from "./encounter";

/** A locally authored joint rig, not a generated/skinned production character asset. */
export function createCreatureEncounter(scene: THREE.Scene) {
  const root = new THREE.Group();
  scene.add(root);
  const fur = new THREE.MeshStandardMaterial({ color: "#303735", roughness: 1, flatShading: true });
  const coat = new THREE.MeshStandardMaterial({ color: "#454d45", roughness: 1 });
  const cloth = new THREE.MeshStandardMaterial({ color: "#6d6153", roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: "#a6a08b", roughness: .95 });
  const dark = new THREE.MeshStandardMaterial({ color: "#131a19", roughness: .8 });
  const ivory = new THREE.MeshStandardMaterial({ color: "#bcbba3", roughness: .65 });
  const eye = new THREE.MeshBasicMaterial({ color: "#f7b354" });
  const wound = new THREE.MeshStandardMaterial({ color: "#401d1b", roughness: .6 });
  const unit = new THREE.IcosahedronGeometry(1, 2);
  const point = new THREE.ConeGeometry(1, 1, 5);
  const coatShape = new THREE.CylinderGeometry(.24, .32, .7, 9);

  function shape(parent: THREE.Object3D, material: THREE.Material, pos: number[], size: number[], geometry: THREE.BufferGeometry = unit) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos[0], pos[1], pos[2]); mesh.scale.set(size[0], size[1], size[2]);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function joint(parent: THREE.Object3D, x: number, y: number, z: number) {
    const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group); return group;
  }
  function person(material: THREE.Material) {
    const body = joint(root, 0, 0, 0);
    const hips = joint(body, 0, .85, 0);
    const torso = shape(hips, material, [0, .38, 0], [.28, .43, .18]);
    const head = joint(hips, 0, .97, 0);
    const humanHead = joint(head, 0, 0, 0);
    shape(humanHead, skin, [0, 0, 0], [.125, .195, .13]);
    shape(humanHead, dark, [0, .125, -.015], [.135, .095, .135]);
    shape(humanHead, skin, [0, -.025, .13], [.027, .052, .035]);
    for (const side of [-1, 1]) shape(humanHead, dark, [side * .057, .025, .117], [.025, .012, .012]);
    const hem = shape(hips, material, [0, -.04, 0], [1, 1, 1], coatShape);
    const arms = [-1, 1].map(side => {
      const upper = joint(hips, side * .29, .67, 0);
      shape(upper, material, [0, -.19, 0], [.095, .24, .1]);
      const lower = joint(upper, 0, -.39, 0);
      shape(lower, material, [0, -.13, .01], [.075, .2, .08]);
      shape(lower, skin, [0, -.32, .015], [.07, .105, .055]);
      return { upper, lower };
    });
    const legs = [-1, 1].map(side => {
      const leg = joint(hips, side * .135, 0, 0);
      shape(leg, dark, [0, -.22, 0], [.11, .27, .12]);
      const shin = joint(leg, 0, -.43, 0);
      shape(shin, dark, [0, -.16, 0], [.085, .2, .09]);
      shape(shin, dark, [0, -.35, .055], [.11, .07, .19]);
      return { leg, shin };
    });
    return { body, hips, torso, head, humanHead, hem, arms, legs };
  }
  const man = person(coat);
  man.body.position.set(WATCHMAN.x, 0, WATCHMAN.z);
  const victim = person(cloth);
  victim.body.position.set(VICTIM.x, 0, VICTIM.z);
  victim.body.rotation.y = -.7;
  // The wolf grows from the watchman's same joints: shoulders, hands, muzzle, knees.
  const wolfHead = joint(man.head, 0, .02, .02);
  shape(wolfHead, fur, [0, 0, 0], [.23, .25, .25]);
  shape(wolfHead, fur, [0, -.06, .24], [.13, .10, .32]);
  shape(wolfHead, dark, [0, -.045, .53], [.075, .048, .045]);
  const jaw = joint(wolfHead, 0, -.1, .03);
  shape(jaw, dark, [0, -.09, .22], [.125, .07, .25]);
  for (const side of [-1, 1]) {
    const ear = shape(wolfHead, fur, [side * .17, .27, -.02], [.105, .32, .1], point);
    ear.rotation.z = -side * .25;
    shape(wolfHead, eye, [side * .15, .045, .195], [.046, .024, .024]);
    const brow = shape(wolfHead, fur, [side * .14, .095, .21], [.09, .043, .047]); brow.rotation.z = side * .3;
    for (let i = 0; i < 4; i++) {
      const tooth = shape(wolfHead, ivory, [side * .11, -.16, .13 + i * .085], [.022, i === 2 ? .14 : .065, .022], point);
      tooth.rotation.z = Math.PI;
      shape(jaw, ivory, [side * .095, -.025, .14 + i * .08], [.019, .065, .019], point);
    }
  }
  const mane = joint(man.hips, 0, .65, -.1);
  shape(mane, fur, [0, 0, 0], [.47, .44, .32]);
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * Math.PI * 2;
    const tuft = shape(mane, fur, [Math.sin(a) * .36, Math.cos(a) * .29, -.12], [.09, .32, .1], point);
    tuft.rotation.z = -a;
  }
  const claws = man.arms.map(({ lower }) => {
    const paw = joint(lower, 0, -.31, .015);
    shape(paw, fur, [0, -.02, 0], [.12, .14, .08]);
    for (let i = 0; i < 4; i++) {
    const claw = shape(paw, ivory, [(i - 1.5) * .058, -.2, .04], [.014, .15, .02], point);
      claw.rotation.x = .3; claw.rotation.z = Math.PI;
    }
    return paw;
  });
  const tail = joint(man.hips, 0, -.05, -.18);
  const tailMesh = shape(tail, fur, [0, -.14, -.28], [.13, .14, .44]); tailMesh.rotation.x = -.45;
  const fallenLantern = joint(root, VICTIM.x + .7, .12, VICTIM.z + .6);
  shape(fallenLantern, dark, [0, .1, 0], [.14, .22, .13]);
  const flame = shape(fallenLantern, eye, [0, .11, .03], [.065, .13, .07]);
  const victimLight = new THREE.PointLight("#ffb45e", 10, 6, 1.5); root.add(victimLight);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(.7, 24), wound);
  pool.rotation.x = -Math.PI / 2; pool.position.set(VICTIM.x, .018, VICTIM.z + .3); root.add(pool);
  const rim = new THREE.PointLight("#aec8d4", 16, 10, 1.4);
  rim.position.set(-2.5, 4.5, -9); root.add(rim);
  let huntStart = { ...VICTIM }, fleeStart = { ...VICTIM };
  let previous = "waiting";

  function pose(state: EncounterState, wolfPosition: { x: number; z: number }, player: { x: number; z: number }, reducedMotion: boolean) {
    const { phase, time } = state;
    if (phase !== previous) {
      if (phase === "hunting") huntStart = { ...wolfPosition };
      if (phase === "fleeing") fleeStart = { ...wolfPosition };
      previous = phase;
    }
    const transformed = !["waiting", "stirring", "transforming"].includes(phase);
    const progress = phase === "transforming" ? THREE.MathUtils.smoothstep(time / ENCOUNTER_DURATIONS.transforming, 0, 1) : transformed ? 1 : 0;
    const tremor = reducedMotion ? 0 : Math.sin(time * 24) * .035 * Math.sin(progress * Math.PI);
    man.body.visible = !["aftermath", "caught"].includes(phase);
    man.body.position.set(WATCHMAN.x, 0, WATCHMAN.z);
    man.body.rotation.set(0, 0, 0);
    man.hips.position.y = .85 + progress * .22;
    man.hips.rotation.set(.12 + progress * .25, 0, tremor);
    man.torso.scale.set(.28 + progress * .19, .43 + progress * .12, .18 + progress * .12);
    man.torso.material = progress > .5 ? fur : coat;
    man.head.scale.setScalar(1 + progress * .3);
    man.head.rotation.set(-progress * .3, 0, tremor);
    man.head.position.set(0, .97 - progress * .12, progress * .22);
    man.humanHead.visible = progress < .6;
    man.hem.visible = progress < .8;
    wolfHead.scale.setScalar(Math.max(.001, progress));
    mane.scale.setScalar(Math.max(.001, progress));
    tail.scale.setScalar(Math.max(.001, progress));
    jaw.rotation.x = -.06 + (transformed ? .3 : progress * .6);
    man.arms.forEach(({ upper, lower }, i) => {
      upper.position.x = (i ? 1 : -1) * (.29 + progress * .19);
      upper.scale.set(1 + progress * .55, 1 + progress * .7, 1 + progress * .55);
      upper.rotation.set(-progress * .25, 0, (i ? 1 : -1) * (.08 + progress * .28));
      lower.rotation.x = -.12 - progress * .45;
      claws[i].scale.setScalar(Math.max(.001, progress));
      upper.children.forEach(child => { if (child instanceof THREE.Mesh) child.material = progress > .5 ? fur : coat; });
      lower.children.forEach((child, index) => { if (child instanceof THREE.Mesh) child.material = progress > .5 ? fur : index === 0 ? coat : skin; });
    });
    man.legs.forEach(({ leg, shin }, i) => {
      leg.scale.setScalar(1 + progress * .3); leg.rotation.x = -.25 * progress;
      shin.rotation.x = .5 * progress;
      leg.position.x = (i ? 1 : -1) * (.135 + progress * .065);
    });
    if (phase === "stirring") {
      man.hips.rotation.x = .1 + Math.sin(Math.min(time / 3, 1) * Math.PI) * .55;
      man.head.rotation.x = .4;
      man.arms.forEach(({ upper }, i) => { upper.rotation.x = -.75; upper.rotation.z = (i ? 1 : -1) * .4; });
    }
    if (phase === "transforming") man.body.rotation.y = Math.sin(progress * Math.PI) * .35;
    const fallen = !["waiting", "stirring", "transforming"].includes(phase);
    const fall = phase === "pouncing" ? THREE.MathUtils.smoothstep(time, .4, 1.1) : fallen ? 1 : 0;
    victim.body.position.set(VICTIM.x, .05 * fall, VICTIM.z);
    victim.body.rotation.set(-fall * Math.PI / 2, -.7 * (1 - fall), fall * .2);
    victim.body.visible = true;
    victim.arms.forEach(({ upper }, i) => { upper.rotation.x = -fall * .8; upper.rotation.z = (i ? -1 : 1) * fall * .9; });
    fallenLantern.position.set(VICTIM.x + .55 + fall * .35, .9 * (1 - fall) + .13, VICTIM.z + .6);
    fallenLantern.rotation.z = fall * 1.2;
    flame.visible = !fallen || phase === "pouncing";
    victimLight.position.copy(fallenLantern.position);
    victimLight.intensity = flame.visible ? 10 : 0;
    pool.visible = ["feeding", "hunting", "fleeing", "aftermath", "caught"].includes(phase);
    pool.scale.setScalar(phase === "feeding" ? Math.min(1, time / 4) : 1);
    if (phase === "pouncing") {
      const t = Math.min(1, time / ENCOUNTER_DURATIONS.pouncing);
      man.body.position.set(THREE.MathUtils.lerp(WATCHMAN.x, VICTIM.x, t), reducedMotion ? 0 : Math.sin(t * Math.PI) * .75, THREE.MathUtils.lerp(WATCHMAN.z, VICTIM.z + .4, t));
      man.body.rotation.y = Math.atan2(VICTIM.x - WATCHMAN.x, VICTIM.z - WATCHMAN.z);
      man.hips.rotation.x = .9;
      man.arms.forEach(({ upper }) => { upper.rotation.x = -1.5; });
    }
    if (phase === "feeding") {
      man.body.position.set(VICTIM.x, -.1, VICTIM.z + .5); man.body.rotation.y = Math.PI;
      man.hips.position.y = .68;
      man.hips.rotation.x = .95 + (reducedMotion ? 0 : Math.sin(time * 5) * .045);
      man.head.rotation.x = .25;
      jaw.rotation.x = reducedMotion ? .35 : .35 + Math.sin(time * 7) * .16;
      man.arms.forEach(({ upper }) => { upper.rotation.x = -1.1; });
      man.legs.forEach(({ leg, shin }) => { leg.rotation.x = -1.1; shin.rotation.x = 1.5; });
    }
    if (phase === "hunting" || phase === "fleeing") {
      const position = phase === "hunting" ? wolfPosition : { x: fleeStart.x - time * 3.8, z: fleeStart.z - time * 4 };
      man.body.position.set(position.x, 0, position.z);
      const target = phase === "hunting" ? player : { x: position.x - 4, z: position.z - 5 };
      man.body.rotation.y = Math.atan2(target.x - position.x, target.z - position.z);
      const gait = reducedMotion ? 0 : Math.sin(time * (phase === "fleeing" ? 13 : 7));
      man.legs.forEach(({ leg }, i) => { leg.rotation.x += gait * (i ? -.45 : .45); });
      man.arms.forEach(({ upper }, i) => { upper.rotation.x += gait * (i ? .2 : -.2); });
      if (phase === "hunting" && time < .6) man.body.position.lerp(new THREE.Vector3(huntStart.x, 0, huntStart.z + .5), 1 - time / .6);
    }
    rim.intensity = man.body.visible ? 16 : 4;
  }
  return { pose, obstacles: () => [
    ...(man.body.visible ? [{ x: man.body.position.x, z: man.body.position.z, radius: .65 }] : []),
    { x: VICTIM.x, z: VICTIM.z, radius: .5 },
  ] };
}
