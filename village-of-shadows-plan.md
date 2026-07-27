# Village of Shadows — Multi-Agent Werewolf

## Implementation Plan & AI Engineering Concept Guide

A learning project: a 7-player Werewolf/Mafia game where each seat is played by an
independently configurable AI agent (or a human), orchestrated so that **only the
orchestrator ever sees the full game state** — every agent, human included, sees a
filtered view appropriate to its role. Built to deliberately exercise a set of
core agentic-AI engineering patterns, not just to produce a working game.

---

## 1. Learning objectives

This project is a vehicle for hands-on practice with:

| Concept | Where it shows up in this game |
|---|---|
| **Multi-agent orchestration** | A supervisor/orchestrator drives phase transitions (night → day → vote → resolve) and delegates to 7 independent agent processes |
| **Partial observability / context isolation** | The orchestrator holds the one true `GameState`; each agent call receives a constructed `AgentView`, not the raw state |
| **Model-agnostic agent abstraction** | Each seat can be backed by any Claude, OpenAI, Gemini, or Ollama (local or remote) model behind one common interface |
| **Human-in-the-loop / interrupt pattern** | The graph pauses execution and waits for real input whenever it's a human seat's turn — no polling, no timeouts, a genuine suspend/resume |
| **Tool use** | Agents act through tools (submit a vote, send a private night message, write a note) instead of free-text parsing — a much more robust pattern than asking for JSON and hoping |
| **MCP (Model Context Protocol)** | The game's tools are served over a real MCP server, so the same tool surface could be reused by other MCP clients, and external MCP servers could be added later |
| **Multi-turn agent negotiation** | The two werewolves hold a genuine private back-and-forth before settling on a target, not an independent single-shot guess |
| **Persistence & observability** | Every game, every seat's role, every agent decision and tool call is stored in a database you can query and review after the fact |
| **Streaming / live UI** | The "thinking → decision" feed effect requires pushing incremental events to the frontend, not a single request/response |

---

## 2. High-level architecture

```
+--------------------------+        +----------------------------------+
|   Frontend (browser)     |        |          Backend (server)         |
|                           |  HTTP  |                                    |
|  Setup / Control Panel   |------->|  POST /games                      |
|  (seats, models, seat    |        |   -> creates GameSession           |
|   you'll play)           |        |                                    |
|                           |<-------|                                    |
|  Live Game View           |  WS   |  GameOrchestrator (LangGraph)      |
|  (feed, player cards,    |<------>|   - owns full GameState             |
|   god view toggle,       | events |   - builds AgentView per seat       |
|   your turn controls)    |  +     |   - interrupt()s on human turn      |
|                           | input  |                                    |
+--------------------------+        +--------+------------------+--------+
                                              |                  |
                                    +---------v------+   +-------v--------+
                                    |  ModelAdapter    |   |  Game Tools    |
                                    | (1 interface,    |   |  MCP Server    |
                                    |  N providers)    |   |  (vote, speak, |
                                    +---------+--------+   |  notes, night  |
                     +----------+-----------+----------+  |  actions, ...) |
                     v          v           v          v  +-------+--------+
                 Claude API  OpenAI API  Gemini API  Ollama         |
                                                    (local/remote)  |
                                                                     v
                                                            +----------------+
                                                            |    Database     |
                                                            | (games, seats,  |
                                                            |  log, decisions,|
                                                            |  tool calls,    |
                                                            |  notes)         |
                                                            +----------------+
```

**Why a server at all, instead of the client-side artifact version:** the prototype
called the Anthropic API directly from the browser. Multi-provider support breaks
that model — you don't want OpenAI/Gemini API keys sitting in client-side
JavaScript, and local Ollama isn't reachable from a hosted browser artifact. A
small backend also gives you a real place to hold the single source of truth
(`GameState`), a real place to implement `interrupt()`/checkpointing, and a real
place to run an MCP server.

