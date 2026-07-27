import uuid

from fastapi import APIRouter, HTTPException, Request

from app import persistence
from app.game import registry
from app.game.orchestrator import GameOrchestrator
from app.models import AgentConfig, GameState, Player

router = APIRouter(prefix="/games", tags=["games"])


@router.post("")
async def create_game(configs: list[AgentConfig], request: Request) -> dict:
    humans = [c for c in configs if c.controller == "human"]
    if len(humans) != 1:
        raise HTTPException(400, "Exactly one seat must have controller='human'.")
    names = [c.display_name for c in configs]
    if len(names) != len(set(names)):
        raise HTTPException(400, "Seat names must be unique.")
    for c in configs:
        if c.controller == "ai" and not (c.provider and c.model_name):
            raise HTTPException(400, f"Seat {c.seat_id} needs a provider and model_name.")

    session_id = str(uuid.uuid4())
    players = [
        Player(
            seat_id=c.seat_id, name=c.display_name, personality=c.personality,
            controller=c.controller, provider=c.provider, model_name=c.model_name,
            endpoint=c.endpoint,
        )
        for c in configs
    ]
    state = GameState(session_id=session_id, players=players)

    conn = request.app.state.db_conn
    graph = request.app.state.graph
    await persistence.create_game(conn, session_id, configs)

    orch = GameOrchestrator(session_id, state, conn, graph)
    registry.register(orch)
    orch.start()

    return {"session_id": session_id}


@router.get("/{session_id}/state")
async def get_state(session_id: str) -> dict:
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    return orch.state.model_dump()


@router.get("/{session_id}/decisions")
async def get_decisions(session_id: str, request: Request) -> list[dict]:
    conn = request.app.state.db_conn
    return await persistence.get_decisions(conn, session_id)


@router.post("/{session_id}/pause")
async def pause_game(session_id: str) -> dict:
    """Requests a pause -- takes effect the next time any seat's turn
    finishes (see nodes.py's `_maybe_pause`), not instantly. It never
    preempts a turn already in flight, so an agent's tool call or a
    human's pending prompt always completes cleanly first."""
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    orch.request_pause()
    return {"ok": True}


@router.post("/{session_id}/continue")
async def continue_game(session_id: str) -> dict:
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    if not orch.state.paused:
        raise HTTPException(409, "Game is not paused.")
    orch.continue_game()
    return {"ok": True}
