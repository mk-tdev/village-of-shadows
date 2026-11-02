import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { Assets } from "./assets";
import type { Point } from "./world";

/** Quaternius CC0 villagers assembled for this project (public/exploration/characters/PROVENANCE.md). */
export type CharacterName = "villager_man_a" | "villager_man_b" | "villager_woman_a" | "villager_woman_b" | "hooded_man" | "hooded_woman" | "woodsman_man" | "huntress_woman";
const TOP_HEIGHT: Record<CharacterName, number> = {
  villager_man_a: 1.803, villager_man_b: 1.777, villager_woman_a: 1.74, villager_woman_b: 1.742,
  hooded_man: 1.832, hooded_woman: 1.757, woodsman_man: 1.777, huntress_woman: 1.74,
};
export type Clip =
  | "Idle_Loop" | "Idle_LookAround" | "Idle_Talking_Loop" | "Walk_Loop" | "Walk_Formal_Loop" | "Jog_Fwd_Loop" | "Sprint_Loop"
  | "Sitting_Enter" | "Sitting_Idle_Loop" | "Sitting_Talking_Loop" | "Sitting_Exit" | "Idle_Torch_Loop" | "Idle_Lantern_Loop"
  | "Idle_FoldArms_Loop" | "Idle_No_Loop" | "Yes" | "Interact" | "Crouch_Idle_Loop" | "Crouch_Fwd_Loop" | "Hit_Chest"
  | "Hit_Knockback" | "Death01" | "LayToIdle" | "Walk_Carry_Loop" | "Zombie_Idle_Loop" | "Zombie_Walk_Fwd_Loop" | "Zombie_Scratch";

const up = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();

/** One animated villager instance: a root you position, a mixer, and procedural head aim. */
export class Character {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private head: THREE.Bone | null = null;
  private neck: THREE.Bone | null = null;
  private spine: THREE.Bone | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private aimed = new Map<THREE.Bone, { before: THREE.Quaternion; after: THREE.Quaternion }>();
  readonly bones = new Map<string, THREE.Bone>();
  readonly materials: THREE.MeshStandardMaterial[] = [];

  constructor(gltf: GLTF, readonly name: CharacterName, height = 1.72) {
    this.model = cloneSkinned(gltf.scene);
    this.model.scale.setScalar(height / TOP_HEIGHT[name]);
    this.model.traverse(child => {
      if (child instanceof THREE.Bone) this.bones.set(child.name, child);
      if (child instanceof THREE.SkinnedMesh) {
        child.castShadow = true; child.receiveShadow = true; child.frustumCulled = false;
        // Clone materials so per-character tint/fade (transformation, darkness) stays local.
        const material = (child.material as THREE.MeshStandardMaterial).clone();
        child.material = material; this.materials.push(material);
      }
    });
    this.head = this.bones.get("Head") ?? null;
    this.neck = this.bones.get("neck_01") ?? null;
    this.spine = this.bones.get("spine_03") ?? null;
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  has(clip: Clip) { return this.actions.has(clip); }

  /** Cross-fade to a clip; one-shots clamp on their last frame. */
  play(clip: Clip, fade = .35, once = false, timeScale = 1) {
    const next = this.actions.get(clip);
    if (!next) return;
    next.timeScale = timeScale;
    if (next === this.current) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false);
    else this.current?.stop();
    this.current = next;
  }

  /** Deterministic sampling for scripted scenes: pausing freezes the pose exactly. */
  sample(clip: Clip, seconds: number, loop = true) {
    const action = this.actions.get(clip);
    if (!action) return;
    if (this.current !== action) { this.mixer.stopAllAction(); action.reset().play(); action.setEffectiveWeight(1); this.current = action; }
    const duration = action.getClip().duration;
    action.paused = false;
    action.time = loop ? ((seconds % duration) + duration) % duration : Math.min(Math.max(seconds, 0), duration - .001);
    this.mixer.update(0);
  }

  clipDuration(clip: Clip) { return this.actions.get(clip)?.getClip().duration ?? 1; }

