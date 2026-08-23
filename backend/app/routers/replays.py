from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app import persistence
from app.game import access, registry, sharing

router = APIRouter(tags=["replays"])


class ShareRequest(BaseModel):
    scope: Literal["public", "god"] = "public"
    expires_in_hours: int | None = Field(default=168, ge=1, le=24 * 365)


async def _host(request: Request, game_id: str, host_token: str | None) -> None:
    viewer = await access.authorize(
        request.app.state.db_conn, game_id, host_token=host_token,
    )
    if viewer is None or not viewer.host:
        raise HTTPException(403, "The host credential is required.")


@router.post("/games/{game_id}/shares")
async def create_share(game_id: str, body: ShareRequest, request: Request, host_token: str | None = None) -> dict:
    await _host(request, game_id, host_token)
    try:
        orch = registry.get(game_id)
    except KeyError:
        raise HTTPException(404, "No such game.") from None
    if orch.state.winner is None:
        raise HTTPException(409, "Only completed games can be shared.")
    return await sharing.create_share(
        graph=request.app.state.graph,
        seat_mind=request.app.state.seat_mind,
        conn=request.app.state.db_conn,
        state=orch.state,
        scope=body.scope,
        expires_in_hours=body.expires_in_hours,
    )


@router.get("/games/{game_id}/shares")
async def list_shares(game_id: str, request: Request, host_token: str | None = None) -> list[dict]:
    await _host(request, game_id, host_token)
    return await persistence.list_replay_shares(request.app.state.db_conn, game_id)


@router.delete("/games/{game_id}/shares/{share_id}")
async def revoke_share(game_id: str, share_id: str, request: Request, host_token: str | None = None) -> dict:
    await _host(request, game_id, host_token)
    if not await persistence.revoke_replay_share(request.app.state.db_conn, game_id, share_id):
        raise HTTPException(404, "No active share exists with that ID.")
    return {"ok": True}


@router.get("/replays/{share_id}")
async def get_replay(share_id: str, request: Request, secret: str | None = None) -> dict:
    replay = await sharing.resolve_share(request.app.state.db_conn, share_id, secret)
    if replay is None:
        raise HTTPException(404, "This replay is invalid, expired, revoked, or requires a secret.")
    return replay
