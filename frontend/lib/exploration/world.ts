/** Local prologue rules. These never read or alter an AI council session. */
export type Point = { x: number; z: number };
export type Obstacle = Point & { radius: number };
export type Rect = Point & { w: number; d: number };
export type Landmark = Point & { id: string; name: string; seal: string; text: string; hint: string };
export type Facing = "n" | "s" | "e" | "w";
export type BuildingKind = "cottage" | "house" | "tavern" | "smithy" | "barn" | "mill" | "hut" | "mausoleum";
export type Building = Rect & { h: number; kind: BuildingKind; facing: Facing; roof: "thatch" | "slate"; lit: boolean; stories: 1 | 2; seed: number };
export type Surface = "stone" | "dirt" | "grass" | "wood";
export type District = Rect & { name: string };

export const SPAWN: Point = { x: 0, z: 19 };
export const COUNCIL: Point = { x: 0, z: -32 };
export const COUNCIL_SEAT: Point = { x: 0, z: -28.2 };
/** The palisade encloses the playable village; the forest beyond is scenery. */
export const BOUNDS = { minX: -36, maxX: 38, minZ: -56, maxZ: 26 };
export const LANDMARKS: Landmark[] = [
  { id: "lantern", x: -2.6, z: 13, name: "The abandoned lantern", seal: "The watchman’s letter", text: "Mara's lantern is still warm. Beneath it, a note: ‘There were seven of us at sunset. I counted eight shadows. Follow the lamps north. Your chair is waiting beyond the chapel.’", hint: "Follow the lane to the old well." },
  { id: "well", x: 2.5, z: -3, name: "The old well", seal: "The well keeper’s key", text: "A rope disappears into the black water. Something below knocks three times. Carved into the stone: ‘The bell has no tongue. If you hear it, do not answer.’ A rusted iron key rests on the wet stone rim.", hint: "The council fire burns beyond the chapel. Keep heading north." },
  { id: "chapel", x: -1.8, z: -24, name: "The silent chapel", seal: "The bell-ringer’s medallion", text: "Seven names are scratched into the door. Yours is the last. A tarnished brass medallion hangs from a nail, beside a message: ‘The council is waiting. One of them already knows what you found.’", hint: "Find the empty wooden chair beside the council fire and take your seat." },
];

/** The original six lane cottages; their footprints are part of the tested route. */
export const COTTAGES = [
  { x: -7, z: 12, w: 6, d: 7, h: 4.2 }, { x: 7.5, z: 8, w: 6, d: 7, h: 4.8 },
  { x: -8, z: -1, w: 7, d: 7, h: 4.8 }, { x: 8.5, z: -8, w: 6, d: 7, h: 4.1 },
  { x: -8, z: -14, w: 6, d: 7, h: 4.5 }, { x: 7.7, z: -21, w: 6, d: 7, h: 5 },
];

const b = (x: number, z: number, w: number, d: number, h: number, kind: BuildingKind, facing: Facing, roof: Building["roof"], lit: boolean, stories: 1 | 2, seed: number): Building => ({ x, z, w, d, h, kind, facing, roof, lit, stories, seed });

/** Every enterable-looking structure in the village. Doors face the street they sit on. */
export const BUILDINGS: Building[] = [
  ...COTTAGES.map((c, i) => b(c.x, c.z, c.w, c.d, c.h, "cottage", c.x < 0 ? "e" : "w", i % 3 === 1 ? "slate" : "thatch", i !== 3, c.h > 4.4 ? 2 : 1, i + 1)),
  // Gate houses beside the spawn.
  b(-7.5, 22, 6, 6, 4.4, "cottage", "e", "thatch", false, 1, 11),
  b(7.5, 20, 6, 6.5, 4.6, "house", "w", "slate", true, 2, 12),
  // Market square: tavern to the north, smithy to the east, merchants to the south.
  b(21.5, -14, 13, 8, 6.2, "tavern", "s", "slate", true, 2, 21),
  b(34, -1, 7, 9, 4.4, "smithy", "w", "slate", true, 1, 22),
  b(17, 14, 7, 7, 5.2, "house", "n", "thatch", true, 2, 23),
  b(26, 14.5, 7, 8, 5.6, "house", "n", "slate", false, 2, 24),
  // Farmstead to the south-west.
  b(-26, 13, 9, 14, 6.4, "barn", "e", "thatch", false, 1, 31),
  b(-28, -4, 7, 6, 4.4, "house", "e", "thatch", true, 1, 32),
  // Mill on the pond and the hunter's hut at the forest edge.
  b(28, -40, 7, 7, 5.4, "mill", "w", "slate", true, 2, 41),
  b(-15, -50, 5, 5, 3.4, "hut", "s", "thatch", false, 1, 42),
  b(-28.5, -41, 4, 5, 3.6, "mausoleum", "e", "slate", false, 1, 43),
];

