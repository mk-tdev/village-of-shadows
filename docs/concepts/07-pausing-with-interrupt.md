# 7. Pausing a live game with a second `interrupt()`

**Files:** [`backend/app/game/orchestrator.py`](../../backend/app/game/orchestrator.py),
[`backend/app/game/nodes.py`](../../backend/app/game/nodes.py),
[`backend/app/routers/games.py`](../../backend/app/routers/games.py)

## The idea: pause and continue are just interrupt and resume, again

Read [03-human-in-the-loop-interrupt.md](03-human-in-the-loop-interrupt.md)
first — this feature is *not* a second mechanism bolted onto the graph. A
human turn already proves the graph can genuinely suspend and later resume
with no polling and no thread held open. Pausing the whole game reuses that
exact machinery: pausing calls `interrupt()` from a place that isn't a human
turn, and continuing is a `Command(resume=...)` call, identical in shape to
answering a human prompt. No second suspend/resume system, no separate
"paused" state machine running alongside the graph.

## Requesting a pause: a flag, not an instant stop

```python
def request_pause(self) -> None:
    self.pause_requested = True
```
([orchestrator.py:72-73](../../backend/app/game/orchestrator.py#L72-L73))

```python
@router.post("/{session_id}/pause")
async def pause_game(session_id: str) -> dict:
    """Requests a pause -- takes effect the next time any seat's turn
    finishes, not instantly. It never preempts a turn already in flight, so
    an agent's tool call or a human's pending prompt always completes
    cleanly first."""
    orch.request_pause()
    return {"ok": True}
```
([games.py:62-73](../../backend/app/routers/games.py#L62-L73))

`POST /pause` doesn't stop anything immediately — it just sets a plain
boolean on the orchestrator. Whatever seat's turn is currently mid-flight
(an agent's tool-calling loop, a human's pending prompt) always finishes
normally. The pause only takes effect at the next natural checkpoint: the
end of whichever node runs next.

This flag deliberately lives on `GameOrchestrator`, **not** inside
`GameState`:

```python
# Plain in-memory flag, deliberately *not* part of GameState -- it's a
# signal from the API layer to whichever node runs next, not game data, and
# it must survive independently of the checkpointed state object being
# swapped out from under it on every resume (see nodes.py's `_sync`
# docstring for why that swap happens at all).
self.pause_requested = False
```
([orchestrator.py:38-43](../../backend/app/game/orchestrator.py#L38-L43))

If `pause_requested` were a `GameState` field instead, it would get
serialized into the LangGraph checkpoint and restored from a snapshot on
every resume — which is exactly wrong for a signal that's supposed to mean
"the very next thing that runs should act on this," not "whatever was true
at the moment of the last checkpoint."

The orchestrator gained a second field with the identical justification
later on: `current_node`, tracking the last node `_sync` reported, so a
browser connecting mid-game can show the right graph highlight immediately
instead of a stale one — see
[09-sse-streaming-and-broadcast.md](09-sse-streaming-and-broadcast.md) for
the full story. Same reasoning, same "orchestrator, not `GameState`" home
for it.

## Pausing: the second `interrupt()` call

```python
def _maybe_pause(orch, game: GameState) -> None:
    if not orch.pause_requested:
        return
    orch.pause_requested = False
    game.paused = True
    orch.publish("paused", {})
    interrupt({"kind": "paused"})
    game.paused = False
    orch.publish("resumed", {})
```
([nodes.py:61-89](../../backend/app/game/nodes.py#L61-L89))

`_maybe_pause` is called at the tail end of **every** node in `nodes.py` (12
call sites). Most of the time `pause_requested` is `False` and it's a no-op.
When a pause has been requested, it flips `game.paused = True`, tells the
frontend (`"paused"` SSE event — see
[09-sse-streaming-and-broadcast.md](09-sse-streaming-and-broadcast.md)),
and then calls `interrupt({"kind": "paused"})` — suspending the graph
exactly the way a human turn would, just with a different payload shape.

```python
if isinstance(event, dict) and "__interrupt__" in event:
    payload = event["__interrupt__"][0].value
    if payload.get("kind") == "paused":
        # state.paused and the "paused" SSE event were already set/emitted
        # synchronously inside the node before this interrupt ever reached
        # here -- nothing else to do but wait.
        return
    self.state.awaiting = AwaitingInput(**payload)
    ...
```
([orchestrator.py:84-92](../../backend/app/game/orchestrator.py#L84-L92))

`GameOrchestrator._run` distinguishes a pause-interrupt from a
human-turn-interrupt purely by the `"kind"` field in the payload — a pause
just returns (nothing to store as `AwaitingInput`, since nobody's answer is
being waited on), while a human-turn interrupt sets up the usual
`awaiting_input` state.

## Continuing: the same `resume()` a human answer uses

```python
def continue_game(self) -> None:
    # `None` specifically cannot be used as a resume value -- LangGraph
    # can't tell it apart from "no resume value provided" internally -- so
    # this is a plain truthy sentinel the pause interrupt discards.
    self.resume(True)
```
([orchestrator.py:75-79](../../backend/app/game/orchestrator.py#L75-L79))

`continue_game()` calls the exact same `resume()` method
`POST /input` calls for a human answer — see
[03](03-human-in-the-loop-interrupt.md) for why `None` specifically doesn't
work as the resume value here. Resuming re-enters whichever node was
paused, from the top; `_maybe_pause` runs again, this time with
`orch.pause_requested` already `False`, so `interrupt()` returns the
sentinel immediately, `game.paused` flips back to `False`, `"resumed"` gets
published, and the node's `return {"game": game}` (whatever comes after
`_maybe_pause` in that node — usually nothing, since it's always the last
line) completes normally.

## The one bug this reuse can cause, and why the fix is "always call `_maybe_pause` last"

This is the subtlest part of the whole feature, worth reasoning through
carefully because it's a real bug class specific to *reusing* `interrupt()`
for a second purpose inside a node that might also call it for a first
purpose.

LangGraph matches a resumed value to an `interrupt()` call by **its
position within the node, counted fresh from the top on every re-run** (see
[02](02-langgraph-state-machine.md) on why nodes re-run from the top at
all). A node with two possible `interrupt()` call sites — say, a human
branch's turn-prompt interrupt, and `_maybe_pause`'s pause interrupt — has
to guarantee those two calls are always reached in the *same relative
order* on every re-run, or a resumed value meant for one can get delivered
to the other instead.

Concretely, here's the sequence that would corrupt a human's answer if
`_maybe_pause` ran *before* the human branch's interrupt instead of after:

1. A human seat's turn suspends on its own `interrupt()` — call position 0
   in this node execution. No pause has been requested yet, so
   `_maybe_pause` (if it ran first) was a no-op that consumed nothing.
2. While the human is still thinking, a pause gets requested via `POST
   /pause`.
3. The human submits their answer. The node re-runs from the top.
4. **If `_maybe_pause` were the first thing in the node**, it now sees
   `pause_requested == True` and calls `interrupt()` itself — becoming
   position 0 in *this* run. LangGraph delivers the human's just-submitted
   resume value to *this* call instead, since it's now first. The pause
   interrupt returns instantly (pausing nothing useful), while the human's
   real interrupt call has shifted to position 1 and suspends again with no
   value — the human's actual answer has vanished, and they get asked the
   same question a second time.

The fix is the ordering rule stated directly in `_maybe_pause`'s docstring:
call it **last** in every node, always after any human `interrupt()` call
in that same node body. That guarantees it can only ever occupy a position
*after* a node's own interrupt (if any) — never before it — so it can never
shift and steal an answer meant for an earlier call.

```python
"""Pause-via-interrupt. Deliberately placed at the very end of a node,
always *after* any human `interrupt()` call earlier in that same node body
(e.g. night_wolves' human branch) -- never before it."""
```
([nodes.py:61-64](../../backend/app/game/nodes.py#L61-L64))

This was caught by careful reasoning about LangGraph's position-based
resume matching *before* writing the code — and then confirmed with a
dedicated regression test,
`test_pause_requested_during_pending_human_turn_does_not_steal_the_answer`
in [`backend/tests/test_pause.py`](../../backend/tests/test_pause.py), which
requests a pause while a human turn is suspended and asserts the human's
subsequently-submitted answer is actually applied — not silently discarded.
If you ever add a node with more than one `interrupt()` call site, this is
the exact failure mode to check for.
