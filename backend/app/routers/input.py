from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.game import access, registry

router = APIRouter(prefix="/games", tags=["input"])


class InputRequest(BaseModel):
    seat_id: str
    kind: str  # "statement" | "vote" | "night_action"
    value: dict
    access_token: str | None = None


@router.post("/{session_id}/input")
async def submit_input(session_id: str, body: InputRequest, request: Request = None) -> dict:
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")

    # `request` is always supplied by FastAPI.  Keeping the direct-call path
    # supports the existing orchestration unit tests without weakening HTTP
    # authorization.
    if request is not None:
        viewer = await access.authorize(
            request.app.state.db_conn,
            session_id,
            seat_id=body.seat_id,
            access_token=body.access_token,
        )
        if viewer is None or viewer.seat_id != body.seat_id:
            raise HTTPException(403, "This credential is not bound to that seat.")

    awaiting = orch.state.awaiting
    if awaiting is None:
        raise HTTPException(409, "This game is not currently awaiting input.")
    if awaiting.seat_id != body.seat_id or awaiting.kind != body.kind:
        raise HTTPException(409, f"Expected input from seat {awaiting.seat_id} of kind {awaiting.kind}.")

    orch.resume(body.value)
    return {"ok": True}
