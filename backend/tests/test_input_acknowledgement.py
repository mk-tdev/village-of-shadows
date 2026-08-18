"""Human submissions close exactly one pending prompt in the browser and graph."""

import pytest
from fastapi import HTTPException

from app.models import AwaitingInput
from app.routers.input import InputRequest, submit_input
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_accepted_vote_publishes_prompt_closure_and_rejects_duplicate(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    orch.state.awaiting = AwaitingInput(
        kind="vote",
        seat_id="seat_0",
        prompt="Who should leave the village?",
        options=["Tomas", "Elin"],
    )
    queue = orch.subscribe()
    resumed_with = []

    async def capture_resume(value):
        resumed_with.append(value)

    # This test is about the HTTP/SSE handoff, not running the whole graph.
    orch._run = capture_resume
    body = InputRequest(seat_id="seat_0", kind="vote", value={"target": "Tomas"})

    assert await submit_input(orch.session_id, body) == {"ok": True}
    await orch._task

    assert orch.state.awaiting is None
    assert resumed_with
    assert queue.get_nowait() == {
        "event": "input_accepted",
        "data": {"seat_id": "seat_0", "kind": "vote"},
    }

    with pytest.raises(HTTPException) as duplicate:
        await submit_input(orch.session_id, body)
    assert duplicate.value.status_code == 409
