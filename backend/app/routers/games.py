import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app import persistence
from app.game import access, branching, insights, registry, timeline
from app.game.views import build_human_state_view
from app.game.orchestrator import GameOrchestrator
from app.model_preflight import ModelPreflightResponse, preflight_models
from app.models import AgentConfig, GameOptions, GameState, Player, RelationshipMemory

router = APIRouter(prefix="/games", tags=["games"])


class BranchRequest(BaseModel):
    checkpoint_id: str
    replacement: dict


class GameCreateRequest(BaseModel):
    seats: list[AgentConfig]
    options: GameOptions = Field(default_factory=GameOptions)


async def _viewer(
    request: Request,
    session_id: str,
    *,
    seat_id: str | None = None,
    access_token: str | None = None,
    host_token: str | None = None,
    require_host: bool = False,
):
    viewer = await access.authorize(
        request.app.state.db_conn,
        session_id,
        seat_id=seat_id,
        access_token=access_token,
        host_token=host_token,
    )
    if viewer is None or (require_host and not viewer.host):
        raise HTTPException(403, "This room credential does not permit that action.")
    return viewer


@router.post("/preflight", response_model=ModelPreflightResponse)
async def preflight_game_models(configs: list[AgentConfig]) -> ModelPreflightResponse:
    """Prove every AI configuration can answer and call a bound tool.

    This route is intentionally read-only: no game, database row, or graph is
    created until the setup page receives an all-clear and calls POST /games.
    """

    return await preflight_models(configs)


@router.post("")
async def create_game(body: list[AgentConfig] | GameCreateRequest, request: Request) -> dict:
    configs = body if isinstance(body, list) else body.seats
    options = GameOptions() if isinstance(body, list) else body.options
    humans = [c for c in configs if c.controller == "human"]
    if not humans:
        raise HTTPException(400, "At least one seat must have controller='human'.")
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
            behavior=c.behavior,
            resilience=c.resilience,
        )
        for c in configs
    ]
    if options.cross_game_memory:
        for player in players:
            memories = await persistence.get_relationship_memories(
                request.app.state.db_conn, player.name,
            )
            player.cross_game_memories = [RelationshipMemory(**memory) for memory in memories[-6:]]
    state = GameState(session_id=session_id, players=players, options=options)

    conn = request.app.state.db_conn
    graph = request.app.state.graph
    await persistence.create_game(conn, session_id, configs, options)
    credentials = await access.create_game_access(
        conn, session_id, [config.seat_id for config in humans],
    )

    orch = GameOrchestrator(session_id, state, conn, graph, request.app.state.seat_mind)
    registry.register(orch)
    # Deliberately not orch.start() here -- see GameOrchestrator.started's
    # docstring. The graph only begins advancing once the human clicks
    # "Start Game" on the already-connected game page (begin_game below),
    # so nothing can run ahead of a browser that hasn't opened its SSE
    # connection yet.

    return {
        "session_id": session_id,
        "room_code": credentials["room_code"],
        "host_token": credentials["host_token"],
        "human_seats": [
            {
                "seat_id": config.seat_id,
                "name": config.display_name,
                "access_token": credentials["seat_tokens"][config.seat_id],
            }
            for config in humans
        ],
    }


@router.get("/{session_id}/configuration")
async def get_game_configuration(session_id: str, request: Request, host_token: str | None = None) -> dict:
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    config = await persistence.get_game_config(request.app.state.db_conn, session_id)
    if config is None:
        raise HTTPException(404, "No configuration was persisted for this game.")
    return config


@router.post("/{session_id}/begin")
async def begin_game(session_id: str, request: Request, host_token: str | None = None) -> dict:
    """Actually starts the graph running. Split out from create_game so the
    human's browser has a chance to open its SSE connection and see the
    game sitting in the "lobby" phase first -- otherwise a fast (especially
    mock-provider) game could advance several steps before the frontend
    ever connects, and the player would land mid-story with no idea what
    they missed."""
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    if orch.started:
        raise HTTPException(409, "Game has already begun.")
    orch.start()
    return {"ok": True}


@router.get("/{session_id}/state")
async def get_state(
    session_id: str,
    request: Request,
    seat_id: str | None = None,
    access_token: str | None = None,
    host_token: str | None = None,
) -> dict:
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    viewer = await _viewer(
        request, session_id, seat_id=seat_id, access_token=access_token, host_token=host_token,
    )
    return build_human_state_view(orch.state, seat_id=viewer.seat_id, host=viewer.host)


@router.get("/{session_id}/decisions")
async def get_decisions(session_id: str, request: Request, host_token: str | None = None) -> list[dict]:
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    conn = request.app.state.db_conn
    return await persistence.get_decisions(conn, session_id)


