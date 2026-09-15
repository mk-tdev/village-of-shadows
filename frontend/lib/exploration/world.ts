/** Local prologue rules. These never read or alter an AI council session. */
export type Point = { x: number; z: number };
export type Obstacle = Point & { radius: number };
export type Landmark = Point & { id: string; name: string; seal: string; text: string; hint: string };

export const SPAWN: Point = { x: 0, z: 19 };
export const COUNCIL: Point = { x: 0, z: -32 };
export const COUNCIL_SEAT: Point = { x: 0, z: -28.2 };
export const LANDMARKS: Landmark[] = [
  { id: "lantern", x: -2.6, z: 13, name: "The abandoned lantern", seal: "The watchman’s letter", text: "Mara's lantern is still warm. Beneath it, a note: ‘There were seven of us at sunset. I counted eight shadows. Follow the lamps north. Your chair is waiting beyond the chapel.’", hint: "Follow the lane to the old well." },
  { id: "well", x: 2.5, z: -3, name: "The old well", seal: "The well keeper’s key", text: "A rope disappears into the black water. Something below knocks three times. Carved into the stone: ‘The bell has no tongue. If you hear it, do not answer.’ A rusted iron key rests on the wet stone rim.", hint: "The council fire burns beyond the chapel. Keep heading north." },
  { id: "chapel", x: -1.8, z: -24, name: "The silent chapel", seal: "The bell-ringer’s medallion", text: "Seven names are scratched into the door. Yours is the last. A tarnished brass medallion hangs from a nail, beside a message: ‘The council is waiting. One of them already knows what you found.’", hint: "Find the empty wooden chair beside the council fire and take your seat." },
];

export const COTTAGES = [
  { x: -7, z: 12, w: 6, d: 7, h: 4.2 }, { x: 7.5, z: 8, w: 6, d: 7, h: 4.8 },
  { x: -8, z: -1, w: 7, d: 7, h: 4.8 }, { x: 8.5, z: -8, w: 6, d: 7, h: 4.1 },
  { x: -8, z: -14, w: 6, d: 7, h: 4.5 }, { x: 7.7, z: -21, w: 6, d: 7, h: 5 },
];

export function canWalk(p: Point, obstacles: readonly Obstacle[] = []): boolean {
  if (obstacles.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.radius + .3)) return false;
  if (Math.abs(p.x) > 15 || p.z > 23 || p.z < -38) return false;
  if (COTTAGES.some(h => Math.abs(p.x - h.x) < h.w / 2 + .35 && Math.abs(p.z - h.z) < h.d / 2 + .35)) return false;
  // Chapel sits west of the path; its porch remains accessible.
  if (p.x > -10.4 && p.x < -3.6 && p.z > -29.4 && p.z < -20.6) return false;
  if (Math.hypot(p.x - 2.5, p.z + 3) < 1.05) return false;
  return true;
}

/** Axis sliding avoids sticking to corners; substeps prevent wall tunnelling. */
export function movePlayer(from: Point, dx: number, dz: number, obstacles: readonly Obstacle[] = []): Point {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .18));
  const p = { ...from };
  for (let i = 0; i < steps; i++) {
    if (canWalk({ x: p.x + dx / steps, z: p.z }, obstacles)) p.x += dx / steps;
    if (canWalk({ x: p.x, z: p.z + dz / steps }, obstacles)) p.z += dz / steps;
  }
  return p;
}

export function nearbyLandmark(p: Point, found: readonly string[]): Landmark | undefined {
  return LANDMARKS.find(l => !found.includes(l.id) && Math.hypot(l.x - p.x, l.z - p.z) < 3.3);
}

export function atCouncil(p: Point): boolean {
  return Math.hypot(p.x - COUNCIL_SEAT.x, p.z - COUNCIL_SEAT.z) < 1.8;
}

export function restoreSeals(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(parsed)) return [];
    return LANDMARKS.filter(l => parsed.includes(l.id)).map(l => l.id);
  } catch { return []; }
}
