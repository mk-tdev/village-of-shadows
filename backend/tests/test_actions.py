"""Focused tests for rule actions and the live deltas they publish."""

import pytest

from app.game.actions import apply_night_action
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_seer_action_publishes_structured_result(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    seer = orch.state.players[0]
    target = orch.state.players[1]
    seer.role = "seer"
    target.role = "werewolf"
    orch.state.phase = "night"
    queue = orch.subscribe()

    result = await apply_night_action(orch, seer.seat_id, target.name)

    assert result == {"ok": True, "target": target.name, "role": "werewolf"}
    assert orch.state.seer_knowledge == {seer.seat_id: {target.name: "werewolf"}}
    events = []
    while not queue.empty():
        events.append(queue.get_nowait())
    assert {
        "event": "seer_result",
        "data": {
            "seat_id": seer.seat_id,
            "target": target.name,
            "role": "werewolf",
        },
    } in events
