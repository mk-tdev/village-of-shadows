"""Shared PostgreSQL-backed test setup for real compiled game graphs."""

import os
import uuid

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app import persistence
from app.config import settings
from app.game import registry
from app.game.graph import build_graph
from app.game.orchestrator import GameOrchestrator
from app.game.seat_mind import build_seat_mind
from app.models import AgentConfig, GameState, Player
from app.postgres_adapter import DatabaseConnection
from app.postgres_migrations import init_schema


def database_url_for_tests() -> str:
    return os.getenv("TEST_DATABASE_URL", settings.database_url)


async def make_orchestrator(_tmp_path, controllers: list[str]) -> GameOrchestrator:
    database_url = database_url_for_tests()
    conn = await DatabaseConnection.connect(database_url)
    await init_schema(conn)
    checkpointer_context = AsyncPostgresSaver.from_conn_string(database_url)
    checkpointer = await checkpointer_context.__aenter__()
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
            seat_id=config.seat_id, name=config.display_name, personality=config.personality,
            controller=config.controller, provider=config.provider, model_name=config.model_name,
        )
        for config in configs
    ]
    state = GameState(session_id=session_id, players=players)
    await persistence.create_game(conn, session_id, configs)

    orchestrator = GameOrchestrator(session_id, state, conn, graph, seat_mind)
    orchestrator._checkpointer_context = checkpointer_context
    registry.register(orchestrator)
    return orchestrator


def answer_for(awaiting) -> dict:
    if awaiting.kind == "statement":
        return {"text": "I have my suspicions.", "thought": "test thought"}
    if awaiting.kind == "werewolf_negotiation":
        return {
            "target": awaiting.options[0],
            "text": "This player is our strongest threat; we can redirect suspicion tomorrow.",
        }
    return {"target": awaiting.options[0], "thought": "test thought"}
