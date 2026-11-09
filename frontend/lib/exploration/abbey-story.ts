/**
 * The Abbey of the Last Bell — deterministic story rules, independent of
 * rendering. Only active play advances the clock, so pausing freezes the
 * Keeper exactly where she stands.
 *
 * dormant → stalking: the player enters the compound; the hanged sister is
 *   gone from the gate rope.
 * stalking: the Keeper waits at an anchor. If the lantern holds on her she
 *   vanishes, then reappears at another anchor out of the player's view.
 * tolling: the player rings the restored bell; every grave bell answers.
 * hunting: she climbs toward the player. Hold the lantern on her to banish
 *   her; let her reach you in the dark and she takes the light (caught).
 */
export type AbbeyPhase = "dormant" | "stalking" | "tolling" | "hunting" | "banished" | "caught";
export type AbbeyState = { phase: AbbeyPhase; time: number; light: number; anchor: number; seen: number; hidden: number; sightings: number };
export type AbbeyInput = { playing: boolean; inside: boolean; lit: boolean; distance: number; ring: boolean; escaped: boolean; nextAnchor: () => number };

export const ABBEY_TIMING = { reveal: .45, hide: 2.5, tolling: 3.6, ward: 2.6, reach: 1.1 };
export const newAbbey = (): AbbeyState => ({ phase: "dormant", time: 0, light: 0, anchor: 0, seen: 0, hidden: 0, sightings: 0 });
export const abbeyActive = (phase: AbbeyPhase) => phase === "tolling" || phase === "hunting";

export function advanceAbbey(state: AbbeyState, delta: number, input: AbbeyInput): AbbeyState {
  if (!input.playing || state.phase === "banished" || state.phase === "caught") return state;
  const dt = Math.min(Math.max(delta, 0), .1);
  const s = { ...state, time: state.time + dt };
  switch (state.phase) {
    case "dormant":
      return input.inside ? { ...s, phase: "stalking", time: 0, anchor: input.nextAnchor(), hidden: 0 } : state;
    case "stalking": {
      if (input.ring) return { ...s, phase: "tolling", time: 0, light: 0, seen: 0, hidden: 0 };
      if (s.hidden > 0) {
        s.hidden = Math.max(0, s.hidden - dt);
        if (s.hidden === 0) s.anchor = input.nextAnchor();
        return s;
      }
      s.seen = input.lit ? s.seen + dt : Math.max(0, s.seen - dt);
      if (s.seen >= ABBEY_TIMING.reveal) return { ...s, seen: 0, hidden: ABBEY_TIMING.hide, sightings: s.sightings + 1 };
      return s;
    }
    case "tolling":
      return s.time >= ABBEY_TIMING.tolling ? { ...s, phase: "hunting", time: 0, light: 0 } : s;
    case "hunting": {
      s.light = input.lit ? s.light + dt : Math.max(0, s.light - dt * .5);
      if (s.light >= ABBEY_TIMING.ward) return { ...s, phase: "banished", time: 0 };
      if (input.distance < ABBEY_TIMING.reach && !input.lit) return { ...s, phase: "caught", time: 0, light: 0 };
      if (input.escaped) return { ...s, phase: "stalking", time: 0, light: 0, hidden: ABBEY_TIMING.hide };
      return s;
    }
  }
  return state;
}
