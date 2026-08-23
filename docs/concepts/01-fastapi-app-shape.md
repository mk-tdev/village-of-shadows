# 1. FastAPI app shape

**Files:** [`backend/app/main.py`](../../backend/app/main.py),
[`backend/app/config.py`](../../backend/app/config.py),
[`backend/app/db.py`](../../backend/app/db.py)

## The shape

This isn't a microservices system — everything (the HTTP API, the LangGraph
orchestrator, the MCP tool server) runs in **one Python process**, sharing
one event loop and one SQLite connection. That's a deliberate scope
decision, not an oversight: it means an agent's MCP tool call, the graph
node that triggered it, and the SSE stream watching it all happen in the
same process with no network hop or serialization boundary between them.
Real production systems might split these out; a learning project showing
the *concepts* of agentic orchestration doesn't need that complexity yet.

## `lifespan` — setup that outlives any single request

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = await aiosqlite.connect(settings.db_path)
    await init_schema(conn)

    checkpointer = AsyncSqliteSaver(conn)
    await checkpointer.setup()

    app.state.db_conn = conn
    app.state.graph = build_graph(checkpointer)

    async with mcp.session_manager.run():
        yield

    await conn.close()
```
([main.py:16-33](../../backend/app/main.py#L16-L33))

FastAPI's `lifespan` context manager runs once when the server starts and
once when it stops — not per-request. Three things get created here that
every request needs but no single request owns:

- **The database connection.** One `aiosqlite.Connection` for the whole
  server's lifetime. SQLite is fine with this in a single-process app; a
  connection pool would be solving a problem this app doesn't have.
- **The compiled LangGraph app** (`build_graph(checkpointer)`) — compiling a
  graph is relatively expensive and the graph's *structure* never changes
  per-game, only its *state* does, so it's built once and reused for every
  game.
- **The MCP server's session manager**, entered as an async context so its
  background bookkeeping runs for exactly as long as the app is up.

Everything created here is attached to `app.state`, which is the idiomatic
FastAPI way to make long-lived objects reachable from route handlers without
global variables — see `request.app.state.db_conn` and
`request.app.state.graph` in [games.py](../../backend/app/routers/games.py).

## Routers: one file per resource, not one giant file

```python
app.include_router(games.router)
app.include_router(stream.router)
app.include_router(input.router)
app.include_router(graph.router)
```
([main.py:46-49](../../backend/app/main.py#L46-L49))

Each router (`games.py`, `stream.py`, `input.py`, `graph.py`) owns one slice
of the API surface and is mounted under a shared prefix
(`APIRouter(prefix="/games", ...)`). This is FastAPI's standard scaling
pattern — nothing exotic — but worth calling out because it's what makes
`app/routers/stream.py` (SSE) and `app/routers/games.py` (pause/continue,
create, state) independently readable despite touching the same
`GameOrchestrator`.

## Mounting a second ASGI app inside this one

```python
app.mount("/mcp", mcp.streamable_http_app())
```
([main.py:54](../../backend/app/main.py#L54))

The MCP tool server (see
[05-mcp-tool-server-identity.md](05-mcp-tool-server-identity.md)) is a
*complete, separate* ASGI application — `FastMCP` produces its own app with
its own routing — but it's mounted as a sub-app under `/mcp` on the same
FastAPI instance rather than run as a separate process on a separate port.
That's what "in-process MCP" means concretely: one `uvicorn` process, one
port, two ASGI apps stitched together by `.mount()`. An agent's MCP client
still talks real MCP-over-HTTP to `http://localhost:8000/mcp` — it has no
way to tell this isn't a separate server — but there's no subprocess to
manage and no separate deployment.

## Config via `pydantic-settings`

[`config.py`](../../backend/app/config.py) defines a `Settings` model whose
fields can be overridden by environment variables or a `.env` file (`db_path`,
`cors_origins`, `mcp_url`). This is the standard "typed, validated config
object instead of scattered `os.environ.get(...)` calls" pattern — mentioned
here mainly so you know where `settings.mcp_url` (used in
`agent_turn.py` to open each agent's MCP connection) actually comes from.
