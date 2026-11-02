import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

/** CC0 Poly Haven surfaces (see public/exploration/README.md). Each has diff/nor/arm maps. */
export type SurfaceName =
  | "cobblestone_floor_08" | "cobblestone_square" | "muddy_tracks" | "forest_ground_04"
  | "plastered_wall_04" | "worn_mossy_plasterwall" | "weathered_planks" | "dark_wooden_planks"
  | "weathered_plank_siding" | "thatch_roof_angled" | "roof_slates_02" | "castle_brick_07"
  | "rustic_stone_wall" | "wood_shutter";

export type ModelName =
  | "Barrel_01" | "wooden_barrels_01" | "wooden_crate_01" | "wooden_crate_02" | "wooden_bucket_01"
  | "wooden_lantern_01" | "Lantern_01" | "wooden_axe" | "tree_stump_01" | "tree_stump_02"
  | "dead_tree_trunk" | "dead_tree_trunk_02" | "shrub_02" | "fern_02" | "nettle_plant" | "boulder_01"
  | "rock_moss_set_01" | "gothic_statue" | "large_iron_gate" | "stone_fire_pit" | "wicker_basket_01"
  | "wooden_picnic_table" | "painted_wooden_bench" | "spinning_wheel_01" | "wooden_ladder"
  | "wine_barrel_01" | "wooden_stool_01" | "WoodenChair_01" | "wooden_broom";

const ROOT = "/exploration/env";

/** One loader set per scene; everything shares the scene's LoadingManager for the intro gate. */
export function createAssets(renderer: THREE.WebGLRenderer, loading: THREE.LoadingManager) {
  const textureLoader = new THREE.TextureLoader(loading);
  const gltfLoader = new GLTFLoader(loading).setMeshoptDecoder(MeshoptDecoder);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const models = new Map<string, Promise<GLTF>>();
  let disposed = false;

  const sources = new Map<string, { texture: THREE.Texture; clones: THREE.Texture[]; loaded: boolean }>();
  function texture(url: string, color: boolean) {
    // Repeat differs per material, so clone the Texture but share its image source;
    // clones made before the image arrives are flagged for upload when it does.
    const cached = sources.get(url);
    if (cached) { const t = cached.texture.clone(); if (cached.loaded) { t.source = cached.texture.source; t.needsUpdate = true; } else cached.clones.push(t); textures.push(t); return t; }
    const entry = { texture: null as unknown as THREE.Texture, clones: [] as THREE.Texture[], loaded: false };
    const t = textureLoader.load(url, () => { entry.loaded = true; entry.clones.forEach(c => { c.source = t.source; c.needsUpdate = true; }); }, undefined, () => { /* Flat colour stays as fallback. */ });
    entry.texture = t; sources.set(url, entry);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    return t;
  }

  /**
   * A PBR material whose maps are sampled in metres: geometry built by the
   * architecture builder carries world-scaled UVs, so `scale` is "metres per tile".
   */
  function surface(name: SurfaceName, options: { color?: THREE.ColorRepresentation; normal?: number; roughness?: number; metres?: number } = {}) {
    const repeat = 1 / (options.metres ?? 2);
    const map = texture(`${ROOT}/textures/${name}_diff.webp`, true);
    const normalMap = texture(`${ROOT}/textures/${name}_nor.webp`, false);
    const arm = texture(`${ROOT}/textures/${name}_arm.webp`, false);
    for (const t of [map, normalMap, arm]) t.repeat.set(repeat, repeat);
    const material = new THREE.MeshStandardMaterial({
      map, normalMap, aoMap: arm, roughnessMap: arm, metalnessMap: arm,
      color: options.color ?? "#ffffff", roughness: options.roughness ?? 1, metalness: 1,
      normalScale: new THREE.Vector2(options.normal ?? 1, options.normal ?? 1),
    });
    // ARM packs AO/roughness/metalness; most village surfaces are non-metal.
    material.metalnessMap = null; material.metalness = 0;
    materials.push(material);
    return material;
  }

  function model(name: ModelName) {
    let promise = models.get(name);
    if (!promise) {
      promise = gltfLoader.loadAsync(`${ROOT}/models/${name}.glb`).then(gltf => {
        gltf.scene.traverse(child => {
          if (child instanceof THREE.Mesh) { child.castShadow = child.receiveShadow = true; }
        });
        gltf.scene.updateMatrixWorld(true);
        return gltf;
      });
      models.set(name, promise);
    }
    return promise;
  }

  function environment(onReady: (envMap: THREE.Texture) => void) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    new HDRLoader(loading).load(`${ROOT}/textures/narrow_moonlit_road_1k.hdr`, hdr => {
      if (disposed) { hdr.dispose(); pmrem.dispose(); return; }
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose(); pmrem.dispose(); textures.push(env); onReady(env);
    }, undefined, () => { pmrem.dispose(); });
  }

  return {
    surface, model, environment, gltfLoader,
    track<T extends THREE.Material | THREE.Texture>(item: T) { if (item instanceof THREE.Texture) textures.push(item); else materials.push(item); return item; },
    dispose() {
      disposed = true;
      textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose());
      void Promise.allSettled(models.values()).then(results => results.forEach(r => {
        if (r.status !== "fulfilled") return;
        r.value.scene.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          child.geometry.dispose();
          for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
            Object.values(m).forEach(v => { if (v instanceof THREE.Texture) v.dispose(); });
            m.dispose();
          }
        });
      }));
    },
  };
}
export type Assets = ReturnType<typeof createAssets>;

/**
 * Collect every mesh in a GLB as (geometry, material, local matrix) so a model
 * can be drawn with one InstancedMesh per part, however many copies are placed.
 */
export function modelParts(root: THREE.Object3D) {
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = [];
  root.updateMatrixWorld(true);
  root.traverse(child => {
    if (child instanceof THREE.Mesh && !(child instanceof THREE.SkinnedMesh)) {
      parts.push({ geometry: child.geometry, material: child.material as THREE.Material, matrix: child.matrixWorld.clone() });
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  return { parts, box };
}
