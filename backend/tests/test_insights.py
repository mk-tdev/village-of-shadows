import pytest

from app import persistence
from app.game.insights import build_deception_report, build_perspective
from app.models import LogEntry
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_perspective_never_leaks_future_or_other_seat_private_state(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    for index, player in enumerate(orch.state.players):
        player.role = "seer" if index == 0 else "werewolf" if index in {1, 2} else "villager"
    orch.state.phase = "day-discuss"
    orch.state.log = [
        LogEntry(seq=0, round=1, phase="day-discuss", type="statement", seat_id="seat_3", text="Public clue", private=False),
        LogEntry(seq=1, round=1, phase="night", type="seer", seat_id="seat_0", target="Tomas", text="Tomas is werewolf", private=True),
        LogEntry(seq=2, round=2, phase="day-discuss", type="statement", seat_id="seat_4", text="Future claim", private=False),
    ]

    early = await build_perspective(orch.conn, orch.state, "seat_0", through_seq=0)
    assert [event["text"] for event in early["public_transcript"]] == ["Public clue"]
    assert early["private_knowledge"]["known_roles"] == {}
    assert all(event["seq"] <= 0 for event in early["visible_events"])

    wolf = await build_perspective(orch.conn, orch.state, "seat_1", through_seq=2)
    assert all(event["type"] != "seer" for event in wolf["visible_events"])
    assert "known_roles" not in wolf["private_knowledge"]


@pytest.mark.asyncio
async def test_perspective_filters_notes_and_beliefs_by_source_event(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.players[0].role = "villager"
    orch.state.log = [
        LogEntry(seq=0, round=1, phase="day-discuss", type="statement", text="first", private=False),
        LogEntry(seq=1, round=1, phase="day-discuss", type="statement", text="second", private=False),
    ]
    await persistence.record_note_event(
        orch.conn, session_id=orch.session_id, seat_id="seat_0", note_id="n1", revision=1,
        operation="create", kind="clue", subject="Tomas", content="late clue", status="active",
        source_seq=1, source_phase="day-discuss", source_round=1, event_key=f"{orch.session_id}:note",
    )
    await persistence.record_belief_event(
        orch.conn, session_id=orch.session_id, observer_seat_id="seat_0", subject_seat_id="seat_1",
        revision=1, suspicion=70, confidence=60, reason="late clue", source_seq=1,
        source_phase="day-discuss", source_round=1, event_key=f"{orch.session_id}:belief",
    )
    early = await build_perspective(orch.conn, orch.state, "seat_0", through_seq=0)
    assert early["private_notes"] == []
    assert early["beliefs"] == []
    late = await build_perspective(orch.conn, orch.state, "seat_0", through_seq=1)
    assert len(late["private_notes"]) == 1
    assert len(late["beliefs"]) == 1


@pytest.mark.asyncio
async def test_deception_report_separates_persisted_fact_from_interpretation(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.players[0].role = "werewolf"
    orch.state.winner = "werewolves"
    orch.state.log = [
        LogEntry(seq=0, round=1, phase="day-discuss", type="statement", seat_id="seat_0", name="Mara", text="Trust me", private=False),
        LogEntry(seq=1, round=1, phase="day-vote", type="vote", seat_id="seat_0", name="Mara", target="Tomas", text="votes for Tomas", private=False),
        LogEntry(seq=2, round=1, phase="day-vote", type="death", target="Tomas", text="Tomas was cast out", private=False),
    ]
    report = await build_deception_report(orch.conn, orch.state, include_private=True)
    assert report["claims"][0]["classification"] == "wolf-framing"
    assert "Persisted" in report["claims"][0]["fact"]
    assert report["claims"][0]["interpretation"]
    assert report["turning_point"]["seq"] == 2
