import assert from "node:assert/strict";
import test from "node:test";
import { SPAWN, COUNCIL, COUNCIL_SEAT, COTTAGES, LANDMARKS, canWalk, movePlayer, nearbyLandmark, atCouncil, restoreSeals } from "../lib/exploration/world.ts";
import { advanceEncounter, canStartEncounter, newEncounter } from "../lib/exploration/encounter.ts";
import { advanceJump, groundedJump, cameraDistance, followCameraHeight, RUN_SPEED, WALK_SPEED } from "../lib/exploration/locomotion.ts";
import { supportHeightAt } from "../lib/exploration/world.ts";

const encounterInput = { playing: true, trigger: false, warding: false, distance: 5, escaped: false };
const tick = (state, seconds, overrides = {}) => {
  for (let i = 0; i < Math.ceil(seconds / .05); i++) state = advanceEncounter(state, .05, { ...encounterInput, ...overrides });
  return state;
};

test('jump has a bounded arc, prevents double jumps, freezes on pause and lands', () => {
  let state = advanceJump(groundedJump(), .02, 0, true);
  assert.ok(state.height > 0 && !state.grounded);
  assert.deepEqual(advanceJump(state, .05, 0, true, false), state);
  assert.deepEqual(advanceJump(state, .02, 0, true), advanceJump(state, .02, 0, false));
  let peak = 0;
  for (let i = 0; i < 50; i++) { state = advanceJump(state, .02, 0, false); peak = Math.max(peak, state.height); }
  assert.ok(peak > 1.8 && peak < 1.9);
  assert.deepEqual(state, groundedJump());
  state = { height: 1.2, velocity: -1, grounded: false };
  assert.deepEqual(advanceJump(state, .02, 1.2, false), {height:1.2,velocity:0,grounded:true});
  assert.equal(advanceJump({height:1.2,velocity:0,grounded:true}, .02, 0, false).grounded, false);
  assert.ok(RUN_SPEED > WALK_SPEED * 2);
});

test('a running jump crosses a low fence but never tunnels through buildings or water', () => {
  const fence = {x:-4.25,z:17.25};
  assert.equal(supportHeightAt(fence), 1.2);
  assert.equal(canWalk(fence), false);
  assert.equal(canWalk(fence, [], 1.8), true);
  let point = {x:-2.7,z:17.25}, state = groundedJump();
  for (let i=0;i<55;i++) {
    point = movePlayer(point, -RUN_SPEED*.02, 0, [], state.height);
    state = advanceJump(state, .02, supportHeightAt(point), i===0);
  }
  assert.ok(point.x < -6, JSON.stringify(point));
  for (const house of COTTAGES) assert.equal(canWalk(house, [], 1.85), false);
  assert.equal(canWalk({x:46,z:-87}, [], 1.85), false);
});

test('follow camera pulls forward before obstacles and supports a close first-person fallback', () => {
  assert.equal(cameraDistance(() => true), 4.2);
  assert.ok(cameraDistance(d => d < 2) < 2);
  assert.equal(cameraDistance(() => false), .05);
  for (const pitch of [-.9,0,.85]) assert.ok(followCameraHeight(pitch, 4.2) >= .55);
});

test("the transformation starts only when a player is near and looking at the watchman", () => {
  assert.equal(canStartEncounter({ x: 0, z: 3 }, 0), true);
  assert.equal(canStartEncounter({ x: 0, z: 3 }, Math.PI), false);
  assert.equal(canStartEncounter({ x: 0, z: -6 }, 0), false);
  assert.equal(canStartEncounter(SPAWN, 0), false);
});

test("the scene runs transformation, pounce, feeding, and hunt in order", () => {
  let state = advanceEncounter(newEncounter(), .05, { ...encounterInput, trigger: true });
  const seen = [state.phase];
  for (let i = 0; i < 300; i++) {
    state = advanceEncounter(state, .05, encounterInput);
    if (seen.at(-1) !== state.phase) seen.push(state.phase);
  }
  assert.deepEqual(seen, ["stirring", "transforming", "pouncing", "feeding", "hunting"]);
});

test("pause freezes the creature, ward progress, and capture even at contact", () => {
  const hunting = { phase: "hunting", time: 4, lightTime: 1.3 };
  assert.deepEqual(tick(hunting, 30, { playing: false, distance: 0 }), hunting);
  const changing = { phase: "transforming", time: 2, lightTime: 0 };
  assert.deepEqual(tick(changing, 30, { playing: false }), changing);
});