  /**
   * Turn neck and head toward a world point after the mixer has posed the
   * skeleton. Rotations are applied about world up, converted into each
   * bone's parent space, so this does not depend on the rig's bone axes.
   */
  lookAt(target: THREE.Vector3 | null, dt: number, limit = 1.1) {
    if (!this.head || !this.neck) return;
    let yaw = 0, pitch = 0;
    if (target) {
      this.root.updateMatrixWorld(true);
      const eye = this.head.getWorldPosition(tmpV);
      const dx = target.x - eye.x, dz = target.z - eye.z, dy = target.y - eye.y;
      const facing = this.root.getWorldQuaternion(tmpQ);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(facing);
      const want = Math.atan2(dx, dz), have = Math.atan2(forward.x, forward.z);
      yaw = Math.atan2(Math.sin(want - have), Math.cos(want - have));
      if (Math.abs(yaw) > limit + .5) yaw = 0; // behind them: don't owl-turn
      yaw = THREE.MathUtils.clamp(yaw, -limit, limit);
      pitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.4, .35);
    }
    const k = 1 - Math.exp(-dt * 4);
    this.lookYaw += (yaw - this.lookYaw) * k; this.lookPitch += (pitch - this.lookPitch) * k;
    const apply = (bone: THREE.Bone | null, share: number) => {
      if (!bone?.parent) return;
      // Clips that don't key this bone leave our last offset in place; undo it so aim never accumulates.
      const saved = this.aimed.get(bone);
      if (saved && bone.quaternion.equals(saved.after)) bone.quaternion.copy(saved.before);
      const before = bone.quaternion.clone();
      const parentWorld = bone.parent.getWorldQuaternion(tmpQ);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(tmpQ2));
      const world = new THREE.Quaternion().setFromAxisAngle(up, this.lookYaw * share).multiply(new THREE.Quaternion().setFromAxisAngle(right, -this.lookPitch * share));
      const local = parentWorld.clone().invert().multiply(world).multiply(parentWorld);
      bone.quaternion.premultiply(local);
      this.aimed.set(bone, { before, after: bone.quaternion.clone() });
      bone.updateMatrixWorld(true);
    };
    apply(this.spine, .15); apply(this.neck, .35); apply(this.head, .5);
  }

  /** Parent a prop to a bone, cancelling the rig's import scale so `object.scale` stays in metres. */
  attach(boneName: string, object: THREE.Object3D, offset = new THREE.Vector3()) {
    const bone = this.bones.get(boneName);
    if (!bone) return;
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
    const s = bone.getWorldScale(new THREE.Vector3()).x || 1;
    object.scale.multiplyScalar(1 / s);
    object.position.copy(offset).multiplyScalar(1 / s);
    bone.add(object);
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); this.materials.forEach(m => m.dispose()); this.root.removeFromParent(); }
}

export function createCast(assets: Assets) {
  const cache = new Map<CharacterName, Promise<GLTF>>();
  const load = (name: CharacterName) => {
    let p = cache.get(name);
    if (!p) { p = assets.gltfLoader.loadAsync(`/exploration/characters/${name}.glb`); cache.set(name, p); }
    return p;
  };
  return {
    load,
    async spawn(name: CharacterName, height?: number) { return new Character(await load(name), name, height); },
    dispose() {
      void Promise.allSettled(cache.values()).then(results => results.forEach(r => {
        if (r.status !== "fulfilled") return;
        r.value.scene.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          child.geometry.dispose();
          const m = child.material as THREE.MeshStandardMaterial;
          Object.values(m).forEach(v => { if (v instanceof THREE.Texture) v.dispose(); });
          m.dispose();
        });
      }));
    },
  };
}
export type Cast = ReturnType<typeof createCast>;

/** A small hand lantern prop for villagers, with an emissive core picked up by bloom. */
export function handLantern(materials: { iron: THREE.Material; glow: THREE.Material }) {
  const g = new THREE.Group();
  const bar = new THREE.CylinderGeometry(.005, .005, .17, 4);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    const b = new THREE.Mesh(bar, materials.iron); b.position.set(Math.cos(a) * .058, 0, Math.sin(a) * .058); g.add(b);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.075, .055, 8), materials.iron); cap.position.y = .112;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .022, 8), materials.iron); base.position.y = -.085;
  const flame = new THREE.Mesh(new THREE.CylinderGeometry(.034, .034, .13, 10), materials.glow);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.045, .005, 4, 12, Math.PI), materials.iron); handle.position.y = .14;
  g.add(cap, base, flame, handle);
  return g;
}

