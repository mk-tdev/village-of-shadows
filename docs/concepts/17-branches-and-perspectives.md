# 17. Counterfactual branches and agent perspectives

**Files:** [`branching.py`](../../backend/app/game/branching.py),
[`insights.py`](../../backend/app/game/insights.py), and
[`BranchingReplayView.tsx`](../../frontend/components/BranchingReplayView.tsx).

## A checkpoint is useful only if its boundary is meaningful

The branch picker does not expose every internal checkpoint. It scans the
LangGraph history for checkpoints containing a real human `interrupt()` and
records the seat, input kind, legal options, round, phase, and public log
position. A selected checkpoint is copied into a new game ID; the source game
is never rewritten.

The main game state and every AI seat's mind use different checkpoint threads.
Branching therefore restores both: the shared world is cloned from the chosen
checkpoint, while each seat conversation is copied only through that moment.
The replacement answer is submitted through the same resume and validation
path used during live play, preserving replay safety.

## Perspective is a time-bounded security projection

The perspective viewer is not a client-side filter over God Mode data.
`build_perspective` constructs a server-side projection through one immutable
event sequence. It includes public events, only that role's permitted private
events, the seat's own notes and beliefs, and its accumulated conversation.
Anything sourced from a later event is excluded.

Together these features support a controlled learning loop: reconstruct what
the agent knew, change one human choice, then compare two descendants of the
same evidence rather than two unrelated random games.
