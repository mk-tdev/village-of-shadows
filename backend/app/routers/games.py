import uuid

from fastapi import APIRouter, HTTPException, Request

from app import persistence
from app.game import registry, timeline
from app.game.orchestrator import GameOrchestrator
from app.model_preflight import ModelPreflightResponse, preflight_models
from app.models import AgentConfig, GameState, Player

router = APIRouter(prefix="/games", tags=["games"])


@router.post("/preflight", response_model=ModelPreflightResponse)
async def preflight_game_models(configs: list[AgentConfig]) -> ModelPreflightResponse:
    """Prove every AI configuration can answer and call a bound tool.

    This route is intentionally read-only: no game, database row, or graph is
    created until the setup page receives an all-clear and calls POST /games.
    """

    return await preflight_models(configs)


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

    orch = GameOrchestrator(session_id, state, conn, graph, request.app.state.seat_mind)
    registry.register(orch)
    # Deliberately not orch.start() here -- see GameOrchestrator.started's
    # docstring. The graph only begins advancing once the human clicks
    # "Start Game" on the already-connected game page (begin_game below),
    # so nothing can run ahead of a browser that hasn't opened its SSE
    # connection yet.

    return {"session_id": session_id}


@router.post("/{session_id}/begin")
async def begin_game(session_id: str) -> dict:
    """Actually starts the graph running. Split out from create_game so the
    human's browser has a chance to open its SSE connection and see the
    game sitting in the "lobby" phase first -- otherwise a fast (especially
    mock-provider) game could advance several steps before the frontend
    ever connects, and the player would land mid-story with no idea what
    they missed."""
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    if orch.started:
        raise HTTPException(409, "Game has already begun.")
    orch.start()
    return {"ok": True}


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


@router.get("/{session_id}/timeline")
async def get_timeline(session_id: str, request: Request) -> dict:
    """The post-game technical report, reconstructed from the checkpointer via
    LangGraph time travel (see game/timeline.py).

    Deliberately independent of the registry: it reads checkpoint threads by
    id, so it works for any game whose checkpoints still exist -- including one
    the server has since forgotten about, or one from a previous process. The
    exception is an *abandoned* game, whose threads stop_game reclaims on
    purpose; that returns `available: false` rather than an error, since "there
    is no history to show" is a normal answer here, not a failure."""
    return await timeline.build_timeline(
        request.app.state.graph,
        getattr(request.app.state, "seat_mind", None),
        session_id,
    )


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


@router.post("/{session_id}/stop")
async def stop_game(session_id: str, request: Request) -> dict:
    """Abandons the game immediately, wherever it currently is -- unlike
    pause, this doesn't wait for a natural checkpoint (see
    GameOrchestrator.stop). The session is unregistered right after, so
    every other route (state, stream, input, pause) 404s for it from this
    point on, same as a session_id that never existed.

    Abandoning also reclaims the game's checkpoint threads -- its own plus one
    per seat's mind. Nothing will ever resume an abandoned game, and the
    played-out record of it stays in the games/log_entries tables regardless,
    so keeping eight threads of resumable state per discarded game buys
    nothing."""
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    orch.stop()
    await persistence.stop_game(request.app.state.db_conn, session_id)
    await orch.discard_checkpoints()
    registry.unregister(session_id)
    return {"ok": True}
