from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.config import settings
from app.postgres_adapter import DatabaseConnection
from app.postgres_migrations import init_schema
from app.game.graph import build_graph
from app.game.seat_mind import build_seat_mind
from app.mcp_server.server import mcp
from app.routers import games, graph, guide, input, relationships, replays, stream, tournaments, voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = await DatabaseConnection.connect(settings.database_url)
    await init_schema(conn)

    async with AsyncPostgresSaver.from_conn_string(settings.database_url) as checkpointer:
        await checkpointer.setup()
        app.state.db_conn = conn
        app.state.graph = build_graph(checkpointer)
        # The main graph and every seat mind share one durable Postgres
        # checkpointer; thread_id keeps each private perspective isolated.
        app.state.seat_mind = build_seat_mind(checkpointer)
        try:
            async with mcp.session_manager.run():
                yield
        finally:
            await conn.close()


app = FastAPI(title="Village of Shadows", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router)
app.include_router(stream.router)
app.include_router(input.router)
app.include_router(guide.router)
app.include_router(graph.router)
app.include_router(tournaments.router)
app.include_router(relationships.router)
app.include_router(replays.router)
app.include_router(voice.router)
app.mount("/mcp", mcp.streamable_http_app())


@app.get("/")
async def root() -> dict:
    return {
        "ok": True,
        "name": "Village of Shadows API",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
