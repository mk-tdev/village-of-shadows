# 10. Frontend: turning events into UI, and observing the agents

**Files:** [`frontend/lib/useGameStream.ts`](../../frontend/lib/useGameStream.ts),
[`frontend/components/DebugPanel.tsx`](../../frontend/components/DebugPanel.tsx),
[`frontend/components/GraphFlow.tsx`](../../frontend/components/GraphFlow.tsx),
[`backend/app/routers/graph.py`](../../backend/app/routers/graph.py)

## `useGameStream`: a reducer over SSE events, not a REST poll

```ts
export function useGameStream(sessionId: string): GameStreamState {
  const [game, setGame] = useState<GameState | null>(null);
  ...
  const gameRef = useRef<GameState | null>(null);

  useEffect(() => {
    const source = new EventSource(streamUrl(sessionId));
    source.addEventListener("state", (e) => {
      const data: GameState = JSON.parse((e as MessageEvent).data);
      gameRef.current = data;
      setGame(data);
    });
    source.addEventListener("log", (e) => {
      const entry: LogEntry = JSON.parse((e as MessageEvent).data);
      const current = gameRef.current;
      if (!current) return;
      if (current.log.some((existing) => existing.seq === entry.seq)) return;
      ...
    });
    ...
    return () => source.close();
  }, [sessionId]);

  return { game, active, connected, errorMessage, currentNode, metrics };
}
```
([useGameStream.ts](../../frontend/lib/useGameStream.ts))

The frontend never polls a "what's the state now" endpoint in a loop.
Instead, one `EventSource` is opened per game, and every named event type
the backend publishes (see
[09-sse-streaming-and-broadcast.md](09-sse-streaming-and-broadcast.md)) has
its own listener that folds the event into local React state — this is a
reducer, just spelled out as individual `addEventListener` calls instead of
a single `switch` inside a `useReducer`. `gameRef` (a `useRef` mirror of
`game`) exists because event handlers registered once at effect-setup time
would otherwise close over a stale `game` from the render that created
them; reading `gameRef.current` instead always gets the latest value.

Two things worth noticing in the `"log"` handler specifically:

- **Dedup by `seq`, not by suppressing one source.** A fast game (especially
  with the mock provider) can finish several log entries before the
  browser's `EventSource` even finishes connecting — so those entries can
  arrive *both* embedded in the initial `"state"` snapshot *and* again as
  queued `"log"` events. Rather than trying to suppress the backlog (which
  would break a genuine reconnect-after-refresh, which needs exactly that
  backlog), every log append checks whether that `seq` is already present
  and skips if so.
- **Structured log entries update player state directly.** A `"death"` log
  entry flips that player's card to dead in the same state update that adds
  the log line, rather than waiting for a full state re-fetch — the log
  entry itself carries `seat_id`, so the reducer can act on it immediately.

## The debug panel: making the orchestration itself visible

```tsx
/** Collapsible engineering debug panel: the live LangGraph orchestration
 * graph (introspected from the compiled graph itself... with the
 * currently-executing node highlighted from "node" SSE events) and a
 * per-agent token/latency metrics table (accumulated from "decision" SSE
 * events...). This is the part of the project meant to showcase the
 * agentic-engineering internals, not just play the game. */
```
([DebugPanel.tsx:8-14](../../frontend/components/DebugPanel.tsx#L8-L14))

This panel exists for a different audience than the rest of the UI: not
"someone playing Werewolf," but "someone who wants to see how the
multi-agent orchestration actually works while it runs." It has two halves,
each fed by a different concept from earlier in this guide:

**The graph-flow diagram is introspected, not hand-drawn.**

```python
@router.get("/structure")
async def get_structure(request: Request) -> dict:
    graph = request.app.state.graph.get_graph()
    nodes = [{"id": n.id, "name": n.name} for n in graph.nodes.values()]
    edges = [{"source": e.source, "target": e.target, "conditional": e.conditional} for e in graph.edges]
    return {"nodes": nodes, "edges": edges}
```
([graph.py](../../backend/app/routers/graph.py))

`GET /graph/structure` calls `.get_graph()` on the *actual compiled*
LangGraph app built in [main.py](../../backend/app/main.py) — the same
object that's running every game — and returns its real nodes and edges.
`GraphFlow.tsx` renders that data, and highlights whichever node the
`"node"` SSE event most recently named (emitted from `_sync` in
`nodes.py`, see [02](02-langgraph-state-machine.md)). Because the diagram
is generated from the graph's own structure instead of maintained as a
separate hand-drawn picture, it's *impossible* for the diagram to drift out
of sync with what `graph.py` actually builds — if someone adds a node or
changes an edge, the diagram updates itself with no separate doc to
remember to touch.

**The token/latency table accumulates from `"decision"` events.**

```ts
source.addEventListener("decision", (e) => {
  const data: DecisionEvent = JSON.parse((e as MessageEvent).data);
  setMetrics((prev) => {
    const existing = prev[data.seat_id];
    const merged: SeatMetrics = {
      ...
      calls: (existing?.calls ?? 0) + 1,
      input_tokens: (existing?.input_tokens ?? 0) + (data.input_tokens ?? 0),
      output_tokens: (existing?.output_tokens ?? 0) + (data.output_tokens ?? 0),
      last_latency_ms: data.latency_ms,
      estimated: data.estimated,
    };
    return { ...prev, [data.seat_id]: merged };
  });
});
```
([useGameStream.ts:80-97](../../frontend/lib/useGameStream.ts#L80-L97))

Every `"decision"` event (published from `_record_decision` in
`agent_turn.py` — see
[06-model-agnostic-adapters-and-tool-calling.md](06-model-agnostic-adapters-and-tool-calling.md))
carries that turn's provider, model name, latency, and token counts. The
frontend accumulates these *per seat* rather than replacing them, so the
debug table reads as a running total across the whole game — "seat 4 has
made 6 calls so far, 1,240 tokens in, 380 out" — not just the most recent
call. The `estimated` flag (`true` for mock-provider turns, since there's
no real API response to measure) surfaces in the UI as a small "est." badge
next to the model name, so it's honest about which numbers are real API
usage and which are a `len(text) // 4` guess.

## Why this pairing matters as a concept, not just a feature

Individually, "introspect the graph" and "log token usage" are both
unremarkable. Put together and streamed live, they're the two questions
someone auditing an agentic system actually asks first: *where is
execution right now*, and *what is each agent call costing*. Building a
debug view around exactly those two questions — rather than, say, a generic
log viewer — is what makes this panel double as a teaching tool for how the
whole system is wired, not just a game feature.
