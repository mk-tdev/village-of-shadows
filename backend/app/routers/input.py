from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.game import registry

router = APIRouter(prefix="/games", tags=["input"])


class InputRequest(BaseModel):
    seat_id: str
    kind: str  # "statement" | "vote" | "night_action"
    value: dict


@router.post("/{session_id}/input")
async def submit_input(session_id: str, body: InputRequest) -> dict:
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")

    awaiting = orch.state.awaiting
    if awaiting is None:
        raise HTTPException(409, "This game is not currently awaiting input.")
    if awaiting.seat_id != body.seat_id or awaiting.kind != body.kind:
        raise HTTPException(409, f"Expected input from seat {awaiting.seat_id} of kind {awaiting.kind}.")

    orch.resume(body.value)
    return {"ok": True}
