/** Deterministic encounter clock. Only active play advances it; no wall-clock timers. */
export type EncounterPhase = "waiting" | "stirring" | "transforming" | "pouncing" | "feeding" | "hunting" | "fleeing" | "aftermath" | "caught";
export type EncounterState = { phase: EncounterPhase; time: number; lightTime: number };
export const WATCHMAN = { x: -.9, z: -7.5 };
export const VICTIM = { x: 1.2, z: -9.5 };
export const ENCOUNTER_DURATIONS = { stirring: 3, transforming: 5, pouncing: 1.1, feeding: 4.8, hunting: 16, fleeing: 3 };
const NEXT: Partial<Record<EncounterPhase, EncounterPhase>> = { stirring: "transforming", transforming: "pouncing", pouncing: "feeding", feeding: "hunting", hunting: "fleeing", fleeing: "aftermath" };
export const newEncounter = (): EncounterState => ({ phase: "waiting", time: 0, lightTime: 0 });
export const encounterActive = (phase: EncounterPhase) => !["waiting", "aftermath", "caught"].includes(phase);

export function canStartEncounter(point: { x: number; z: number }, yaw: number, found: readonly string[]) {
  const dx = WATCHMAN.x - point.x, dz = WATCHMAN.z - point.z;
  const distance = Math.hypot(dx, dz);
  return found.length > 0 && distance > 3 && distance < 12 && (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / distance > .78;
}

export function advanceEncounter(state: EncounterState, dt: number, input: { playing: boolean; trigger: boolean; warding: boolean; distance: number; escaped: boolean }): EncounterState {
  if (!input.playing || state.phase === "caught" || state.phase === "aftermath") return state;
  if (state.phase === "waiting") return input.trigger ? { phase: "stirring", time: 0, lightTime: 0 } : state;
  const next = { ...state, time: state.time + Math.min(Math.max(dt, 0), .1) };
  if (state.phase === "hunting") {
    next.lightTime = input.warding ? state.lightTime + Math.min(Math.max(dt, 0), .1) : Math.max(0, state.lightTime - dt * .5);
    if (input.escaped || next.lightTime >= 2.6) return { phase: "fleeing", time: 0, lightTime: 0 };
    if (input.distance < 1.25 && !input.warding) return { phase: "caught", time: 0, lightTime: 0 };
  }
  const duration = ENCOUNTER_DURATIONS[state.phase as keyof typeof ENCOUNTER_DURATIONS];
  if (next.time >= duration) return { phase: NEXT[state.phase]!, time: 0, lightTime: 0 };
  return next;
}

export const ENCOUNTER_COPY: Record<EncounterPhase, { title: string; text: string }> = {
  waiting: { title: "", text: "" },
  stirring: { title: "Something is wrong.", text: "The watchman has stopped breathing. Watch the figure ahead." },
  transforming: { title: "That is not a man.", text: "His back bends. His hands become claws. The other villager has not noticed." },
  pouncing: { title: "Too late.", text: "The creature leaps. A lantern strikes the stones." },
  feeding: { title: "Do not make a sound.", text: "It is feeding. Keep your distance. Your lantern may be all that protects you." },
  hunting: { title: "It has your scent.", text: "Face it with your lantern lit to drive it back, or run away. F toggles the lantern." },
  fleeing: { title: "It retreats into the mist.", text: "Keep moving. Reach the council fire." },
  aftermath: { title: "The watchman’s hunger", text: "I saw a man become a wolf. It fell upon a villager, then fed beside the fallen lantern. It turned toward me. I survived. The council must hear this." },
  caught: { title: "The light went out.", text: "The creature reached you in the dark. Return to the lane with your seals intact." },
};
