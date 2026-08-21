# Codex Meetup Demo Guide

## Village of Shadows — three-minute live demo

**Format:** live demo, no slides or pitch

**Hard stop:** 3 minutes

**Core message:** LangGraph controls the world, the agents create the story, and the human sits inside the graph with them.

## Prepare before the meetup

Do not configure or start a new game on stage. Prepare one game until it is suspended at the human player's turn.

Open the same game session in two browser tabs:

1. **Game tab:** positioned at the council with a human action waiting.
2. **Engineering tab:** scrolled to the LangGraph diagrams, token/context table, and Live Activity feed.

Keep God Mode enabled. Use model configurations that have already passed the app's readiness check. The SSE implementation broadcasts an independent copy of every event to each connected tab, so both views remain live.

## Three-minute talk track

### 0:00–0:25 — Establish the idea

> This is Village of Shadows, a seven-player game of Werewolf. Six players are independent AI agents, and the seventh is me.
>
> Each AI seat can use a different model and has its own personality, secret role, private memory, and view of the game. This is not one model pretending to be six characters. These are six isolated agent contexts participating in one shared world.

Briefly point to the characters.

### 0:25–0:50 — Personas and private information

> Before the game begins, I configure each player's model, name, and personality. LangGraph then randomly assigns roles such as werewolf, seer, doctor, and villager.
>
> The application creates a persona from that combination. A sly werewolf is instructed to deceive and protect its teammate. A cautious seer knows it can investigate people. Those instructions are added only to that agent's private system context.
>
> God Mode lets us inspect stated rationale, roles, private notes, and suspicion changes that the other players cannot normally see.

Toggle God Mode off and on only if it will not interrupt the flow.

### 0:50–1:10 — The human is inside the graph

Point at the waiting human action.

> Right now, LangGraph is genuinely suspended because it is my turn. I am not supervising the agents from outside the workflow. I am one of the participants the graph is waiting for.
>
> When I submit this action, the graph resumes using LangGraph's interrupt and resume mechanism.

Submit the statement, vote, or night action.

### 1:10–1:35 — Live Activity

Switch to the engineering tab.

> Everything moving here is driven by live server-sent events. The backend publishes events when the orchestrator enters a node, when an agent starts its turn, when it opens an identity-bound MCP session, when it calls a tool, and when it commits a decision.
>
> The frontend reduces those events into this Live Activity feed. It is not polling, and these are not decorative log messages. They are emitted by the running orchestration.

Point to entries such as:

- `Orchestrator entered voting`
- `Mara is taking their turn`
- `Mara opened an MCP session`
- `Mara called MCP tool “submit_vote”`
- `Mara committed a decision`

### 1:35–2:00 — Graph execution

Point at the main graph.

> This diagram is introspected from the actual compiled LangGraph. It is not a separately maintained architecture diagram. The highlighted node is the node currently executing.
>
> The graph owns the rules of the world: role assignment, night actions, discussion order, voting, resolution, win conditions, and human interrupts. Conditional edges loop once for every living player.
>
> But LangGraph does not decide whom an agent trusts, investigates, protects, accuses, or eliminates. Those decisions belong to the agents.

### 2:00–2:30 — Context, history, and usage

Point at the per-seat subgraph and metrics table.

> Every AI turn enters a second LangGraph: the per-seat agent mind. One compiled mind graph is shared by all agents, but each seat receives a separate checkpoint thread.
>
> The persona is inserted once. Every later turn adds only what happened since that agent last acted. Its model responses, tool calls, results, and new briefings accumulate in its own conversation.
>
> Here, In and Out are cumulative token usage reported by the model provider. Mem is the number of messages currently stored in that agent's persistent conversation.

### 2:30–2:55 — Knowledge boundaries

> The orchestrator contains the full game state, but an agent never receives that raw state.
>
> Every model-facing briefing passes through a filtered agent view. Everyone sees the public conversation. A werewolf additionally knows its teammate. A seer sees only identities it has personally investigated. Private night actions and another agent's notebook never enter its context.
>
> Actions also go through identity-bound MCP tools and game-rule validation, so a model cannot simply vote twice, inspect an illegal target, or act as another player.

### 2:55–3:00 — Finish

> LangGraph controls the world. The agents create the story. And the human sits inside the graph with them.

Stop there.

## Technical explanation cheat sheet

### How is Live Activity shown?

