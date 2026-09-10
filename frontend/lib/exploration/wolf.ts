import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { EncounterState } from "./encounter";

function disposeAsset(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), skeletons = new Set<THREE.Skeleton>();
  object.traverse(child => {
    if (child instanceof THREE.Mesh) { geometries.add(child.geometry); (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => materials.add(m)); }
    if (child instanceof THREE.SkinnedMesh) skeletons.add(child.skeleton);
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); skeletons.forEach(s => s.dispose());
}

export function createWolf(scene: THREE.Object3D, loading: THREE.LoadingManager, onError: () => void) {
  const root = new THREE.Group(); scene.add(root); root.visible = false;
  const bones: Record<string, THREE.Bone> = {};
  const foot = new THREE.Vector3();
  let disposed = false;
  new GLTFLoader(loading).load("/exploration/werewolf.glb", gltf => {
    if (disposed) { disposeAsset(gltf.scene); return; }
    gltf.scene.traverse(child => {
      if (child instanceof THREE.Bone) bones[child.name] = child;
      if (child instanceof THREE.Mesh) { child.castShadow = child.receiveShadow = true; child.frustumCulled = false; }
    });
    root.add(gltf.scene);
  }, undefined, () => { if (!disposed) onError(); });
  const rotate = (name: string, x: number, y = 0, z = 0) => bones[name]?.rotation.set(x, y, z);
  return {
    pose(state: EncounterState, position: THREE.Vector3, yaw: number, progress: number, reduced: boolean) {
      root.visible = progress > .42 && !["aftermath", "caught"].includes(state.phase);
      root.position.copy(position); root.rotation.y = yaw;
      root.scale.setScalar(THREE.MathUtils.lerp(.67, 1, THREE.MathUtils.smoothstep(progress, .42, 1)));
      Object.values(bones).forEach(b => b.rotation.set(0, 0, 0));
      const { phase, time } = state;
      const breath = reduced ? 0 : Math.sin(time * 2.8) * .025;
      rotate("Spine", .06 + breath); rotate("Neck", -.12); rotate("Head", -.05);
      rotate("Jaw", .2);
      if (phase === "transforming") {
        rotate("Spine", (1 - progress) * .7);
        rotate("Head", -.2 - Math.sin(progress * Math.PI) * .4);
        rotate("Jaw", .65 * Math.sin(progress * Math.PI));
      }
      if (phase === "pouncing") {
        rotate("Spine", .55); rotate("Head", -.5); rotate("Jaw", .8);
        rotate("ArmL", -1.1, 0, -.2); rotate("ArmR", -1.1, 0, .2);
        rotate("ThighL", -.7); rotate("ThighR", -.7); rotate("ShinL", 1.1); rotate("ShinR", 1.1);
      }
      if (phase === "feeding") {
        root.position.y = -.42;
        rotate("Spine", .8); rotate("Chest", .2); rotate("Head", .24);
        rotate("Jaw", .3 + (reduced ? 0 : Math.max(0, Math.sin(time * 5)) * .35));
        rotate("ThighL", -.7); rotate("ThighR", -.7); rotate("ShinL", .9); rotate("ShinR", .9);
        rotate("ArmL", -.65, 0, -.12); rotate("ArmR", -.65, 0, .12);
      }
      if (phase === "hunting" || phase === "fleeing") {
        const cycle = time * (phase === "fleeing" ? 12 : 6);
        const step = reduced ? 0 : Math.sin(cycle);
        rotate("ThighL", step * .36); rotate("ThighR", -step * .36);
        rotate("ShinL", Math.max(0, -step) * .5); rotate("ShinR", Math.max(0, step) * .5);
        rotate("ArmL", -step * .17, 0, -.08); rotate("ArmR", step * .17, 0, .08);
        rotate("ForearmL", -.18); rotate("ForearmR", -.18);
        rotate("Head", -.12, reduced ? 0 : Math.sin(time * 1.2) * .045);
        // The opening threat vocalization has a matching jaw gesture.
        rotate("Jaw", time < 2.8 ? .25 + Math.sin(Math.min(1, time / 2.8) * Math.PI) * .6 : .2);
        root.position.y += reduced ? 0 : Math.abs(step) * .035;
      }
      // Plant the lower foot after posing; the gait must not lift the whole body.
      if (bones.FootL && bones.FootR && phase !== "feeding" && phase !== "pouncing") {
        root.updateMatrixWorld(true);
        const left = bones.FootL.localToWorld(foot.set(0, -.18, .16)).y;
        const right = bones.FootR.localToWorld(foot.set(0, -.18, .16)).y;
        root.position.y -= Math.min(left, right);
      }
    },
    dispose() {
      disposed = true;
      const skeletons = new Set<THREE.Skeleton>();
      root.traverse(child => { if (child instanceof THREE.SkinnedMesh) skeletons.add(child.skeleton); });
      skeletons.forEach(skeleton => skeleton.dispose());
    },
  };
}
