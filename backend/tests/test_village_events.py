import pytest

from app.game import actions, nodes
from app.models import GameOptions, VillageEventState
from tests.helpers import make_orchestrator


def _config(orch, node):
    return {
        "configurable": {"session_id": orch.session_id},
        "metadata": {"langgraph_node": node},
    }


@pytest.mark.asyncio
async def test_event_selection_is_checkpointed_and_from_validated_ruleset(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.options = GameOptions(village_events=True)
    orch.state.phase = "day-discuss"
    await nodes.select_village_event(
        {"game": orch.state}, _config(orch, "select_village_event"),
    )
    assert orch.state.village_event is not None
    assert orch.state.village_event.kind in {
        "silence", "secret_vote", "forced_testimony", "discovered_evidence",
    }
    assert orch.state.event_history == [orch.state.village_event]
    assert orch.state.log[-1].type == "village_event"


@pytest.mark.asyncio
async def test_silence_event_skips_only_target_speaking_turn(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    orch.state.phase = "day-discuss"
    orch.state.village_event = VillageEventState(
        kind="silence", round=1, target_seat_id="seat_0", description="silenced",
    )
    await nodes.day_discussion({"game": orch.state}, _config(orch, "day_discussion"))
    assert orch.state.day_index == 1
    assert orch.state.awaiting is None
    assert "loses this speaking turn" in (orch.state.log[-1].text or "")


@pytest.mark.asyncio
async def test_secret_ballot_hides_individual_vote_but_reveals_final_tally(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "day-vote"
    orch.state.village_event = VillageEventState(
        kind="secret_vote", round=1, description="sealed",
    )
    target = orch.state.players[1].name
    await actions.apply_vote(orch, "seat_0", target)
    assert orch.state.log[-1].private is True
    await nodes.resolve_vote({"game": orch.state}, _config(orch, "resolve_vote"))
    assert any(
        entry.type == "system" and "Final tally" in (entry.text or "")
        for entry in orch.state.log
    )
