import asyncio

import pytest
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app import persistence
from app.postgres_adapter import DatabaseConnection
from app.postgres_migrations import init_schema
from tests.helpers import database_url_for_tests
from app.game.graph import build_graph
from app.game.seat_mind import build_seat_mind
from app.game.tournaments import TournamentRequest, _rotated_roles, prepare, summarize
from app.models import AgentConfig


class AppState:
    pass


def _lineup():
    return [
        AgentConfig(
            seat_id=f"seat_{index}", display_name=f"Model {index}", personality="analytical",
            controller="ai", provider="mock", model_name=f"mock-{index % 2}",
        )
        for index in range(7)
    ]


@pytest.mark.asyncio
async def test_tournament_balances_roles_and_persists_aggregate(tmp_path):
    database_url = database_url_for_tests()
    conn = await DatabaseConnection.connect(database_url)
    await init_schema(conn)
    saver_context = AsyncPostgresSaver.from_conn_string(database_url)
    saver = await saver_context.__aenter__()
    await saver.setup()
    state = AppState()
    state.db_conn = conn
    state.graph = build_graph(saver)
    state.seat_mind = build_seat_mind(saver)
    request = TournamentRequest(lineup=_lineup(), game_count=2, concurrency=2)
    tournament_id = await prepare(request, state)

    for _ in range(100):
        record = await persistence.get_tournament(conn, tournament_id)
        if record and record["status"] in {"completed", "failed", "stopped_budget"}:
            break
        await asyncio.sleep(0.02)
    assert record is not None
    assert record["status"] == "completed", record.get("stop_reason")
    assert record["games_completed"] == 2
    report = summarize(record)
    assert report["summary"]
    assert report["totals"]["tokens"] > 0
    assert _rotated_roles(0)[0] == "werewolf"
    assert _rotated_roles(1)[-1] == "werewolf"
    await saver_context.__aexit__(None, None, None)
    await conn.close()


def test_tournament_rejects_humans_and_requires_seven_seats():
    with pytest.raises(ValueError):
        TournamentRequest(lineup=_lineup()[:6])
    lineup = _lineup()
    lineup[0].controller = "human"
    with pytest.raises(ValueError):
        TournamentRequest(lineup=lineup)
