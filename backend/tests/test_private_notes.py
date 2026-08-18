"""FE-07: private notebooks are isolated, immutable, and replay-safe."""

import pytest

from app.game import actions
from app.game.actions import ActionError
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_note_lifecycle_preserves_every_revision_and_source(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "day-discuss"
    queue = orch.subscribe()
    await actions.apply_statement(orch, "seat_0", "Tomas changed his story.")

    created = await actions.record_private_note(
        orch,
        "seat_0",
        kind="suspicion",
        subject="Tomas",
        content="Tomas contradicted his earlier claim.",
        source_seq=0,
    )
    note_id = created["note"]["note_id"]
    revised = await actions.revise_private_note(
        orch,
        "seat_0",
        note_id=note_id,
        content="The contradiction may have been confusion, but Tomas remains suspicious.",
        source_seq=0,
    )
    retired = await actions.retire_private_note(
        orch,
        "seat_0",
        note_id=note_id,
        reason="New evidence resolved the contradiction.",
        source_seq=0,
    )

    history = await actions.get_note_history(orch, "seat_0")
    assert [event["revision"] for event in history] == [1, 2, 3]
    assert [event["operation"] for event in history] == ["create", "revise", "retire"]
    assert all(event["source_seq"] == 0 for event in history)
    assert all(event["created_at"] for event in history)
    assert revised["note"]["status"] == "active"
    assert retired["note"]["status"] == "retired"
    assert await actions.get_notes(orch, "seat_0") == []

    note_events = []
    while not queue.empty():
        event = queue.get_nowait()
        if event["event"] == "private_note":
            note_events.append(event)
    assert len(note_events) == 3
    assert {event["data"]["name"] for event in note_events} == {"Mara"}


@pytest.mark.asyncio
async def test_note_identity_and_private_evidence_are_isolated(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "night"
    orch.state.players[1].role = "doctor"
    await actions.apply_night_action(orch, "seat_1", "Mara")

    with pytest.raises(ActionError, match="not visible"):
        await actions.record_private_note(
            orch,
            "seat_0",
            kind="clue",
            content="I somehow know what the doctor did.",
            source_seq=0,
        )

    own = await actions.record_private_note(
        orch,
        "seat_1",
        kind="clue",
        content="I protected Mara tonight.",
        source_seq=0,
    )
    assert await actions.get_note_history(orch, "seat_0") == []
    assert len(await actions.get_note_history(orch, "seat_1")) == 1

    with pytest.raises(ActionError, match="belongs to this seat"):
        await actions.revise_private_note(
            orch,
            "seat_0",
            note_id=own["note"]["note_id"],
            content="Trying to edit another agent's belief.",
        )


@pytest.mark.asyncio
async def test_identical_note_operations_are_idempotent_on_replay(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "day-vote"

    first = await actions.record_private_note(
        orch, "seat_0", kind="theory", content="Elin and Bram may be aligned.",
    )
    replay = await actions.record_private_note(
        orch, "seat_0", kind="theory", content="Elin and Bram may be aligned.",
    )
    assert first["note"]["event_key"] == replay["note"]["event_key"]
    assert replay["replayed"] is True

    note_id = first["note"]["note_id"]
    revision = await actions.revise_private_note(
        orch, "seat_0", note_id=note_id, content="Only Bram remains suspicious.",
    )
    revision_replay = await actions.revise_private_note(
        orch, "seat_0", note_id=note_id, content="Only Bram remains suspicious.",
    )
    assert revision["note"]["event_key"] == revision_replay["note"]["event_key"]
    assert revision_replay["replayed"] is True

    retired = await actions.retire_private_note(
        orch, "seat_0", note_id=note_id, reason="Bram was cleared.",
    )
    retired_replay = await actions.retire_private_note(
        orch, "seat_0", note_id=note_id, reason="Bram was cleared.",
    )
    assert retired["note"]["event_key"] == retired_replay["note"]["event_key"]
    assert retired_replay["replayed"] is True

    history = await actions.get_note_history(orch, "seat_0")
    assert len(history) == 3