export const CHAPEL: Rect & { h: number } = { x: -7, z: -25, w: 6, d: 8, h: 5.8 };
export const POND: Obstacle = { x: 17, z: -44, radius: 6.2 };
export const GRAVEYARD = { minX: -32, maxX: -14, minZ: -45, maxZ: -16, gate: { from: -18.5, to: -15 } };
export const PADDOCK = { minX: -22, maxX: -16, minZ: 18, maxZ: 25 };

export const DISTRICTS: District[] = [
  { name: "The village gate", x: 0, z: 22, w: 30, d: 8 },
  { name: "The market square", x: 22, z: 0, w: 32, d: 34 },
  { name: "The old graveyard", x: -23, z: -30, w: 20, d: 32 },
  { name: "The Hollow farm", x: -19, z: 10, w: 30, d: 34 },
  { name: "The mill pond", x: 20, z: -37, w: 32, d: 26 },
  { name: "The hunter’s hut", x: -15, z: -48, w: 16, d: 14 },
  { name: "The council clearing", x: 0, z: -33, w: 18, d: 14 },
  { name: "The silent chapel", x: -2, z: -21, w: 14, d: 12 },
  { name: "The old well", x: 0, z: -5, w: 14, d: 16 },
];

/** Walk surfaces drive footstep audio. Ribbons are [x1,z1,x2,z2,width]. */
export const STREETS: { surface: Surface; points: Point[]; width: number }[] = [
  { surface: "stone", width: 8, points: [{ x: 0, z: 26 }, { x: 0, z: -27 }] },
  { surface: "stone", width: 8, points: [{ x: 3, z: 0 }, { x: 14, z: 0 }] },
  { surface: "dirt", width: 3.2, points: [{ x: -3, z: -7.5 }, { x: -16.5, z: -7.5 }, { x: -16.8, z: -17 }] },
  { surface: "dirt", width: 3, points: [{ x: -3, z: 5.5 }, { x: -20, z: 5.5 }, { x: -21, z: 13 }] },
  { surface: "dirt", width: 2.8, points: [{ x: 5, z: -35 }, { x: 10, z: -37.5 }, { x: 24, z: -37 }] },
  { surface: "dirt", width: 2.4, points: [{ x: -5, z: -36 }, { x: -11, z: -42 }, { x: -15, z: -47 }] },
  { surface: "dirt", width: 2.4, points: [{ x: -16.5, z: -18 }, { x: -22, z: -28 }, { x: -27, z: -38 }] },
];
export const MARKET: Rect = { x: 21.5, z: 0, w: 17, d: 18 };
export const JETTY: Rect = { x: 11.6, z: -42.5, w: 3.2, d: 1.6 };

/** Low, cheap-to-collide fixtures. Rendering reads the same data so visuals and collision agree. */
export const FENCES: Rect[] = [
  // Lane fences fill only the gaps that are not side streets.
  { x: -4.25, z: 17.25, w: .16, d: 3.5 }, { x: -4.25, z: -19.25, w: .16, d: 3.5 },
  { x: 4.25, z: 14.1, w: .16, d: 5.2 }, { x: 4.25, z: -14.5, w: .16, d: 6 },
  // Paddock rails with a gap toward the farm track.
  { x: -19, z: PADDOCK.maxZ, w: 6, d: .16 }, { x: PADDOCK.minX, z: 21.5, w: .16, d: 7 },
  { x: PADDOCK.maxX, z: 22.5, w: .16, d: 5 }, { x: -20.5, z: PADDOCK.minZ, w: 3, d: .16 },
];
export const WALLS: Rect[] = [
  { x: (GRAVEYARD.minX + GRAVEYARD.maxX) / 2, z: GRAVEYARD.minZ, w: GRAVEYARD.maxX - GRAVEYARD.minX, d: .5 },
  { x: GRAVEYARD.minX, z: (GRAVEYARD.minZ + GRAVEYARD.maxZ) / 2, w: .5, d: GRAVEYARD.maxZ - GRAVEYARD.minZ },
  { x: GRAVEYARD.maxX, z: (GRAVEYARD.minZ + GRAVEYARD.maxZ) / 2 - 2, w: .5, d: GRAVEYARD.maxZ - GRAVEYARD.minZ - 4 },
  { x: (GRAVEYARD.minX + GRAVEYARD.gate.from) / 2, z: GRAVEYARD.maxZ, w: GRAVEYARD.gate.from - GRAVEYARD.minX, d: .5 },
  { x: (GRAVEYARD.gate.to + GRAVEYARD.maxX) / 2, z: GRAVEYARD.maxZ, w: GRAVEYARD.maxX - GRAVEYARD.gate.to, d: .5 },
];
export const STALLS: Rect[] = [{ x: 16, z: -5, w: 3, d: 2 }, { x: 16, z: 5, w: 3, d: 2 }, { x: 27, z: -5.5, w: 3, d: 2 }];

