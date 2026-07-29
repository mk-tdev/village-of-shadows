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


def _describe_exception(exc: BaseException) -> str:
    """`str(exc)` on an `ExceptionGroup` just says something like
    "unhandled errors in a TaskGroup (1 sub-exception)" -- the *real* error
    (a bad API key, an invalid model name, a network failure) is nested
    inside `.exceptions` and Python's default __str__ doesn't recurse into
    it. Real-provider calls run through the MCP client's own internal
    `anyio` task group (see agent_turn.py, 05-mcp-tool-server-identity.md's
    "double mount" section for another bug this exact wrapping once hid),
    so *any* failure there -- not just routing bugs -- arrives here as an
    ExceptionGroup. Unwrap it so the frontend shows the actual cause
    instead of a content-free wrapper string.
    """
    if isinstance(exc, BaseExceptionGroup):
        return "; ".join(_describe_exception(sub) for sub in exc.exceptions)
    return f"{type(exc).__name__}: {exc}"


class GameOrchestrator:
    def __init__(
        self,
        session_id: str,
        state: GameState,
        conn: aiosqlite.Connection,
        graph: Any,
        seat_mind: Any = None,
    ):
        self.session_id = session_id
        self.state = state
        self.conn = conn
        self.graph = graph
        # The per-seat agent subgraph (see game/seat_mind.py). One compiled
        # graph shared by every seat; each seat's *memory* is separated by its
        # own thread_id, not by having its own graph object. Optional so a test
        # can construct an orchestrator without one.
        self.seat_mind = seat_mind
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
        # True once start() has actually been called. create_game (see
        # routers/games.py) registers the orchestrator but deliberately does
        # NOT call start() -- the graph would otherwise start advancing
        # (assign_roles, night_wolves, ...) before the browser's SSE
        # connection even opens, so a fast/mock game could visibly "skip
        # ahead" several steps before the human ever sees the first one.
        # start() only actually runs once the human clicks a "Start Game"
        # button on the already-connected game page (see routers/games.py's
        # begin_game route) -- this flag makes that a one-time action.
        self.started = False

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
        self.started = True
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

    def stop(self) -> None:
        """Abandons this game outright -- cancels the background task
        immediately, wherever it is (mid AI turn, mid human wait, anywhere),
        rather than waiting for a natural checkpoint the way request_pause()
        does. This is deliberately a different mechanism from pause/resume,
        not a reuse of it: pausing means "come back to this later," stopping
        means "this game is over, discard it." Task.cancel() raises
        CancelledError at the task's next await point; that's a
        BaseException, not an Exception, so it passes straight through
        _run's `except Exception` handler below without publishing a
        misleading "error" event -- the task just ends, cancelled.
        """
        if self._task is not None and not self._task.done():
            self._task.cancel()

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
            self.publish("error", {"message": _describe_exception(exc)})
