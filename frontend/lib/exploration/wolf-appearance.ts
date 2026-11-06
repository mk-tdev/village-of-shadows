import * as THREE from "three";

/** Refine the existing rig in bind space; retain its skin weights and authored clips. */
export function refineWolf(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  const p = new THREE.Vector3(), inverse = new THREE.Matrix4();
  const originals = new Set<THREE.BufferGeometry>();
  const charcoal = new THREE.Color("#383e42"), silver = new THREE.Color("#777b79"), undercoat = new THREE.Color("#4b4b46");
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    // Some rigid details share geometry (eyes and nose). Clone before reshaping.
    originals.add(child.geometry); child.geometry = child.geometry.clone();
    const positions = child.geometry.getAttribute("position");
    inverse.copy(child.matrixWorld).invert();
    const coat = child.name === "ContinuousAnatomy" || child.name === "GroomedFur";
    const colors = coat ? new Float32Array(positions.count * 3) : null;
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(child.matrixWorld);
      const { x, y, z } = p;
      // Longer, tapered canine muzzle, not a broad bear-like face.
      const face = THREE.MathUtils.smoothstep(y, 2.14, 2.3);
      const muzzle = THREE.MathUtils.smoothstep(z, .31, .75) * face;
      p.z += muzzle * .28;
      p.x *= 1 - muzzle * .16;
      // Narrow the rounded crown into a canine skull without moving the eyes.
      p.x *= 1 - THREE.MathUtils.smoothstep(y, 2.47, 2.62) * .14;
      // Lean waist beneath the heavy shoulder ruff, preserving arm/leg attachments.
      const waist = Math.exp(-(((y - 1.38) / .3) ** 2)) * (1 - THREE.MathUtils.smoothstep(Math.abs(x), .3, .5));
      p.x *= 1 - waist * .15;
      p.z = -.1 + (p.z + .1) * (1 - waist * .1);
      if (colors) {
        const grain = Math.sin(x * 137 + y * 251 + z * 193) * .5 + .5;
        const back = THREE.MathUtils.smoothstep(-z, -.1, .4);
        const c = undercoat.clone().lerp(charcoal, back * .8).lerp(silver, grain * .38);
        if (child.name === "ContinuousAnatomy") c.multiplyScalar(.78);
        c.toArray(colors, i * 3);
      }
      p.applyMatrix4(inverse); positions.setXYZ(i, p.x, p.y, p.z);
    }
    positions.needsUpdate = true;
    child.geometry.computeVertexNormals(); child.geometry.computeBoundingSphere();
    if (colors) {
      child.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      for (const material of [child.material].flat()) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.color.set("#ffffff"); material.vertexColors = true;
        material.roughness = child.name === "GroomedFur" ? .94 : .83;
        material.metalness = 0;
      }
    }
    // Wet nose and restrained amber eye glints instead of luminous cartoon eyes.
    for (const material of [child.material].flat()) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.name === "Material_3") material.roughness = .24;
      if (material.name === "Material_4" || material.name === "Material_6") {
        material.color.set("#b99555"); material.emissive.set("#573810"); material.emissiveIntensity = .18;
      }
    }
  });
  originals.forEach(g => g.dispose());
  const body = model.getObjectByName("ContinuousAnatomy");
  if (body instanceof THREE.SkinnedMesh) addFaceCoat(body);
}

/** Short guard hairs across the brow and cheeks replace the bare, rubbery mask. */
function addFaceCoat(body: THREE.SkinnedMesh) {
  const source = body.geometry, vertices = source.getAttribute("position"), normals = source.getAttribute("normal");
  const joints = source.getAttribute("skinIndex"), weights = source.getAttribute("skinWeight");
  if (!joints || !weights || !body.parent) return;
  const points: number[] = [], skinIndices: number[] = [], skinWeights: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), tangent = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const random = (i: number) => { const f = Math.sin(i * 127.1) * 43758.5453; return f - Math.floor(f); };
  for (let k = 0; k < vertices.count; k += 2) {
    v.fromBufferAttribute(vertices, k); n.fromBufferAttribute(normals, k);
    if (v.y < 2.2 || v.y > 2.65 || v.z > .9 || v.z < -.06) continue;
    if (Math.hypot(Math.abs(v.x) - .17, v.y - 2.417, (v.z - .5) * .7) < .08) continue;
    tangent.crossVectors(n, up).normalize().multiplyScalar(.0018);
    const start = v.clone().addScaledVector(n, .002), length = .012 + random(k) * .026;
    const end = start.clone().addScaledVector(n, length * .45).add(new THREE.Vector3(Math.sign(v.x) * length * .35, -length * .7, -length * .4));
    for (const p of [start.clone().sub(tangent), start.clone().add(tangent), end]) {
      points.push(p.x, p.y, p.z);
      skinIndices.push(joints.getX(k), joints.getY(k), joints.getZ(k), joints.getW(k));
      skinWeights.push(weights.getX(k), weights.getY(k), weights.getZ(k), weights.getW(k));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.computeVertexNormals();
  const fur = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: "#636963", roughness: .95, side: THREE.DoubleSide }));
  fur.name = "CanineFaceCoat";
  fur.position.copy(body.position); fur.quaternion.copy(body.quaternion); fur.scale.copy(body.scale);
  fur.bind(body.skeleton, body.bindMatrix); fur.castShadow = fur.receiveShadow = true;
  body.parent.add(fur);
}
