# 7. Controlling a live game: starting, pausing, and stopping

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

## Not starting automatically: the `started` flag and `begin_game`

Before pause/continue/stop even come into play, there's an earlier
lifecycle question: *when* does a game's graph first start running at all?
The obvious answer — the instant `POST /games` creates it — turned out to
be wrong in practice:

```python
orch = GameOrchestrator(session_id, state, conn, graph)
registry.register(orch)
# Deliberately not orch.start() here -- see GameOrchestrator.started's
# docstring.
```
([routers/games.py:40-46](../../backend/app/routers/games.py#L40-L46))

`create_game` builds and registers the orchestrator, but never calls
`orch.start()`. If it did — which is what this project's first version
actually shipped — the graph would begin advancing in the background
*immediately*, often before the browser had even navigated to the game
page and opened its SSE connection. A fast game (mock-provider seats
especially, since they never wait on a real API call) could race through
`assign_roles` and several `night_wolves` turns before anyone was watching,
so a player would land on a game already a few steps deep with no idea
what they'd missed — a real, reported symptom ("it just skips 3 steps
ahead before I even realize"), not a hypothetical one.

The fix is a `started` flag (the same "plain attribute on the orchestrator,
not `GameState`" reasoning as `pause_requested` below and `current_node`
in [09](09-sse-streaming-and-broadcast.md)) and a dedicated route the human
triggers explicitly:

```python
self.started = False
```
([orchestrator.py:80-89](../../backend/app/game/orchestrator.py#L80-L89))

```python
@router.post("/{session_id}/begin")
async def begin_game(session_id: str) -> dict:
    ...
    if orch.started:
        raise HTTPException(409, "Game has already begun.")
    orch.start()
    return {"ok": True}
```
([routers/games.py:51-66](../../backend/app/routers/games.py#L51-L66))

`GameState.phase` starts at `"lobby"` and stays there until `begin_game`
actually calls `orch.start()`. The frontend's game page already opens its
SSE connection the moment it mounts — so by the time a human clicks the
"Start Game" button it presents while `phase === "lobby"`
([GameView.tsx](../../frontend/components/GameView.tsx)), the connection
watching for events has been live for as long as the page has been open.
Nothing can run ahead of a viewer who hasn't arrived yet, because starting
is now an action the viewer takes, not a side effect of creating the game.
See [11](11-application-walkthrough.md) for this traced through end to end.

This same decoupling is *why* three separate fields — the current node,
`phase`/`round`, and player roles — each needed their own catch-up-on-connect
SSE event after this change: the browser's one-time initial `"state"`
snapshot is now reliably taken before the game (and therefore those fields)
exists, where it previously often wasn't. See
[09](09-sse-streaming-and-broadcast.md) for all three.

## Requesting a pause: a flag, not an instant stop

```python
def request_pause(self) -> None:
    self.pause_requested = True
```
([orchestrator.py:112-113](../../backend/app/game/orchestrator.py#L112-L113))

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
([games.py:102-113](../../backend/app/routers/games.py#L102-L113))

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
([orchestrator.py:67-72](../../backend/app/game/orchestrator.py#L67-L72))

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
([nodes.py:147-175](../../backend/app/game/nodes.py#L147-L175))

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
([orchestrator.py:165-173](../../backend/app/game/orchestrator.py#L165-L173))

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
([orchestrator.py:115-119](../../backend/app/game/orchestrator.py#L115-L119))

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
([nodes.py:148-151](../../backend/app/game/nodes.py#L148-L151))

This was caught by careful reasoning about LangGraph's position-based
resume matching *before* writing the code — and then confirmed with a
dedicated regression test,
`test_pause_requested_during_pending_human_turn_does_not_steal_the_answer`
in [`backend/tests/test_pause.py`](../../backend/tests/test_pause.py), which
requests a pause while a human turn is suspended and asserts the human's
subsequently-submitted answer is actually applied — not silently discarded.
If you ever add a node with more than one `interrupt()` call site, this is
the exact failure mode to check for.

## Stopping outright: the other way to end a game

Pause and stop look similar from a UI button's perspective — both interrupt
a running game — but they're deliberately built on two *different*
mechanisms, not variations of one:

```python
def stop(self) -> None:
    """Abandons this game outright -- cancels the background task
    immediately, wherever it is (mid AI turn, mid human wait, anywhere),
    rather than waiting for a natural checkpoint the way request_pause()
    does. This is deliberately a different mechanism from pause/resume,
    not a reuse of it: pausing means "come back to this later," stopping
    means "this game is over, discard it." Task.cancel() raises
    CancelledError at the task's next await point; that's a
    BaseException, not an Exception, so it passes straight through
    _run's `except Exception` handler below without publishing a
    misleading "error" event -- the task just ends, cancelled.
    """
    if self._task is not None and not self._task.done():
        self._task.cancel()
```
([orchestrator.py:121-134](../../backend/app/game/orchestrator.py#L121-L134))

**Pause is cooperative: it asks, and waits for a safe point to say yes.**
`request_pause()` just sets a flag; the *running* node keeps going until it
naturally reaches `_maybe_pause()` at its own tail end (see above) before
anything actually suspends. Nothing is ever interrupted mid-step — an
in-flight tool call, a partially-built prompt, a DB write, all finish
untouched. That's exactly right for "I want to come back to this game
later": the state has to be coherent to resume from.

**Stop is preemptive: it doesn't ask.** `orch._task.cancel()` schedules a
`CancelledError` to be raised at whatever `await` the task happens to be
sitting on right now — inside a slow real-model API call, in the middle of
an MCP tool round-trip, anywhere. There's no equivalent of "wait for a safe
point" because there's no plan to resume afterward; the game is being
discarded, not parked. This is the right tool specifically for "stop a
model call that might otherwise run for many more seconds" — pause
wouldn't even help there, since `request_pause()`'s flag is only checked
*after* the current turn finishes, and an in-flight provider call is
exactly the thing pause can't interrupt.

**Why cancellation doesn't trip the error-handling path.** `_run`'s loop
(see [03](03-human-in-the-loop-interrupt.md)) wraps everything in `except
Exception`, which publishes an `"error"` SSE event — appropriate for a
genuine failure, wrong for a user-requested stop. `asyncio.CancelledError`
inherits from `BaseException`, not `Exception`, specifically so cancellation
isn't accidentally swallowed by ordinary exception handlers throughout a
codebase — which is exactly the behavior this relies on here: cancelling
`orch._task` unwinds past `_run`'s `except Exception` untouched, the task
simply ends in a cancelled state, and no misleading error reaches the
frontend.

The router endpoint that drives this
([routers/games.py](../../backend/app/routers/games.py)) also immediately
calls `registry.unregister(session_id)` after `orch.stop()` — unlike pause,
there's no notion of a stopped game still existing to be resumed later, so
every other route (`/state`, `/stream`, `/input`, `/pause`) should 404 for
it from that instant on, identical to a `session_id` that never existed.