/** Ambient village behaviours. Each owns its character and reports a collision circle. */
export type Villager = {
  id: string;
  name: string;
  line: string;
  character: Character;
  position: () => Point;
  update: (dt: number, time: number, player: THREE.Vector3, reduced: boolean) => void;
  light?: () => THREE.Vector3 | null;
};

export function standing(character: Character, at: Point & { yaw: number }, clip: Clip, meta: { id: string; name: string; line: string }, react: Clip = "Idle_LookAround"): Villager {
  character.root.position.set(at.x, 0, at.z); character.root.rotation.y = at.yaw;
  character.play(clip, 0);
  let near = false;
  return {
    ...meta, character, position: () => at,
    update(dt, _time, player, reduced) {
      const distance = Math.hypot(player.x - at.x, player.z - at.z);
      if (distance < 5 !== near) { near = distance < 5; character.play(near && clip !== react ? react : clip, .6); }
      character.mixer.update(reduced ? 0 : dt);
      character.lookAt(distance < 9 ? player : null, dt);
    },
  };
}

/** Walks a closed waypoint loop with a lantern; pauses to stare when the player is close. */
export function patrol(character: Character, route: Point[], meta: { id: string; name: string; line: string }, speed = 1.15): Villager {
  let leg = 0, along = 0, stare = 0;
  const pos = { ...route[0] };
  character.root.position.set(pos.x, 0, pos.z);
  character.play("Walk_Loop", 0);
  const lamp = new THREE.Vector3();
  return {
    ...meta, character, position: () => pos,
    light: () => character.bones.get("hand_r")?.getWorldPosition(lamp) ?? null,
    update(dt, _time, player, reduced) {
      const distance = Math.hypot(player.x - pos.x, player.z - pos.z);
      if (distance < 3.2 && stare <= 0) stare = 4;
      if (stare > 0) {
        stare -= dt;
        character.play("Idle_Lantern_Loop", .5);
        const want = Math.atan2(player.x - pos.x, player.z - pos.z);
        character.root.rotation.y += Math.atan2(Math.sin(want - character.root.rotation.y), Math.cos(want - character.root.rotation.y)) * Math.min(1, dt * 2);
        if (stare <= 0 && distance < 3.2) stare = .5;
      } else if (!reduced) {
        character.play("Walk_Loop", .5);
        const a = route[leg], b = route[(leg + 1) % route.length];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        along += speed * dt;
        if (along >= length) { along -= length; leg = (leg + 1) % route.length; }
        const t = along / length;
        pos.x = a.x + (b.x - a.x) * t; pos.z = a.z + (b.z - a.z) * t;
        const want = Math.atan2(b.x - a.x, b.z - a.z);
        character.root.rotation.y += Math.atan2(Math.sin(want - character.root.rotation.y), Math.cos(want - character.root.rotation.y)) * Math.min(1, dt * 4);
      }
      character.root.position.set(pos.x, 0, pos.z);
      character.mixer.update(reduced ? 0 : dt);
      character.lookAt(distance < 7 ? player : null, dt);
    },
  };
}

/** Seated council member: idles or talks, and turns to watch the newcomer approach. */
export function seated(character: Character, seat: Point & { yaw: number; height: number }, talkSeed: number): Villager {
  character.root.position.set(seat.x, 0, seat.z); character.root.rotation.y = seat.yaw;
  character.play("Sitting_Idle_Loop", 0);
  // Fit the pelvis to the chair: sample the pose once and lift/lower the root.
  character.mixer.update(0); character.root.updateMatrixWorld(true);
  const pelvis = character.bones.get("pelvis")?.getWorldPosition(new THREE.Vector3());
  if (pelvis) character.root.position.y += seat.height + .1 - pelvis.y;
  let talking = false;
  return {
    id: `council-${talkSeed}`, name: "", line: "", character, position: () => seat,
    update(dt, time, player, reduced) {
      const talk = Math.sin(time * .23 + talkSeed * 1.7) > .55;
      if (talk !== talking) { talking = talk; character.play(talk ? "Sitting_Talking_Loop" : "Sitting_Idle_Loop", .8); }
      character.mixer.update(reduced ? 0 : dt);
      const distance = Math.hypot(player.x - seat.x, player.z - seat.z);
      character.lookAt(distance < 14 ? player : null, dt, 1.2);
    },
  };
}
