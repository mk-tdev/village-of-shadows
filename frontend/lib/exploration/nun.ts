import * as THREE from "three";
import type { Character } from "./characters";

/**
 * Dresses a rigged CC0 villager as a sister of the abbey: a long black habit,
 * black veil over a white coif and collar, and optionally a black face veil.
 *
 * The habit pieces are not skinned. The robe hangs from the root and sways
 * with the hips; the veil follows the Head bone through a rest-pose offset,
 * so the costume works without knowing the rig's bone axes.
 */
export function dressAsNun(character: Character, options: { faceVeil: boolean }) {
  const black = new THREE.MeshStandardMaterial({ color: "#0b0b0d", roughness: .95, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: "#d9d4c6", roughness: .9 });
  const lace = new THREE.MeshStandardMaterial({ color: "#050506", roughness: 1, transparent: true, opacity: .93, side: THREE.DoubleSide });
  const geometries: THREE.BufferGeometry[] = [];
  const keep = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };

  // Hide hair; turn every outfit material into black wool, keep skin, eyes and brows.
  character.model.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    if (/Hair/i.test(child.name)) child.visible = false;
  });
  for (const m of character.materials) {
    if (/Peasant|Ranger/i.test(m.name)) { m.color.set("#111114"); m.roughness = 1; m.map = null; m.needsUpdate = true; }
    if (/Regular_Female|Regular_Male/i.test(m.name)) m.color.multiply(new THREE.Color("#c8c4c2"));
  }

  // Robe: a folded skirt from the waist to the ground.
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, y = 1.14 - t * 1.13;
    profile.push(new THREE.Vector2(.165 + Math.pow(t, 1.35) * .27, y));
  }
  const robeGeo = keep(new THREE.LatheGeometry(profile, 40));
  const pos = robeGeo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), a = Math.atan2(z, x);
    const fold = 1 + Math.sin(a * 9) * .045 * (1.14 - y);
    pos.setX(i, x * fold); pos.setZ(i, z * fold * .86);
  }
  robeGeo.computeVertexNormals();
  const robe = new THREE.Mesh(robeGeo, black); robe.castShadow = robe.receiveShadow = true;
  const robePivot = new THREE.Group(); robePivot.position.y = 1.14; robe.position.y = -1.14; robePivot.add(robe);
  character.root.add(robePivot);

  // Veil, coif and collar in an upright head frame: +y up, +z toward the face.
  const veil = new THREE.Group();
  const hood = new THREE.Mesh(keep(new THREE.SphereGeometry(.142, 28, 18, Math.PI * .72, Math.PI * 1.56, 0, Math.PI * .62)), black);
  hood.position.set(0, .105, -.012); hood.rotation.y = Math.PI;
  const drape = new THREE.Mesh(keep(new THREE.CylinderGeometry(.13, .31, .62, 28, 1, true, Math.PI * .72, Math.PI * 1.56)), black);
  drape.position.set(0, -.17, -.03); drape.rotation.y = Math.PI;
  const coif = new THREE.Mesh(keep(new THREE.TorusGeometry(.098, .024, 8, 28)), white);
  coif.position.set(0, .095, .062); coif.scale.set(.95, 1.18, .6);
  const collar = new THREE.Mesh(keep(new THREE.CylinderGeometry(.1, .2, .17, 24, 1, true)), white);
  collar.position.set(0, -.07, .015);
  hood.castShadow = drape.castShadow = true;
  veil.add(hood, drape, coif, collar);
  if (options.faceVeil) {
    const face = new THREE.Mesh(keep(new THREE.CircleGeometry(.105, 24)), lace);
    face.position.set(0, .09, .118); face.scale.set(.86, 1.15, 1);
    veil.add(face);
  }
  character.root.add(veil);

  // Rest-pose offset between the Head bone and the upright costume frame.
  const head = character.bones.get("Head");
  const correction = new THREE.Quaternion();
  const tmpQ = new THREE.Quaternion(), rootQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), rootInv = new THREE.Matrix4();
  let calibrated = false;
  function calibrate() {
    if (!head) return;
    character.root.updateMatrixWorld(true);
    head.getWorldQuaternion(tmpQ); character.root.getWorldQuaternion(rootQ);
    correction.copy(tmpQ).invert().multiply(rootQ);
    calibrated = true;
  }

  return {
    /** Call after the mixer and any head aiming for this frame. */
    update(time: number, reduced: boolean, motion = 0) {
      if (!head) return;
      if (!calibrated) calibrate();
      character.root.updateMatrixWorld(true);
      rootInv.copy(character.root.matrixWorld).invert();
      head.getWorldPosition(tmpP).applyMatrix4(rootInv);
      head.getWorldQuaternion(tmpQ).multiply(correction);
      character.root.getWorldQuaternion(rootQ);
      veil.position.copy(tmpP);
      veil.quaternion.copy(rootQ.invert().multiply(tmpQ));
      const sway = reduced ? 0 : Math.sin(time * 1.7) * .02 + motion * Math.sin(time * 6) * .05;
      robePivot.rotation.set(motion * .06, 0, sway);
    },
    recalibrate() { calibrated = false; },
    dispose() { geometries.forEach(g => g.dispose()); black.dispose(); white.dispose(); lace.dispose(); robePivot.removeFromParent(); veil.removeFromParent(); },
  };
}
export type NunCostume = ReturnType<typeof dressAsNun>;