@router.get("/{session_id}/timeline")
async def get_timeline(session_id: str, request: Request, host_token: str | None = None) -> dict:
    """The post-game technical report, reconstructed from the checkpointer via
    LangGraph time travel (see game/timeline.py).

    Deliberately independent of the registry: it reads checkpoint threads by
    id, so it works for any game whose checkpoints still exist -- including one
    the server has since forgotten about, or one from a previous process. The
    exception is an *abandoned* game, whose threads stop_game reclaims on
    purpose; that returns `available: false` rather than an error, since "there
    is no history to show" is a normal answer here, not a failure."""
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    return await timeline.build_timeline(
        request.app.state.graph,
        getattr(request.app.state, "seat_mind", None),
        session_id,
        request.app.state.db_conn,
    )


@router.get("/{session_id}/perspective")
async def get_perspective(
    session_id: str,
    seat_id: str,
    request: Request,
    through_seq: int | None = None,
    host_token: str | None = None,
) -> dict:
    """God Mode's read-only, time-bounded reconstruction of one seat's view."""
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    try:
        orch = registry.get(session_id)
        orch.state.find_seat(seat_id)
    except (KeyError, StopIteration):
        raise HTTPException(404, "No such game or seat.") from None
    return await insights.build_perspective(
        request.app.state.db_conn, orch.state, seat_id, through_seq,
    )


@router.get("/{session_id}/deception-report")
async def get_deception_report(
    session_id: str,
    request: Request,
    god_mode: bool = False,
    host_token: str | None = None,
) -> dict:
    viewer = await _viewer(request, session_id, host_token=host_token)
    if god_mode and not viewer.host:
        raise HTTPException(403, "God Mode report requires the host credential.")
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.") from None
    if orch.state.winner is None:
        raise HTTPException(409, "The deception report is available after the game ends.")
    return await insights.build_deception_report(
        request.app.state.db_conn, orch.state, include_private=god_mode,
    )


@router.get("/{session_id}/branch-points")
async def get_branch_points(
    session_id: str, request: Request, host_token: str | None = None,
) -> list[dict]:
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    return await branching.branch_points(request.app.state.graph, session_id)


@router.post("/{session_id}/branches")
async def create_game_branch(
    session_id: str,
    body: BranchRequest,
    request: Request,
    host_token: str | None = None,
) -> dict:
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    try:
        orch = await branching.create_branch(
            graph=request.app.state.graph,
            seat_mind=request.app.state.seat_mind,
            conn=request.app.state.db_conn,
            parent_session_id=session_id,
            checkpoint_id=body.checkpoint_id,
            replacement=body.replacement,
        )
    except KeyError:
        raise HTTPException(404, "No such checkpoint.") from None
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc
    humans = [player.seat_id for player in orch.state.players if player.controller == "human"]
    credentials = await access.create_game_access(request.app.state.db_conn, orch.session_id, humans)
    return {
        "session_id": orch.session_id,
        "lineage": await persistence.get_branch_lineage(request.app.state.db_conn, orch.session_id),
        "room_code": credentials["room_code"],
        "host_token": credentials["host_token"],
        "human_seats": [
            {
                "seat_id": player.seat_id,
                "name": player.name,
                "access_token": credentials["seat_tokens"][player.seat_id],
            }
            for player in orch.state.players if player.controller == "human"
        ],
    }


@router.get("/{session_id}/lineage")
async def get_game_lineage(
    session_id: str,
    request: Request,
    seat_id: str | None = None,
    access_token: str | None = None,
    host_token: str | None = None,
) -> dict:
    await _viewer(
        request, session_id, seat_id=seat_id, access_token=access_token, host_token=host_token,
    )
    return {
        "session_id": session_id,
        "branch": await persistence.get_branch_lineage(request.app.state.db_conn, session_id),
    }


@router.post("/{session_id}/pause")
async def pause_game(session_id: str, request: Request, host_token: str | None = None) -> dict:
    """Requests a pause -- takes effect the next time any seat's turn
    finishes (see nodes.py's `_maybe_pause`), not instantly. It never
    preempts a turn already in flight, so an agent's tool call or a
    human's pending prompt always completes cleanly first."""
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    orch.request_pause()
    return {"ok": True}


@router.post("/{session_id}/continue")
async def continue_game(session_id: str, request: Request, host_token: str | None = None) -> dict:
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    if not orch.state.paused:
        raise HTTPException(409, "Game is not paused.")
    orch.continue_game()
    return {"ok": True}


@router.post("/{session_id}/stop")
async def stop_game(session_id: str, request: Request, host_token: str | None = None) -> dict:
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
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    orch.stop()
    await persistence.stop_game(request.app.state.db_conn, session_id)
    await orch.discard_checkpoints()
    registry.unregister(session_id)
    return {"ok": True}


