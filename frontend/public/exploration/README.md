# Prologue environment materials

`weathered-timber.png` and `wet-cobblestone.png` were generated for this feature
with the built-in OpenAI image generator on 2026-09-05. They are used as repeated
color and bump maps in the local Three.js scene. No reference app assets were
copied.

- Timber prompt: seamless flat albedo photograph of weathered medieval
  horizontal timber boards; dark gray wood grain, subtle moss and moisture;
  neutral diffuse lighting, no perspective, text, objects, or strong shadows.
- Cobblestone prompt: seamless flat top-down albedo photograph of closely set,
  irregular wet gray cobblestones in dark soil, dirt and moss in cracks;
  neutral overcast lighting, no perspective, text, or objects.

The scene also reuses the existing `public/characters/full/` cast images.

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

The council fire uses procedural shader flames, coals/logs, ember particles,
and a synthesized crackle loop. No external flame media is used.

## Walk into Shadows update — 2026-09-15

The three optional keepsakes are supported physical objects: a wax-sealed letter
on a crate, a rusted key on the well rim, and a stamped brass medallion hanging
against wood. `props.ts` authors their geometry and patina locally. There are no
spinning, emissive pickup rings. The main objective is the empty council chair.

The pre-transformation watchman and witness use **INFINITE, 3D Head Scan** by
**Lee Perry-Smith**, based on Triplegangers work, under **CC BY 3.0**. The source
is pinned to the Three.js r185 example archive:
https://github.com/mrdoob/three.js/tree/r185/examples/models/gltf/LeePerrySmith

`watchman/LICENSE.txt` preserves the original attribution/license. The runtime
trims the scanned shoulders, scales/tints the head, and fits it into locally
authored clothing. The approximately 0.7 MB asset set includes the original
head GLB, color texture and normal map. The finished wolf asset is unchanged.

`audio.ts` adds an original synthesized horror score: detuned bowed drones,
sub-bass, slow pitch drift and a low heartbeat pulse. It swells during the
encounter and recedes near the council fire, alongside spatial creature
recordings, wind and fire. It begins only on a gesture; sound-off and pause
suspend it. This is a procedural score, not a licensed music recording.
