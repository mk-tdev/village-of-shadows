# 9. Streaming state out over SSE, and a real race condition it hit

**Files:** [`backend/app/routers/stream.py`](../../backend/app/routers/stream.py),
[`backend/app/game/orchestrator.py`](../../backend/app/game/orchestrator.py),
[`frontend/lib/useGameStream.ts`](../../frontend/lib/useGameStream.ts)

## Why SSE instead of WebSockets

The original design plan called for WebSockets, but this project uses
Server-Sent Events instead, because the data actually only flows in one
direction that matters for *pushing* updates: server → browser. Human input
already goes out through its own ordinary `POST /games/{id}/input`
([03](03-human-in-the-loop-interrupt.md)) — it never needed to share a
channel with the push side. SSE is plain HTTP (`text/event-stream`), works
through an ordinary `fetch`/`EventSource`, needs no upgrade handshake, and
reconnects automatically on the browser side by default. Once you notice
you don't need bidirectional messaging, SSE is the simpler tool for exactly
what's left: "the server has updates, stream them to whoever's listening."

## The event stream, from the backend's side

```python
@router.get("/{session_id}/stream")
async def stream(session_id: str, request: Request) -> EventSourceResponse:
    orch = registry.get(session_id)

    async def event_generator():
        queue = orch.subscribe()
        try:
            yield {"event": "state", "data": json.dumps(orch.state.model_dump())}
            if orch.state.awaiting is not None:
                yield {"event": "awaiting_input", "data": json.dumps(orch.state.awaiting.model_dump())}
            if orch.current_node is not None:
                yield {"event": "node", "data": json.dumps({"node": orch.current_node})}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    continue
                yield {"event": event["event"], "data": json.dumps(event["data"])}
        finally:
            orch.unsubscribe(queue)

    return EventSourceResponse(event_generator())
```
([stream.py](../../backend/app/routers/stream.py))

On connect, the route immediately yields a full `"state"` snapshot (so a
browser that connects mid-game — or reconnects after a refresh — doesn't
have to wait for the next event to know anything) plus the current
`awaiting_input` if a human turn is pending, and the current `"node"` if
the graph has one (see the next section for why that last one was added
after the fact). After that it just drains `queue.get()` in a loop,
translating whatever the orchestrator publishes into SSE frames, checking
every 15 seconds whether the client disconnected so the generator doesn't
loop forever after the browser tab closes.

Human prompts have an explicit closing event too. Accepting a statement, vote,
or night action publishes `input_accepted` with the expected seat and input
kind. `useGameStream` clears `game.awaiting` only when both fields match the
currently displayed prompt. This removes the control immediately while the
graph continues and avoids a stale or reconnected event closing a newer turn.
The controls also lock against a stable round/phase prompt key, so receiving
the same pending prompt as a newly parsed object cannot re-enable it.

## A second staleness bug the same "catch-up on connect" idea fixes

The `"node"` catch-up line above wasn't there from the start, and its
absence caused a real, if minor, bug: the debug panel's graph diagram (see
[10-frontend-observability.md](10-frontend-observability.md)) highlights
whichever node a `"node"` SSE event most recently named. That's fine for a
browser that's been connected since the game started — it's received every
transition. But a browser that connects *mid-game* (a page refresh, or
opening the game page again after navigating away) has received none of
them, so the highlight sits at whatever its initial value was — visibly
wrong the moment the graph is paused on a human's turn, since no further
`"node"` event will fire until that human answers and there's nothing to
correct the stale highlight in the meantime.

The fix follows the exact same shape as `pause_requested`
(see [07](07-pausing-with-interrupt.md)): a plain attribute on
`GameOrchestrator`, not `GameState`, updated every time a node actually
runs:

