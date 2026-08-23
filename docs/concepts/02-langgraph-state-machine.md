# 2. LangGraph as the game's state machine

**Files:** [`backend/app/game/graph.py`](../../backend/app/game/graph.py),
[`backend/app/game/nodes.py`](../../backend/app/game/nodes.py)

## Why not just a Python function with a `while` loop?

A werewolf game is naturally a loop: night phase, day phase, vote, repeat
until someone wins. The obvious first instinct is to write that as nested
Python loops — `while not winner: do_night(); do_day(); do_vote()`. That
works fine *until* you need one seat's turn to be a real human sitting at a
browser, whose answer might not arrive for thirty seconds. A `while` loop
has nowhere to "hang up the phone and call back later" — it can only block
the thread or poll. LangGraph's answer is to represent the loop as **graph
structure** (nodes and edges) instead of **control-flow code**, because a
graph can be *paused between nodes* and resumed later from durable storage,
which a suspended Python stack frame cannot (not without real coroutine
serialization, which nobody wants to hand-roll).

## The graph, read as a diagram

```
assign_roles → start_night → werewolf_negotiation ⟲ → resolve_wolf_plan
  → night_doctor → night_seer
  → resolve_night → check_win_night → END | start_day
start_day → day_discussion ⟲ → start_vote → voting ⟲ → resolve_vote
  → check_win_vote → END | start_night (next round)
```
([graph.py:1-10](../../backend/app/game/graph.py#L1-L10), the module
docstring — and yes, writing the diagram as a comment above the code that
builds it is exactly the kind of thing worth doing so the two can't silently
drift apart... except of course they still can, which is why
[`routers/graph.py`](../../backend/app/routers/graph.py) exposes the *real*
compiled graph's structure to the frontend instead of a second hand-drawn
copy — see [10-frontend-observability.md](10-frontend-observability.md)).

The `⟲` marks are **conditional self-edges** — a node that routes back to
itself. This is how "run the bounded werewolf council one seat-turn at a time" gets
expressed as graph structure:

```python
def _route_werewolf_negotiation(state: GraphState) -> str:
    game = state["game"]
    return (
        "werewolf_negotiation"
        if game.wolf_index < werewolf_turn_limit(game)
        else "resolve_wolf_plan"
    )

builder.add_conditional_edges(
    "werewolf_negotiation",
    _route_werewolf_negotiation,
    ["werewolf_negotiation", "resolve_wolf_plan"],
)
```
([graph.py:26-32](../../backend/app/game/graph.py#L26-L32),
[graph.py:73-79](../../backend/app/game/graph.py#L73-L79))

Each time `werewolf_negotiation` finishes, LangGraph calls
`_route_werewolf_negotiation` on the *returned* state to decide where to go
next. If `wolf_index` has not reached the bounded council-turn limit, it routes
back to itself — same node, next wolf or revision. Otherwise it moves to the
deterministic `resolve_wolf_plan` node. `day_discussion` and `voting` use the identical pattern for
"one alive player per day/vote." This is the graph-native equivalent of a
`for` loop, and it composes cleanly with suspension: the graph can be
sitting on a self-edge, paused mid-loop, for an arbitrary amount of wall-clock
time, with no thread blocked and no state lost.

## `StateGraph`, nodes, and the shared state shape

```python
class GraphState(TypedDict):
    game: GameState

def build_graph(checkpointer):
    builder = StateGraph(GraphState)
    builder.add_node("assign_roles", nodes.assign_roles)
    ...
    builder.add_edge(START, "assign_roles")
    builder.add_conditional_edges("check_win_night", _route_after_night_check, [END, "start_day"])
    ...
    return builder.compile(checkpointer=checkpointer)
```
([graph.py:20-80](../../backend/app/game/graph.py#L20-L80))

`StateGraph` is generic over a state shape — here, a `TypedDict` with a
single key `"game"` holding the entire `GameState`. Every node is an
`async def node(state: dict, config: RunnableConfig) -> dict` function that
receives the current state and returns a (partial) update to merge back in.
Nodes are wired together with `add_edge` (unconditional) and
`add_conditional_edges` (a router function picks the next node, or `END`).
`builder.compile(checkpointer=...)` turns this description into a runnable
graph — and passing a checkpointer here is what makes suspension durable;
see [08-persistence-and-checkpointing.md](08-persistence-and-checkpointing.md).

Two nodes are registered *twice* under different names —
`check_win_night` / `check_win_vote` both run the same `nodes.check_win`
function ([graph.py:57, 63](../../backend/app/game/graph.py#L57)) — because
the same win-check logic is needed after both night and day, but a graph
needs distinct node *names* to route to distinct next-steps (`start_day` vs.
`start_night`). One function, two graph identities.

## The one rule that makes this safe with `interrupt()`: minimal nodes

```python
"""Human turns use `interrupt()`, which — per LangGraph's own docs — re-runs
a node **from the top** on resume. Every node here is therefore kept
minimal: one seat's turn per node execution, looped via conditional
self-edges (`route_*` functions in graph.py) rather than a Python `for` loop
with `interrupt()` calls mixed into it. A node with a `for` loop containing
both AI calls and a human `interrupt()` would re-run the AI calls (and their
side effects: MCP tool calls, DB writes) every time that human's turn
resumes...
"""
```
([nodes.py:1-12](../../backend/app/game/nodes.py#L1-L12))

This is the single most important design constraint in the whole
orchestration layer, and it's worth internalizing *before* reading
[03-human-in-the-loop-interrupt.md](03-human-in-the-loop-interrupt.md):
**a node that calls `interrupt()` gets re-executed from its first line every
time it resumes.** If `werewolf_negotiation` were a `for wolf in wolves:` loop with
`interrupt()` inside it, then wolf #2's answer arriving would re-run the
*entire loop* from wolf #1 — re-invoking wolf #1's already-completed AI call,
re-writing its DB row, re-emitting its SSE events, a second time. Every node
in `nodes.py` instead handles exactly **one seat's turn** and relies on the
graph's conditional self-edges to loop; that way, a re-run only ever repeats
the one turn currently in flight (in a way that's idempotent — see how the
human branch's `interrupt()` call is always the *first* thing awaited in a
node, so a resume with an answer has nothing else in that node to
re-execute before consuming it).

This rule directly shaped the pause feature's implementation in
[07-pausing-with-interrupt.md](07-pausing-with-interrupt.md), and is worth
keeping in mind any time you're tempted to add a loop inside a node here.
