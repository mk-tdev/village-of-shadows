import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from app.game import registry

router = APIRouter(prefix="/games", tags=["stream"])


@router.get("/{session_id}/stream")
async def stream(session_id: str, request: Request) -> EventSourceResponse:
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No such game.")

    async def event_generator():
        # Each connection gets its own queue via subscribe() -- see
        # GameOrchestrator's docstring on why a shared queue is unsafe here
        # (a doomed, about-to-be-aborted connection, e.g. from a dev-mode
        # double-mounted EventSource, could otherwise steal events meant for
        # the connection that actually survives).
        queue = orch.subscribe()
        try:
            yield {"event": "state", "data": json.dumps(orch.state.model_dump())}
            if orch.state.awaiting is not None:
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
                yield {"event": event["event"], "data": json.dumps(event["data"])}
        finally:
            orch.unsubscribe(queue)

    return EventSourceResponse(event_generator())
