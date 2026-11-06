import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { refineWolf, repairWolfArmWeights } from '../lib/exploration/wolf-appearance.ts';

const file = await readFile(new URL('../public/exploration/werewolf-blender.glb', import.meta.url));
const jsonLength = file.readUInt32LE(12);
const model = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
const binary = file.subarray(28 + jsonLength);
function values(index) {
  const a = model.accessors[index], v = model.bufferViews[a.bufferView];
  const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const readers = { 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4], 5123: ['readUInt16LE', 2], 5121: ['readUInt8', 1] };
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
  assert.equal(model.images.length, 1);
  assert.ok(model.images.every(image => image.bufferView !== undefined && !image.uri));
  assert.ok(model.nodes.every(node => !node.name?.startsWith('REVIEW')));
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


test('all encounter clips contain finite, ordered animation data for valid nodes', () => {
  assert.deepEqual(model.animations.map(a => a.name).sort(), ['Attack_Lunge', 'Feeding', 'Hunt_Stride', 'Threat_Idle', 'Threat_Roar', 'Transformation_Convulsion']);
  for (const clip of model.animations) {
    for (const channel of clip.channels) assert.ok(model.nodes[channel.target.node]);
    for (const sampler of clip.samplers) {
      const times = values(sampler.input);
      assert.ok(times.length > 1 && times.at(-1) > 0);
      assert.ok(times.every((t, i) => Number.isFinite(t) && (i === 0 || t > times[i - 1])));
      assert.ok(values(sampler.output).every(Number.isFinite));
    }
  }
  const triangles = model.meshes.flatMap(m => m.primitives).reduce((n, p) => n + model.accessors[p.indices].count / 3, 0);
  assert.ok(triangles < 140000);
});

test('actual creature wrists and fur follow arm joints, not legs, without altering inner leg weights', () => {
  for (const node of model.nodes.filter(n => n.skin !== undefined)) {
    const bones = model.skins[node.skin].joints.map(id => { const bone = new THREE.Bone(); bone.name = model.nodes[id].name; return bone; });
    for (const primitive of model.meshes[node.mesh].primitives) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(values(primitive.attributes.POSITION), 3));
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(values(primitive.attributes.JOINTS_0), 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(values(primitive.attributes.WEIGHTS_0), 4));
      const mesh = new THREE.SkinnedMesh(geometry); mesh.bind(new THREE.Skeleton(bones));
      const original = geometry.attributes.skinWeight.array.slice();
      repairWolfArmWeights(mesh);
      const {position, skinIndex, skinWeight} = geometry.attributes;
      let wrists = 0;
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(position.getX(i)) > .6 && position.getY(i) < 1.05) {
          wrists++;
          for (let j = 0; j < 4; j++) if (skinWeight.array[i * 4 + j] > 0) assert.match(bones[skinIndex.array[i * 4 + j]].name, /^(Forearm|Hand)[LR]$/);
          assert.ok(Math.abs(skinWeight.getX(i) + skinWeight.getY(i) - 1) < .00001);
        }
        if (Math.abs(position.getX(i)) <= .46) assert.deepEqual(skinWeight.array.slice(i*4,i*4+4), original.slice(i*4,i*4+4));
      }
      assert.ok(wrists > 100);
      geometry.dispose(); mesh.material.dispose(); mesh.skeleton.dispose();
    }
  }
});

test('canine refinement preserves skin weights and adds finite, rigged facial fur', () => {
  const root = new THREE.Group(), bone = new THREE.Bone(); root.add(bone);
  const geometry = new THREE.SphereGeometry(.23, 16, 12).translate(0, 2.4, .4);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const body = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  body.name = 'ContinuousAnatomy'; root.add(body); body.bind(new THREE.Skeleton([bone]));
  const before = geometry.attributes.position.array.slice();
  refineWolf(root);
  assert.notEqual(body.geometry, geometry);
  assert.deepEqual(geometry.attributes.position.array, before);
  assert.deepEqual(body.geometry.attributes.skinWeight.array, weights);
  assert.ok(body.geometry.attributes.position.array.every(Number.isFinite));
  assert.ok(body.geometry.attributes.normal.array.every(Number.isFinite));
  assert.ok(body.geometry.attributes.color.array.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  body.geometry.computeBoundingBox(); geometry.computeBoundingBox();
  assert.ok(body.geometry.boundingBox.max.z > geometry.boundingBox.max.z);
  const fur = root.getObjectByName('CanineFaceCoat');
  assert.ok(fur instanceof THREE.SkinnedMesh);
  assert.equal(fur.skeleton, body.skeleton);
  assert.ok(fur.geometry.attributes.position.count > 0);
  assert.ok(fur.geometry.attributes.position.array.every(Number.isFinite));
  assert.ok(fur.geometry.attributes.normal.array.every(Number.isFinite));
  assert.equal(fur.geometry.attributes.skinWeight.count, fur.geometry.attributes.position.count);
  body.geometry.dispose(); fur.geometry.dispose(); body.material.dispose(); fur.material.dispose(); body.skeleton.dispose();
});
