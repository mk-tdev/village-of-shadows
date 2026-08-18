# Village of Shadows — Concept Guide

This is a learning write-up, not API reference docs. Each file explains one
agentic-AI-engineering concept that shows up in this codebase, why it's built
the way it is, and what breaks if you build it the naive way instead. Every
file points at real file:line locations in `backend/` and `frontend/` so you
can read the actual code alongside the explanation.

Read them in order — later ones assume the earlier ones. If you only have
time for a few, read 02, 03, 05, 09, and 12; those are the concepts most
specific to multi-agent orchestration rather than general web-app plumbing.

Those `file:line` citations are checked, not trusted:

```bash
python docs/concepts/check_citations.py
```

verifies each one still contains the code the doc quotes beside it, so a
citation that drifted when the code moved fails loudly instead of quietly
pointing a reader at the wrong function.

**A note on how to read these.** Roughly half of each doc is the mechanism and
half is what went wrong building it — the naive version, the symptom, the root
cause, the fix. That's deliberate: the pitfalls are where the actual learning
is, because most of them are not specific to Werewolf or to LangGraph. "State
you mutate in place isn't a point-in-time snapshot" (13), "an idempotency guard
has to be applied per effect, not per operation" (12), and "a single shared
consumer queue silently loses events once there can be two consumers" (09) are
all general lessons that happened to surface here.

1. [FastAPI app shape](01-fastapi-app-shape.md) — routers, lifespan, one
   shared process, dependency injection via `app.state`.
2. [LangGraph as the game's state machine](02-langgraph-state-machine.md) —
   why the orchestration is a graph of nodes and edges instead of a `while`
   loop, and the one rule (minimal nodes) that makes interrupts safe.
3. [Human-in-the-loop with `interrupt()`](03-human-in-the-loop-interrupt.md) —
   how a human player's turn genuinely suspends the graph with no polling,
   and how `Command(resume=...)` picks it back up.
4. [Partial observability: `build_agent_view`](04-partial-observability-agent-view.md) —
   the one function that stands between "the model knows everything" and
   "the model knows only what its character would know."
5. [MCP tool server with connection-bound identity](05-mcp-tool-server-identity.md) —
   why every agent action goes through a real MCP tool call, how the
   server knows *which seat* is calling without ever asking the model, and
   a real double-mount routing bug this exact setup hit (and how the test
   that should have caught it didn't).
6. [Model-agnostic adapters and the tool-calling loop](06-model-agnostic-adapters-and-tool-calling.md) —
   swapping Claude/OpenAI/Gemini/Ollama/mock behind one interface, and why
   "let the model call a tool" beats "ask the model for JSON and parse it."
7. [Controlling a live game: starting, pausing, and stopping](07-pausing-with-interrupt.md) —
   why a game doesn't start advancing the instant it's created (the
   `started` flag and `begin_game`), reusing the human-turn suspend/resume
   machinery for pause/continue, the subtle ordering bug that reuse can
   cause if you're not careful, and `stop()`'s contrasting mechanism
   (`Task.cancel()`) for ending a game outright instead of pausing it.
8. [Two kinds of persistence](08-persistence-and-checkpointing.md) — the
   SQLite *checkpointer* that makes `interrupt()` durable vs. the SQLite
   *tables* that record game history for humans to read later. Easy to
   conflate; they solve different problems.
9. [Streaming state out over SSE](09-sse-streaming-and-broadcast.md) — why
   Server-Sent Events instead of WebSockets, the broadcast/pub-sub redesign
   that fixed a real race condition this project hit, and three separate
   catch-up-on-connect fixes (current node, phase/round, and player roles)
   for browsers that connect before or during a game.
10. [Frontend: turning events into UI](10-frontend-observability.md) — the
    `useGameStream` reducer; the debug panel, now permanently embedded
    rather than a click-to-open overlay; a hand-rolled drag/zoom canvas for
    the graph diagram (and the stale-ref race it crashed on); and a live
    activity feed that narrates node transitions, turns, MCP calls, and
    decisions as they happen.
11. [Application walkthrough](11-application-walkthrough.md) — trace one
    complete turn, end to end, through every layer above, using a concrete
    example (an AI werewolf's night action).
12. [Giving each agent a memory](12-per-seat-agent-memory-subgraphs.md) — how
    each seat got a persistent conversation spanning the whole game (one
    subgraph, one checkpoint thread per seat), why the orchestrator sends
    only what changed since that seat last acted, and the memory-corrupting
    replay bug that appears the moment agent state lives outside the main
    graph's rollback.
13. [Time travel and the post-game report](13-time-travel-and-the-post-game-report.md) —
    reconstructing a finished game's whole execution history from the
    checkpoints that already had to exist, what that reveals for free
    (self-edges counted, cost localised by timestamp), and why a checkpoint
    here is *not* a clean point-in-time snapshot when nodes mutate shared
    state in place.
14. [Agent-authored private notes](14-agent-authored-private-notes.md) — how
    connection-bound agents maintain an immutable, evidence-linked belief
    ledger without leaking notes across seats or duplicating replayed writes.
