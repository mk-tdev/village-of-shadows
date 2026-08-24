from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import persistence
from app.game import access, registry
from app.models import LogEntry
from app.routers import games
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_delete_game_data_removes_primary_private_and_derived_records(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    session_id = orch.session_id
    await access.create_game_access(orch.conn, session_id, ["seat_0"])
    await persistence.record_log_entry(
        orch.conn,
        session_id,
        LogEntry(
            seq=1,
            round=1,
            phase="night",
            type="seer",
            seat_id="seat_0",
            text="private discovery",
            private=True,
        ),
    )
    await persistence.create_replay_share(
        orch.conn,
        share_id="delete-me",
        game_id=session_id,
        scope="public",
        secret_hash=None,
        snapshot={"event": "derived"},
        expires_at=None,
    )

    deleted = await persistence.delete_game_data(orch.conn, session_id)

    assert deleted["games"] == 1
    for table in ("games", "seats", "log_entries", "game_hosts", "seat_access_tokens", "replay_shares"):
        key = "id" if table == "games" else "game_id"
        cursor = await orch.conn.execute(f"SELECT COUNT(*) FROM {table} WHERE {key} = ?", (session_id,))
        assert (await cursor.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_delete_game_data_rejects_unknown_game(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    with pytest.raises(KeyError):
        await persistence.delete_game_data(orch.conn, "missing")


@pytest.mark.asyncio
async def test_delete_game_data_endpoint_requires_host_and_unregisters_game(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    issued = await access.create_game_access(orch.conn, orch.session_id, ["seat_0"])
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        db_conn=orch.conn,
        graph=orch.graph,
        seat_mind=orch.seat_mind,
    )))

    with pytest.raises(HTTPException) as exc:
        await games.delete_game_data(orch.session_id, request)
    assert exc.value.status_code == 403

    result = await games.delete_game_data(
        orch.session_id,
        request,
        host_token=issued["host_token"],
    )
    assert result["ok"] is True
    with pytest.raises(KeyError):
        registry.get(orch.session_id)
