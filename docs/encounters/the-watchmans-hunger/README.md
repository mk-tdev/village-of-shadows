# The watchman's hunger — development checkpoint

This package records an in-progress, locally authored gameplay prototype in
`/explore`. It is not an approved Blender/Meshy room or a production character
asset. All three room-plugin gates remain pending. No paid generation, Blender/Meshy
export, deployment, or human approval has occurred. A locally generated Three.js
GLB is now used by the runtime, outside that room-production pipeline.

Implemented: articulated human-to-wolf transformation, pounce, feeding pose,
fallen victim and lantern, hunt, directional lantern protection, escape,
capture/retry preserving seals, actor collision, and a session-only witness
journal entry. The existing AI council remains separate.

At this checkpoint, the production build, TypeScript, lint, and ten gameplay
tests pass. Browser checks exercised transformation, feeding, hunt, capture,
and retry preserving seals and relighting the lantern. Journal pause during
the hunt was also exercised. Complete the post-survival journal check, mobile
encounter pass, console audit, and final screenshot review next time.

The manifest files are preliminary planning records. The plugin's Function
validator currently fails: reference images/plans and approval are missing,
and its full room/Meshy schema does not yet match this zero-credit procedural
encounter. Resolve or explicitly adapt those contracts before pursuing that
pipeline; do not treat these files or the successful app build as gate approval.

Remaining visual work: improve anatomy, fur/material detail, floor contact,
and the production-camera framing of the attack. Current geometry is stylized
and procedural, not photorealistic. No final asset quality is claimed.

## Fire, creature, and sound revision — 2026-09-11

The solid council-fire cone is replaced by turbulent, transparent shader
flames, coals, crossed logs, a stone ring, rising sparks, and firelight.
The wolf now loads `public/exploration/werewolf.glb`, a continuous skinned
anatomical mesh with an 18-bone skeleton and groomed fur geometry. Rebuild with
`pnpm build:werewolf` in `frontend/`. The source generator is kept in the repo.
A GLB skin/weight/budget validation test supplements the encounter rule tests.

Creature sound uses locally hosted CC0 recordings by Darsycho (provenance in
`frontend/public/exploration/README.md`), layered at different pitches with
stereo direction, distance attenuation, and a compressor. The audio context
suspends on pause so the recorded roar freezes with its animation.

This revision changes the renderer/assets, not the live council or encounter
progression. The exported model has no external texture dependencies. Its
~12 MB payload and dense fur should still be profiled on lower-end phones.
