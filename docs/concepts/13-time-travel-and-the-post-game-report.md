# 13. Time travel: reading a finished game back out of the checkpointer

**Files:** [`backend/app/game/timeline.py`](../../backend/app/game/timeline.py),
[`backend/app/routers/games.py`](../../backend/app/routers/games.py),
[`frontend/components/GameSummary.tsx`](../../frontend/components/GameSummary.tsx)

Read [08](08-persistence-and-checkpointing.md) first — this doc is entirely
about a second use for the checkpointer it describes, and
[12](12-per-seat-agent-memory-subgraphs.md), since there are two graphs to walk.

## The idea: the trace already exists

The obvious way to build a post-game technical report is to emit trace events
while the game runs and store them: a second write path, a schema to maintain,
and a standing risk that the trace and reality disagree.

None of that is necessary here, because **every step of the graph was already
checkpointed** — not for reporting, but to make `interrupt()` durable
([03](03-human-in-the-loop-interrupt.md)). LangGraph exposes those checkpoints
through `aget_state_history`, so a finished game's entire execution history can
be reconstructed after the fact from data that had to exist anyway:

```python
snapshots = [s async for s in graph.aget_state_history(config)]
snapshots.reverse()   # history yields newest-first; execution order is the reverse
```
([timeline.py:118-119](../../backend/app/game/timeline.py#L118-L119))

This is what LangGraph calls **time travel**. Its headline use is forking a run
from an earlier checkpoint to try a different path; the same history is equally
useful read-only, as an audit trail nobody had to write.

Each snapshot carries:

| field | what it gives you |
| --- | --- |
| `metadata["step"]` | monotonic step number (`-1` is the initial input) |
| `next` | the node(s) queued at that checkpoint |
| `values` | the full channel state — here, `{"game": GameState}` |
| `created_at` | timestamp, so wall-clock gaps between steps are recoverable |
| `config` | includes `checkpoint_id`, the handle you'd fork from |
| `tasks` | per-task detail, including any pending `interrupts` |

Two histories get walked, one per graph: the game thread (`session_id`) for the
stage-by-stage progression, and each seat's mind thread
(`{session_id}:{seat_id}`) for how much that agent ended up remembering
([timeline.py:89-111](../../backend/app/game/timeline.py#L89-L111)).

## What the history reveals for free

A real 3-round game with one human seat, straight from the endpoint:

```
steps=62  duration=10858ms  events=56  winner=werewolves
phases: lobby#1 → night#1 → day-discuss#1 → day-vote#1 → night#2 → … → gameover#3
nodes:  day_discussion×14, voting×14, night_wolves×5, check_win_night×3, …
```

Three things worth noticing, none of which required instrumenting anything:

- **The conditional self-edges become concrete.** `graph.py` declares
  `day_discussion` once; the trace shows it ran **14 times** — once per living
  speaker per round. That's the clearest possible answer to "what does a
  conditional self-edge actually do at runtime" (see
  [02](02-langgraph-state-machine.md)).
- **Timing localises cost.** `created_at` deltas show step 3 taking 2,103 ms
  while its neighbours take single-digit milliseconds. That step is a human's
  night action — the interrupt suspended the graph until a person answered.
  With real providers the same column localises slow model calls, and it comes
  from checkpoint timestamps rather than any added timer.
- **The lobby is visible as a state, not an absence.** Step 0 sits at
  `phase: lobby` with no roles assigned, because roles are dealt *inside*
  `assign_roles` rather than at setup. The manual-start design from
  [07](07-pausing-with-interrupt.md) shows up in the trace as a real checkpoint
  the graph waited at.

## The pitfall: a checkpoint here is not a clean point-in-time snapshot

It is tempting to read a snapshot as "the state before its `next` node ran" and
diff consecutive snapshots to attribute changes to nodes. **That is wrong in
this codebase, and it fails in a way that looks plausible.**

Measured directly:

```
step next             phase        log  last log entry
   0 assign_roles     lobby          0  (none)
   1 start_night      night          2  Night 1 falls over the village. The werewolves…
   2 night_wolves     night          2  Night 1 falls over the village. The werewolves…
   3 night_wolves     night          3  proposes attacking Tomas.
```

Step 1 is labelled `next=start_night` yet its state already contains
`start_night`'s own log entry and its phase change. Step 2, labelled
`next=night_wolves`, does *not* contain `night_wolves`' write. The relationship
is inconsistent — and identical across repeated runs, so it isn't a race.

The cause is architectural. Nodes here mutate **one shared `GameState` object
in place** rather than returning fresh copies — deliberately, so the
orchestrator and the MCP tool layer can all see the live object (see nodes.py's
`_sync` and [registry.py](../../backend/app/game/registry.py)). What ends up
serialized into a given checkpoint therefore depends on when that write happened
relative to further mutation of the same object. Deterministic, but not a
snapshot in the sense the word implies.

The fix here is honesty rather than re-architecture: `timeline.py` keeps the two
kinds of fact apart.

- **Graph mechanics** — node order, counts, step numbers, timing — come from the
  checkpoint history, where they *are* reliable.
- **The narrative of what happened** — who spoke, who voted for whom, who died —
  comes from `GameState.log`, which is ordered by `seq` and authoritative.

Mixing them would produce a report that looks precise and attributes actions to
the wrong node. The caveat is carried in the payload itself
([timeline.py:52-60](../../backend/app/game/timeline.py#L52-L60)) and rendered
in the UI rather than buried in a comment, on the grounds that a reader of a
suspiciously tidy trace deserves to know which half to trust.

**The general lesson:** checkpointed state is only a point-in-time record if the
state is *immutable between checkpoints*. In-place mutation of a shared object
buys convenience during a run and costs you the ability to trust the history
afterwards. A codebase that wants both needs nodes that return new state rather
than edit the state they were handed.

A second, smaller correction in the same spirit: a seat's mind accumulates
roughly **four checkpoints per turn** (its input, plus one per node it passes
through), so checkpoint count is not turn count. Turn counts come from the log
too. The summary labels the two separately (`Ckpt` vs `Turns`) rather than
picking one and hoping.

## Where it surfaces

`GET /games/{id}/timeline`
([games.py:84-98](../../backend/app/routers/games.py#L84-L98)) builds the report
on demand. Two properties fall out of reading the checkpointer rather than a
bespoke table:

- **It costs nothing during play.** No trace is accumulated while a game runs;
  the work happens only if someone asks.
- **It doesn't need the registry.** The route reads threads by id, so it works
  for a game the server has since forgotten, or one from a previous process —
  anything whose checkpoints still exist.

The exception is an *abandoned* game, whose threads `stop_game` reclaims on
purpose ([12](12-per-seat-agent-memory-subgraphs.md)). That returns
`available: false` rather than an error, because "there is no history" is a
normal answer here, not a failure. Note the tradeoff this creates: the storage
reclamation added in doc 12 is also the reason a stopped game has no report.
Finished games keep both.

[`GameSummary.tsx`](../../frontend/components/GameSummary.tsx) renders it when
`game.winner` is set, reachable from the game-over overlay. It is fetched
post-game rather than streamed for the same reason the data exists at all: none
of it is recorded as the game runs.
