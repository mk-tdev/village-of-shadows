# 5. MCP tool server with connection-bound identity

**Files:** [`backend/app/mcp_server/server.py`](../../backend/app/mcp_server/server.py),
[`backend/app/mcp_server/identity.py`](../../backend/app/mcp_server/identity.py),
[`backend/app/game/agent_turn.py`](../../backend/app/game/agent_turn.py)

## What MCP is doing here

MCP (Model Context Protocol) is a standard for exposing *tools* — named,
schema'd functions — to a language model over a client/server connection,
independent of which model provider you're using. Every action an agent
takes in this game — voting, attacking, speaking, writing a private note —
is a real MCP tool call, going out over real HTTP to a real server process
(well, sub-app — see [01](01-fastapi-app-shape.md)), not a function call
made directly in-process. That might look like unnecessary indirection for
a single-process app, but it's the point: this is the same protocol and the
same code path a production multi-agent system would use if these agents
were running as separate services. The mock provider (see
[06](06-model-agnostic-adapters-and-tool-calling.md)) exercises this exact
path too, specifically so "no API key available" doesn't mean "the MCP
integration goes untested."

## The identity problem MCP doesn't solve for you

An MCP tool handler receives whatever arguments the model's tool call
specifies, plus a `Context` object for the current session. Nothing about
raw MCP tells a `submit_vote` handler *which seat* is calling it — that's
entirely up to the server to establish. The tempting-but-wrong way to solve
this: add a `seat_id` parameter to every tool, and trust the model to pass
its own. That fails the instant a model — accidentally or by clever
prompting — passes someone else's `seat_id` and casts their vote or reads
their private role.

## The actual fix: identity lives on the *connection*, never in an argument

```python
"""The orchestrator mints a one-time token for (game_id, seat_id) and calls
the `bind_seat` tool itself, over the session it just opened for that seat's
turn, *before* handing the model any tools. `bind_seat` is filtered out of
the tool list a model ever sees — the model has no way to call it, and no
gameplay tool accepts a seat_id argument, so there is no argument through
which a model could impersonate another seat."""
```
([identity.py:1-10](../../backend/app/mcp_server/identity.py#L1-L10))

Three pieces work together:

**1. A one-time token, minted server-side, never derivable by the model.**

```python
def mint_token(game_id: str, seat_id: str) -> str:
    token = secrets.token_urlsafe(24)
    _PENDING[token] = (game_id, seat_id)
    return token
```
([identity.py:22-25](../../backend/app/mcp_server/identity.py#L22-L25))

`agent_turn.py` calls this *before* the model ever sees a tool list —
`identity.mint_token(orch.session_id, player.seat_id)`
([agent_turn.py:92](../../backend/app/game/agent_turn.py#L92)).

**2. The orchestrator, not the model, spends that token.**

```python
async with create_session({"transport": "streamable_http", "url": settings.mcp_url}) as session:
    await session.initialize()
    await session.call_tool("bind_seat", {"token": token})
    ...
```
([agent_turn.py:99-101](../../backend/app/game/agent_turn.py#L99-L101))

The orchestrator opens the MCP session and immediately calls `bind_seat`
itself, handing the token it just minted. Only *after* this does it load the
tool list and hand it to the model. The model never sees the token exist —
it isn't in the prompt, isn't in any tool's schema.

**3. `bind_seat` is filtered out of what the model can ever call.**

```python
MODEL_VISIBLE_TOOLS = {
    "get_public_transcript", "get_my_private_context", "get_vote_history",
    "get_my_notes", "write_note", "negotiate_message",
    "submit_night_action", "submit_statement", "submit_vote",
}
```
([server.py:20-30](../../backend/app/mcp_server/server.py#L20-L30))

```python
all_tools = await load_mcp_tools(session)
model_tools = [t for t in all_tools if t.name in MODEL_VISIBLE_TOOLS]
bound_model = chat_model.bind_tools(model_tools)
```
([agent_turn.py:103-105](../../backend/app/game/agent_turn.py#L103-L105))

`load_mcp_tools` (from `langchain-mcp-adapters`) would happily return
*every* tool the server defines, `bind_seat` included — filtering by
`MODEL_VISIBLE_TOOLS` before calling `chat_model.bind_tools(...)` is what
actually keeps `bind_seat` out of the model's hands. Notice this isn't
security through obscurity ("the model probably won't guess the tool
name") — even if a model somehow emitted a `bind_seat` tool call, it isn't
in `tools_by_name` (built from the same filtered list,
[agent_turn.py:106](../../backend/app/game/agent_turn.py#L106)), so there's
no code path that would execute it.

## Resolving identity inside a tool handler

```python
@mcp.tool()
async def submit_vote(target: str, thought: str = "", ctx: Context = None) -> dict:
    """Cast your vote to eliminate a player."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.apply_vote(orch, seat_id, target, thought)
```
([server.py:106-111](../../backend/app/mcp_server/server.py#L106-L111))

Every gameplay tool follows this exact shape: pull `(game_id, seat_id)` from
`identity.resolve(ctx.session)` — a lookup keyed by the *session object
itself*, set once by `bind`
([identity.py:28-33](../../backend/app/mcp_server/identity.py#L28-L33)) —
and pass `seat_id` into `actions.py` (see
[04](04-partial-observability-agent-view.md) for why `actions.py` is where
rule enforcement lives). `target` is the only thing the model actually
supplies. There is no `seat_id: str` parameter anywhere in this function
signature for a model to fill in with the wrong value, because identity was
never something a *caller* provides — it's something the *connection*
already has, established out-of-band before the model got involved.

## Cleanup

```python
def release(session: object) -> None:
    _BOUND.pop(session, None)
```
([identity.py:43-44](../../backend/app/mcp_server/identity.py#L43-L44))

Called in `agent_turn.py`'s `finally` block
([agent_turn.py:143](../../backend/app/game/agent_turn.py#L143)) once a
turn's MCP session closes — the binding is scoped to exactly one seat's one
turn, not left dangling for the lifetime of the server.
