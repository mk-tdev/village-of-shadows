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
([agent_turn.py:108](../../backend/app/game/agent_turn.py#L108)).

**2. The orchestrator, not the model, spends that token.**

```python
async with create_session({"transport": "streamable_http", "url": settings.mcp_url}) as session:
    await session.initialize()
    await session.call_tool("bind_seat", {"token": token})
    ...
```
([agent_turn.py:124-126](../../backend/app/game/agent_turn.py#L124-L126))

The orchestrator opens the MCP session and immediately calls `bind_seat`
itself, handing the token it just minted. Only *after* this does it load the
tool list and hand it to the model. The model never sees the token exist —
it isn't in the prompt, isn't in any tool's schema.

**3. `bind_seat` is filtered out of what the model can ever call.**

```python
MODEL_VISIBLE_TOOLS = {
    "get_public_transcript", "get_my_private_context", "get_vote_history",
    "get_my_notes", "get_my_note_history", "record_private_note",
    "revise_private_note", "retire_private_note", "write_note", "negotiate_message",
    "submit_night_action", "submit_statement", "submit_vote",
}
```
([server.py:27-41](../../backend/app/mcp_server/server.py#L27-L41))

```python
all_tools = await load_mcp_tools(session)
model_tools = [t for t in all_tools if t.name in MODEL_VISIBLE_TOOLS]
bound_model = chat_model.bind_tools(model_tools)
```
([agent_turn.py:131-133](../../backend/app/game/agent_turn.py#L131-L133))

`load_mcp_tools` (from `langchain-mcp-adapters`) would happily return
*every* tool the server defines, `bind_seat` included — filtering by
`MODEL_VISIBLE_TOOLS` before calling `chat_model.bind_tools(...)` is what
actually keeps `bind_seat` out of the model's hands. Notice this isn't
security through obscurity ("the model probably won't guess the tool
name") — even if a model somehow emitted a `bind_seat` tool call, it isn't
in `tools_by_name` (built from the same filtered list,
[agent_turn.py:134](../../backend/app/game/agent_turn.py#L134)), so there's
no code path that would execute it.

## A routing pitfall this exact setup hit: the double mount

Identity binding assumes agents can actually *reach* the MCP server in the
first place — and for a while in this project, real-provider seats
couldn't, because of a mistake specific to mounting a `FastMCP` app inside
another ASGI app rather than running it standalone.

```python
mcp = FastMCP("game-tools")
# FastMCP's streamable_http_app() registers its own internal route at
# "/mcp" by default. main.py mounts that whole app *again* under "/mcp",
# which would make the real endpoint "/mcp/mcp" while every client (see
# settings.mcp_url) expects plain "/mcp". Pointing the internal route at
# "/" instead means mount prefix + internal route == "/mcp", matching what
# clients actually connect to.
mcp.settings.streamable_http_path = "/"
```
([server.py:15-22](../../backend/app/mcp_server/server.py#L15-L22))

`FastMCP.streamable_http_app()` builds an ASGI app with its own internal
route already fixed at `/mcp` (that's a library default, not something this
project set). [main.py](../../backend/app/main.py) then mounts that whole
app *again* under the prefix `/mcp` — so without the line above, the only
path that actually resolves is `/mcp/mcp`, while every agent's MCP client
(via `settings.mcp_url`, see [01](01-fastapi-app-shape.md)) connects to
plain `/mcp` and gets a 404. Concretely, that 404 doesn't surface as a
clean error — it blows up the client transport's internal `anyio` task
group, and the orchestrator's broad `except Exception` in
`GameOrchestrator._run` (see [03](03-human-in-the-loop-interrupt.md)) ends
up catching an `ExceptionGroup` whose default string is the unhelpful
*"unhandled errors in a TaskGroup (1 sub-exception)"* — a real symptom this
project hit, with the actual 404 several layers down in the traceback. The
mock provider never triggers this at all (it skips MCP entirely — see
[06](06-model-agnostic-adapters-and-tool-calling.md)), which is exactly why
the bug could sit unnoticed until a real provider seat was tried.

The fix is the one-line `streamable_http_path = "/"` override above, so the
mount prefix alone supplies the `/mcp` path and the sub-app's own internal
route contributes nothing extra. It's also why
[`test_mcp_integration.py`](../../backend/tests/test_mcp_integration.py) was
rewritten to actually build a Starlette app and `.mount("/mcp",
mcp.streamable_http_app())` the same way `main.py` does, instead of pointing
a test client straight at the unwrapped sub-app — the original test passed
throughout, because it never exercised the real mount at all. The general
lesson: if a test double-checks a component in isolation but the real bug
lives specifically in *how it's wired together*, the test can stay green
while production is broken. Test the actual integration point, not a
convenient stand-in for it.

**This symptom is generic, not specific to this one bug.** The double
mount was the *first* thing to produce *"unhandled errors in a TaskGroup (1
sub-exception)"*, but it's not the only thing that can: `str()` on an
`ExceptionGroup` never recurses into `.exceptions` by default, so *any*
failure inside the MCP client's own internal `anyio` task group — a 404
from a routing bug, an HTTP 410 from an invalid model name, an auth
failure, a network error — arrives at `GameOrchestrator._run`'s `except
Exception` as an opaque wrapper with the real cause several layers down
and no way for a user to see it. That's exactly what happened a second
time in this project, independent of this bug: an invalid Ollama Cloud
model name (see the "guessed model names silently 410" pitfall in
[06](06-model-agnostic-adapters-and-tool-calling.md)) produced the
identical-looking generic error, with a completely different root cause.
`orchestrator.py`'s `_describe_exception` helper (see
[03](03-human-in-the-loop-interrupt.md)) now recursively unwraps
`BaseExceptionGroup` so the frontend shows the actual leaf exception
instead of this wrapper — worth knowing about both because it explains why
the *same-looking* error can have unrelated causes, and because it's a
general lesson about `ExceptionGroup`: always unwrap it before surfacing
its message to a user, never trust its default `str()`.

## Resolving identity inside a tool handler

```python
@mcp.tool()
async def submit_vote(target: str, thought: str = "", ctx: Context = None) -> dict:
    """Cast your vote to eliminate a player."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.apply_vote(orch, seat_id, target, thought)
```
([server.py:113-118](../../backend/app/mcp_server/server.py#L113-L118))

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
([agent_turn.py:168](../../backend/app/game/agent_turn.py#L168)) once a
turn's MCP session closes — the binding is scoped to exactly one seat's one
turn, not left dangling for the lifetime of the server.
