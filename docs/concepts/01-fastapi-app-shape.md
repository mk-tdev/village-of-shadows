# 1. FastAPI app shape

**Files:** [`backend/app/main.py`](../../backend/app/main.py), [`backend/app/config.py`](../../backend/app/config.py), [`backend/app/postgres_adapter.py`](../../backend/app/postgres_adapter.py)

## The shape

The HTTP API, LangGraph orchestrator, and MCP tool server run in one FastAPI process. They share an application PostgreSQL connection, while LangGraph owns a separate PostgreSQL checkpointer connection. This keeps agent tool calls, graph transitions, and SSE updates close together without pretending that database history and checkpoint state are the same thing.

## `lifespan` — setup that outlives one request

At server startup, `lifespan` opens `DatabaseConnection` using `DATABASE_URL`, applies the versioned application schema, opens LangGraph `AsyncPostgresSaver`, and runs its setup. It attaches the database connection, compiled game graph, and compiled per-seat mind graph to `app.state`. It also enters the MCP session manager for the lifetime of the process.

```python
conn = await DatabaseConnection.connect(settings.database_url)
await init_schema(conn)
async with AsyncPostgresSaver.from_conn_string(settings.database_url) as checkpointer:
    await checkpointer.setup()
    app.state.db_conn = conn
    app.state.graph = build_graph(checkpointer)
    app.state.seat_mind = build_seat_mind(checkpointer)
```

A `thread_id` separates the main game and every private seat mind in the common checkpoint store. The compiled graph structure is reused, but each game has independent checkpoint state.

## Why one backend replica today

PostgreSQL makes records and interrupts durable. The active-game registry and mounted MCP server are still in-process, however, so production deployment deliberately uses one Container Apps replica. Horizontal scaling is a later architecture change: it requires a distributed game-owner registry and SSE routing, not merely a database switch.

## Routers and configuration

Routers remain separated by resource (`games`, `stream`, `input`, `graph`, and related features), and read durable resources through `request.app.state`. `Settings` accepts `DATABASE_URL`, `CORS_ORIGINS`, and `MCP_URL` from environment variables. Local Docker uses the Compose PostgreSQL service; Azure uses a TLS connection string stored as a Container Apps secret.
