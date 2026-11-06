# Explore village assets

Every runtime asset here is CC0 except the werewolf, which was authored for
this project. Nothing is loaded from a third-party CDN at runtime.

## Environment (`env/`): Poly Haven, CC0

Downloaded 2026-11-03 from the Poly Haven API (https://polyhaven.com,
https://api.polyhaven.com) at 1k resolution, then converted.

- **Textures** (`env/textures/*_{diff,nor,arm}.webp`, 1024 px WebP, ARM =
  AO/roughness/metalness): cobblestone_floor_08, cobblestone_square,
  muddy_tracks, forest_ground_04, plastered_wall_04, worn_mossy_plasterwall,
  weathered_planks, dark_wooden_planks, weathered_plank_siding,
  thatch_roof_angled, roof_slates_02, castle_brick_07, rustic_stone_wall,
  wood_shutter.
- **HDRI**: narrow_moonlit_road (1k, used only as image-based lighting).
- **Models** (`env/models/*.glb`): Barrel_01, wooden_barrels_01,
  wooden_crate_01/02, wooden_bucket_01, wooden_lantern_01, Lantern_01,
  wooden_axe, tree_stump_01/02, dead_tree_trunk, dead_tree_trunk_02, shrub_02,
  fern_02, nettle_plant, boulder_01, rock_moss_set_01, gothic_statue,
  large_iron_gate, stone_fire_pit, wicker_basket_01, wooden_picnic_table,
  painted_wooden_bench, spinning_wheel_01, wooden_ladder, wine_barrel_01,
  wooden_stool_01, WoodenChair_01, wooden_broom.
  They are optimized with `gltf-transform optimize --compress meshopt
  --texture-compress webp --texture-size 512`. Dense scanned meshes are
  simplified: nettle 8%, shrub 10%, boulder 4%, fern 35%, others 15–50%.
  Poly Haven's fir and pine trees (4M+ triangles each) are not used.
  Conifers, bare trees and grass are generated in `lib/exploration/nature.ts`.

Houses, the chapel, walls, the palisade and fences are procedural geometry
(`lib/exploration/architecture.ts`). They use the textures above with
box-projected, metre-scaled UVs and are merged into one mesh per material.

## Characters (`characters/`): Quaternius, CC0

Eight rigged villagers share one 65-bone skeleton and 27 clips (sitting,
walking, lantern, death, look-around and others). See
`characters/PROVENANCE.md` for sources, hashes and edits.

## Audio (`audio/`): Kenney and Freesound, CC0

Surface footsteps, ambience beds, one-shots, music beds and stingers.
See `audio/PROVENANCE.md` for per-file authors, URLs and edits.

## Werewolf mesh

`werewolf.glb` is authored locally by `frontend/scripts/build-werewolf.mjs`
using Three.js: smooth-union anatomical surfaces, an 18-bone skeleton, skin
weights, tapered fur ribbons, articulated jaw, eyes, teeth, and claws. Run
`node scripts/build-werewolf.mjs` from `frontend/` to regenerate it. No stock
character, Meshy service, or Blender installation is required. The asset is
approximately 12 MB, with 14,844 body triangles and 51,096 fur triangles.

## Creature recordings

`audio/attack.mp3` and `audio/growl.mp3` derive from **Monster snarls** by
**Darsycho**, released under **CC0**:
https://opengameart.org/content/monster-snarls
https://creativecommons.org/publicdomain/zero/1.0/

Source downloads (verified 2026-09-10):
- https://opengameart.org/sites/default/files/monster-snarl-attack.ogg
- https://opengameart.org/sites/default/files/monster-snarls-2_0.ogg

Edits: use the first 1.25 seconds of the attack and 3.2 seconds of the growl;
45 Hz high-pass filter, short fade-out, peak limiting, MP3 encoding. Runtime
layers two pitches with a short offset, applies distance attenuation and
stereo direction, and routes through a compressor. Files are served locally.

The council fire uses procedural shader flames, coals/logs and ember
particles. Its crackle is the CC0 campfire loop, positioned in 3D.

## Keepsakes

The six optional keepsakes are physical objects authored in `props.ts`: a
wax-sealed letter, rusted key, brass medallion, broken moon seal, household
diary and river charm. The main objective remains the empty council chair.

## Blackwood expansion

`wilderness.ts` generates the temple, abandoned houses, waterfall, pool and
spray. It reuses the CC0 surfaces and moss-rock scan already listed above; no
additional third-party assets or remotely hosted resources are introduced.
The waterfall sound is locally synthesized noise in `audio.ts`. Temple bells
and empty-house sounds reuse the existing CC0 sound library. `world.ts` holds
the trails, tree placements and collision footprints used by the renderers.

`wolf-appearance.ts` refines the existing GLB at load time: a longer canine
muzzle, leaner waist, salt-and-pepper coat and short skinned facial guard hairs.
The original Blender and GLB files are unchanged. Runtime animation blends
clips, freezes gait when blocked, and keeps the roar stationary before pursuit.

## Blender refinement (feature branch)

The encounter now loads `werewolf-blender.glb`, exported from the editable
`art/werewolf/watchman-werewolf.blend` source. It includes six authored clips and
an embedded baked dermis normal map. The original `werewolf.glb` remains the
procedural authoring input. See `art/werewolf/README.md` for regeneration,
provenance, budgets and review status. Blender is required to re-author/export
this version, but is not needed to run the app.
