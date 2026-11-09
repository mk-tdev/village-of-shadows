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
/** Keep the original council route; the broken north gate opens into the forest. */
export const VILLAGE_BOUNDS = { minX: -36, maxX: 38, minZ: -56, maxZ: 26 };
export const BOUNDS = { minX: -70, maxX: 76, minZ: -136, maxZ: 26 };
export const FALLS = { x: 43, z: -91, radius: 7 };
export const TEMPLE = { x: -29, z: -87 };
export const RUINS = { x: 15, z: -73 };
/**
 * Abbey of the Last Bell: a walled compound north-west of the forest trail.
 * Every wall, pew and altar below is both drawn (abbey.ts) and collided
 * (canWalk), so what the player sees is exactly what blocks them.
 */
export const ABBEY = { minX: -68, maxX: -16, minZ: -134, maxZ: -100.5 };
export const ABBEY_GATE = { x: -53, z: -101 };
export const ABBEY_TRAIL = [{ x: -43, z: -70 }, { x: -51, z: -77 }, { x: -53, z: -86 }, { x: -53, z: -104 }];
export const NAVE = { x: -53, z: -122, w: 14, d: 18, h: 8.5 };
export const OSSUARY = { x: -63.8, z: -123, w: 7.6, d: 8, h: 3.6 };
export const HALL = { x: -33.4, z: -122.5, w: 25.2, d: 4, h: 4.2 };
export const TOWER = { start: -35, count: 24, run: .43, rise: .24, landing: 3.6, z: -122.5, width: 3.6 };
const stairEnd = TOWER.start + TOWER.count * TOWER.run;
export const BELFRY_TOP = TOWER.count * TOWER.rise;
export const BELL = { x: stairEnd + TOWER.landing / 2, z: TOWER.z, y: BELFRY_TOP + 4.15 };
export function stairHeight(x: number) {
  return Math.min(TOWER.count, Math.max(0, 1 + Math.floor((x - TOWER.start) / TOWER.run))) * TOWER.rise;
}
export function onBelfry(p: Point, height: number) {
  return p.x > stairEnd && p.x < stairEnd + TOWER.landing && Math.abs(p.z - TOWER.z) < TOWER.width / 2 && height >= BELFRY_TOP - .05;
}
type Wall = Rect & { h: number; kind: "outer" | "nave" | "ossuary" | "hall" | "stair" | "pier" | "parapet" | "pew" | "altar" };
const wallX = (z: number, x1: number, x2: number, h: number, kind: Wall["kind"], t = .8): Wall => ({ x: (x1 + x2) / 2, z, w: Math.abs(x2 - x1), d: t, h, kind });
const wallZ = (x: number, z1: number, z2: number, h: number, kind: Wall["kind"], t = .8): Wall => ({ x, z: (z1 + z2) / 2, w: t, d: Math.abs(z2 - z1), h, kind });
const naveMin = { x: NAVE.x - NAVE.w / 2, z: NAVE.z - NAVE.d / 2 }, naveMax = { x: NAVE.x + NAVE.w / 2, z: NAVE.z + NAVE.d / 2 };
export const ABBEY_WALLS: Wall[] = [
  // Compound wall; the gatehouse towers (RUIN_WALLS) close the gap either side of the gate.
  wallX(ABBEY.maxZ, ABBEY.minX, -58.5, 4.4, "outer"), wallX(ABBEY.maxZ, -47.5, ABBEY.maxX, 4.4, "outer"),
  wallX(ABBEY.minZ, ABBEY.minX, ABBEY.maxX, 4.4, "outer"),
  wallZ(ABBEY.minX, ABBEY.minZ, ABBEY.maxZ, 4.4, "outer"), wallZ(ABBEY.maxX, ABBEY.minZ, ABBEY.maxZ, 4.4, "outer"),
  // Chapel nave: south door to the courtyard, west door to the ossuary, east opening to the sisters' walk.
  wallX(naveMax.z, naveMin.x - .4, NAVE.x - 1.6, NAVE.h, "nave"), wallX(naveMax.z, NAVE.x + 1.6, naveMax.x + .4, NAVE.h, "nave"),
  wallX(naveMin.z, naveMin.x - .4, naveMax.x + .4, NAVE.h, "nave"),
  wallZ(naveMin.x, naveMin.z, -124.6, NAVE.h, "nave"), wallZ(naveMin.x, -121.4, naveMax.z, NAVE.h, "nave"),
  wallZ(naveMax.x, naveMin.z, TOWER.z - TOWER.width / 2 - .2, NAVE.h, "nave"), wallZ(naveMax.x, TOWER.z + TOWER.width / 2 + .2, naveMax.z, NAVE.h, "nave"),
  // Ossuary: a low bone chapel off the nave.
  wallX(OSSUARY.z - OSSUARY.d / 2, OSSUARY.x - OSSUARY.w / 2, naveMin.x, OSSUARY.h, "ossuary", .6),
  wallX(OSSUARY.z + OSSUARY.d / 2, OSSUARY.x - OSSUARY.w / 2, naveMin.x, OSSUARY.h, "ossuary", .6),
  wallZ(OSSUARY.x - OSSUARY.w / 2, OSSUARY.z - OSSUARY.d / 2, OSSUARY.z + OSSUARY.d / 2, OSSUARY.h, "ossuary", .6),
  // Sisters' walk: blind north wall, arcaded south side, then the enclosed belfry stair.
  wallX(TOWER.z - TOWER.width / 2 - .2, naveMax.x, TOWER.start, HALL.h, "hall", .4),
  wallX(TOWER.z - TOWER.width / 2 - .2, TOWER.start, stairEnd + TOWER.landing + .2, BELFRY_TOP + 5, "stair", .4),
  wallX(TOWER.z + TOWER.width / 2 + .2, TOWER.start, stairEnd + TOWER.landing + .2, BELFRY_TOP + 5, "stair", .4),
  wallZ(stairEnd + TOWER.landing + .2, TOWER.z - TOWER.width / 2 - .4, TOWER.z + TOWER.width / 2 + .4, BELFRY_TOP + 5, "stair", .4),
  ...[naveMax.x + 2.75, naveMax.x + 5.5, naveMax.x + 8.25, TOWER.start].map(x => ({ x, z: TOWER.z + TOWER.width / 2 + .2, w: .7, d: .7, h: HALL.h, kind: "pier" as const })),
  ...[0, 1, 2, 3].map(i => wallX(TOWER.z + TOWER.width / 2 + .2, naveMax.x + i * 2.75 + .35, naveMax.x + (i + 1) * 2.75 - .35, 1, "parapet", .4)),
  // Pews either side of the nave aisle, and the altar.
  ...[0, 1, 2, 3, 4, 5].flatMap(row => [-1, 1].map(side => ({ x: NAVE.x + side * 3.1, z: naveMax.z - 3.5 - row * 2, w: 3.2, d: .7, h: .95, kind: "pew" as const }))),
  { x: NAVE.x, z: naveMin.z + 1.6, w: 3, d: 1.2, h: 1.1, kind: "altar" },
  { x: OSSUARY.x - 2.4, z: OSSUARY.z, w: 1.1, d: 2.4, h: 1.05, kind: "altar" },
];
export const ABBEY_INTERIORS: Rect[] = [
  { ...NAVE, w: NAVE.w - .8, d: NAVE.d - .8 }, { ...OSSUARY, w: OSSUARY.w - .6, d: OSSUARY.d - .6 },
  { x: (naveMax.x + stairEnd + TOWER.landing) / 2, z: TOWER.z, w: stairEnd + TOWER.landing - naveMax.x, d: TOWER.width },
];
/** Where the Keeper may be standing while she stalks; yaw is the way she faces. */
export const ABBEY_ANCHORS: (Point & { yaw: number })[] = [
  { x: NAVE.x, z: naveMin.z + 2.9, yaw: 0 }, { x: naveMin.x + 1.2, z: naveMax.z - 1.2, yaw: 2.36 },
  { x: naveMax.x + 1.4, z: TOWER.z, yaw: -Math.PI / 2 }, { x: OSSUARY.x - 2.5, z: OSSUARY.z + 2.8, yaw: Math.PI / 2 },
  { x: -36.5, z: -105.5, yaw: -1.39 }, { x: -46.5, z: -103.2, yaw: -1.7 },
  { x: TOWER.start + .4, z: TOWER.z, yaw: -Math.PI / 2 }, { x: -63.5, z: -106.5, yaw: 1.6 },
];
/** Whether the player is looking at a point (yaw 0 faces -z), within range and unobstructed. */
export function facingPoint(player: Point, yaw: number, target: Point, range: number, cone = .8) {
  const dx = target.x - player.x, dz = target.z - player.z, d = Math.hypot(dx, dz);
  if (d < .01 || d > range) return false;
  return (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d > cone && lineOfSight(player, target);
}

/**
 * Choose where the Keeper reappears: inside the compound, 6–16 m away, and
 * preferably somewhere the player is not looking, so she is found by turning.
 */
export function pickAnchor(player: Point, yaw: number, current: number) {
  const scored = ABBEY_ANCHORS.map((a, i) => {
    const d = Math.hypot(a.x - player.x, a.z - player.z);
    const seen = facingPoint(player, yaw, a, 40, .35);
    const score = (i === current ? 100 : 0) + (d < 6 ? 50 : 0) + (d > 16 ? (d - 16) * 2 : 0) + (seen ? 20 : 0) + Math.abs(d - 9) * .3;
    return { i, score };
  }).sort((a, b) => a.score - b.score);
  return scored[0].i;
}

/** Sisters' cemetery before the gate: four ranks either side of the trail. */
export const ABBEY_GRAVES = [-5.4, -2.8, 2.8, 5.4].flatMap((dx, c) => [0, 1, 2, 3, 4, 5].map(r => ({ x: -53 + dx, z: -82 - r * 3 - (c % 2) * .6 })));
export const RINGING_GRAVE = ABBEY_GRAVES.find(g => g.x === -50.2 && g.z === -91)!;
export function insideAbbey(p: Point) {
  return p.x > ABBEY.minX && p.x < ABBEY.maxX && p.z < ABBEY.maxZ - 1.5 && p.z > ABBEY.minZ;
}
/** 0 outdoors, 1 under the abbey roofs. Drives interior darkness, reverb and choir. */
export function interiorAt(p: Point) {
  let best = 0;
  for (const r of ABBEY_INTERIORS) {
    const edge = Math.min(r.w / 2 - Math.abs(p.x - r.x), r.d / 2 - Math.abs(p.z - r.z));
    if (edge > -1.5) best = Math.max(best, Math.min(1, (edge + 1.5) / 2.5));
  }
  return best;
}
/** True when no tall abbey wall lies between two points. */
export function lineOfSight(a: Point, b: Point) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .35);
  for (let i = 1; i < steps; i++) {
    const p = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps };
    if (ABBEY_WALLS.some(w => w.h > 2 && insideRect(p, w, 0))) return false;
  }
  return true;
}
export const LANDMARKS: Landmark[] = [
  { id: "lantern", x: -2.6, z: 13, name: "The abandoned lantern", seal: "The watchman’s letter", text: "Mara's lantern is still warm. Beneath it, a note: ‘There were seven of us at sunset. I counted eight shadows. Follow the lamps north. Your chair is waiting beyond the chapel.’", hint: "Follow the lane to the old well." },
  { id: "well", x: 2.5, z: -3, name: "The old well", seal: "The well keeper’s key", text: "A rope disappears into the black water. Something below knocks three times. Carved into the stone: ‘The bell has no tongue. If you hear it, do not answer.’ A rusted iron key rests on the wet stone rim.", hint: "The council fire burns beyond the chapel. Keep heading north." },
  { id: "chapel", x: -1.8, z: -24, name: "The silent chapel", seal: "The bell-ringer’s medallion", text: "Seven names are scratched into the door. Yours is the last. A tarnished brass medallion hangs from a nail, beside a message: ‘The council is waiting. One of them already knows what you found.’", hint: "Find the empty wooden chair beside the council fire and take your seat." },
  { id: "temple", x: TEMPLE.x, z: TEMPLE.z + 3, name: "The moon temple", seal: "The broken moon seal", text: "Roots have split the sanctuary, but someone has replaced the candles. The stone reads: ‘We did not build this place to worship the moon. We built it to keep something beneath it.’ Between the broken pillars, your lantern casts one shadow too many.", hint: "Beyond the north gate, take the western trail to the ruined temple." },
  { id: "ruins", x: RUINS.x, z: RUINS.z + 2, name: "The abandoned settlement", seal: "The last household’s diary", text: "An unfinished meal. A child's empty chair. Every door was barred from the inside, yet no one remains. The diary ends with a single line: ‘Tonight the knocking came from underneath the floor.’", hint: "Follow the trail northeast of the council to the roofless houses." },
  { id: "falls", x: FALLS.x - 5, z: FALLS.z + 9, name: "The whispering falls", seal: "The river watcher’s charm", text: "The falling water almost sounds like voices. A silver charm hangs above the bank: ‘The water remembers every name. Never tell it yours.’ For a moment the mist takes the shape of someone you recognise.", hint: "Beyond the abandoned houses, follow the sound of water east." },
  { id: "grave", x: RINGING_GRAVE.x - 1.4, z: RINGING_GRAVE.z, name: "The ringing grave", seal: "The cut bell-cord", text: "The soil is fresh, and the little bell above it will not stop trembling. The sisters here were buried with a cord in hand, so that anyone who woke beneath the earth could ring for help. The cross reads SISTER ODILE, KEEPER OF THE BELL. The cord has been cut clean. Someone heard her once, and made sure no one would hear her again.", hint: "Take the western fork past the temple. The sisters’ graves line the way to the abbey gate." },
  { id: "register", x: NAVE.x, z: NAVE.z - 4.4, name: "The burial register", seal: "The abbey’s burial register", text: "Twelve sisters, each entered in the same careful hand: name, date, and the words ‘bell given’. The thirteenth line is Odile’s, written twice. Once in ink: ‘Buried at dusk.’ Once in candle soot, pressed hard enough to tear the page: ‘Still ringing.’ The tower bell has had no tongue since that night.", hint: "Inside the abbey chapel, a book lies open before the altar." },
  { id: "clapper", x: OSSUARY.x - .8, z: OSSUARY.z, name: "The bell’s iron tongue", seal: "The iron clapper", text: "On an altar of stacked bones, wrapped in a novice’s veil, lies the clapper torn from the abbey bell. A note is pinned through the cloth: ‘She rings so she can come home. Do not give back her voice.’ It is heavier than it looks, and cold. You take it anyway. The stair to the belfry is east, along the sisters’ walk.", hint: "Through the chapel’s west door, the bone chapel keeps what the sisters hid." },
];

