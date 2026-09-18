import type { EncounterState } from "./encounter";

/** Absolute encounter time keeps animation frozen when play is paused. */
export function wolfAnimation(state: EncounterState, reduced: boolean) {
  const { phase, time } = state;
  let name = "Threat_Idle", seconds = time, span = 0;
  if (phase === "transforming") { name = "Transformation_Convulsion"; span = 5; }
  if (phase === "pouncing") { name = "Attack_Lunge"; span = 1.1; }
  if (phase === "feeding") name = "Feeding";
  if (phase === "hunting") {
    if (time < 2.8) { name = "Threat_Roar"; span = 2.8; }
    else { name = "Hunt_Stride"; seconds = time - 2.8; }
  }
  if (phase === "fleeing") { name = "Hunt_Stride"; seconds = time * 2; }
  return { name, seconds: reduced ? 0 : seconds, span, reduced };
}

export function wolfClipTime(sample: ReturnType<typeof wolfAnimation>, duration: number) {
  if (duration <= 0) return 0;
  if (sample.reduced) return sample.name === "Threat_Idle" ? 0 : duration * .5;
  return sample.span ? Math.min(1, Math.max(0, sample.seconds / sample.span)) * duration : Math.max(0, sample.seconds) % duration;
}