async def _discard_threads(request: Request, session_id: str, seat_ids: list[str]) -> None:
    thread_ids = [session_id, *(f"{session_id}:{seat_id}" for seat_id in seat_ids)]
    seen: set[int] = set()
    for compiled in (request.app.state.graph, getattr(request.app.state, "seat_mind", None)):
        checkpointer = getattr(compiled, "checkpointer", None)
        if checkpointer is None or id(checkpointer) in seen or not hasattr(checkpointer, "adelete_thread"):
            continue
        seen.add(id(checkpointer))
        for thread_id in thread_ids:
            try:
                await checkpointer.adelete_thread(thread_id)
            except Exception:  # noqa: BLE001 - deletion continues for remaining persisted data
                pass


@router.delete("/{session_id}/data")
async def delete_game_data(session_id: str, request: Request, host_token: str | None = None) -> dict:
    """Permanently erase a game, its checkpoints, logs, private agent data,
    cached voice, room credentials, replay snapshots, and derived memories.

    This is intentionally separate from Stop Game: stopping preserves an
    auditable played-out record, while this endpoint is an explicit host-only
    privacy action and cannot be undone.
    """
    conn = request.app.state.db_conn
    cursor = await conn.execute("SELECT 1 FROM games WHERE id = ?", (session_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(404, "No such game.")
    await _viewer(request, session_id, host_token=host_token, require_host=True)

    seat_cursor = await conn.execute("SELECT seat_id FROM seats WHERE game_id = ?", (session_id,))
    seat_ids = [row[0] for row in await seat_cursor.fetchall()]
    try:
        orch = registry.get(session_id)
    except KeyError:
        orch = None
    if orch is not None:
        orch.stop()
    await _discard_threads(request, session_id, seat_ids)
    try:
        deleted = await persistence.delete_game_data(conn, session_id)
    except KeyError:
        raise HTTPException(404, "No such game.") from None
    registry.unregister(session_id)
    return {"ok": True, "deleted": deleted}


@router.get("/{session_id}/room")
async def get_room(session_id: str, request: Request, host_token: str | None = None) -> dict:
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    info = await access.room_info(request.app.state.db_conn, session_id)
    if info is None:
        raise HTTPException(404, "No protected room exists for this game.")
    return info


@router.post("/{session_id}/room/{seat_id}/rotate-token")
async def rotate_room_seat_token(
    session_id: str,
    seat_id: str,
    request: Request,
    host_token: str | None = None,
) -> dict:
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    try:
        token = await access.rotate_seat_token(request.app.state.db_conn, session_id, seat_id)
    except KeyError:
        raise HTTPException(404, "That seat is not human-controlled.") from None
    return {"seat_id": seat_id, "access_token": token}


@router.post("/{session_id}/room/{seat_id}/replace-with-ai")
async def replace_room_seat_with_ai(
    session_id: str,
    seat_id: str,
    request: Request,
    host_token: str | None = None,
) -> dict:
    """Let a host recover a room when an invited human never arrives.

    The replacement is deliberately the offline validated agent; accepting an
    arbitrary hosted model here would bypass the preflight gate. If the graph
    is already waiting at this human's interrupt, one deterministic legal
    answer closes that interrupt before all future turns become AI-owned.
    """
    await _viewer(request, session_id, host_token=host_token, require_host=True)
    try:
        orch = registry.get(session_id)
        player = orch.state.find_seat(seat_id)
    except (KeyError, ValueError):
        raise HTTPException(404, "No such game or seat.") from None
    if player.controller != "human":
        raise HTTPException(409, "That seat is not human-controlled.")
    if not await access.release_human_seat_to_ai(request.app.state.db_conn, session_id, seat_id):
        raise HTTPException(409, "That human seat has already been released.")

    player.controller = "ai"
    player.provider = "mock"
    player.model_name = "mock-v1"
    player.endpoint = None
    awaiting = orch.state.awaiting
    if awaiting is not None and awaiting.seat_id == seat_id:
        if awaiting.kind == "statement":
            replacement = {"text": "I have nothing further to add.", "thought": "The host released this seat to AI."}
        else:
            if not awaiting.options:
                raise HTTPException(409, "The pending action has no legal deterministic replacement.")
            replacement = {
                "target": awaiting.options[0],
                "thought": "The host released this seat to AI.",
                "text": "I accept this course.",
            }
        orch.resume(replacement)
    # Reuse the already viewer-filtered player projection event; publishing a
    # pre-built host state here would leak host-only configuration to every
    # SSE subscriber.
    orch.publish("roles_assigned", {"players": []})
    return {"ok": True, "seat_id": seat_id, "controller": "ai", "provider": "mock", "model_name": "mock-v1"}
