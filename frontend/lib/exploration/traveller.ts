import * as THREE from "three";
import { handLantern, type Cast, type Character } from "./characters";
import type { Point } from "./world";

export const TRAVELLERS = [
  { id: "woodsman_man", name: "The woodsman", description: "Leather coat · masculine" },
  { id: "huntress_woman", name: "The huntress", description: "Forest leathers · feminine" },
  { id: "hooded_man", name: "The wanderer", description: "Hooded cloak · masculine" },
  { id: "hooded_woman", name: "The wayfarer", description: "Hooded cloak · feminine" },
] as const;
export type TravellerName = typeof TRAVELLERS[number]["id"];
export type CameraView = "first" | "third";

/** Avatar selection is browser-local. Presets reuse the village's rigged cast. */
export function createTraveller(scene: THREE.Scene, cast: Cast, onError: () => void) {
  let character: Character | null = null, selected: TravellerName | null = null, request = 0, disposed = false;
  const iron = new THREE.MeshStandardMaterial({ color: "#25251f", metalness: .7, roughness: .6 });
  const glow = new THREE.MeshStandardMaterial({ color: "#d8a85c", emissive: "#d5a050", emissiveIntensity: 1 });
  let lantern: THREE.Object3D | null = null;
  function release() {
    if (lantern) { lantern.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); lantern.removeFromParent(); }
    character?.dispose(); character = null; lantern = null;
  }
  return {
    select(name: TravellerName) {
      if (selected === name || disposed) return;
      selected = name; const version = ++request;
      void cast.spawn(name, 1.78).then(next => {
        if (disposed || version !== request) { next.dispose(); return; }
        release(); character = next; next.root.visible = false;
        lantern = handLantern({ iron, glow }); next.attach("hand_r", lantern, new THREE.Vector3(0, -.12, 0));
        scene.add(next.root);
      }).catch(() => { if (!disposed && version === request) { selected = null; onError(); } });
    },
    update(point: Point, height: number, facing: number, moving: boolean, running: boolean, airborne: boolean, dt: number, visible: boolean, light: boolean, reduced: boolean) {
      if (!character) return false;
      character.root.visible = visible;
      character.root.position.set(point.x, height, point.z);
      const angle = Math.atan2(Math.sin(facing - character.root.rotation.y), Math.cos(facing - character.root.rotation.y));
      character.root.rotation.y += angle * (reduced ? 1 : 1 - Math.exp(-dt * 14));
      if (airborne) character.play("Crouch_Idle_Loop", .12);
      else character.play(moving ? running ? "Sprint_Loop" : "Walk_Loop" : "Idle_Lantern_Loop", .18, false, moving ? running ? 1.2 : 1.25 : 1);
      character.mixer.update(reduced ? 0 : dt);
      if (lantern) lantern.visible = light;
      return true;
    },
    dispose() { disposed = true; request++; release(); iron.dispose(); glow.dispose(); },
  };
}
