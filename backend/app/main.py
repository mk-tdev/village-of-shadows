from contextlib import asynccontextmanager

import aiosqlite
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from app.config import settings
from app.db import init_schema
from app.game.graph import build_graph
from app.game.seat_mind import build_seat_mind
from app.mcp_server.server import mcp
from app.routers import games, graph, input, stream


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = await aiosqlite.connect(settings.db_path)
    await init_schema(conn)

    checkpointer = AsyncSqliteSaver(conn)
    await checkpointer.setup()

    app.state.db_conn = conn
    app.state.graph = build_graph(checkpointer)
    # Same checkpointer as the game graph: a seat's memory and the game's own
    # interrupt/resume state are both just threads in the one SQLite store,
    # separated by thread_id (see game/seat_mind.py).
    app.state.seat_mind = build_seat_mind(checkpointer)

    async with mcp.session_manager.run():
        yield

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
app.include_router(graph.router)
app.mount("/mcp", mcp.streamable_http_app())


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