**Suggested stack:** Python + FastAPI + LangGraph + LangChain provider packages
(`langchain-anthropic`, `langchain-openai`, `langchain-google-genai`,
`langchain-ollama`) + the official `mcp` Python SDK for the tool server +
SQLite (or Postgres later) for persistence. LangGraph's Python implementation
has the most mature support for interrupts and checkpointing, which are core
to this project. Frontend can stay close to the existing HTML/CSS/JS
prototype, now driven by a WebSocket instead of direct `fetch` calls.

---

## 3. Data model

### 3.1 `AgentConfig` (set up before the game starts)

```python
class AgentConfig(BaseModel):
    seat_id: str                     # "seat_1" .. "seat_7"
    display_name: str                # "Mara", "Tomas", ...
    personality: str                 # "sharp-eyed", "hot-headed", ...
    controller: Literal["ai", "human"]
    provider: Literal["claude", "openai", "gemini", "ollama"] | None
    model_name: str | None           # free text -- any model the provider's account
                                      # supports, e.g. "claude-sonnet-4-6", "gpt-4.1",
                                      # "gemini-2.5-flash", "llama3.1", "qwen2.5:14b"
    endpoint: str | None             # only for "ollama" -- local (default
                                      # http://localhost:11434) or any remote
                                      # Ollama-compatible endpoint
```

No provider is hardcoded to a specific model list -- the control panel can offer
a few well-known suggestions per provider as a convenience dropdown-with-freeform,
but anything the account/endpoint supports is valid. API keys are **not** part
of this object (see section 7).

### 3.2 `GameState` (server-only, never sent to the frontend in full)

```python
class Player(BaseModel):
    seat_id: str
    name: str
    role: Literal["werewolf", "seer", "doctor", "villager"]
    alive: bool = True

class LogEntry(BaseModel):
    seq: int
    round: int
    phase: str
    type: Literal["system", "statement", "vote", "death", "winner",
                  "werewolf_negotiation", "seer", "doctor"]
    seat_id: str | None
    text: str
    thought: str | None
    private: bool                    # True => hidden unless "god view"

class GameState(BaseModel):
    session_id: str
    players: list[Player]
    round: int
    phase: str
    log: list[LogEntry]
    seer_knowledge: dict[str, dict[str, str]]   # seer seat_id -> {target_name: role}
    winner: str | None
```

### 3.3 `AgentView` (what a given agent actually receives)

This is the core of the "only the orchestrator knows everything" requirement --
it's a *function of* `GameState` and a `seat_id`, never the raw state object:

```python
def build_agent_view(state: GameState, seat_id: str) -> dict:
    player = next(p for p in state.players if p.seat_id == seat_id)
    public_log = [e for e in state.log if not e.private]
    view = {
        "your_name": player.name,
        "your_role": player.role,
        "alive_players": [p.name for p in state.players if p.alive],
        "public_transcript": public_log,
    }
    if player.role == "werewolf":
        teammate = next(p for p in state.players if p.role == "werewolf" and p.seat_id != seat_id)
        view["teammate"] = teammate.name if teammate.alive else None
    if player.role == "seer":
        view["known_roles"] = state.seer_knowledge.get(seat_id, {})
    return view
```

This one function is worth treating as the centerpiece of the "partial
observability" learning goal -- every bug where an agent "knows too much" traces
back to something leaking outside this boundary. The same principle carries
into the tool server (section 6): a tool call must be scoped by the *session's*
bound seat identity, never by a `seat_id` argument the model supplies, or an
agent could simply ask for another seat's private context.

---

## 4. Persistence & database schema

Everything is written to the database as it happens, not just at game end --
this is what lets you go back and inspect exactly what each agent decided and
why.

