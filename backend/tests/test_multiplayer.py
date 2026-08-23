import pytest

from app.game import access
from app.game.views import build_human_state_view
from app.models import AwaitingInput, LogEntry
from tests.helpers import answer_for, make_orchestrator


@pytest.mark.asyncio
async def test_room_tokens_are_bound_to_exact_human_seats(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human", "human"] + ["ai"] * 5)
    issued = await access.create_game_access(orch.conn, orch.session_id, ["seat_0", "seat_1"])
    seat_0 = await access.authorize(
        orch.conn, orch.session_id, seat_id="seat_0",
        access_token=issued["seat_tokens"]["seat_0"],
    )
    assert seat_0 is not None and seat_0.seat_id == "seat_0" and not seat_0.host
    wrong = await access.authorize(
        orch.conn, orch.session_id, seat_id="seat_1",
        access_token=issued["seat_tokens"]["seat_0"],
    )
    assert wrong is None
    host = await access.authorize(
        orch.conn, orch.session_id, host_token=issued["host_token"],
    )
    assert host is not None and host.host

    assert await access.release_human_seat_to_ai(orch.conn, orch.session_id, "seat_1")
    released = await access.authorize(
        orch.conn, orch.session_id, seat_id="seat_1",
        access_token=issued["seat_tokens"]["seat_1"],
    )
    assert released is None
    cursor = await orch.conn.execute(
        "SELECT controller, provider, model_name FROM seats WHERE game_id = ? AND seat_id = ?",
        (orch.session_id, "seat_1"),
    )
    assert await cursor.fetchone() == ("ai", "mock", "mock-v1")


@pytest.mark.asyncio
async def test_browser_projection_filters_roles_private_logs_and_other_prompts(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human", "human"] + ["ai"] * 5)
    for index, player in enumerate(orch.state.players):
        player.role = "seer" if index == 0 else "werewolf" if index in {1, 2} else "villager"
    orch.state.seer_knowledge["seat_0"] = {"Tomas": "werewolf"}
    orch.state.log = [
        LogEntry(seq=0, round=1, phase="night", type="seer", seat_id="seat_0", text="private result", private=True),
        LogEntry(seq=1, round=1, phase="night", type="werewolf", seat_id="seat_1", text="wolf plan", private=True),
        LogEntry(seq=2, round=1, phase="day-discuss", type="statement", seat_id="seat_3", text="public", private=False),
    ]
    orch.state.awaiting = AwaitingInput(kind="statement", seat_id="seat_1", prompt="Your turn")
    seer = build_human_state_view(orch.state, seat_id="seat_0", host=False)
    assert [entry["text"] for entry in seer["log"]] == ["private result", "public"]
    assert seer["players"][0]["role"] == "seer"
    assert seer["players"][1]["role"] is None
    assert seer["awaiting"] is None
    assert seer["seer_knowledge"] == {"seat_0": {"Tomas": "werewolf"}}

    wolf = build_human_state_view(orch.state, seat_id="seat_1", host=False)
    assert "wolf plan" in [entry["text"] for entry in wolf["log"]]
    assert wolf["players"][2]["role"] == "werewolf"
    assert wolf["awaiting"]["seat_id"] == "seat_1"


@pytest.mark.asyncio
async def test_graph_waits_for_different_human_browsers_sequentially(tmp_path, monkeypatch):
    monkeypatch.setattr("app.game.nodes.random.shuffle", lambda roles: None)
    orch = await make_orchestrator(tmp_path, ["human", "human"] + ["ai"] * 5)
    orch.start()
    seen = []
    for _ in range(100):
        await orch._task
        if orch.state.awaiting is None:
            break
        seen.append(orch.state.awaiting.seat_id)
        orch.resume(answer_for(orch.state.awaiting))
    assert "seat_0" in seen
    assert "seat_1" in seen
