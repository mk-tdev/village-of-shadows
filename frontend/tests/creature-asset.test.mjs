import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const file = await readFile(new URL('../public/exploration/werewolf.glb', import.meta.url));
const jsonLength = file.readUInt32LE(12);
const model = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
const binary = file.subarray(28 + jsonLength);
function values(index) {
  const a = model.accessors[index], v = model.bufferViews[a.bufferView];
  const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const readers = { 5126: ['readFloatLE', 4], 5123: ['readUInt16LE', 2], 5121: ['readUInt8', 1] };
  const [method, size] = readers[a.componentType];
  const width = widths[a.type], stride = v.byteStride ?? size * width;
  const out = [];
  for (let i = 0; i < a.count; i++) for (let j = 0; j < width; j++) out.push(binary[method]((v.byteOffset ?? 0) + (a.byteOffset ?? 0) + stride * i + size * j));
  return out;
}

test('the exported creature is a complete GLB within its 14 MB runtime budget', () => {
  assert.equal(file.readUInt32LE(0), 0x46546c67);
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  assert.ok(file.length < 14 * 1024 * 1024);
  assert.ok(!model.images?.length, 'the creature must not depend on unresolved external textures');
  for (const name of ['Head', 'Jaw', 'FootL', 'FootR', 'HandL', 'HandR']) assert.ok(model.nodes.some(n => n.name === name), `missing animation joint ${name}`);
});

test('every body/fur vertex has finite coordinates and valid normalized joint weights', () => {
  const skinnedNodes = model.nodes.filter(n => n.skin !== undefined);
  assert.equal(skinnedNodes.length, 2);
  for (const node of skinnedNodes) {
    const jointCount = model.skins[node.skin].joints.length;
    for (const primitive of model.meshes[node.mesh].primitives) {
      const positions = values(primitive.attributes.POSITION);
      assert.ok(positions.every(Number.isFinite));
      const joints = values(primitive.attributes.JOINTS_0);
      assert.ok(joints.every(j => j >= 0 && j < jointCount));
      const weights = values(primitive.attributes.WEIGHTS_0);
      assert.equal(weights.length / 4, positions.length / 3);
      for (let i = 0; i < weights.length; i += 4) {
        const w = weights.slice(i, i + 4);
        assert.ok(w.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
        assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < .0001);
      }
    }
  }
});
