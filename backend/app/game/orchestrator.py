"""Owns one game's live state and drives its LangGraph app as a background
task. Plan §5's "the graph pauses execution and waits for real input
whenever it's a human seat's turn — no polling, no timeouts, a genuine
suspend/resume", now over SSE instead of WebSocket.

Pause/continue reuses that exact same suspend/resume mechanism rather than
adding a second one: pausing sets `pause_requested`, and the *next* node to
finish its turn calls `interrupt()` on it (see nodes.py's `_maybe_pause`),
suspending the graph exactly like a human turn would. Continuing is a
`Command(resume=...)` call, identical in shape to answering a human prompt.
"""

import asyncio
from typing import Any

import aiosqlite
from langgraph.types import Command

from app.models import AwaitingInput, GameState


class GameOrchestrator:
    def __init__(self, session_id: str, state: GameState, conn: aiosqlite.Connection, graph: Any):
        self.session_id = session_id
        self.state = state
        self.conn = conn
        self.graph = graph
        self.config = {"configurable": {"thread_id": session_id, "session_id": session_id}}
        self._task: asyncio.Task | None = None
        # Broadcast fan-out, not a single shared queue: every /stream
        # connection gets its own independent queue via subscribe(). A
        # single shared queue would let a doomed, about-to-be-aborted
        # connection (e.g. a dev-mode double-mounted EventSource whose
        # client-side .close() the server doesn't notice instantly) steal
        # events out from under the connection that actually survives --
        # each subscriber getting its own copy makes that race harmless.
        self._subscribers: list[asyncio.Queue] = []
        # Plain in-memory flag, deliberately *not* part of GameState -- it's
        # a signal from the API layer to whichever node runs next, not game
        # data, and it must survive independently of the checkpointed state
        # object being swapped out from under it on every resume (see
        # nodes.py's `_sync` docstring for why that swap happens at all).
        self.pause_requested = False
        # Last node name reported by _sync (nodes.py), so a browser that
        # connects mid-game (a page refresh, or joining after the graph
        # already suspended on an interrupt) can show the real current node
        # immediately instead of waiting for a "node" event that may never
        # come again before the human answers. Same "not GameState" reasoning
        # as pause_requested above.
        self.current_node: str | None = None

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    def publish(self, event: str, data: dict) -> None:
        for queue in self._subscribers:
            queue.put_nowait({"event": event, "data": data})

    def start(self) -> None:
        self._task = asyncio.create_task(self._run({"game": self.state}))

    def resume(self, value: Any) -> None:
        self.state.awaiting = None
        self._task = asyncio.create_task(self._run(Command(resume=value)))

    def request_pause(self) -> None:
        self.pause_requested = True

    def continue_game(self) -> None:
        # `None` specifically cannot be used as a resume value -- LangGraph
        # can't tell it apart from "no resume value provided" internally --
        # so this is a plain truthy sentinel the pause interrupt discards.
        self.resume(True)

    async def _run(self, input_: Any) -> None:
        try:
            async for event in self.graph.astream(input_, self.config):
                if isinstance(event, dict) and "__interrupt__" in event:
                    payload = event["__interrupt__"][0].value
                    if payload.get("kind") == "paused":
                        # state.paused and the "paused" SSE event were
                        # already set/emitted synchronously inside the node
                        # (nodes.py's `_maybe_pause`) before this interrupt
                        # ever reached here -- nothing else to do but wait.
                        return
                    self.state.awaiting = AwaitingInput(**payload)
                    self.publish("awaiting_input", payload)
                    return
            self.state.awaiting = None
            self.publish("done", {"winner": self.state.winner})
        except Exception as exc:  # surfaced to the SSE stream rather than swallowed
            self.publish("error", {"message": str(exc)})