`GameOrchestrator.publish()` copies named events into every connected subscriber's queue. The SSE endpoint streams them to the browser. `useGameStream` listens for `node`, `turn`, `mcp`, `decision`, `memory`, `belief_update`, and other event types and converts them into UI entries.

This is an event projection of the running system, not REST polling or a second logging pipeline.

### How is context usage shown?

Real model responses expose `usage_metadata`. The backend records input tokens, output tokens, latency, provider, and model, then publishes a `decision` event. The frontend accumulates these values per seat.

The `Mem` column is different: it counts messages in that seat's checkpointed conversation. Mock-provider token values use an explicit estimate based on text length.

Use this precise description:

> This shows usage telemetry and memory depth, not the percentage of the model's context window remaining.

### How are graph steps shown?

`GET /graph/structure` calls `get_graph()` on both compiled LangGraph applications. During execution, nodes read LangGraph's `langgraph_node` metadata and publish it through SSE. The frontend highlights the matching real graph node.

The large graph is the game orchestrator. The smaller graph is the persistent per-seat mind.

### How are personas derived?

The setup page supplies an editable name and personality, while the game graph randomly assigns a secret role. The backend combines those values into a role-aware system message containing:

- The player's name and personality
- The secret role and role-specific capabilities
- Short, in-character speaking constraints
- Werewolf deception and teammate knowledge, when applicable
- Instructions for private notes and evidence-backed suspicion scores

The persona is seeded once, on that seat's first AI turn, instead of being repeated on every call.

### How does each agent's context and history work?

The per-seat mind uses LangGraph's `add_messages` reducer. Every seat runs the same compiled graph under a private thread identifier:

```text
{game-session-id}:{seat-id}
```

LangGraph restores that thread before the turn and checkpoints the messages added by the briefing, model response, tool calls, and tool results. A cursor in game state lets the orchestrator send only public events that happened since the seat last acted.

### How is knowledge managed?

`build_agent_view(game, seat_id)` is the only model-facing view of game information. It supplies:

- The agent's own role
- Living players
- The non-private public transcript
- Its living werewolf teammate, when applicable
- Its own accumulated seer discoveries, when applicable

Private logs, another agent's notebook, and another agent's role knowledge are excluded. MCP connections are also bound to a server-issued seat identity, so a model cannot claim another seat when calling a tool.

### How does LangGraph manage the game?

There are two compiled graphs:

```text
Main game LangGraph
  Controls roles, phases, turn order, rules, resolution and interrupts
        ↓
Per-seat mind LangGraph
  Restores that agent's private conversation
        ↓
LLM + identity-bound MCP tools
  Makes and commits a validated decision
        ↓
SSE events
  Update the board, diagrams, metrics and Live Activity
```

The main graph moves through role assignment, night, resolution, discussion, voting, and win checks. Conditional self-edges process one living seat at a time. A human turn calls `interrupt()`; the submitted human action resumes the graph with a LangGraph `Command`.

The graph owns valid state transitions. Agents own behavioral choices.

## Handling live-demo delays

If a real model takes several seconds, point to the highlighted `deliberate` node and say:

> This highlighted deliberate node is the real model call currently running. The latency we are waiting for will appear in the metrics when the decision completes.

If a provider fails, keep a second pre-run session available. Do not spend the three-minute slot editing API keys or model IDs.

## Implementation references

- [`backend/app/game/graph.py`](../backend/app/game/graph.py) — main LangGraph state machine
- [`backend/app/game/seat_mind.py`](../backend/app/game/seat_mind.py) — per-seat persistent agent graph
- [`backend/app/game/nodes.py`](../backend/app/game/nodes.py) — personas, briefings, turns, and human interrupts
- [`backend/app/game/views.py`](../backend/app/game/views.py) — partial-observability boundary
- [`backend/app/game/orchestrator.py`](../backend/app/game/orchestrator.py) — graph execution, SSE broadcast, pause, and resume
- [`backend/app/game/agent_turn.py`](../backend/app/game/agent_turn.py) — model calls, MCP tools, and usage telemetry
- [`frontend/lib/useGameStream.ts`](../frontend/lib/useGameStream.ts) — SSE event reducer
- [`frontend/components/DebugPanel.tsx`](../frontend/components/DebugPanel.tsx) — graphs, metrics, Live Activity, notebooks, and beliefs
