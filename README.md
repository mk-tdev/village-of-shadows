# Village of Shadows

A 7-seat multi-agent Werewolf game — FastAPI + LangGraph orchestrator, a real
MCP tool server, SQLite persistence, and a Next.js frontend driven over SSE.
Full design rationale lives in [village-of-shadows-plan.md](village-of-shadows-plan.md);
`werewolf_game.html` is the original single-file client-side prototype this
replaces.

## Running it

**Backend**

```bash
cd backend
uv sync
cp .env.example .env   # fill in API keys if you have them -- optional, see below
uv run uvicorn app.main:app --reload
```

**Frontend** (separate terminal)

```bash
cd frontend
pnpm install
cp .env.local.example .env.local
pnpm dev
```

Then open `http://localhost:3000`, pick which seat you want to play, and hit
**Start Game**.

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
