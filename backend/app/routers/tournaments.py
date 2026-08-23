from fastapi import APIRouter, HTTPException, Request

from app import persistence
from app.game import tournaments
from app.model_preflight import preflight_models

router = APIRouter(prefix="/tournaments", tags=["tournaments"])


@router.post("")
async def create_tournament(body: tournaments.TournamentRequest, request: Request) -> dict:
    readiness = await preflight_models(body.lineup)
    if not readiness.ok:
        failures = [
            f"{item.display_name}: {item.message}"
            for item in readiness.results if not item.ok
        ]
        raise HTTPException(400, "Model preflight failed — " + "; ".join(failures))
    tournament_id = await tournaments.prepare(body, request.app.state)
    return {"tournament_id": tournament_id, "status": "queued"}


@router.get("/{tournament_id}")
async def get_tournament(tournament_id: str, request: Request) -> dict:
    record = await persistence.get_tournament(request.app.state.db_conn, tournament_id)
    if record is None:
        raise HTTPException(404, "No such tournament.")
    return tournaments.summarize(record)
