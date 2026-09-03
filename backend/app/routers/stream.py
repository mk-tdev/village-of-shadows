import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from app import persistence
from app.game import access, registry
from app.game.views import build_human_state_view, log_visible_to_human
from app.models import LogEntry
from app.visitor_location import country_for_request

router = APIRouter(prefix="/games", tags=["stream"])


@router.get("/{session_id}/stream")
async def stream(
    session_id: str,
    request: Request,
    seat_id: str | None = None,
    access_token: str | None = None,
    host_token: str | None = None,
) -> EventSourceResponse:
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")
    viewer = await access.authorize(
        request.app.state.db_conn,
        session_id,
        seat_id=seat_id,
        access_token=access_token,
        host_token=host_token,
    )
    if viewer is None:
        raise HTTPException(403, "A valid room or seat credential is required.")
    if viewer.seat_id:
        await access.mark_claimed(request.app.state.db_conn, session_id, viewer.seat_id)
        await persistence.record_game_participant(
            request.app.state.db_conn,
            session_id,
            viewer.seat_id,
            await country_for_request(request),
        )

    def visible_event(event: str, data: dict) -> dict | None:
        if event == "log":
            entry = LogEntry(**data)
            return data if log_visible_to_human(orch.state, entry, viewer.seat_id, viewer.host) else None
        if event == "roles_assigned":
            projected = build_human_state_view(
                orch.state, seat_id=viewer.seat_id, host=viewer.host,
            )
            return {"players": projected["players"]}
        if event in {"private_note", "belief_update"}:
            return data if viewer.host else None
        if event == "seer_result":
            return data if viewer.host or data.get("seat_id") == viewer.seat_id else None
        if event in {"awaiting_input", "input_accepted"}:
            return data if data.get("seat_id") == viewer.seat_id else None
        return data

    async def event_generator():
        # Each connection gets its own queue via subscribe() -- see
        # GameOrchestrator's docstring on why a shared queue is unsafe here
        # (a doomed, about-to-be-aborted connection, e.g. from a dev-mode
        # double-mounted EventSource, could otherwise steal events meant for
        # the connection that actually survives).
        queue = orch.subscribe()
        try:
            yield {
                "event": "state",
                "data": json.dumps(build_human_state_view(
                    orch.state, seat_id=viewer.seat_id, host=viewer.host,
                )),
            }
            # Notebook rows are deliberately persisted outside GameState so a
            # pause/replay cannot duplicate or roll them back. Send their
            # immutable history as a separate observer snapshot; the frontend
            # renders it only while God Mode is enabled.
            note_events = (
                await persistence.get_note_events(orch.conn, orch.session_id)
                if viewer.host else []
            )
            player_names = {player.seat_id: player.name for player in orch.state.players}
            yield {
                "event": "private_notes",
                "data": json.dumps({
                    "events": [
                        {**event, "name": player_names.get(event["seat_id"], event["seat_id"])}
                        for event in note_events
                    ],
                }),
            }
            belief_events = (
                await persistence.get_belief_events(orch.conn, orch.session_id)
                if viewer.host else []
            )
            alive = {player.seat_id: player.alive for player in orch.state.players}
            yield {
                "event": "belief_snapshot",
                "data": json.dumps({
                    "events": [
                        {
                            **event,
                            "observer_name": player_names.get(
                                event["observer_seat_id"], event["observer_seat_id"],
                            ),
                            "subject_name": player_names.get(
                                event["subject_seat_id"], event["subject_seat_id"],
                            ),
                            "subject_alive": alive.get(event["subject_seat_id"], False),
                        }
                        for event in belief_events
                    ],
                }),
            }
            if orch.state.awaiting is not None and orch.state.awaiting.seat_id == viewer.seat_id:
                yield {"event": "awaiting_input", "data": json.dumps(orch.state.awaiting.model_dump())}
            if orch.current_node is not None:
                yield {"event": "node", "data": json.dumps({"node": orch.current_node})}

            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    continue
                filtered = visible_event(event["event"], event["data"])
                if filtered is not None:
                    yield {"event": event["event"], "data": json.dumps(filtered)}
        finally:
            orch.unsubscribe(queue)

    return EventSourceResponse(event_generator())
