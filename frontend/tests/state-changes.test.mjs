import test from 'node:test';
import assert from 'node:assert/strict';
import { stateChanges } from '../lib/state-changes.ts';
test('checkpoint diff identifies nested evidence without reporting unchanged state', () => {
  const before = { game: { round: 1, missing_villager: { discovered: [], revision: 0 } } };
  const after = { game: { round: 1, missing_villager: { discovered: ['cloth'], revision: 1 } } };
  assert.deepEqual(stateChanges(before, after).map(c => c.path), ['game.missing_villager.discovered', 'game.missing_villager.revision']);
  assert.deepEqual(stateChanges(before, before), []);
});
test('checkpoint diff retains additions, removals and message order', () => {
  const diff = stateChanges({ deleted: true, messages: ['old'] }, { added: null, messages: ['old', 'new'] });
  assert.equal(diff.find(c => c.path === 'deleted').after, undefined);
  assert.equal(diff.find(c => c.path === 'added').after, null);
  assert.deepEqual(diff.find(c => c.path === 'messages').after, ['old', 'new']);
});
