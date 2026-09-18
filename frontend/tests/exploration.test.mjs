import assert from "node:assert/strict";
import test from "node:test";
import { SPAWN, COUNCIL, COUNCIL_SEAT, COTTAGES, LANDMARKS, canWalk, movePlayer, nearbyLandmark, atCouncil, restoreSeals } from "../lib/exploration/world.ts";
import { advanceEncounter, canStartEncounter, newEncounter } from "../lib/exploration/encounter.ts";

const encounterInput = { playing: true, trigger: false, warding: false, distance: 5, escaped: false };
const tick = (state, seconds, overrides = {}) => {
  for (let i = 0; i < Math.ceil(seconds / .05); i++) state = advanceEncounter(state, .05, { ...encounterInput, ...overrides });
  return state;
};

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

test("the entire main lane connects spawn, every seal, and the council", () => {
  let point = { ...SPAWN };
  const found = [];
  for (let i = 0; i < 580; i++) {
    assert.ok(canWalk(point));
    const nearby = nearbyLandmark(point, found);
    if (nearby) found.push(nearby.id);
    point = movePlayer(point, 0, -.1);
    if (atCouncil(point)) break;
  }
  assert.deepEqual(found, LANDMARKS.map(l => l.id));
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
  assert.ok(movePlayer(SPAWN, 0, 100).z <= 23);
  assert.ok(movePlayer({ x: 0, z: -30 }, 0, -100).z >= -38);
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
