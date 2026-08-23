import pytest

from app import persistence
from app.game import branching
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_checkpoint_branch_restores_interrupt_and_keeps_parent_immutable(tmp_path, monkeypatch):
    monkeypatch.setattr("app.game.nodes.random.shuffle", lambda roles: None)
    parent = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    parent.start()
    await parent._task
    assert parent.state.awaiting is not None
    assert parent.state.awaiting.kind == "werewolf_negotiation"

    points = await branching.branch_points(parent.graph, parent.session_id)
    point = next(item for item in points if item["kind"] == "werewolf_negotiation")
    parent_log = [entry.model_dump() for entry in parent.state.log]
    target = point["options"][0]

    child = await branching.create_branch(
        graph=parent.graph,
        seat_mind=parent.seat_mind,
        conn=parent.conn,
        parent_session_id=parent.session_id,
        checkpoint_id=point["checkpoint_id"],
        replacement={"text": "Counterfactual opening plan", "target": target},
    )
    await child._task

    assert child.session_id != parent.session_id
    assert [entry.model_dump() for entry in parent.state.log] == parent_log
    assert any(
        entry.type == "werewolf_negotiation"
        and entry.seat_id == "seat_0"
        and entry.text == "Counterfactual opening plan"
        for entry in child.state.log
    )
    lineage = await persistence.get_branch_lineage(parent.conn, child.session_id)
    assert lineage is not None
    assert lineage["parent_game_id"] == parent.session_id
    assert lineage["checkpoint_id"] == point["checkpoint_id"]
    assert lineage["replacement"]["target"] == target


@pytest.mark.asyncio
async def test_branch_points_only_include_real_human_interrupts(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.start()
    await orch._task
    assert await branching.branch_points(orch.graph, orch.session_id) == []