```sql
CREATE TABLE games (
    id            TEXT PRIMARY KEY,
    created_at    TIMESTAMP,
    status        TEXT,              -- 'setup' | 'in_progress' | 'finished'
    winner        TEXT                -- 'villagers' | 'werewolves' | NULL
);

CREATE TABLE seats (
    id            TEXT PRIMARY KEY,
    game_id       TEXT REFERENCES games(id),
    seat_id       TEXT,
    display_name  TEXT,
    personality   TEXT,
    controller    TEXT,               -- 'ai' | 'human'
    provider      TEXT,
    model_name    TEXT,
    role          TEXT                -- assigned once the game starts
);

CREATE TABLE log_entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT REFERENCES games(id),
    seq           INTEGER,
    round         INTEGER,
    phase         TEXT,
    type          TEXT,
    seat_id       TEXT,
    text          TEXT,
    thought       TEXT,
    private       BOOLEAN,
    created_at    TIMESTAMP
);

-- Every model call an agent makes, independent of what it decided to do
CREATE TABLE agent_decisions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT REFERENCES games(id),
    seat_id       TEXT,
    round         INTEGER,
    phase         TEXT,
    provider      TEXT,
    model_name    TEXT,
    prompt        TEXT,               -- the AgentView / instructions sent
    raw_response  TEXT,               -- full model output, including any reasoning
    tool_calls    TEXT,               -- JSON array: [{tool, arguments, result}, ...]
    latency_ms    INTEGER,
    created_at    TIMESTAMP
);

-- Each agent's private persistent scratchpad, written via the write_note tool
CREATE TABLE agent_notes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT REFERENCES games(id),
    seat_id       TEXT,
    round         INTEGER,
    note          TEXT,
    created_at    TIMESTAMP
);
```

`agent_decisions` is the single most useful table for the "I want to see the
agent's decisions and tool usage" goal -- a query filtered by `game_id` and
ordered by `created_at` gives you a full replay of what every agent was
thinking and doing, turn by turn, across every provider.

---

## 5. The orchestrator graph (LangGraph)

```
assign_roles
   -> night_phase
       - werewolf_negotiation (multi-turn, see below)
       - doctor_protect
       - seer_inspect
   -> resolve_night
   -> check_win  --(winner)--> END
        | (no winner)
        v
   day_discussion (loop over alive seats, in order)
   -> voting (loop over alive seats)
   -> resolve_vote
   -> check_win  --(winner)--> END
        | (no winner)
        v
   (loop back to night_phase, round += 1)
```

### Werewolf negotiation (real back-and-forth, not independent proposals)

Rather than each werewolf silently proposing a target and the orchestrator
picking the majority, the two werewolves get an actual private conversation:

```
werewolf_negotiation:
  turn = 0
  loop while turn < MAX_TURNS (e.g. 4):
    active_wolf = werewolves[turn % 2]
    call active_wolf's agent with the negotiation transcript so far
    agent responds via tools -- either:
      - negotiate_message(text)      -> adds a private message, turn continues
      - submit_night_action(target)  -> this wolf commits, negotiation ends
    turn += 1
  if MAX_TURNS reached with no submit_night_action:
    ask each wolf independently for a final submit_night_action
    resolve by majority (tie -> random, same rule as voting)
```

Every message in this exchange is logged as a `private: true` log entry (type
`werewolf_negotiation`), visible in God View, invisible to everyone else --
including the human, unless the human happens to be a werewolf that game.

Other implementation notes carried over from the original design:

- **`day_discussion` and `voting` loop over seats**, calling either the seat's
  `ModelAdapter` (AI) or `interrupt()` (human) each iteration.
- **`interrupt()`** genuinely suspends the graph on a human turn; the frontend
  calls `/games/{id}/input`, and the server resumes with
  `graph.invoke(Command(resume=answer), config)`.
- **Checkpointing** (`SqliteSaver`, or reuse the same database from section 4)
  keeps a paused game alive across restarts/disconnects.
- **Streaming**: each node pushes events to a session-scoped queue that a
  WebSocket handler forwards immediately, producing the "thinking -> decision"
  live feed.

