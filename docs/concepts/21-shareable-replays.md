# 21. Immutable, revocable replay exports

**Files:** [`sharing.py`](../../backend/app/game/sharing.py),
[`replays.py`](../../backend/app/routers/replays.py), and
[`ReplayViewer.tsx`](../../frontend/components/ReplayViewer.tsx).

## Sharing is export, not access to a live game

A replay link points to an immutable JSON snapshot created after the game
finishes. It does not expose the orchestrator, checkpoint thread, room token,
provider endpoint, API credential, or raw prompt. Mutating the live in-memory
state later cannot change an already published chronicle.

Public snapshots include public game events, role reveals, graph step labels,
sanitized tool names and metrics, and the post-game deception analysis. God
Mode snapshots may also include private events, notes, and beliefs, but require
a second unguessable secret stored only as a hash. That secret travels in the
shared URL; the server cannot recover it later.

The replay page is read-only and moves through immutable event sequence
numbers. Links may expire or be revoked without deleting the source game.
This separates three concerns cleanly: durable evidence, authorization to see
private evidence, and the presentation that animates it.
