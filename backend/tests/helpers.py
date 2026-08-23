"""Shared test setup — a fresh orchestrator wired to a temp SQLite DB and
the real compiled graph, driven by scripted mock/human turns."""

import uuid

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from app import persistence
from app.db import init_schema
from app.game import registry
from app.game.graph import build_graph
from app.game.orchestrator import GameOrchestrator
from app.game.seat_mind import build_seat_mind
from app.models import AgentConfig, GameState, Player


async def make_orchestrator(tmp_path, controllers: list[str]) -> GameOrchestrator:
    db_path = str(tmp_path / f"test-{uuid.uuid4().hex}.db")
    conn = await aiosqlite.connect(db_path)
    await init_schema(conn)
    checkpointer = AsyncSqliteSaver(conn)
    await checkpointer.setup()
    graph = build_graph(checkpointer)
    seat_mind = build_seat_mind(checkpointer)

    session_id = str(uuid.uuid4())
    names = ["Mara", "Tomas", "Elin", "Bram", "Sable", "Corvin", "Petra"]
    configs = [
        AgentConfig(
            seat_id=f"seat_{i}", display_name=names[i], personality="stoic",
            controller=controllers[i], provider=None if controllers[i] == "human" else "mock",
            model_name=None if controllers[i] == "human" else "mock-v1",
        )
        for i in range(len(controllers))
    ]
    players = [
        Player(
            seat_id=c.seat_id, name=c.display_name, personality=c.personality,
            controller=c.controller, provider=c.provider, model_name=c.model_name,
        )
        for c in configs
    ]
    state = GameState(session_id=session_id, players=players)
    await persistence.create_game(conn, session_id, configs)

    orch = GameOrchestrator(session_id, state, conn, graph, seat_mind)
    registry.register(orch)
    return orch


def answer_for(awaiting) -> dict:
    if awaiting.kind == "statement":
        return {"text": "I have my suspicions.", "thought": "test thought"}
    if awaiting.kind == "werewolf_negotiation":
        return {
            "target": awaiting.options[0],
            "text": "This player is our strongest threat; we can redirect suspicion tomorrow.",
        }
    return {"target": awaiting.options[0], "thought": "test thought"}
