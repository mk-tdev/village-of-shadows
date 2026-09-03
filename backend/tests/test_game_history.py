import pytest

from app import persistence
from app.models import LogEntry
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_game_archive_tracks_only_joined_humans_timing_and_public_transcript(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human", "human"] + ["ai"] * 5)
    await persistence.begin_game(orch.conn, orch.session_id)
    await persistence.record_game_participant(orch.conn, orch.session_id, "seat_0", "SG")
    public = LogEntry(
        seq=0, round=1, phase="day-discuss", type="statement",
        seat_id="seat_0", text="I am listening closely.", private=False,
    )
    private = LogEntry(
        seq=1, round=1, phase="night", type="seer",
        seat_id="seat_0", text="secret result", private=True,
    )
    await persistence.record_log_entry(orch.conn, orch.session_id, public)
    await persistence.record_log_entry(orch.conn, orch.session_id, private)
    await persistence.finish_game(orch.conn, orch.session_id, "villagers")

    history = await persistence.list_game_history(orch.conn)
    assert len(history) == 1
    summary = history[0]
    assert summary["status"] == "finished"
    assert summary["winner"] == "villagers"
    assert summary["started_at"] is not None
    assert summary["finished_at"] is not None
    joined, invited = summary["participants"]
    assert (joined["seat_id"], joined["name"], joined["country_code"], joined["joined"]) == (
        "seat_0", "Mara", "SG", True,
    )
    assert joined["actions_taken"] == 0
    assert (invited["seat_id"], invited["name"], invited["joined"]) == ("seat_1", "Tomas", False)

    archive = await persistence.get_game_archive(orch.conn, orch.session_id)
    assert archive is not None
    assert [entry["text"] for entry in archive["public_log"]] == ["I am listening closely."]


@pytest.mark.asyncio
async def test_multiple_active_sessions_have_independent_history_rows(tmp_path):
    first = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    second = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    await persistence.begin_game(first.conn, first.session_id)
    await persistence.begin_game(second.conn, second.session_id)

    history = await persistence.list_game_history(first.conn)
    assert {game["session_id"] for game in history} == {first.session_id, second.session_id}
    assert all(game["status"] == "in_progress" for game in history)