---

## 6. Tool use & MCP integration

This is the new centerpiece for the tool-use / MCP learning goal. Two ideas
are combined here on purpose: **agents act through tools instead of free-text
JSON**, and **those tools are served over a real MCP server** rather than
being ad hoc Python functions bound directly into the LLM call.

### 6.1 Why tools instead of "ask for JSON and parse it"

The prototype asked each model to reply with `{"thought": ..., "target": ...}`
and parsed it with a regex-and-fallback. That works, but it's fragile and it's
not how production agent systems are built. Replacing it with real tool calls
(`bind_tools` / MCP tool schemas) gets you:

- Reliable, provider-validated argument schemas instead of hoping a model's
  free-text response is valid JSON.
- A single point (the tool handler) where you can enforce game rules -- e.g.
  `submit_vote` rejects a target that isn't alive, without ever trusting the
  model to have gotten that right.
- A natural, structured place to log *every* action for section 4's
  `agent_decisions` table -- the tool call itself *is* the record.

### 6.2 The Game Tools MCP server

Run one MCP server, `game-tools`, exposing:

| Tool | Who can call it | Purpose |
|---|---|---|
| `get_public_transcript` | any seat | Read the public log for the current round (or all rounds) |
| `get_my_private_context` | any seat | Role, teammate (if werewolf), known roles (if seer) -- the `AgentView` |
| `get_vote_history` | any seat | Past rounds' vote tallies |
| `get_my_notes` | any seat | Retrieve this seat's own past private notes |
| `write_note` | any seat | Persist a private scratchpad note for future rounds |
| `negotiate_message` | werewolves only | Send a message in the private werewolf channel |
| `submit_night_action` | werewolf / seer / doctor, on their turn | Commit a night target |
| `submit_statement` | any seat, on their turn | Speak during day discussion |
| `submit_vote` | any seat, on their turn | Cast a vote |

**Identity is bound to the connection, not to an argument.** Each agent call
opens (or reuses) an MCP session that the orchestrator has already scoped to
one `seat_id` server-side. Tools never accept a `seat_id` parameter from the
model -- if they did, a model could simply request another seat's private
context. This mirrors the `build_agent_view` boundary in section 3.3 and is
worth treating as a first-class lesson, not an afterthought: **authorization
lives in the server, never in something the model self-reports.**

Every tool call -- arguments, result, and the surrounding model turn -- is
written straight into `agent_decisions` (section 4).

### 6.3 Room to extend

Once the core server-authorized tools are working, this is a natural place to
experiment with connecting an *external* MCP server for something low-stakes
and fun -- e.g. a public trivia/proverb MCP for flavor lines, or a dice-roller
MCP for a personality-driven random flourish. Keep these strictly optional and
non-authoritative (they should never be able to affect game rules), so the
"what can an agent influence vs. merely decorate" boundary stays clean.

---

## 7. The model adapter layer

```python
def get_chat_model(config: AgentConfig):
    match config.provider:
        case "claude":
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(model=config.model_name)
        case "openai":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(model=config.model_name)
        case "gemini":
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(model=config.model_name)
        case "ollama":
            from langchain_ollama import ChatOllama
            return ChatOllama(model=config.model_name, base_url=config.endpoint or "http://localhost:11434")

model = get_chat_model(config).bind_tools(GAME_TOOLS)
```

Things worth planning for rather than discovering mid-build:

- **Tool-calling support varies by provider and by local model.** Claude and
  OpenAI have mature, reliable tool-calling. Gemini's is solid too. Local
  Ollama models vary a lot -- some small models will ignore tool schemas
  entirely. Plan a fallback path (e.g. detect no tool call was made, prompt
  once more with an explicit reminder, then fall back to a default safe
  action) rather than assuming every model behaves the same.
