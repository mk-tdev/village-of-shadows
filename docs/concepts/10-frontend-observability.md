# 10. Frontend: turning events into UI, and observing the agents

**Files:** [`frontend/lib/useGameStream.ts`](../../frontend/lib/useGameStream.ts),
[`frontend/components/DebugPanel.tsx`](../../frontend/components/DebugPanel.tsx),
[`frontend/components/GraphFlow.tsx`](../../frontend/components/GraphFlow.tsx),
[`frontend/components/CouncilTable3D.tsx`](../../frontend/components/CouncilTable3D.tsx),
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

  return {
    game, active, connected, errorMessage, currentNode,
    mindNode, mindNodeCounts, metrics, activity,
  };
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

The same reducer rule applies to private knowledge that changes after the
initial snapshot. A `"seer_result"` event carries the investigating seat,
target name, and discovered role; its listener immutably merges that value
into the correct nested `seer_knowledge` map
([useGameStream.ts](../../frontend/lib/useGameStream.ts)). `GameView` reads
only the human seer's map and passes each investigated role to `PlayerCard`,
which reveals it even when God Mode is off
([GameView.tsx](../../frontend/components/GameView.tsx),
[PlayerCard.tsx](../../frontend/components/PlayerCard.tsx)). This keeps two
different visibility rules distinct: God Mode may reveal every role for
observability, while a seer investigation reveals only knowledge the human
legitimately earned during play.

## The 3D chamber is another projection of state

The council table in [`CouncilTable3D.tsx`](../../frontend/components/CouncilTable3D.tsx)
does not own game logic. `GameView` projects the same streamed `GameState`
used by the ordinary player cards into a smaller scene model: living status
controls each candle, the current turn controls the glowing seat, the phase
changes the light and fog, and the existing role-visibility rule decides
whether a role artifact is present. In particular, turning God Mode off does
not make the 3D layer a back door for secret roles; it receives only the
human player's own role, public death reveals, and roles legitimately learned
by a human seer.

The scene is loaded with a client-only dynamic import, so Three.js and the
renderer are not part of the initial setup/game bundle. It also detects WebGL
support and honors reduced-motion preferences. The chamber can be collapsed;
doing so unmounts its canvas instead of hiding an active render loop, returning
the GPU work as well as the screen space. Player names are drawn into small
local canvas textures above their portraits, so edited names stay legible in
the 3D scene without another font or network dependency. Drifting embers, an
animated ritual light, active-seat rings, and candle light make the chamber
feel alive, but all animation observes the same reduced-motion preference.
If either the code chunk, textures, or WebGL presentation is unavailable, the
normal cards, feed, controls, and orchestration observability remain the
authoritative interface; the 3D chamber is an atmospheric visualization,
never a dependency of play.

## The debug panel: making the orchestration itself visible

