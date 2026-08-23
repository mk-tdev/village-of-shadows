import pytest

from app import persistence
from app.game.relationships import capture_game
from app.models import GameOptions, LogEntry
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_relationship_capture_is_opt_in_source_cited_and_role_agnostic(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.options = GameOptions(cross_game_memory=True)
    orch.state.players[1].role = "werewolf"
    orch.state.log = [
        LogEntry(seq=3, round=1, phase="day-discuss", type="statement", text="A public contradiction", private=False),
    ]
    await persistence.record_belief_event(
        orch.conn,
        session_id=orch.session_id,
        observer_seat_id="seat_0",
        subject_seat_id="seat_1",
        revision=1,
        suspicion=82,
        confidence=75,
        reason="The seer says this player is a werewolf",
        source_seq=3,
        source_phase="day-discuss",
        source_round=1,
        event_key=f"{orch.session_id}:relationship-belief",
    )

    await capture_game(orch.conn, orch.state)
    memories = await persistence.get_relationship_memories(orch.conn, owner_name="Mara")
    assert len(memories) == 1
    assert memories[0]["source_game_id"] == orch.session_id
    assert memories[0]["source_seq"] == 3
    assert "communication" in memories[0]["memory"]
    assert "seer" not in memories[0]["memory"].lower()
    assert "werewolf" not in memories[0]["memory"].lower()


@pytest.mark.asyncio
async def test_relationship_capture_disabled_and_archive_is_editable(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    await capture_game(orch.conn, orch.state)
    assert await persistence.get_relationship_memories(orch.conn) == []

    await persistence.record_relationship_memory(
        orch.conn,
        owner_name="Mara",
        subject_name="Tomas",
        memory="Observed a voting habit.",
        source_game_id=orch.session_id,
        source_seq=4,
        event_key=f"{orch.session_id}:manual-memory",
    )
    memory = (await persistence.get_relationship_memories(orch.conn))[0]
    assert await persistence.edit_relationship_memory(orch.conn, memory["id"], "Edited observation.")
    assert (await persistence.get_relationship_memories(orch.conn))[0]["memory"] == "Edited observation."
    assert await persistence.delete_relationship_memory(orch.conn, memory["id"])
    assert await persistence.get_relationship_memories(orch.conn) == []
