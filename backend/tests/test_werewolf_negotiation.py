"""FE-01: bounded, private, replay-safe werewolf coordination."""

import pytest

from app.game import actions
from app.game.actions import ActionError
from app.game.rules import (
    WEREWOLF_NEGOTIATION_CHAR_BUDGET,
    resolve_werewolf_target,
    werewolf_turn_limit,
)
from tests.helpers import make_orchestrator


def _deal_two_wolves(orch):
    first, second, *others = orch.state.players
    first.role = "werewolf"
    second.role = "werewolf"
    for player in others:
        player.role = "villager"
    orch.state.phase = "night"
    orch.state.wolf_index = 0
    return first, second, others


@pytest.mark.asyncio
async def test_private_council_enforces_identity_order_budget_and_one_commit(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    first, second, villagers = _deal_two_wolves(orch)

    with pytest.raises(ActionError, match="not this werewolf"):
        await actions.negotiate_message(orch, second.seat_id, "Strike now.", villagers[0].name)

    result = await actions.negotiate_message(
        orch,
        first.seat_id,
        "Elin is observant. Remove her, then question Bram's voting tomorrow.",
        villagers[0].name,
    )
    assert result == {"ok": True, "target": villagers[0].name, "turn": 1}
    assert orch.state.wolf_proposals[first.seat_id] == villagers[0].name
    assert orch.state.log[-1].private is True
    assert orch.state.log[-1].type == "werewolf_negotiation"

    with pytest.raises(ActionError, match="already been committed"):
        await actions.negotiate_message(orch, first.seat_id, "I changed my mind.", villagers[1].name)

    orch.state.wolf_index = 1
    with pytest.raises(ActionError, match="token budget"):
        await actions.negotiate_message(
            orch,
            second.seat_id,
            "x" * (WEREWOLF_NEGOTIATION_CHAR_BUDGET + 1),
            villagers[1].name,
        )

    outsider = villagers[0]
    with pytest.raises(ActionError, match="Only werewolves"):
        await actions.negotiate_message(orch, outsider.seat_id, "Let me in.", villagers[1].name)


@pytest.mark.asyncio
async def test_each_wolf_can_revise_and_disagreement_uses_pack_leader(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    first, second, villagers = _deal_two_wolves(orch)
    assert werewolf_turn_limit(orch.state) == 4

    proposals = [villagers[0].name, villagers[1].name, villagers[2].name, villagers[3].name]
    speakers = [first, second, first, second]
    for turn, (speaker, target) in enumerate(zip(speakers, proposals, strict=True)):
        orch.state.wolf_index = turn
        await actions.negotiate_message(
            orch,
            speaker.seat_id,
            f"Council turn {turn + 1}: I now favor {target}.",
            target,
        )

    assert orch.state.wolf_proposals == {
        first.seat_id: villagers[2].name,
        second.seat_id: villagers[3].name,
    }
    target, method = resolve_werewolf_target(orch.state)
    assert target == villagers[2].name
    assert method == f"pack-leader tie-break ({first.name})"


@pytest.mark.asyncio
async def test_werewolf_can_pass_without_creating_or_replacing_a_proposal(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    first, second, villagers = _deal_two_wolves(orch)

    opening = await actions.skip_werewolf_negotiation(orch, first.seat_id)
    assert opening == {"ok": True, "skipped": True, "target": None, "turn": 1}
    assert first.seat_id not in orch.state.wolf_proposals
    assert orch.state.log[-1].private is True
    assert orch.state.log[-1].target is None

    orch.state.wolf_index = 1
    await actions.negotiate_message(orch, second.seat_id, "I favor Elin.", villagers[0].name)
    orch.state.wolf_index = 2
    await actions.negotiate_message(orch, first.seat_id, "Agreed for now.", villagers[1].name)
    orch.state.wolf_index = 3
    passed = await actions.skip_werewolf_negotiation(orch, second.seat_id)

    assert passed["target"] == villagers[0].name
    assert orch.state.wolf_proposals[second.seat_id] == villagers[0].name
    assert orch.state.log[-1].target == villagers[0].name


@pytest.mark.asyncio
async def test_mock_game_persists_bounded_negotiation_and_final_plan(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.start()
    await orch._task

    council = [entry for entry in orch.state.log if entry.type == "werewolf_negotiation"]
    assert council, "two living wolves should negotiate in at least the opening night"
    messages = [entry for entry in council if entry.seat_id is not None]
    resolutions = [entry for entry in council if entry.seat_id is None]
    assert messages
    assert resolutions
    assert all(entry.private for entry in council)
    assert all(len(entry.text or "") <= WEREWOLF_NEGOTIATION_CHAR_BUDGET for entry in messages)

    first_round_messages = [entry for entry in messages if entry.round == 1]
    assert len(first_round_messages) == 4
    assert len({entry.seat_id for entry in first_round_messages}) == 2

    cursor = await orch.conn.execute(
        "SELECT COUNT(*) FROM log_entries WHERE game_id = ? AND type = 'werewolf_negotiation'",
        (orch.session_id,),
    )
    assert (await cursor.fetchone())[0] == len(council)


@pytest.mark.asyncio
async def test_human_wolf_revision_is_a_distinct_interrupt_turn(tmp_path, monkeypatch):
    # Keep the fixed role deck order so seat_0 and seat_1 are the two wolves.
    monkeypatch.setattr("app.game.nodes.random.shuffle", lambda roles: None)
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    orch.start()
    await orch._task

    opening = orch.state.awaiting
    assert opening is not None
    assert opening.kind == "werewolf_negotiation"
    assert opening.turn_id == "1:werewolf-negotiation:0"

    orch.resume({"text": "I open with Elin as the target.", "target": opening.options[0]})
    await orch._task

    revision = orch.state.awaiting
    assert revision is not None
    assert revision.kind == "werewolf_negotiation"
    assert revision.turn_id == "1:werewolf-negotiation:2"
    assert revision.turn_id != opening.turn_id
    assert [
        entry.seat_id
        for entry in orch.state.log
        if entry.type == "werewolf_negotiation" and entry.seat_id is not None
    ] == ["seat_0", "seat_1"]