```python
self.current_node: str | None = None
```
([orchestrator.py:73-79](../../backend/app/game/orchestrator.py#L73-L79))

```python
node_name = config.get("metadata", {}).get("langgraph_node")
if node_name:
    orch.current_node = node_name
    orch.publish("node", {"node": node_name, "phase": game.phase, "round": game.round})
```
([nodes.py:73-76](../../backend/app/game/nodes.py#L73-L76))

`_sync` (see [02](02-langgraph-state-machine.md)) already ran on every node
execution to re-point `orch.state` — recording the node name there too was
a one-line addition, not a new mechanism. The connection route then just
checks it, exactly like it already checked `orch.state.awaiting`:
if a node has run at all, a freshly-connecting browser catches up
immediately instead of waiting for a transition that may not come for a
while. Verified directly: created a game via the API, let a real (Ollama)
turn run partway, then opened the game page fresh — the graph highlighted
the correct in-progress node on first paint, matched against the backend's
own `/state` response.

The `phase`/`round` fields alongside `"node"` were added later, for a
related but distinct reason than the graph highlight: they're the *only*
place a connected browser learns those values after its one-time initial
`"state"` snapshot, since nothing else updates them on the frontend. See
[10-frontend-observability.md](10-frontend-observability.md) for the real
bug this caused — the lobby's Start Game prompt (a modal overlay at the time;
it's since moved inline, see [11](11-application-walkthrough.md)) never went
away once the game actually started, because `game.phase` was frozen at
`"lobby"` from the snapshot with no live event ever correcting it.

## A third staleness bug: roles never reach an already-connected browser

The exact same root cause hit a third field, with a more visible symptom.
`game.players` — including each player's `role` — otherwise only ever comes
from that one-time initial `"state"` snapshot too. Before `begin_game`
existed (see [07](07-pausing-with-interrupt.md)), a game usually started
advancing the instant it was created, so `assign_roles` had frequently
already run by the time a browser's `EventSource` opened — the snapshot
"by luck" often already had roles baked in. Once starting became a
deliberate, later action the human takes, the snapshot is now taken
*while the game is still `"lobby"`*, always before any role exists, and
nothing ever refreshed `game.players` afterward.

The visible symptom: "God view" ([10](10-frontend-observability.md)) is
supposed to reveal every seat's role and role icon the instant it's
toggled on. Instead, every seat showed no role at all until the page was
manually refreshed — a refresh re-fetches a `"state"` snapshot taken
*after* `assign_roles` had already run, so it "fixed itself" the same
misleading way the stuck lobby prompt in the previous section did before
its own fix.

The fix follows the same shape again — publish the data a node just
computed, right when it computes it, rather than waiting for a browser to
eventually reconnect and re-fetch it:

```python
orch.publish("roles_assigned", {"players": [p.model_dump() for p in game.players]})
```
([nodes.py:242](../../backend/app/game/nodes.py#L242))

```typescript
source.addEventListener("roles_assigned", (e) => {
  const data: { players: Player[] } = JSON.parse((e as MessageEvent).data);
  const current = gameRef.current;
  if (!current) return;
  const next: GameState = { ...current, players: data.players };
  gameRef.current = next;
  setGame(next);
});
```
([useGameStream.ts:133-140](../../frontend/lib/useGameStream.ts#L133-L140))

Three fields (`current_node`, `phase`/`round`, now `players`) have hit this
exact same shape of bug for the exact same reason: `begin_game` decoupled
"a browser is connected" from "the game has started," so the one-time
initial snapshot increasingly under-represents reality by the time
anything interesting has happened. The general lesson isn't "add another
one-off event per field" — it's that *any* piece of `GameState` a node
mutates needs either its own catch-up event like this, or to be re-sent
wholesale (a fresh `"state"` broadcast) whenever a node changes it. This
project has so far reached for the narrower, per-field event each time a
new staleness bug was actually hit, rather than broadcasting the full
`GameState` on every node transition — cheaper per-event, at the cost of
being the kind of bug that only surfaces one missed field at a time.

FE-02's private relationship ledger follows a related but deliberately
separate pattern: persisted history is sent as a `belief_snapshot` when an
observer connects, while each append publishes a narrow `belief_update`.
Those events feed only the God Mode observer UI; agents read their own rows
through connection-bound MCP tools rather than through SSE.

## A fourth staleness bug: the human seer's result existed only on the server

Seer investigations exposed the same snapshot-versus-delta problem in a
more subtle form. `apply_night_action` correctly added the discovered role
to `GameState.seer_knowledge`, and its private log entry even described the
result, but an already-connected browser received neither a new state
snapshot nor a structured update for that nested map. With God Mode off,
the human seer therefore had no way to see the identity they had just
investigated. Refreshing happened to make it appear because reconnecting
sent a newer `"state"` snapshot.

The action now publishes a narrow `"seer_result"` delta at the moment the
knowledge is recorded:

```python
orch.publish(
    "seer_result",
    {"seat_id": seat_id, "target": target.name, "role": target.role},
)
```
([actions.py](../../backend/app/game/actions.py))

The frontend folds that event into only the named seer's nested knowledge
map. `GameView` then gives player cards knowledge from the human seat only,
and `PlayerCard` treats that investigated role as visible even when God Mode
is disabled. This separation matters: the event updates the browser's live
state, while the rendering rule decides which part of that state belongs in
the ordinary player view. God Mode remains an observability feature, not a
requirement for receiving legitimate role-specific information.

This is also why a private prose log is not a sufficient state protocol.
The UI should not parse a sentence such as “discovers they are a werewolf”
to reconstruct game state; a stable event with explicit `seat_id`, `target`,
and `role` fields keeps transport, state reduction, and presentation
independent.

## Publishing events from inside a graph node

Graph nodes never write to the HTTP response directly — they call
`orch.publish(event, data)` (see e.g. `_emit_turn`,
[nodes.py:72-73](../../backend/app/game/nodes.py#L72-L73), or the "decision"
event in `agent_turn.py`,
[agent_turn.py:306-316](../../backend/app/game/agent_turn.py#L306-L316) —
there's also a `"mcp"` event published from the same file on every MCP
session bind and tool call, see
[06](06-model-agnostic-adapters-and-tool-calling.md)),
and the orchestrator is what actually gets the data to any listening
browser. This indirection matters for the same reason `_sync` exists (see
[08](08-persistence-and-checkpointing.md)): a node has no idea whether zero,
one, or several browser tabs are currently connected to this game's stream,
and it shouldn't need to.

The same `publish` is reached from a place that *isn't* a node of this graph:
the per-seat mind subgraph ([12](12-per-seat-agent-memory-subgraphs.md)) emits
two events of its own — `"mind_node"` as each of its nodes executes, and
`"memory"` after each turn, carrying how many messages that agent's
conversation now holds
([seat_mind.py:315-320](../../backend/app/game/seat_mind.py#L315-L320)).

Both reach the orchestrator exactly the way a game node's events do, and needed
no change at all on the stream side. That's the payoff of `publish` being a
plain fan-out method rather than something wired into the node lifecycle: an
entire second graph started reporting into the same stream without the SSE
layer knowing anything had changed. The one rule that *did* matter is that
they're separate event names rather than reuses of `"node"` — a browser that
folded them together would show a mind's `deliberate` as the game graph's
current node, which it isn't.

## The bug this project actually hit: a shared queue loses events under a real race

The first implementation gave each `GameOrchestrator` **one** shared
`asyncio.Queue`, and every SSE connection just drained the same queue.
That's the natural first design — and it silently loses events, for a
subtle reason that only shows up under a specific, real-world race:

React's `useEffect` (in `useGameStream.ts`) can run **twice** for the same
component mount — this happens in dev mode, and can also happen from
fast-refresh or a rapid re-render — creating a second `EventSource` pointed
at the same `/stream` URL before the first one's connection has actually
been torn down server-side. Confirmed directly by inspecting network
requests in the browser: two `GET` requests to the identical stream URL,
one resolving `200 OK`, the other `net::ERR_ABORTED`. With one shared
queue, the *doomed* connection — the one about to be aborted — can still
successfully call `queue.get()` and pull a real event (say, the `"resumed"`
event after a pause) out from under the connection that actually survives.
That event is now gone forever; the surviving connection never sees it. The
observable symptom was exactly this: the frontend stuck showing "Game
paused" even though `GET /games/{id}/state` confirmed the backend had
correctly resumed — the `"resumed"` SSE event had been consumed by a
connection nobody was listening to anymore.

## The fix: broadcast/pub-sub, not a shared queue

```python
self._subscribers: list[asyncio.Queue] = []

def subscribe(self) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    self._subscribers.append(queue)
    return queue

def unsubscribe(self, queue: asyncio.Queue) -> None:
    if queue in self._subscribers:
        self._subscribers.remove(queue)

def publish(self, event: str, data: dict) -> None:
    for queue in self._subscribers:
        queue.put_nowait({"event": event, "data": data})
```
([orchestrator.py:66-102](../../backend/app/game/orchestrator.py#L66-L102))

Every SSE connection now gets its **own independent queue** via
`subscribe()`, and `publish()` fans an event out to *every* subscriber's
queue, not one shared queue that any connection might drain from. This
makes the double-connection race harmless by construction: the doomed
connection still gets its own copy of every event delivered to its own
queue, and simply never gets read from again once
`stream.py`'s `finally: orch.unsubscribe(queue)` runs — it can no longer
*steal* an event meant for the surviving connection, because there's no
shared resource left for it to steal from.

```python
# Broadcast fan-out, not a single shared queue: every /stream connection
# gets its own independent queue via subscribe(). A single shared queue
# would let a doomed, about-to-be-aborted connection... steal events out
# from under the connection that actually survives -- each subscriber
# getting its own copy makes that race harmless.
```
([orchestrator.py:59-65](../../backend/app/game/orchestrator.py#L59-L65))

The general lesson: a single shared consumer queue is only safe for
fan-*out* delivery if you can guarantee there's ever exactly one consumer.
The instant more than one connection can legitimately (even if
transiently, even if one is about to die) exist for the same producer,
"shared queue" quietly becomes "whichever consumer happens to call `.get()`
first wins" — which is a data-loss bug, not a performance concern.
Per-subscriber queues plus explicit `subscribe`/`unsubscribe` is the
standard fix, and it's a pattern worth reaching for any time you're
streaming the same live data to a set of listeners whose membership can
change while events are flowing.