```tsx
/** Engineering debug panel, embedded directly in the page (not a sliding
 * overlay) so the live LangGraph orchestration graph (introspected from the
 * compiled graph itself -- see routers/graph.py -- with the
 * currently-executing node highlighted from "node" SSE events) and the
 * per-agent token/latency metrics table (accumulated from "decision" SSE
 * events emitted in agent_turn.py) are both visible to watch update live
 * while a game plays, with no click required to reveal them. This is the
 * part of the project meant to showcase the agentic-engineering internals,
 * not just play the game. */
```
([DebugPanel.tsx:33-41](../../frontend/components/DebugPanel.tsx#L33-L41))

This panel exists for a different audience than the rest of the UI: not
"someone playing Werewolf," but "someone who wants to see how the
multi-agent orchestration actually works while it runs." It's worth being
explicit about a design choice baked into that docstring: earlier this panel
was a collapsible slide-in overlay you had to click a floating button to
open. It's now a plain embedded section of the page, always rendered, no
toggle — because "click to reveal" is the wrong default for something meant
to be watched continuously *while a game plays*, not inspected occasionally
after the fact. The panel has three parts, each fed by a different concept
from earlier in this guide:

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

**A second diagram, for the second graph.** Once each seat gained a
persistent agent subgraph ([12](12-per-seat-agent-memory-subgraphs.md)), this
panel was quietly telling half the story: it showed the orchestration and
omitted the agents' own reasoning loop entirely. `/graph/structure` now
reports both compiled graphs, and the seat-mind one renders below the main
diagram via `SeatMindFlow.tsx` — a separate, deliberately simpler component.
That's a judgement call worth naming: `GraphFlow` carries a hand-positioned
layout table for 15 nodes plus the pan/zoom pointer handling described below,
and the mind graph is four nodes in a straight line. Parameterising a working
component with a fiddly drag implementation, to gain nothing a reader would
see, is a worse trade than a second small renderer that shares its CSS
classes.

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
([useGameStream.ts:245-263](../../frontend/lib/useGameStream.ts#L245-L263))

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

The table's `Mem` column comes from a *different* event — `"memory"`, emitted
per seat after each turn ([12](12-per-seat-agent-memory-subgraphs.md)) — and
its handler in `useGameStream.ts` **merges** into the same per-seat record
rather than replacing it. That merge is load-bearing rather than defensive: a
`"memory"` event carries only a message count, so overwriting the record would
wipe the provider/model/token fields only `"decision"` events know about, and
it can arrive for a seat that has no metrics row yet. Two independent event
types feeding one table row is the case where a reducer has to be written as
an update, not an assignment.

**The live activity feed turns the same events into a chronological log.**

The graph diagram answers "where is execution right now" and the metrics
table answers "what has each agent cost so far" — but neither answers "what
is happening, in order, right now," which is exactly what someone watching
an agent system actually wants to follow moment to moment: whose turn it
is, when the orchestrator moves between nodes, when an MCP session opens,
which tool gets called, and when a decision finally lands. Rather than a
fourth SSE event type, the feed is built entirely by re-reading events the
hook already receives for other reasons — `"node"`, `"turn"`, and
`"decision"` — plus one new one, `"mcp"`, added specifically for this (see
[06-model-agnostic-adapters-and-tool-calling.md](06-model-agnostic-adapters-and-tool-calling.md)
for where it's published):

```ts
function pushActivity(kind: ActivityEntry["kind"], text: string) {
  activityIdRef.current += 1;
  const entry: ActivityEntry = { id: activityIdRef.current, kind, text };
  setActivity((prev) => [entry, ...prev].slice(0, MAX_ACTIVITY_ENTRIES));
}
...
source.addEventListener("mcp", (e) => {
  const data: McpEvent = JSON.parse((e as MessageEvent).data);
  pushActivity(
    "mcp",
    data.action === "bind"
      ? `${data.name} opened an MCP session (${data.phase})`
      : `${data.name} called MCP tool “${data.tool}”`
  );
});
```
([useGameStream.ts:77-81](../../frontend/lib/useGameStream.ts#L77-L81), [235-243](../../frontend/lib/useGameStream.ts#L235-L243))

Each existing listener (`"turn"`, `"node"`, `"decision"`) got one extra line
calling `pushActivity(...)` alongside whatever it already did — the feed is
additive to logic that was already there, not a parallel system. Entries
are capped at `MAX_ACTIVITY_ENTRIES` (60) and prepended newest-first, so the
feed reads like a live ticker rather than an ever-growing page. In
[DebugPanel.tsx](../../frontend/components/DebugPanel.tsx), this renders as
a plain list appended *below* the existing metrics table, in space that was
previously just empty — the graph and metrics table markup are untouched;
the feed is a pure addition sharing the same column.

## Pan and zoom without a pan/zoom library

The graph diagram is a fixed-size SVG (`520×740`) hand-positioned to match
the real node layout (see [02](02-langgraph-state-machine.md)) — with 14+
nodes stacked vertically, it doesn't fit legibly at any one fixed scale, so
[`GraphFlow.tsx`](../../frontend/components/GraphFlow.tsx) implements its
own drag-to-pan, scroll-to-zoom canvas rather than pulling in a diagramming
library for a graph this small and static.

The trick that keeps the math simple: instead of manipulating the SVG's
`viewBox` (which would mean converting every mouse position between screen
pixels and viewBox units), the pan/zoom state is applied as a plain CSS
`transform` on the SVG element itself, with `transform-origin: 0 0`:

```tsx
<svg
  className="graph-flow-svg"
  width={VIEW_W}
  height={VIEW_H}
  viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
  style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}
>
```
([GraphFlow.tsx:186-192](../../frontend/components/GraphFlow.tsx#L186-L192))

Because `translate` is applied in the *parent's* screen-pixel coordinate
system (CSS composes `translate(...) scale(...)` as translate-after-scale),
a pointer drag's `(dx, dy)` in screen pixels maps straight onto `(view.x,
view.y)` with no unit conversion at all, regardless of the current zoom
level:

```tsx
const drag = dragRef.current;
if (!drag) return;
const dx = e.clientX - drag.startClientX;
const dy = e.clientY - drag.startClientY;
setView((v) => ({ ...v, x: drag.startX + dx, y: drag.startY + dy }));
```
([GraphFlow.tsx:138-142](../../frontend/components/GraphFlow.tsx#L138-L142))

Zooming toward a fixed point (the cursor, on scroll; the container's center,
on the `+`/`−` buttons) uses the standard "keep that point's screen
position fixed while scale changes" formula — convert the target point to
*pre-transform* local coordinates at the old scale, then solve for the new
translate that puts the same local point back under the same screen
position at the new scale:

```tsx
const zoomToward = useCallback((factor: number, screenX: number, screenY: number) => {
  setView((v) => {
    const kNew = clampScale(v.k * factor);
    const localX = (screenX - v.x) / v.k;
    const localY = (screenY - v.y) / v.k;
    return { x: screenX - kNew * localX, y: screenY - kNew * localY, k: kNew };
  });
}, []);
```
([GraphFlow.tsx:103-110](../../frontend/components/GraphFlow.tsx#L103-L110))

A `fitView()` helper runs once when the graph data first arrives, measuring
the container via `getBoundingClientRect()` and picking a scale that fits
the whole diagram (`Math.min(rect.width / VIEW_W, rect.height / VIEW_H)`,
[GraphFlow.tsx:86-95](../../frontend/components/GraphFlow.tsx#L86-L95)) —
the same "⤾ fit to view" button re-runs it on demand after you've zoomed in
and want to reorient.

**A bug this actually hit, worth knowing if you build something similar:**
the first version read `dragRef.current!.startX` *inside* the `setView`
updater callback. That's a real race — React can batch and defer that
updater's execution until *after* a `pointerup` in the same gesture has
already run `endDrag()` and set `dragRef.current = null`, so the `!`
non-null assertion throws with nothing to catch it, crashing the page
mid-drag. The fix is the `const drag = dragRef.current; if (!drag) return;`
guard shown above — capture the snapshot into a local *before* handing a
closure to `setState`, never re-read a mutable ref from inside a state
updater that might run later than you think.

## Why these three pieces matter together, not just individually

"Introspect the graph," "log token usage," and "narrate what's happening
live" are each unremarkable alone. Together, they're the three questions
someone auditing an agentic system actually asks: *where is execution right
now*, *what is each agent call costing*, and *what, exactly, just
happened*. Building a debug view around those three questions — rather
than, say, a generic log viewer — is what makes this panel double as a
teaching tool for how the whole system is wired, not just a game feature.
