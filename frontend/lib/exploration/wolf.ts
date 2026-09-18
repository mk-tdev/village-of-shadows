import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { EncounterState } from "./encounter";
import { wolfAnimation, wolfClipTime } from "./wolf-animation";

function disposeAsset(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>(), textures = new Set<THREE.Texture>();
  object.traverse(child => {
    if (child instanceof THREE.Mesh) { geometries.add(child.geometry); (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => materials.add(m)); }
    if (child instanceof THREE.SkinnedMesh) skeletons.add(child.skeleton);
  });
  materials.forEach(material => Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); }));
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  skeletons.forEach(s => s.dispose()); textures.forEach(t => t.dispose());
}

export function createWolf(scene: THREE.Object3D, loading: THREE.LoadingManager, onError: () => void) {
  const root = new THREE.Group(); scene.add(root); root.visible = false;
  const contacts: { mesh: THREE.SkinnedMesh; indices: number[] }[] = [];
  const foot = new THREE.Vector3();
  const actions = new Map<string, THREE.AnimationAction>();
  let disposed = false;
  let mixer: THREE.AnimationMixer | undefined, active: THREE.AnimationAction | undefined;
  new GLTFLoader(loading).load("/exploration/werewolf-blender.glb", gltf => {
    if (disposed) { disposeAsset(gltf.scene); return; }
    gltf.scene.traverse(child => {
      if (child instanceof THREE.Mesh) { child.castShadow = child.receiveShadow = true; child.frustumCulled = false; }
    });
    // Measure in asset space before attaching to the moving/scaling encounter root.
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(child => {
      if (!(child instanceof THREE.SkinnedMesh) || child.name !== "ContinuousAnatomy") return;
      const indices: number[] = [], positions = child.geometry.getAttribute("position");
      let floor = Infinity;
      for (let i = 0; i < positions.count; i++) floor = Math.min(floor, child.getVertexPosition(i, foot).applyMatrix4(child.matrixWorld).y);
      for (let i = 0; i < positions.count; i++) {
        if (child.getVertexPosition(i, foot).applyMatrix4(child.matrixWorld).y < floor + .3) indices.push(i);
      }
      contacts.push({ mesh: child, indices });
    });
    root.add(gltf.scene);
    mixer = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    if (!["Threat_Idle", "Threat_Roar", "Transformation_Convulsion", "Attack_Lunge", "Feeding", "Hunt_Stride"].every(name => actions.has(name))) onError();
  }, undefined, () => { if (!disposed) onError(); });
  return {
    pose(state: EncounterState, position: THREE.Vector3, yaw: number, progress: number, reduced: boolean) {
      root.visible = progress > .42 && !["aftermath", "caught"].includes(state.phase);
      root.position.copy(position); root.rotation.y = yaw;
      root.scale.setScalar(THREE.MathUtils.lerp(.67, 1, THREE.MathUtils.smoothstep(progress, .42, 1)));
      const sample = wolfAnimation(state, reduced), action = actions.get(sample.name);
      if (action && mixer) {
        if (action !== active) {
          active?.stop(); active = action;
          action.reset().setLoop(THREE.LoopOnce, 1).play();
          action.clampWhenFinished = true;
        }
        action.time = wolfClipTime(sample, action.getClip().duration);
        mixer.update(0);
      }
      if (state.phase === "feeding") root.position.y -= .42;
      // glTF bones retain Blender's rest orientation; never zero their rotations.
      if (contacts.length && state.phase !== "feeding" && state.phase !== "pouncing") {
        root.updateMatrixWorld(true);
        let floor = Infinity;
        for (const { mesh, indices } of contacts) {
          for (const index of indices) floor = Math.min(floor, mesh.getVertexPosition(index, foot).applyMatrix4(mesh.matrixWorld).y);
        }
        if (Number.isFinite(floor)) root.position.y += position.y - floor;
      }
    },
    dispose() {
      disposed = true;
      mixer?.stopAllAction();
      if (mixer) mixer.uncacheRoot(mixer.getRoot());
      actions.clear(); disposeAsset(root); scene.remove(root);
    },
  };
}
