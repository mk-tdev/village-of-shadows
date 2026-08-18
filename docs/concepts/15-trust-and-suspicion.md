# 15. Trust and suspicion as explicit agent state

**Files:** [`backend/app/db.py`](../../backend/app/db.py),
[`backend/app/game/actions.py`](../../backend/app/game/actions.py),
[`backend/app/mcp_server/server.py`](../../backend/app/mcp_server/server.py),
[`backend/app/routers/stream.py`](../../backend/app/routers/stream.py),
[`frontend/components/BeliefMatrix.tsx`](../../frontend/components/BeliefMatrix.tsx)

Private prose notes are useful, but they do not answer a simple comparative
question: *how suspicious was Tomas of Elin before and after the vote?* FE-02
adds an explicit observer-to-subject relationship state without replacing the
richer notebook.

## One score, two readable meanings

Every revision stores suspicion and confidence from 0 to 100. The interface
derives `trust = 100 - suspicion`; it does not persist two numbers that could
contradict each other. Confidence stays separate because “I am neutral because
I have no evidence” and “I am confidently undecided after conflicting
evidence” are different states.

No row means *unknown*, not a fabricated score of 50. That distinction is
visible as a dash in the matrix.

## The ledger is private and immutable

`agent_belief_events` identifies both `observer_seat_id` and
`subject_seat_id`. A new opinion starts at revision 1; every later change is a
new row. Historical scores are never updated or deleted, so a role reveal can
move suspicion from 80 to 0 without pretending the original mistake never
happened.

The action layer bounds scores, rejects self-scoring and unknown players,
requires a concise reason, and permits citations only to public events or the
observer's own private events. This keeps a relationship update from becoming
a side channel for another role's secret action.

A deterministic `event_key` includes the game, observer, subject, phase,
round, scores, reason, and evidence sequence. If LangGraph replays the same
effect after a pause, persistence returns the existing row instead of adding a
duplicate revision.

## Identity comes from the MCP connection

Models receive three relationship tools:

- `get_my_beliefs` returns the caller's latest score for each subject.
- `get_my_belief_history` returns only that caller's revisions.
- `update_belief` accepts a subject, scores, reason, and optional evidence
  sequence—but no observer seat ID.

The MCP session was already bound by the orchestrator before the model saw its
tools. The action therefore receives the observer from trusted connection
state, preserving the same non-impersonation boundary as voting and private
notes.

## God Mode observes; agents do not share

The SSE route sends a separate observer snapshot on connection and publishes
narrow `belief_update` events as rows are appended. `useGameStream` reduces
those into a client-only ledger. `BeliefMatrix` then shows observers as rows,
subjects as columns, the current suspicion as the main number, and confidence
below it. The cited reason remains available in the update cards and cell
tooltip.

This stream is an observer surface. No belief matrix is added to the public
transcript or another agent's context. A model can read only its own rows
through its bound MCP identity, and disabling God Mode hides the observer UI
without changing anyone's permitted knowledge.

## Closing the learning loop

The post-game timeline reads the immutable ledger alongside checkpoints,
decisions, and notes. The Learning Debrief renders the final matrix and the
revision sequence, so a learner can connect a changed score to a precise
round, phase, confidence level, and evidence event.

The offline mock path records simple, explicitly scripted score changes too.
That is not presented as model reasoning; it ensures the complete persistence,
streaming, visualization, and debrief pipeline can be studied without an API
key. Tests separately cover isolation, hidden-evidence rejection, validation,
role-reveal revision, replay idempotence, mock games, and a genuine MCP
round-trip.
