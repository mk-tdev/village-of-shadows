export const WALK_SPEED = 3.3;
export const RUN_SPEED = 7;
const GRAVITY = 20;
const JUMP_SPEED = 8.6;
export type JumpState = { height: number; velocity: number; grounded: boolean };
export const groundedJump = (): JumpState => ({ height: 0, velocity: 0, grounded: true });

/** A fixed-size step, with real low-obstacle support rather than a collision bypass. */
export function advanceJump(state: JumpState, delta: number, floor: number, jump: boolean, playing = true): JumpState {
  if (!playing) return state;
  const dt = Math.max(0, Math.min(delta, .05));
  if (!dt) return state;
  let velocity = state.velocity;
  if (jump && state.grounded && Math.abs(state.height - floor) < .05) velocity = JUMP_SPEED;
  else if (state.grounded && state.height <= floor && !velocity) return { height: floor, velocity: 0, grounded: true };
  const height = state.height + velocity * dt - .5 * GRAVITY * dt * dt;
  velocity -= GRAVITY * dt;
  if (velocity <= 0 && height <= floor) return { height: floor, velocity: 0, grounded: true };
  return { height, velocity, grounded: false };
}

/** Sweep the follow camera toward its desired position. Pull in before walls. */
export function followCameraHeight(pitch: number, distance: number) {
  return Math.max(.55, 2.2 - Math.sin(pitch) * distance * .7);
}

export function cameraDistance(clear: (distance: number) => boolean, desired = 4.2) {
  for (let d = .15; d <= desired; d += .12) if (!clear(d)) return Math.max(.05, d - .24);
  return desired;
}
