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
`awaiting_input` if a human turn is pending. After that it just drains
`queue.get()` in a loop, translating whatever the orchestrator publishes
into SSE frames, checking every 15 seconds whether the client disconnected
so the generator doesn't loop forever after the browser tab closes.

## Publishing events from inside a graph node

Graph nodes never write to the HTTP response directly — they call
`orch.publish(event, data)` (see e.g. `_emit_turn`,
[nodes.py:56-57](../../backend/app/game/nodes.py#L56-L57), or the "decision"
event in `agent_turn.py`,
[agent_turn.py:240-250](../../backend/app/game/agent_turn.py#L240-L250)),
and the orchestrator is what actually gets the data to any listening
browser. This indirection matters for the same reason `_sync` exists (see
[08](08-persistence-and-checkpointing.md)): a node has no idea whether zero,
one, or several browser tabs are currently connected to this game's stream,
and it shouldn't need to.

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
([orchestrator.py:37-56](../../backend/app/game/orchestrator.py#L37-L56))

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
([orchestrator.py:30-36](../../backend/app/game/orchestrator.py#L30-L36))

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
