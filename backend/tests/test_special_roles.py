import pytest

from app.game import actions, nodes
from app.models import GameOptions
from tests.helpers import make_orchestrator


def _config(orch, node):
    return {
        "configurable": {"session_id": orch.session_id},
        "metadata": {"langgraph_node": node},
    }


@pytest.mark.asyncio
async def test_mayor_vote_is_server_weighted(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "day-vote"
    orch.state.players[0].role = "mayor"
    result = await actions.apply_vote(orch, "seat_0", orch.state.players[1].name)
    assert result["weight"] == 2
    assert orch.state.vote_tally[orch.state.players[1].name] == 2
    assert "two votes" in (orch.state.log[-1].text or "")


@pytest.mark.asyncio
async def test_only_pending_dead_hunter_can_take_final_shot(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    hunter = orch.state.players[0]
    hunter.role = "hunter"
    hunter.alive = False
    orch.state.hunter_pending = hunter.seat_id
    target = orch.state.players[1]
    result = await actions.hunter_retaliate(orch, hunter.seat_id, target.name)
    assert result["target"] == target.name
    assert target.alive is False
    assert orch.state.hunter_pending is None
    with pytest.raises(actions.ActionError):
        await actions.hunter_retaliate(orch, hunter.seat_id, orch.state.players[2].name)


@pytest.mark.asyncio
async def test_jester_wins_only_when_voted_out(tmp_path, monkeypatch):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.phase = "day-vote"
    jester = orch.state.players[3]
    jester.role = "jester"
    for player in orch.state.players[:2]:
        player.role = "werewolf"
    orch.state.vote_tally = {jester.name: 5}
    monkeypatch.setattr("app.game.nodes.random.choice", lambda values: values[0])
    await nodes.resolve_vote({"game": orch.state}, _config(orch, "resolve_vote"))
    await nodes.hunter_retaliation({"game": orch.state}, _config(orch, "hunter_retaliation_vote"))
    await nodes.check_win({"game": orch.state}, _config(orch, "check_win_vote"))
    assert orch.state.winner == "jester"
    assert orch.state.phase == "gameover"
    assert "Jester" in (orch.state.log[-1].text or "")


@pytest.mark.asyncio
async def test_expanded_role_pack_deals_all_configured_roles(tmp_path, monkeypatch):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.options = GameOptions(role_pack="expanded")
    monkeypatch.setattr("app.game.nodes.random.shuffle", lambda roles: None)
    await nodes.assign_roles({"game": orch.state}, _config(orch, "assign_roles"))
    assert [player.role for player in orch.state.players] == [
        "werewolf", "werewolf", "seer", "doctor", "hunter", "mayor", "jester",
    ]


@pytest.mark.asyncio
async def test_complete_expanded_mock_game_reaches_a_winner(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.options = GameOptions(role_pack="expanded", village_events=True)
    orch.start()
    await orch._task
    assert orch.state.winner in {"villagers", "werewolves", "jester"}
    assert orch.state.hunter_pending is None
