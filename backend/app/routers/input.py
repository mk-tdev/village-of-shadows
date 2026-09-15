from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app import persistence
from app.game import access, registry
from app.visitor_location import country_for_request

router = APIRouter(prefix="/games", tags=["input"])


class InputRequest(BaseModel):
    seat_id: str
    kind: str  # "statement" | "vote" | "night_action"
    value: dict
    access_token: str | None = None


class ParticipantTelemetry(BaseModel):
    """Deliberately coarse browser context; never a raw user-agent or ID."""

    browser_name: str | None = Field(None, max_length=40)
    os_name: str | None = Field(None, max_length=40)
    language: str | None = Field(None, max_length=35)
    timezone: str | None = Field(None, max_length=80)
    device_class: str | None = Field(None, max_length=20)
    viewport_size: str | None = Field(None, max_length=20)
    connection_type: str | None = Field(None, max_length=20)
    save_data: bool | None = None


class ParticipantPresenceRequest(BaseModel):
    seat_id: str
    access_token: str | None = None
    telemetry: ParticipantTelemetry


@router.post("/{session_id}/presence")
async def participant_presence(
    session_id: str, body: ParticipantPresenceRequest, request: Request,
) -> dict:
    """Store one human's coarse browser context after seat authorization."""
    viewer = await access.authorize(
        request.app.state.db_conn,
        session_id,
        seat_id=body.seat_id,
        access_token=body.access_token,
    )
    if viewer is None or viewer.seat_id != body.seat_id:
        raise HTTPException(403, "This credential is not bound to that seat.")
    await access.mark_claimed(request.app.state.db_conn, session_id, body.seat_id)
    await persistence.record_game_participant(
        request.app.state.db_conn,
        session_id,
        body.seat_id,
        await country_for_request(request),
        body.telemetry.model_dump(exclude_none=True),
    )
    return {"ok": True}


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

    if awaiting.kind == "statement" and "turn_id" in body.value and body.value["turn_id"] != awaiting.turn_id:
        raise HTTPException(409, "This discussion turn has changed. Refresh and try again.")

    if awaiting.kind == "investigation":
        if body.value.get("turn_id") != awaiting.turn_id:
            raise HTTPException(409, "This investigation step has already changed. Refresh and try again.")
        if body.value.get("action") not in awaiting.options:
            raise HTTPException(422, "That action is not available in this investigation step.")

    if request is not None:
        await persistence.increment_participant_actions(
            request.app.state.db_conn, session_id, body.seat_id,
        )
    if orch.state.awaiting is not awaiting:
        raise HTTPException(409, "This action was already accepted.")
    orch.resume(body.value)
    return {"ok": True}
