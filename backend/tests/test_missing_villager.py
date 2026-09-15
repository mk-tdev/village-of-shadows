import json
import pytest
from fastapi import HTTPException
from app.game import branching, missing_villager, nodes
from app.game.views import build_agent_view, build_human_state_view
from app.models import GameOptions
from app.routers.input import InputRequest, submit_input
from tests.helpers import answer_for, make_orchestrator


async def start_case(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    orch.state.options = GameOptions(scenario="missing-villager")
    events = orch.subscribe()
    orch.start()
    await orch._task
    errors = []
    while not events.empty():
        event = events.get_nowait()
        if event["event"] == "error":
            errors.append(event["data"])
    assert not errors
    assert orch.state.awaiting.kind == "investigation"
    return orch


async def choose(orch, action):
    awaiting = orch.state.awaiting
    await submit_input(orch.session_id, InputRequest(seat_id=awaiting.seat_id, kind=awaiting.kind,
        value={"action": action, "turn_id": awaiting.turn_id}))
    await orch._task


async def investigate(orch):
    for action in ["enter", "inspect:cloth", "inspect:tracks"]:
        await choose(orch, action)
    for _ in range(3):
        await choose(orch, next(a for a in orch.state.awaiting.options if a.endswith(":alibi")))


@pytest.mark.asyncio
async def test_episode_runs_through_real_council_to_winner(tmp_path):
    orch = await start_case(tmp_path)
    assert orch.state.players[0].role == "villager"
    culprit = orch.state.missing_villager.culprit
    await investigate(orch)
    await choose(orch, "present:both")
    assert orch.state.awaiting.kind == "statement"
    assert orch.state.round == 1 and all(p.alive for p in orch.state.players)
    assert orch.state.missing_villager.culprit == culprit
    assert sum("Evidence presented" in (e.text or "") for e in orch.state.log) == 1
    for _ in range(50):
        if not orch.state.awaiting:
            break
        orch.resume(answer_for(orch.state.awaiting))
        await orch._task
    assert orch.state.winner
    assert orch.state.missing_villager.consequence in {"rescued", "missing"}


@pytest.mark.asyncio
async def test_private_truth_and_withheld_evidence(tmp_path):
    orch = await start_case(tmp_path)
    await investigate(orch)
    case = orch.state.missing_villager
    outsider = next(p for p in orch.state.players if p.seat_id not in {case.culprit, case.framed, case.witness, case.investigator})
    assert build_agent_view(orch.state, outsider.seat_id)["case_memory"] == []
    browser = build_human_state_view(orch.state, seat_id=case.investigator, host=False)
    assert "culprit" not in json.dumps(browser)
    assert "abducted" not in json.dumps(browser)
    assert "abducted" in json.dumps(build_agent_view(orch.state, case.culprit)["case_memory"])
    await choose(orch, "present:cloth")
    public = build_agent_view(orch.state, outsider.seat_id)["public_transcript"]
    assert "crescent" not in json.dumps(public) and "blue scarf" in json.dumps(public)
    memory = build_agent_view(orch.state, case.witness)["case_memory"]
    assert sum("Private interview" in text for text in memory) == 1


@pytest.mark.asyncio
async def test_invalid_and_stale_actions_are_rejected(tmp_path):
    orch = await start_case(tmp_path)
    original = orch.state.model_dump()
    for value, status in [({"action": "present:both", "turn_id": "case:0"}, 422),
                          ({"action": "enter", "turn_id": "case:99"}, 409)]:
        with pytest.raises(HTTPException) as error:
            await submit_input(orch.session_id, InputRequest(seat_id="seat_0", kind="investigation", value=value))
        assert error.value.status_code == status
        assert orch.state.model_dump() == original
    await choose(orch, "enter")
    assert orch.state.missing_villager.revision == 1


@pytest.mark.asyncio
async def test_pause_does_not_duplicate_discovery(tmp_path):
    orch = await start_case(tmp_path)
    await choose(orch, "enter")
    orch.request_pause()
    await choose(orch, "inspect:cloth")
    assert orch.state.paused
    orch.continue_game()
    await orch._task
    assert orch.state.missing_villager.discovered == ["cloth"]
    assert orch.state.missing_villager.revision == 2
    assert sum("Physical evidence" in (e.text or "") for e in orch.state.log) == 1


@pytest.mark.asyncio
async def test_branch_preserves_truth_and_parent(tmp_path):
    parent = await start_case(tmp_path)
    await investigate(parent)
    points = await branching.branch_points(parent.graph, parent.session_id)
    point = next(p for p in reversed(points) if "present:cloth" in p["options"])
    original = parent.state.model_dump()
    child = await branching.create_branch(graph=parent.graph, seat_mind=parent.seat_mind, conn=parent.conn,
        parent_session_id=parent.session_id, checkpoint_id=point["checkpoint_id"],
        replacement={"action": "present:cloth", "turn_id": point["turn_id"]})
    await child._task
    assert parent.state.model_dump() == original
    assert child.state.missing_villager.culprit == parent.state.missing_villager.culprit
    assert child.state.missing_villager.presented == ["cloth"]
    assert child.state.awaiting.kind == "statement"


@pytest.mark.asyncio
@pytest.mark.parametrize("correct", [True, False])
async def test_real_vote_controls_next_night_protection(tmp_path, correct):
    orch = await start_case(tmp_path)
    case = orch.state.missing_villager
    case.stage = "complete"
    target = case.culprit if correct else case.framed
    orch.state.phase = "day-vote"
    orch.state.vote_tally = {orch.state.find_seat(target).name: 5}
    config = {"configurable": {"session_id": orch.session_id}}
    await nodes.resolve_vote({"game": orch.state}, config)
    await missing_villager.consequence({"game": orch.state}, config)
    assert case.consequence == ("rescued" if correct else "missing")
    orch.state.round = 2
    orch.state.phase = "night"
    orch.state.night_target = orch.state.find_seat(case.investigator).name
    await nodes.resolve_night({"game": orch.state}, config)
    assert orch.state.find_seat(case.investigator).alive is correct
    if correct:
        orch.state.round = 3
        await nodes.resolve_night({"game": orch.state}, config)
        assert not orch.state.find_seat(case.investigator).alive


@pytest.mark.asyncio
async def test_concurrent_http_submissions_only_resume_once(tmp_path, monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from app.game.access import Viewer
    orch = await start_case(tmp_path)
    async def authorize(*args, **kwargs):
        return Viewer(seat_id="seat_0", host=True, protected=True)
    async def telemetry(*args, **kwargs):
        await asyncio.sleep(0)
    monkeypatch.setattr("app.routers.input.access.authorize", authorize)
    monkeypatch.setattr("app.routers.input.persistence.increment_participant_actions", telemetry)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db_conn=orch.conn)))
    body = InputRequest(seat_id="seat_0", kind="investigation", value={"action": "enter", "turn_id": "case:0"})
    results = await asyncio.gather(submit_input(orch.session_id, body, request), submit_input(orch.session_id, body, request), return_exceptions=True)
    assert sum(isinstance(r, dict) and r.get("ok") for r in results) == 1
    assert sum(isinstance(r, HTTPException) and r.status_code == 409 for r in results) == 1
    await orch._task
    assert orch.state.missing_villager.revision == 1
