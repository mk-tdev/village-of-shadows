# Village of Shadows

A 7-seat multi-agent Werewolf game — FastAPI + LangGraph orchestrator, a real
MCP tool server, SQLite persistence, and a Next.js frontend driven over SSE.
Full design rationale lives in [village-of-shadows-plan.md](village-of-shadows-plan.md);
`werewolf_game.html` is the original single-file client-side prototype this
replaces.

## Running it

One-time setup:

```bash
cd backend && uv sync && cp .env.example .env && cd ../frontend && pnpm install && cp .env.local.example .env.local
```

(Fill in API keys in `backend/.env` if you have them — optional, see below.)

Then, from the repo root:

```bash
./start.sh
```

That runs the backend on **:8000** and the frontend on **:4001**, logging to
`logs/` and recording PIDs to `.run/`. Open `http://localhost:4001`, pick which
seat you want to play, and hit **Start Game**.

To stop everything:

```bash
./stop.sh
```

`stop.sh` kills by recorded PID tree, then sweeps by port and by process
pattern — `uvicorn --reload` and `pnpm dev` each fork children that survive a
plain kill of the top-level process, which otherwise leaves the ports held.

<details>
<summary>Running the two servers manually instead</summary>

```bash
cd backend && uv run uvicorn app.main:app --reload   # :8000
cd frontend && pnpm dev                              # :3000
```

Both `:4001` and `:3000` are in `CORS_ORIGINS` (`backend/.env`), so either port
works. If you serve the frontend from any *other* port, add that origin there
too — otherwise the page loads but every API call is blocked by the browser,
which looks like a broken backend rather than a CORS mismatch.

</details>

## Playing without any API key

Every AI seat defaults to `provider: "mock"` in the control panel. The mock
provider skips calling a real model entirely and picks a random legal action
instead — but it still runs through the exact same MCP tool call and SQLite
persistence path a real model would, so the whole system (orchestrator,
interrupts, tool validation, logging) is exercisable with zero setup. Swap a
seat to `claude` / `openai` / `gemini` / `ollama` and give it a real
`model_name` once you have the matching API key in `backend/.env`. The model
field is a free-text combobox with suggestions per provider, covering
flagship/cheap/thinking-capable tiers — Claude's suggestions are verified
against Anthropic's current model catalog; OpenAI's and Gemini's are
best-effort and worth double-checking against each provider's own docs
before relying on them (`frontend/lib/seatDefaults.ts`).

## Debug panel

The "Debug" pill in the bottom-right of the live game view opens a panel with
two things meant to showcase the agentic-engineering internals, not just the
game itself:

- **LangGraph orchestration flow** — the actual compiled graph, introspected
  live via `GET /graph/structure` (`graph.get_graph()`, not a hand-drawn
  diagram), with the currently-executing node highlighted in real time from
  a `node` SSE event emitted on every node entry (see `game/nodes.py`'s
  `_sync` and `routers/graph.py`).
- **Per-agent token & context usage** — a live table of input/output tokens,
  call count, and latency per seat, accumulated from `decision` SSE events
  (`game/agent_turn.py`). Real providers report actual `usage_metadata` from
  the model response; the `mock` provider estimates tokens from text length
  (~4 chars/token) since there's no real API call to measure — those rows
  are marked "est."

## Tests

```bash
cd backend
uv run pytest
```

Covers: partial-observability leakage (`test_views.py`), a full night → day
→ vote → win game loop via the mock provider including the human
interrupt/resume path (`test_graph_smoke.py`), and a real MCP protocol
round-trip — session bind, tool listing, a gameplay tool call — independent
of any LLM (`test_mcp_integration.py`).

## Known gaps in this pass

- **Werewolf negotiation** is a first-pass: independent proposals resolved
  by majority, same as the original prototype — not yet the real multi-turn
  back-and-forth described in plan §5. The `negotiate_message` MCP tool
  exists and is wired for it, just not yet called by the graph.
- **openai / gemini / ollama** adapters are implemented per plan §7 but
  untested end-to-end (no keys/local models available while building this).
  Only `claude` and `mock` have been exercised against a real model call.
- **`agent_decisions` viewer**: the `GET /games/{id}/decisions` endpoint
  works: no dedicated frontend page for it yet.
- LangGraph logs a `Deserializing unregistered type app.models.GameState`
  deprecation warning on checkpoint resume. Harmless today; worth
  registering the type (or moving to a slimmer checkpoint-only schema)
  before relying on `LANGGRAPH_STRICT_MSGPACK`.
