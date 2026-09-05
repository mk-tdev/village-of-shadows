# The watchman's hunger — development checkpoint

This package records an in-progress, locally authored gameplay prototype in
`/explore`. It is not an approved Blender/Meshy room or a production character
asset. All three plugin gates remain pending. No paid generation, export,
deployment, or human approval has occurred.

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