test("holding the light drives it away; losing focus drains protection; darkness at contact catches", () => {
  const hunting = { phase: "hunting", time: 0, lightTime: 0 };
  assert.equal(tick(hunting, 2.7, { warding: true, distance: 1 }).phase, "fleeing");
  assert.equal(tick(hunting, .05, { distance: 1 }).phase, "caught");
  const charging = tick(hunting, 1, { warding: true });
  assert.ok(tick(charging, .5).lightTime < charging.lightTime);
  assert.equal(tick(hunting, .05, { escaped: true }).phase, "fleeing");
  assert.equal(tick(hunting, 20).phase, "aftermath");
  assert.deepEqual(tick({ phase: "caught", time: 0, lightTime: 0 }, 20), { phase: "caught", time: 0, lightTime: 0 });
});

test("the original main lane still connects spawn, its three keepsakes, and the council", () => {
  let point = { ...SPAWN };
  const found = [];
  for (let i = 0; i < 580; i++) {
    assert.ok(canWalk(point));
    const nearby = nearbyLandmark(point, found);
    if (nearby) found.push(nearby.id);
    point = movePlayer(point, 0, -.1);
    if (atCouncil(point)) break;
  }
  assert.deepEqual(found, ["lantern", "well", "chapel"]);
  assert.ok(atCouncil(point));
});

test("large movement cannot tunnel through cottages, the well, or world bounds", () => {
  for (const h of COTTAGES) {
    assert.equal(canWalk({ x: h.x, z: h.z }), false);
    const start = { x: 0, z: h.z };
    const destination = movePlayer(start, h.x * 2, 0);
    assert.ok(canWalk(destination));
    assert.ok(Math.abs(destination.x) < Math.abs(h.x) - h.w / 2);
  }
  assert.equal(canWalk({ x: 2.5, z: -3 }), false);
});

test("diagonal movement slides along walls instead of sticking", () => {
  const point = movePlayer({ x: -3.5, z: 12 }, -3, -2);
  assert.ok(canWalk(point));
  assert.ok(point.z < 10.1);
  assert.ok(point.x > -3.7);
});

test("characters have clearance without sealing off the lane", () => {
  const actors = [{ x: -.9, z: -7.5, radius: .65 }, { x: 1.2, z: -9.5, radius: .5 }];
  const stop = movePlayer({ x: -.9, z: -5 }, 0, -5, actors);
  assert.ok(stop.z > -6.6);
  assert.ok(canWalk(stop, actors));
  const route = movePlayer({ x: -2.5, z: -5 }, 0, -7, actors);
  assert.ok(route.z < -11.9);
});

test("keepsakes require proximity and cannot be collected twice; the empty chair is the goal", () => {
  assert.equal(nearbyLandmark(SPAWN, []), undefined);
  assert.equal(nearbyLandmark({ x: 0, z: 13 }, [])?.id, "lantern");
  assert.equal(nearbyLandmark({ x: 0, z: 13 }, ["lantern"]), undefined);
  assert.equal(atCouncil(COUNCIL), false);
  assert.equal(atCouncil(SPAWN), false);
  assert.equal(atCouncil(COUNCIL_SEAT), true);
  assert.equal(atCouncil({x: 0, z: -26.8}), true);
});

test("saved journal rejects malformed data, unknown IDs, and duplicates", () => {
  for (const raw of [null, "not json", "{}", "true", "1"]) assert.deepEqual(restoreSeals(raw), []);
  assert.deepEqual(restoreSeals('["chapel","unknown","lantern","lantern",123]'), ["lantern", "chapel"]);
});


test("the council seat can be reached without picking up any keepsakes", () => {
  let point = {...SPAWN};
  for(let i=0;i<550 && !atCouncil(point);i++) point=movePlayer(point,0,-.1);
  assert.ok(atCouncil(point));
  assert.ok(canWalk(COUNCIL_SEAT));
});


const { wolfAnimation, wolfClipTime } = await import('../lib/exploration/wolf-animation.ts');
test('Blender clips follow phase timing, pause deterministically, and freeze reduced motion', () => {
  const sample = wolfAnimation({ phase: 'pouncing', time: .55 }, false);
  assert.equal(sample.name, 'Attack_Lunge');
  assert.equal(wolfClipTime(sample, 2), 1);
  assert.equal(wolfClipTime(sample, 2), 1);
  assert.equal(wolfAnimation({ phase: 'hunting', time: 1 }, false).name, 'Threat_Roar');
  assert.equal(wolfAnimation({ phase: 'hunting', time: 3 }, false).name, 'Hunt_Stride');
  for (const phase of ['transforming', 'pouncing', 'feeding', 'hunting', 'fleeing']) {
    assert.equal(wolfClipTime(wolfAnimation({ phase, time: .1 }, true), 2), wolfClipTime(wolfAnimation({ phase, time: .8 }, true), 2));
  }
});

