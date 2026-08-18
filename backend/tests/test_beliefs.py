"""FE-02: private relationship scores are isolated, immutable, and auditable."""

import pytest

from app.game import actions
from app.game.actions import ActionError
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_belief_revisions_preserve_scores_reasons_and_sources(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "day-discuss"
    queue = orch.subscribe()
    await actions.apply_statement(orch, "seat_0", "Elin changed her story.")

    first = await actions.update_belief(
        orch, "seat_1", subject="Elin", suspicion=64, confidence=55,
        reason="His public account changed.", source_seq=0,
    )
    second = await actions.update_belief(
        orch, "seat_1", subject="Elin", suspicion=31, confidence=78,
        reason="A later explanation resolved the apparent contradiction.", source_seq=0,
    )

    history = await actions.get_belief_history(orch, "seat_1")
    latest = await actions.get_beliefs(orch, "seat_1")
    assert [event["revision"] for event in history] == [1, 2]
    assert [event["suspicion"] for event in history] == [64, 31]
    assert [event["trust"] for event in history] == [36, 69]
    assert all(event["source_seq"] == 0 for event in history)
    assert latest == [second["belief"]]
    assert first["belief"]["observer_name"] == "Tomas"
    assert first["belief"]["subject_name"] == "Elin"

    updates = []
    while not queue.empty():
        event = queue.get_nowait()
        if event["event"] == "belief_update":
            updates.append(event["data"])
    assert len(updates) == 2


@pytest.mark.asyncio
async def test_beliefs_are_observer_private_and_cannot_cite_hidden_evidence(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "night"
    orch.state.players[1].role = "doctor"
    await actions.apply_night_action(orch, "seat_1", "Mara")

    with pytest.raises(ActionError, match="not visible"):
        await actions.update_belief(
            orch, "seat_0", subject="Tomas", suspicion=80, confidence=90,
            reason="I should not know whom the doctor protected.", source_seq=0,
        )

    await actions.update_belief(
        orch, "seat_1", subject="Mara", suspicion=18, confidence=45,
        reason="My protection choice reflects provisional trust.", source_seq=0,
    )
    assert await actions.get_belief_history(orch, "seat_0") == []
    assert len(await actions.get_belief_history(orch, "seat_1")) == 1


@pytest.mark.asyncio
async def test_belief_updates_validate_identity_scores_and_replay(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "day-vote"

    first = await actions.update_belief(
        orch, "seat_0", subject="Elin", suspicion=77, confidence=68,
        reason="Elin is my leading suspect.",
    )
    replay = await actions.update_belief(
        orch, "seat_0", subject="Elin", suspicion=77, confidence=68,
        reason="Elin is my leading suspect.",
    )
    assert replay["replayed"] is True
    assert replay["belief"]["event_key"] == first["belief"]["event_key"]
    assert len(await actions.get_belief_history(orch, "seat_0")) == 1

    with pytest.raises(ActionError, match="itself"):
        await actions.update_belief(
            orch, "seat_0", subject="Mara", suspicion=50, confidence=50, reason="Self.",
        )
    with pytest.raises(ActionError, match="0 to 100"):
        await actions.update_belief(
            orch, "seat_0", subject="Elin", suspicion=101, confidence=50, reason="Invalid.",
        )
    with pytest.raises(ActionError, match="not a player"):
        await actions.update_belief(
            orch, "seat_0", subject="Nobody", suspicion=50, confidence=50, reason="Invalid.",
        )


@pytest.mark.asyncio
async def test_role_reveal_can_change_belief_without_rewriting_history(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "day-resolve"
    await actions.update_belief(
        orch, "seat_0", subject="Elin", suspicion=71, confidence=63,
        reason="The vote pattern looked coordinated.",
    )
    orch.state.players[2].alive = False
    await actions.update_belief(
        orch, "seat_0", subject="Elin", suspicion=3, confidence=100,
        reason="The revealed villager role cleared Elin.",
    )

    history = await actions.get_belief_history(orch, "seat_0")
    assert [event["suspicion"] for event in history] == [71, 3]
    assert history[-1]["subject_alive"] is False