/** Walkable ruin interiors: only individual walls, columns and the altar collide. */
export const RUIN_WALLS: (Rect & { h: number })[] = [
  ...[-4, 4].map(dx => ({ x: ABBEY_GATE.x + dx, z: ABBEY_GATE.z, w: 3, d: 3.6, h: 6.8 })),
  { x: -35, z: -87, w: .9, d: 14, h: 2.8 }, { x: -23, z: -87, w: .9, d: 14, h: 1.7 },
  { x: -29, z: -94, w: 12, d: .9, h: 3.4 }, { x: -29, z: -90, w: 2.7, d: 1.4, h: 1.2 },
  { x: -33, z: -84, w: 1.2, d: 4.5, h: .8 },
  ...[9, 21].flatMap(x => [
    { x: x - 3, z: -74, w: .5, d: 8, h: 2.8 }, { x: x + 3, z: -74, w: .5, d: 8, h: 1.8 },
    { x, z: -78, w: 6, d: .5, h: 3.2 }, { x: x - 2, z: -70, w: 2, d: .5, h: 1.2 },
  ]),
];
export const TEMPLE_COLUMNS = [-33, -25].flatMap(x => [-91, -86, -81].map((z, i) => ({ x, z, radius: .65, h: i === 1 ? 2.6 : 5.5 })));

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
  { name: "The belfry stair", x: (TOWER.start + stairEnd + TOWER.landing) / 2, z: TOWER.z, w: stairEnd + TOWER.landing - TOWER.start, d: TOWER.width },
  { name: "The sisters’ walk", x: (NAVE.x + NAVE.w / 2 + TOWER.start) / 2, z: TOWER.z, w: TOWER.start - NAVE.x - NAVE.w / 2, d: TOWER.width + 1 },
  { name: "The bone chapel", ...OSSUARY },
  { name: "The abbey chapel", ...NAVE },
  { name: "The abbey courtyard", x: (ABBEY.minX + ABBEY.maxX) / 2, z: -107, w: ABBEY.maxX - ABBEY.minX, d: 13 },
  { name: "Abbey of the Last Bell", x: (ABBEY.minX + ABBEY.maxX) / 2, z: (ABBEY.minZ + ABBEY.maxZ) / 2, w: ABBEY.maxX - ABBEY.minX, d: ABBEY.maxZ - ABBEY.minZ },
  { name: "The sisters’ graves", x: -53, z: -89.5, w: 16, d: 20 },
  { name: "The whispering falls", x: 43, z: -88, w: 26, d: 28 },
  { name: "The moon temple", x: -29, z: -87, w: 25, d: 28 },
  { name: "The abandoned settlement", x: 15, z: -73, w: 26, d: 20 },
  { name: "The blackwood trails", x: 0, z: -86, w: 146, d: 56 },
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
  { surface: "dirt", width: 3.4, points: ABBEY_TRAIL },
  { surface: "dirt", width: 3.8, points: [{ x: 0, z: -39 }, { x: 0, z: -60 }, { x: -15, z: -68 }, { x: -29, z: -78 }, { x: -29, z: -91 }] },
  { surface: "dirt", width: 3.5, points: [{ x: 0, z: -60 }, { x: 15, z: -65 }, { x: 30, z: -72 }, { x: 38, z: -82 }] },
  { surface: "dirt", width: 3, points: [{ x: -29, z: -78 }, { x: -43, z: -70 }, { x: -40, z: -60 }, { x: 0, z: -60 }] },
  { surface: "dirt", width: 3, points: [{ x: 15, z: -65 }, { x: 15, z: -74 }] },
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
  { kind: "post", x: 2.8, z: -51 }, { kind: "post", x: -2.8, z: -60 },
  { kind: "post", x: -17, z: -66 }, { kind: "post", x: -31, z: -77 },
  { kind: "post", x: 17, z: -63 }, { kind: "post", x: 32, z: -71 }, { kind: "post", x: 35, z: -81 },
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

