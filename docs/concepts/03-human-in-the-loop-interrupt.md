# 3. Human-in-the-loop with `interrupt()`

**Files:** [`backend/app/game/nodes.py`](../../backend/app/game/nodes.py),
[`backend/app/game/orchestrator.py`](../../backend/app/game/orchestrator.py),
[`backend/app/routers/input.py`](../../backend/app/routers/input.py)

## The problem this solves

One seat in every game is a human, played from a browser. When it's their
turn, the backend needs to: stop running, tell the frontend what's being
asked, wait — for an unbounded amount of time, no timeout — and then
continue exactly where it left off once the human answers. No polling loop
checking "has the human answered yet?" every second, and no thread sitting
blocked in memory the whole time (the app needs to serve other requests,
including other games, while this one waits).

## `interrupt()`: suspend a node, mid-function

```python
if wolf.controller == "human":
    answer = interrupt(
        {"kind": "night_action", "seat_id": wolf.seat_id,
         "prompt": "Choose which villager to attack.", "options": pool}
    )
    await actions.apply_night_action(orch, wolf.seat_id, answer["target"], answer.get("thought", ""))
```
([nodes.py:161-165](../../backend/app/game/nodes.py#L161-L165))

`interrupt(payload)` does something that looks like a blocking call but
isn't: it raises a special LangGraph exception that unwinds execution all
the way out of the graph, *without* losing where it was. The `payload` (here,
what question to ask and what options are valid) becomes the value that
propagates out through `graph.astream(...)` as a special `"__interrupt__"`
event. Nothing after this line runs — yet.

## Catching the interrupt and turning it into an SSE prompt

```python
async def _run(self, input_: Any) -> None:
    try:
        async for event in self.graph.astream(input_, self.config):
            if isinstance(event, dict) and "__interrupt__" in event:
                payload = event["__interrupt__"][0].value
                ...
                self.state.awaiting = AwaitingInput(**payload)
                self.publish("awaiting_input", payload)
                return
        ...
```
([orchestrator.py:74-87](../../backend/app/game/orchestrator.py#L74-L87))

`GameOrchestrator._run` drives the graph with `graph.astream(...)` inside a
background `asyncio.Task` (see `start()`,
[orchestrator.py:58-59](../../backend/app/game/orchestrator.py#L58-L59)).
When it sees an `"__interrupt__"` event, it stores the payload as
`AwaitingInput` on the game's state and publishes an `awaiting_input` SSE
event, then **returns** — the background task ends. There is nothing left
running for this game until something resumes it. That's the "no polling,
no timeout" property: the cost of an indefinitely-waiting human turn is
zero — no task, no thread, nothing — until they actually answer.

## Resuming: `Command(resume=...)`

```python
def resume(self, value: Any) -> None:
    self.state.awaiting = None
    self._task = asyncio.create_task(self._run(Command(resume=value)))
```
([orchestrator.py:61-63](../../backend/app/game/orchestrator.py#L61-L63))

```python
@router.post("/{session_id}/input")
async def submit_input(session_id: str, body: InputRequest) -> dict:
    ...
    orch.resume(body.value)
    return {"ok": True}
```
([input.py:15-29](../../backend/app/routers/input.py#L15-L29))

When the human submits an answer via `POST /games/{id}/input`, the route
calls `orch.resume(body.value)`, which starts a **new** `graph.astream(...)`
call — but instead of a fresh initial state, it passes
`Command(resume=value)`. LangGraph's checkpointer (see
[08-persistence-and-checkpointing.md](08-persistence-and-checkpointing.md))
recognizes this thread is paused at an `interrupt()` and re-enters that node
from the top, with the crucial difference that **this time, the `interrupt()`
call returns `value` instead of raising** — so `answer = interrupt(...)`
actually gets the human's submitted dict as `answer`, and execution
continues past it into `actions.apply_night_action(...)`.

This is why the module docstring in `nodes.py` warns that a node re-runs
*from the top* on resume (see
[02-langgraph-state-machine.md](02-langgraph-state-machine.md)) — everything
in the node before the `interrupt()` call runs again too. It's harmless here
specifically because there's nothing with side effects before it; the
`interrupt()` is the first thing each human branch does.

## Why the resumed value has to match what's expected

```python
awaiting = orch.state.awaiting
if awaiting is None:
    raise HTTPException(409, "This game is not currently awaiting input.")
if awaiting.seat_id != body.seat_id or awaiting.kind != body.kind:
    raise HTTPException(409, f"Expected input from seat {awaiting.seat_id} of kind {awaiting.kind}.")
```
([input.py:22-26](../../backend/app/routers/input.py#L22-L26))

LangGraph doesn't know or care *what* value you resume with — it just hands
it back as the `interrupt()` return value, whatever type that is. The
validation that it's the *right* seat answering the *right* kind of prompt is
entirely this route's job, checked against `orch.state.awaiting` (the same
`AwaitingInput` the orchestrator stored when it caught the interrupt). This
is the same "don't trust the caller, validate at the one point that
matters" principle that shows up again in
[04](04-partial-observability-agent-view.md) and
[05](05-mcp-tool-server-identity.md) — a resumed value with the wrong shape
would otherwise sail straight into `actions.apply_night_action(...)` unless
caught here first.

## A pitfall worth knowing before you touch this code: `None` can't be a resume value

While building the pause feature (see
[07-pausing-with-interrupt.md](07-pausing-with-interrupt.md)), we needed to
resume a paused interrupt with *some* value even though there was no real
data to send. `None` seems like the obvious choice — but LangGraph's own
source explicitly rejects it: internally, "no resume value provided" and
"resumed with `None`" would be indistinguishable, which matters especially
over HTTP where the two cases need to be told apart. The fix used here is a
plain truthy sentinel (`self.resume(True)`, in
`continue_game()`) that the interrupt call simply discards. If you ever find
yourself wanting to resume with "nothing," reach for a sentinel like this
instead of `None`.
