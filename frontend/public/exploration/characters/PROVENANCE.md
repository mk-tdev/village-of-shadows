# Character assets — provenance

All files in this directory are derived **only** from CC0 1.0 (public-domain) assets by Quaternius. No CC-BY, Mixamo, or Sketchfab material was used.

Licence: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/ (stated in each archive's `License.txt`/`License_Standard.txt` and on each itch.io page's "Asset license" field). Attribution is not required; crediting "Quaternius" is courteous.

Download date: 2026-11-02 UTC (2026-11-03 local). Downloaded with the free itch.io flow (POST `<page>/file/<upload_id>?source=view_game&as_props=1&after_download_lightbox=true` with the page csrf_token → signed, short-lived Cloudflare R2 URL). The R2 URLs below are shown without their expiring signature query string.

## Sources

| Title | Author | Source page | Itch upload id / file | Resolved download URL (unsigned part) | SHA-256 of archive |
|---|---|---|---|---|---|
| Universal Base Characters [Standard] | Quaternius (https://quaternius.com) | https://quaternius.itch.io/universal-base-characters | 15861669 — `Universal Base Characters[Standard].zip` (122 MB) | https://itchio-mirror.cb031a832f44726753d6267436f3b414.r2.cloudflarestorage.com/upload2/game/3822259/15861669 | `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40` |
| Modular Character Outfits – Fantasy [Standard] | Quaternius (https://quaternius.com) | https://quaternius.itch.io/modular-character-outfits-fantasy | 16289385 — `Modular Character Outfits - Fantasy[Standard].zip` (280 MB) | https://itchio-mirror.cb031a832f44726753d6267436f3b414.r2.cloudflarestorage.com/upload2/game/4040378/16289385 | `c3468b18871cc8c8f05ab14df7712baf22cb9f389cbd870babf130e595187f70` |
| Universal Animation Library [Standard] | Quaternius (https://quaternius.com) | https://quaternius.itch.io/universal-animation-library | 17958403 — `Universal Animation Library[Standard].zip` (15 MB) | https://itchio-mirror.cb031a832f44726753d6267436f3b414.r2.cloudflarestorage.com/upload2/game/3408034/17958403 | `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724` |
| Universal Animation Library 2 [Standard] | Quaternius (https://quaternius.com) | https://quaternius.itch.io/universal-animation-library-2 | 17958478 — `Universal Animation Library 2[Standard].zip` (17 MB) | https://itchio-mirror.cb031a832f44726753d6267436f3b414.r2.cloudflarestorage.com/upload2/game/4221776/17958478 | `4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68` |

Files used: outfits from `Exports/glTF (Godot-Unreal)/Outfits/*.gltf` + alt textures `Textures/Peasant/T_Peasant_2_BaseColor.png`, `Textures/Ranger/T_Ranger_3_BaseColor.png`; heads/eyes/eyebrows from UBC `Base Characters/Godot - UE/Superhero_{Male,Female}_FullBody.gltf`; hair from UBC `Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/`; animations from `Unreal-Godot/UAL1_Standard.glb` and `UAL2_Standard.glb` (in-place, non-root-motion variants). Raw archives are kept under `../raw/<pack>/`.

## Edits made (all files)

1. **Assembly (Blender 5.2.2, headless):** outfit armature kept as the single skeleton (65 bones, root bone `root`). The UBC full body was cut down to the head/neck (kept only vertices whose dominant skin weight is `Head` or `neck_01`, per the outfit pack's Readme: "only the head of the model is required"), re-skinned to the outfit armature (head/neck bones identical, 0.0 mm difference), and its "superhero" material replaced with the outfit pack's plain-skin `MI_Regular_{Male,Female}` (same UV layout). Hair/eyebrow/eye meshes re-bound to the same armature. Outfit base-colour textures swapped for variants as listed per file. Blender's import helper `Icosphere` objects removed.
2. **Animation retarget (gltf-transform script):** 26 clips copied from UAL1/UAL2 onto each character's own bones by name. Rotations are retargeted relative to rest (`q = charRest · mannequinRest⁻¹ · q_anim`), so each character keeps its own proportions; `pelvis` translation is re-based on the character's pelvis rest and scaled by pelvis-height ratio; all other translation tracks and all scale tracks dropped.
3. **Authored clip `Idle_LookAround` (new, CC0 by derivation):** two cycles of `Idle_Loop` (5.0 s) with an added world-vertical yaw distributed over `spine_03`/`neck_01`/`Head` (20/35/45 %): head turns ≈38° left, holds, ≈38° right, holds, returns (measured head yaw relative to idle baseline).
4. **Tints:** hair/eyebrow `baseColorFactor` per character (Quaternius hair is grey-scale by design); woodsman outfit `baseColorFactor` 0.55/0.6/0.5 to mute the green.
5. **Optimisation (`gltf-transform optimize`, CLI v4):** textures resized to ≤1024 px and converted to WebP; meshopt compression + quantization; dedup/prune/resample. No mesh simplification, no joining/flattening (mesh names preserved, e.g. the hood is a separate mesh `*_Head_Hood` that can be hidden).

## Output files

Runtime requirements (Three.js r185): `GLTFLoader` + `loader.setMeshoptDecoder(MeshoptDecoder)` (from `three/examples/jsm/libs/meshopt_decoder.module.js`); `EXT_texture_webp` and `KHR_mesh_quantization` are handled natively. Units are metres, +Y up, characters face +Z, feet at y≈−0.01, origin between the feet. Scene root node `Armature` (identity transform) → root bone `root` (rotation −90° about X; the skeleton is authored Z-up inside it — do not touch it). All meshes of a file share one skin joint list (65 joints, same names and order in every file). Animations are **embedded** in each GLB (no separate animation file to bind). To make a character 1.7 m tall: `object.scale.setScalar(1.7 / topHeight)` using the top heights below (hair/hood included).

| File | Character | Size | Triangles | Meshes | Bones | Top height (m) | Textures |
|---|---|---|---|---|---|---|---|
| `villager_man_a.glb` | Older male villager: cream peasant tunic, brown trousers, boots; grey swept hair + grey beard | 1.21 MB | 19,833 | 9 | 65 | 1.803 | 10 × 1024x1024, 256x256 WebP |
| `villager_man_b.glb` | Male villager, drab variant: dark olive/brown peasant clothes; short brown buzzed hair | 1.18 MB | 18,328 | 8 | 65 | 1.777 | 10 × 1024x1024, 256x256 WebP |
| `villager_woman_a.glb` | Female villager: corset bodice, linen sleeves, gloves, trousers, boots; shoulder-length auburn hair | 1.27 MB | 21,792 | 8 | 65 | 1.740 | 10 × 1024x1024, 256x256 WebP |
| `villager_woman_b.glb` | Female villager, drab variant: olive bodice, dark trousers; dark hair in a bun | 1.27 MB | 22,170 | 8 | 65 | 1.742 | 10 × 1024x1024, 256x256 WebP |
| `hooded_man.glb` | Hooded/cloaked man (ranger hood, leather vest, belts, pauldron, bracers, tall boots); brown beard | 1.43 MB | 32,620 | 13 | 65 | 1.832 | 10 × 1024x1024, 256x256 WebP |
| `hooded_woman.glb` | Hooded woman (ranger hood, leather vest, pauldron, bracers, tall boots), brown palette | 1.45 MB | 32,284 | 12 | 65 | 1.757 | 10 × 1024x1024, 256x256 WebP |
| `woodsman_man.glb` | Bare-headed woodsman/hunter: green ranger tunic (darkened), belts, bracers, boots; buzzed hair + beard | 1.40 MB | 29,938 | 12 | 65 | 1.777 | 10 × 1024x1024, 256x256 WebP |
| `huntress_woman.glb` | Bare-headed huntress: brown ranger vest, belts, bracers, boots; long blonde-brown hair | 1.45 MB | 31,678 | 11 | 65 | 1.740 | 10 × 1024x1024, 256x256 WebP |

Total: 10.66 MB for all 8 GLBs.

Per-file build recipe:

- `villager_man_a.glb` — Male_Peasant outfit (T_Peasant texture) + UBC male head + Hair_SimpleParted + Hair_Beard; hair untinted (grey).
- `villager_man_b.glb` — Male_Peasant outfit with alt texture T_Peasant_2_BaseColor + UBC male head + Hair_Buzzed tinted dark brown.
- `villager_woman_a.glb` — Female_Peasant outfit (T_Peasant) + UBC female head + Hair_Long tinted auburn.
- `villager_woman_b.glb` — Female_Peasant outfit with T_Peasant_2_BaseColor + UBC female head + Hair_Buns tinted near-black.
- `hooded_man.glb` — Male_Ranger outfit (all parts incl. Head_Hood) with alt texture T_Ranger_3_BaseColor + UBC male head + Hair_Beard tinted brown.
- `hooded_woman.glb` — Female_Ranger outfit (incl. Head_Hood) with T_Ranger_3_BaseColor + UBC female head; no hair mesh (hood); eyebrows tinted brown.
- `woodsman_man.glb` — Male_Ranger outfit minus Head_Hood & Acc_Pauldron, T_Ranger texture with outfit baseColorFactor (0.55,0.6,0.5) + UBC male head + Hair_Buzzed + Hair_Beard tinted dark brown.
- `huntress_woman.glb` — Female_Ranger outfit minus Head_Hood & Acc_Pauldrons, T_Ranger_3_BaseColor + UBC female head + Hair_Long tinted light brown.

## Animation clips (identical set in every file)

| Clip | Duration (s) | Source |
|---|---|---|
| `Idle_Loop` | 2.5 | UAL1 |
| `Idle_LookAround` | 5 | authored (from UAL1 Idle_Loop) |
| `Walk_Loop` | 1.333 | UAL1 |
| `Walk_Formal_Loop` | 1.333 | UAL1 |
| `Jog_Fwd_Loop` | 0.933 | UAL1 |
| `Sprint_Loop` | 0.667 | UAL1 |
| `Sitting_Enter` | 1.3 | UAL1 |
| `Sitting_Idle_Loop` | 1.667 | UAL1 |
| `Sitting_Talking_Loop` | 2.933 | UAL1 |
| `Sitting_Exit` | 1.033 | UAL1 |
| `Idle_Talking_Loop` | 2.933 | UAL1 |
| `Idle_Torch_Loop` | 1.267 | UAL1 |
| `Crouch_Idle_Loop` | 2.933 | UAL1 |
| `Crouch_Fwd_Loop` | 2 | UAL1 |
| `Hit_Chest` | 0.333 | UAL1 |
| `Death01` | 2.4 | UAL1 |
| `Interact` | 2 | UAL1 |
| `Idle_FoldArms_Loop` | 2.5 | UAL2 |
| `Idle_Lantern_Loop` | 2.5 | UAL2 |
| `Idle_No_Loop` | 2.5 | UAL2 |
| `Yes` | 2.5 | UAL2 |
| `Hit_Knockback` | 0.833 | UAL2 |
| `LayToIdle` | 1.533 | UAL2 |
| `Walk_Carry_Loop` | 2 | UAL2 |
| `Zombie_Idle_Loop` | 1.333 | UAL2 |
| `Zombie_Walk_Fwd_Loop` | 1.333 | UAL2 |
| `Zombie_Scratch` | 1.8 | UAL2 |

`preview_contact_sheet.png` is a Blender render of the final (meshopt-decoded) files in sample poses.