const seeded = (i: number, salt = 1) => ((Math.sin(i * 127.1 + salt * 311.7) * 43758.5453) % 1 + 1) % 1;
/** Graves in rows inside the wall, leaving a central aisle to the mausoleum. */
export const GRAVES: (Point & { kind: number; tilt: number; yaw: number })[] = [];
for (let row = 0; row < 7; row++) for (let col = 0; col < 6; col++) {
  const i = row * 6 + col;
  if (col === 2 || col === 3 || seeded(i, 3) < .12) continue;
  GRAVES.push({ x: -30 + col * 2.6 + (seeded(i, 1) - .5) * .5, z: -20.5 - row * 3 + (seeded(i, 2) - .5) * .6, kind: Math.floor(seeded(i, 4) * 4), tilt: (seeded(i, 5) - .5) * .32, yaw: (seeded(i, 6) - .5) * .25 });
}

/** Props with physical footprints, all rendered from Poly Haven CC0 models. */
export type PropKind = "barrel" | "barrels" | "crate" | "crate2" | "bucket" | "cart" | "hay" | "stump" | "stump2" | "boulder" | "statue" | "deadtree" | "deadtree2" | "rocks" | "bench" | "table" | "wine" | "ladder" | "axe" | "wheel" | "basket" | "stool" | "broom" | "firepit" | "gate" | "scarecrow" | "pillory" | "noticeboard" | "anvil" | "woodpile" | "grave_open";
export type Prop = Point & { kind: PropKind; yaw?: number; scale?: number; radius: number };
export const PROPS: Prop[] = [
  // Market
  { kind: "barrels", x: 14.2, z: -7.6, yaw: .3, radius: .9 }, { kind: "crate", x: 17.6, z: -6.5, yaw: .2, radius: .5 }, { kind: "crate2", x: 18.1, z: -5.6, yaw: 1, radius: .45 },
  { kind: "basket", x: 15.2, z: 6.4, radius: .35 }, { kind: "crate", x: 28.6, z: -4.2, yaw: .6, radius: .5 }, { kind: "barrel", x: 29, z: -7, radius: .4 },
  { kind: "cart", x: 27, z: 5, yaw: -.5, radius: 1.3 }, { kind: "pillory", x: 21.5, z: 1, radius: .6 }, { kind: "noticeboard", x: 13.5, z: 3.6, yaw: Math.PI / 2, radius: .5 },
  { kind: "wine", x: 17.8, z: -9.2, yaw: Math.PI / 2, radius: .6 }, { kind: "table", x: 25, z: -8.3, radius: 1.1 }, { kind: "bench", x: 21.5, z: -9.1, radius: .5 },
  { kind: "anvil", x: 30, z: -1, radius: .45 }, { kind: "woodpile", x: 30.2, z: 3.4, yaw: Math.PI / 2, radius: .9 },
  // Lane backyards
  { kind: "woodpile", x: -10.6, z: 7.5, radius: .8 }, { kind: "barrel", x: 4.9, z: 13.2, radius: .4 }, { kind: "bucket", x: 3.4, z: -1.5, radius: .2 },
  { kind: "ladder", x: 11.85, z: -8, yaw: Math.PI / 2, radius: .3 }, { kind: "stool", x: -4.9, z: -12.7, radius: .25 }, { kind: "broom", x: 10.8, z: 10.3, radius: .15 },
  { kind: "crate", x: 11, z: 21.4, yaw: .4, radius: .5 }, { kind: "barrels", x: -12.6, z: -1.5, radius: .9 },
  // Farm
  { kind: "hay", x: -19.6, z: 9, radius: 1.1 }, { kind: "hay", x: -20.5, z: 15.8, radius: 1.1 }, { kind: "cart", x: -17.8, z: 1.5, yaw: 1.2, radius: 1.3 },
  { kind: "scarecrow", x: -30, z: 23, radius: .4 }, { kind: "wheel", x: -23.6, z: -1.6, radius: .45 }, { kind: "axe", x: -18, z: -2.2, radius: .45 }, { kind: "stump", x: -18, z: -2.2, radius: .45 },
  { kind: "bucket", x: -20.6, z: 7.6, radius: .2 }, { kind: "barrel", x: -21.3, z: 19, radius: .4 },
  // Graveyard and chapel
  { kind: "statue", x: -22.8, z: -31, radius: .9 }, { kind: "deadtree", x: -16.6, z: -39, radius: .7 }, { kind: "deadtree2", x: -30.2, z: -23, radius: .7 },
  { kind: "grave_open", x: -20.4, z: -24.6, radius: 1.1 }, { kind: "gate", x: -22.5, z: GRAVEYARD.maxZ - .55, radius: 0 },
  { kind: "deadtree", x: -11.5, z: -19, yaw: 2, radius: .7 },
  // Council clearing, forest edge and mill
  { kind: "stump2", x: -7.5, z: -38, radius: .55 }, { kind: "boulder", x: 7.5, z: -27.5, radius: 1.2 }, { kind: "rocks", x: -8.8, z: -30.5, radius: .7 },
  { kind: "woodpile", x: -11.6, z: -50, yaw: Math.PI / 2, radius: .9 }, { kind: "stump", x: -12.7, z: -46.6, radius: .45 }, { kind: "axe", x: -12.7, z: -46.6, yaw: 2.3, radius: 0 },
  { kind: "barrels", x: 23.6, z: -35.6, radius: .9 }, { kind: "crate2", x: 25, z: -35.4, radius: .45 }, { kind: "boulder", x: 9.5, z: -49, yaw: 2, scale: 1.4, radius: 1.6 },
  { kind: "deadtree2", x: 31, z: -49, radius: .7 }, { kind: "rocks", x: 22.5, z: -48, radius: .7 },
];