const { BOUNDS, DISTRICTS, LAMPS, PROPS, BUILDINGS, surfaceAt, districtAt } = await import('../lib/exploration/world.ts');
function reachable() {
  const seen = new Set(), key = (x, z) => `${x},${z}`, queue = [[Math.round(SPAWN.x * 2), Math.round(SPAWN.z * 2)]];
  seen.add(key(...queue[0]));
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (!seen.has(k) && canWalk({ x: nx / 2, z: nz / 2 })) { seen.add(k); queue.push([nx, nz]); }
    }
  }
  return (p) => { for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (seen.has(key(Math.round(p.x * 2) + dx, Math.round(p.z * 2) + dz))) return true; return false; };
}
test('every district, landmark and lamp-lit street is reachable on foot from the gate', () => {
  const ok = reachable();
  for (const d of DISTRICTS) {
    // District centres can be water or a solid altar; verify an actual point inside.
    const approach = d.name === 'The whispering falls' ? { x: 38, z: -82 } : d;
    assert.ok(ok(approach), `${d.name} unreachable`);
  }
  for (const l of LANDMARKS) assert.ok(ok(l), `${l.id} unreachable`);
  assert.ok(ok(COUNCIL_SEAT));
  for (const lamp of LAMPS.filter(l => l.kind === 'post')) assert.ok(ok(lamp), `lamp ${lamp.x},${lamp.z} unreachable`);
});
test('the palisade bounds the village and props never sit inside buildings', () => {
  assert.ok(movePlayer(SPAWN, 0, 100).z <= BOUNDS.maxZ);
  assert.ok(movePlayer({ x: 0, z: -30 }, 0, -100).z >= BOUNDS.minZ);
  for (const p of PROPS) assert.ok(!BUILDINGS.some(h => Math.abs(p.x - h.x) < h.w / 2 && Math.abs(p.z - h.z) < h.d / 2), `${p.kind} inside a building`);
  assert.equal(surfaceAt(SPAWN), 'stone');
  assert.equal(surfaceAt({ x: -16.5, z: -10 }), 'dirt');
  assert.equal(districtAt({ x: 22, z: 0 }), 'The market square');
});

const { FALLS, TEMPLE, RUIN_WALLS, TEMPLE_COLUMNS, FOREST_TREES, forestHint, VILLAGE_BOUNDS } = await import('../lib/exploration/world.ts');
test('the forest is substantially larger, with a clear north gate and a return path', () => {
  const area = (b) => (b.maxX - b.minX) * (b.maxZ - b.minZ);
  assert.ok(area(BOUNDS) > area(VILLAGE_BOUNDS) * 3);
  let p = { x: 0, z: -40 };
  p = movePlayer(p, 0, -20);
  assert.ok(p.z < -59.9);
  p = movePlayer(p, 0, 31.8);
  assert.ok(atCouncil(p));
  assert.equal(districtAt(COUNCIL), 'The council clearing');
  assert.match(forestHint({x: 0, z: -60}), /west.*east/);
  assert.match(forestHint({x: -29, z: -85}), /south/);
});

test('water, cliffs, ruin walls, columns and visible forest trunks block walking', () => {
  assert.equal(canWalk(FALLS), false);
  assert.equal(canWalk({x: FALLS.x, z: FALLS.z - 8}), false);
  for (const w of RUIN_WALLS) assert.equal(canWalk(w), false);
  for (const c of TEMPLE_COLUMNS) assert.equal(canWalk(c), false);
  for (const tree of FOREST_TREES) assert.equal(canWalk(tree), false);
  assert.ok(FOREST_TREES.length > 100);
  assert.ok(canWalk({x: TEMPLE.x, z: TEMPLE.z + 3}));
  assert.equal(surfaceAt({x: TEMPLE.x, z: TEMPLE.z + 3}), 'stone');
});

test('new optional discoveries restore alongside old saves and can each be collected once', () => {
  const ids = LANDMARKS.map(l => l.id);
  assert.equal(ids.length, 6);
  assert.deepEqual(restoreSeals(JSON.stringify([...ids, ...ids, 'unknown'])), ids);
  for (const l of LANDMARKS.slice(3)) {
    assert.ok(canWalk(l));
    assert.equal(nearbyLandmark(l, [])?.id, l.id);
    assert.equal(nearbyLandmark(l, [l.id]), undefined);
  }
});