/** Shared deterministic trees keep visible trunks and navigation in agreement. */
export const FOREST_TREES: (Obstacle & { height: number; dead: boolean })[] = [];
for (let i = 0; i < 1300; i++) {
  const x = BOUNDS.minX + 3 + seeded(i, 81) * (BOUNDS.maxX - BOUNDS.minX - 6);
  const z = BOUNDS.minZ + 3 + seeded(i, 82) * (BOUNDS.maxZ - BOUNDS.minZ - 6);
  const p = { x, z };
  if (x > ABBEY.minX - 4 && x < ABBEY.maxX + 4 && z < ABBEY.maxZ + 3) continue;
  if (x > -62 && x < -44 && z < -78 && z > -100) continue; // the sisters' cemetery
  if (x > VILLAGE_BOUNDS.minX - 4 && x < VILLAGE_BOUNDS.maxX + 4 && z > VILLAGE_BOUNDS.minZ - 3) continue;
  if (STREETS.some(s => s.points.some((b, j) => j > 0 && distanceToSegment(p, s.points[j - 1], b) < s.width / 2 + 3))) continue;
  if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 12 || Math.hypot(x - FALLS.x, z - FALLS.z) < 16 || Math.hypot(x - RUINS.x, z - RUINS.z) < 14) continue;
  if (FOREST_TREES.some(t => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
  FOREST_TREES.push({ x, z, radius: .5, height: 10 + seeded(i, 83) * 9, dead: seeded(i, 84) < .24 });
}

export function forestHint(p: Point, found: readonly string[] = []): string {
  if (insideAbbey(p) || (p.x < -44 && p.z < -78)) {
    if (!found.includes("register")) return "Go through the gate and into the chapel. Something is written in the book before the altar.";
    if (!found.includes("clapper")) return "The bell has no tongue. Search the bone chapel through the west door of the nave.";
    return "Carry the clapper east along the sisters’ walk and climb to the belfry. Ring the bell, and keep your lantern on whatever answers.";
  }
  if (p.z > -43) return "Follow the lamps north to the council. The forest trails beyond are optional.";
  if (p.z > -63) return "Beyond the broken gate: temple to the west, abandoned houses and waterfall to the east. Council fire is south.";
  return "The western trail forks toward the Abbey of the Last Bell. Follow the lamps south to return to the council.";
}

export function surfaceAt(p: Point): Surface {
  if (insideRect(p, { ...TEMPLE, w: 12, d: 14 }, 0)) return "stone";
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

const PROP_TOP: Partial<Record<PropKind, number>> = { bucket: .45, crate: .9, crate2: .85, barrel: 1.15, bench: .9, stool: .65, stump: .8, stump2: .8, rocks: 1.2, cart: 1.5, woodpile: 1.3, table: 1.1, axe: .8, basket: .5 };

/** Tops of low, vaultable objects. Buildings, water and the palisade stay solid. */
export function supportHeightAt(p: Point): number {
  if (p.x >= TOWER.start && p.x <= stairEnd + TOWER.landing && Math.abs(p.z - TOWER.z) <= TOWER.width / 2) return stairHeight(p.x);
  let height = 0;
  for (const w of ABBEY_WALLS) if (w.h <= 1.5 && insideRect(p, w, .3)) height = Math.max(height, w.h);
  if (FENCES.some(f => insideRect(p, f, .3))) height = 1.2;
  if (WALLS.some(w => insideRect(p, w, .3))) height = Math.max(height, 1.25);
  for (const w of RUIN_WALLS) if (w.h <= 1.5 && insideRect(p, w, .3)) height = Math.max(height, w.h);
  for (const o of PROPS) if (o.radius > 0 && PROP_TOP[o.kind] && Math.hypot(p.x - o.x, p.z - o.z) < o.radius + .25) height = Math.max(height, PROP_TOP[o.kind]!);
  if (GRAVES.some(g => Math.abs(p.x - g.x) < .55 && Math.abs(p.z - g.z) < .35)) height = Math.max(height, 1.35);
  return height;
}

export function canWalk(p: Point, obstacles: readonly Obstacle[] = [], footHeight = 0): boolean {
  if (p.z < -78 && p.x < -14) {
    if (ABBEY_WALLS.some(w => insideRect(p, w, .3) && (w.h > 1.5 || footHeight < w.h))) return false;
    if (footHeight < 1.15 && ABBEY_GRAVES.some(g => Math.abs(g.x - p.x) < .7 && Math.abs(g.z - p.z) < .55)) return false;
  }
  if (obstacles.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.radius + .3)) return false;
  if (p.x < BOUNDS.minX || p.x > BOUNDS.maxX || p.z > BOUNDS.maxZ || p.z < BOUNDS.minZ) return false;
  if (RUIN_WALLS.some(w => insideRect(p, w, .3) && (w.h > 1.5 || footHeight < w.h))) return false;
  if (TEMPLE_COLUMNS.some(t => Math.hypot(p.x - t.x, p.z - t.z) < t.radius + .3)) return false;
  if ((p.z < -57 || p.x < -36 || p.x > 38) && FOREST_TREES.some(t => Math.hypot(p.x - t.x, p.z - t.z) < t.radius + .3)) return false;
  if (Math.hypot(p.x - FALLS.x, p.z - FALLS.z) < FALLS.radius + .3) return false;
  // Cliff face behind the waterfall; the banks and temple remain approachable.
  if (insideRect(p, { x: FALLS.x, z: FALLS.z - 8, w: 26, d: 6 }, .3)) return false;
  // Original palisade, with a five-metre opening at the north trail.
  const v = VILLAGE_BOUNDS;
  if ((Math.abs(p.x - (v.minX - 1.2)) < .5 || Math.abs(p.x - (v.maxX + 1.2)) < .5) && p.z > v.minZ - 1.2) return false;
  if (Math.abs(p.z - (v.minZ - 1.2)) < .5 && Math.abs(p.x) > 2.5 && p.x > v.minX - 1.2 && p.x < v.maxX + 1.2) return false;
  if (BUILDINGS.some(h => insideRect(p, h, .35))) return false;
  // Chapel sits west of the path; its porch remains accessible.
  if (p.x > -10.4 && p.x < -3.6 && p.z > -29.4 && p.z < -20.6) return false;
  if (Math.hypot(p.x - 2.5, p.z + 3) < 1.05) return false;
  if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.radius && !insideRect(p, JETTY, 0)) return false;
  if ((footHeight < 1.2 && FENCES.some(f => insideRect(p, f, .3))) || (footHeight < 1.25 && WALLS.some(w => insideRect(p, w, .3))) || STALLS.some(s => insideRect(p, s, .3))) return false;
  if (PROPS.some(o => o.radius > 0 && footHeight < (PROP_TOP[o.kind] ?? Infinity) && Math.hypot(p.x - o.x, p.z - o.z) < o.radius + .25)) return false;
  if (footHeight < 1.35 && GRAVES.some(g => Math.abs(p.x - g.x) < .55 && Math.abs(p.z - g.z) < .35)) return false;
  return true;
}

/** Axis sliding avoids sticking to corners; substeps prevent wall tunnelling. */
export function movePlayer(from: Point, dx: number, dz: number, obstacles: readonly Obstacle[] = [], footHeight = 0): Point {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .18));
  const p = { ...from };
  for (let i = 0; i < steps; i++) {
    if (canWalk({ x: p.x + dx / steps, z: p.z }, obstacles, footHeight)) p.x += dx / steps;
    if (canWalk({ x: p.x, z: p.z + dz / steps }, obstacles, footHeight)) p.z += dz / steps;
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