/** Where lanterns and lamp posts stand. Only the nearest few get real lights at runtime. */
export const LAMPS: (Point & { kind: "post" | "wall" | "hanging"; yaw?: number })[] = [
  { kind: "post", x: -2.6, z: 13 }, { kind: "post", x: 3.6, z: 1 }, { kind: "post", x: -3.4, z: -12 }, { kind: "post", x: -1.8, z: -24 },
  { kind: "post", x: 3.6, z: 23 }, { kind: "post", x: 14, z: -8 }, { kind: "post", x: 29, z: 8 }, { kind: "wall", x: 21.5, z: -9.85 },
  { kind: "wall", x: 30.4, z: -1, yaw: -Math.PI / 2 }, { kind: "post", x: -16, z: -15.6 }, { kind: "post", x: -16, z: 6.8 }, { kind: "wall", x: 24.4, z: -40, yaw: -Math.PI / 2 },
  { kind: "post", x: 10.6, z: -36 }, { kind: "hanging", x: -21.5, z: 13 },
];

function insideRect(p: Point, r: Rect, margin: number) {
  return Math.abs(p.x - r.x) < r.w / 2 + margin && Math.abs(p.z - r.z) < r.d / 2 + margin;
}
const distanceToSegment = (p: Point, a: Point, c: Point) => {
  const dx = c.x - a.x, dz = c.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
};

export function surfaceAt(p: Point): Surface {
  if (JETTY && insideRect(p, JETTY, 0)) return "wood";
  if (insideRect(p, MARKET, 0)) return "stone";
  for (const street of STREETS) {
    for (let i = 1; i < street.points.length; i++) if (distanceToSegment(p, street.points[i - 1], street.points[i]) < street.width / 2) return street.surface;
  }
  if (Math.hypot(p.x - COUNCIL.x, p.z - COUNCIL.z) < 8) return "dirt";
  if (p.x < GRAVEYARD.maxX && p.x > GRAVEYARD.minX && p.z < GRAVEYARD.maxZ && p.z > GRAVEYARD.minZ) return "grass";
  return "grass";
}

export function districtAt(p: Point): string {
  return DISTRICTS.find(d => insideRect(p, d, 0))?.name ?? (p.z > 7 ? "The village threshold" : "The village lanes");
}

export function canWalk(p: Point, obstacles: readonly Obstacle[] = []): boolean {
  if (obstacles.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.radius + .3)) return false;
  if (p.x < BOUNDS.minX || p.x > BOUNDS.maxX || p.z > BOUNDS.maxZ || p.z < BOUNDS.minZ) return false;
  if (BUILDINGS.some(h => insideRect(p, h, .35))) return false;
  // Chapel sits west of the path; its porch remains accessible.
  if (p.x > -10.4 && p.x < -3.6 && p.z > -29.4 && p.z < -20.6) return false;
  if (Math.hypot(p.x - 2.5, p.z + 3) < 1.05) return false;
  if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.radius && !insideRect(p, JETTY, 0)) return false;
  if (FENCES.some(f => insideRect(p, f, .3)) || WALLS.some(w => insideRect(p, w, .3)) || STALLS.some(s => insideRect(p, s, .3))) return false;
  if (PROPS.some(o => o.radius > 0 && Math.hypot(p.x - o.x, p.z - o.z) < o.radius + .25)) return false;
  if (GRAVES.some(g => Math.abs(p.x - g.x) < .55 && Math.abs(p.z - g.z) < .35)) return false;
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
