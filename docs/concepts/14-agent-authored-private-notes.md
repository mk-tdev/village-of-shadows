# 14. Agent-authored private notes

Persistent conversation gives an agent continuity, but it does not give the
application a clean representation of what that agent currently believes.
FE-07 adds a second, deliberately structured memory: a private notebook whose
changes can be inspected, compared, and replayed as evidence.

## The notebook is an event ledger, not a mutable document

[`backend/app/db.py`](../../backend/app/db.py) defines
`agent_note_events`. A new belief starts at revision 1. Revising or retiring it
inserts another row with the same `note_id` and the next revision number. No
earlier row is updated or deleted.

That design answers two different questions without ambiguity:

- `get_my_notes` returns the latest active content an agent should reason with.
- `get_my_note_history` returns every create, revise, and retire event for an
  audit or learning debrief.

Each row records its kind, optional subject, round, phase, source transcript
sequence, database timestamp, and status. The allowed kinds are `suspicion`,
`clue`, `theory`, `lie`, and `alliance`.

## Isolation is enforced below the prompt

The MCP handlers in
[`backend/app/mcp_server/server.py`](../../backend/app/mcp_server/server.py)
do not accept a seat ID. They resolve the caller from the seat identity bound
to that MCP connection, then pass that identity to the shared action layer.

Ownership appears in every notebook query. A model can retrieve or mutate
only rows whose `game_id` and `seat_id` match its bound identity. Guessing
another note ID does not help: the action layer resolves the latest revision
using both owner fields and rejects a missing match.

Source-event validation preserves partial observability too. An agent may cite:

- any public log event; or
- one of its own private actions, such as its seer investigation.

It cannot cite another seat's private event. The validation lives in
[`backend/app/game/actions.py`](../../backend/app/game/actions.py), alongside
the same server-side rules used for votes, statements, and night actions.

## Why pause and replay do not duplicate notes

Notebook rows are ordinary application persistence rather than LangGraph
state. That is intentional: the note must remain available across turns and in
the post-game report even though a pause can roll the main graph back to the
start of a node.

Every notebook operation derives a deterministic `event_key` from the game,
seat, round, phase, operation, note, content, and source. SQLite enforces that
key as unique. Reapplying the same operation returns the existing row and emits
no second SSE update. Conversation replay protection in the seat-mind subgraph
normally prevents the model call from happening twice; the database key is the
second line of defence at the side-effect boundary.

## One history, two observer views

[`backend/app/routers/stream.py`](../../backend/app/routers/stream.py) sends a
notebook snapshot when an observer connects and `actions.py` publishes each
new revision as `private_note`. The frontend accumulates these immutable events
and shows them in the engineering panel only while God Mode is enabled.

After the game,
[`backend/app/game/timeline.py`](../../backend/app/game/timeline.py) reads the
same rows into the Learning Debrief. The learner can see when a theory appeared,
what evidence prompted it, how it changed, and why it was retired. No hidden
chain-of-thought is exposed; the notebook contains only the concise rationale
the agent explicitly chose to record through a validated tool.

## What the tests prove

[`backend/tests/test_private_notes.py`](../../backend/tests/test_private_notes.py)
covers the immutable lifecycle, timestamp and source metadata, seat ownership,
private-evidence rejection, and idempotent operation replay. The MCP integration
test also creates and reads a note over the real mounted MCP protocol, proving
that the connection-bound identity path—not a direct helper alone—works.
