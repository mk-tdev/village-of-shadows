# Blender werewolf

Branch: `codex/blender-werewolf`. Form direction approved by the user on
2026-09-17 ("proceed"). The branch now loads `werewolf-blender.glb` in the
exploration encounter. Production has not been changed.

## Author and export

Open `watchman-werewolf.blend` in Blender 5.2.2. The rig has 18 named bones.
Six editable actions cover idle, transformation, lunge, feeding, roar and stride.
Actions are retained in muted NLA tracks. Preview at 24 fps.

```sh
blender --background --factory-startup --python scripts/blender/author_werewolf.py
blender --background --factory-startup --python scripts/blender/export_werewolf.py
```

The first command rebuilds the study and review renders from the original
procedural `werewolf.glb`. The second adds the feeding action, applies surface
modifiers without applying the skin, bakes a 1024px dermis normal map, saves the
editable source and exports only the creature and rig. Review lights, camera
and ground are excluded. The original GLB stays available as authoring input.
No stock assets, Meshy calls or paid generation were used.

The runtime export has 72,278 triangles and is 13,473,960 bytes (under 14 MiB).
Textures are embedded. Fur detail comes from geometry and PBR roughness;
unsupported procedural bumps on secondary materials are deliberately omitted.
The silhouette and fur remain stylized, not a scanned photoreal creature.
Hashes and material decisions are recorded in `authoring-report.json`.

## Playback and validation

`frontend/lib/exploration/wolf-animation.ts` maps encounter phases to clips.
Three.js samples absolute encounter time, so pausing does not advance animation.
Transformation and attack clips fit their gameplay durations; the roar fits the
existing 2.8-second threat cue. Reduced motion holds representative poses.
Foot placement samples the animated lower-foot vertices and preserves Blender rest orientations. Disposal releases geometry,
materials, skeletons, animation bindings and the baked texture.

Run `pnpm --dir frontend test:exploration`, `pnpm --dir frontend lint` and
`pnpm --dir frontend exec tsc --noEmit`. Tests validate exported skin weights,
clip data, embedded textures, budgets, phase timing and reduced motion.

`review/` retains the original room-oriented skill scaffold. Architecture,
openings and Meshy checks in `validation.txt` are inapplicable to this isolated
creature; they are not represented as passing. Form approval is recorded in
`milestone-reviews.json`. Runtime human approval remains pending; deployment
is outside this branch task.

## Lessons from this pass

The source body used disconnected triangle vertices: smoothing before welding
perforated it. Weld first. Recessed sockets make the previously buried eyes
visible. glTF exported from Blender has meaningful bone rest rotations: use
its clips rather than resetting bones to zero as the old procedural poser did.

Local browser verification on 2026-09-17 observed feeding, retreat, the frontal
hunting roar, lantern protection and pause/resume in `/explore`. The production
webpack build also passed. Human Runtime approval is separate from these checks.