- **Latency differs wildly per seat** -- a local 8B Ollama model responds much
  faster than a large cloud model. Show each seat's "thinking" state
  independently rather than assuming uniform pacing.
- **API keys live only in environment variables**, read server-side by each
  provider's LangChain client in the standard way for that library (e.g.
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`). The control panel
  never collects or transmits a key.

---

## 8. Control panel (pre-game setup screen)

- **7 seat rows.** Each row: display name (editable), personality (editable or
  randomize button), a **controller** toggle (`AI` / `You`), and -- only when
  `AI` is selected -- a provider dropdown (`Claude`, `OpenAI`, `Gemini`,
  `Ollama`) plus a free-text model name field (with a few suggested values per
  provider for convenience). `Ollama` also shows an endpoint field, defaulting
  to `http://localhost:11434`, editable to point at any remote
  Ollama-compatible host. Only one seat may be set to `You`.
- **Validation before "Start Game" is enabled:** exactly one human seat, every
  AI seat has a provider and model name, no duplicate seat names.
- **On submit:** POST the full `list[AgentConfig]` to `/games`, receive a
  `session_id`, open the WebSocket, and transition to the live game view
  (player cards, god view toggle, feed, contextual controls for your turn --
  close to the existing prototype).

Role assignment still happens **after** seat selection, randomly -- the human
picks *which seat* to sit in, not which role to play, exactly as in the
prototype.

---

## 9. API contract (draft)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/games` | Body: `list[AgentConfig]`. Returns `{session_id}` and starts the orchestrator (paused at "begin first night") |
| `WS` | `/games/{session_id}/stream` | Server pushes `LogEntry` events and `interrupt` prompts as they occur |
| `POST` | `/games/{session_id}/input` | Body: `{seat_id, kind: "statement" or "vote" or "night_action", value}`. Resumes the graph via `Command(resume=...)` |
| `GET` | `/games/{session_id}/state` | Returns the current filtered public state, for reconnect after a refresh |
| `GET` | `/games/{session_id}/decisions` | Returns the full `agent_decisions` history for this game -- every model call, tool call, and result, for review/debugging |

---

## 10. Suggested build order

1. **Port the existing single-provider prototype logic into LangGraph nodes**,
   with Claude only, no tools/MCP/control panel yet -- get the
   orchestrator/interrupt mechanics right first.
2. **Add the database** (section 4) and checkpointing; confirm a paused game
   survives a backend restart, and that log entries persist correctly.
3. **Introduce the Game Tools MCP server** (section 6) and switch agents from
   JSON-parsing to real tool calls for a single provider first.
4. **Build the `ModelAdapter` layer** and prove it with a second provider
   (e.g. local Ollama) before wiring in the rest.
5. **Implement werewolf negotiation** as a real multi-turn sub-loop.
6. **Build the control panel UI** and the `/games` setup endpoint.
7. **Wire WebSocket streaming** so the live feed effect matches the
   prototype's feel.
8. **Polish:** tie-break voting rules, reconnect handling, per-seat error
   states when a provider or tool call fails, a simple viewer for the
   `agent_decisions` table.

---

## 11. Decisions on record

These were open questions during design; answers below are what this plan is
built around.

- **Secrets:** API keys and available models are configured via environment
  variables on the server. The control panel never collects a raw key.
- **Tie-break voting:** same as the prototype -- random among tied players.
- **Werewolf negotiation:** real, multi-turn, private back-and-forth
  (section 5), not independent single-shot proposals.
- **Persistence:** a real database is required, storing every game, every
  seat's assigned role (human and AI alike), and every agent decision and
  tool call, so past games can be reviewed in detail (section 4).
- **Model support:** any Claude, OpenAI, or Gemini model the configured
  account has access to, and any Ollama model -- local or remote -- with no
  hardcoded model list.
- **Tools & MCP:** core to the build. Agents act through a real MCP tool
  server (section 6) rather than free-text JSON parsing.
