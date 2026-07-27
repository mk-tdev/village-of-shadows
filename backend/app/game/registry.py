"""In-memory registry of active games, shared by the FastAPI routers, the
LangGraph nodes, and the MCP tool handlers — all three live in one process
for this scaffold, so a plain dict is enough. See orchestrator.py for the
GameOrchestrator type stored here.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.game.orchestrator import GameOrchestrator

ACTIVE_GAMES: dict[str, "GameOrchestrator"] = {}


def register(orch: "GameOrchestrator") -> None:
    ACTIVE_GAMES[orch.session_id] = orch


def get(session_id: str) -> "GameOrchestrator":
    orch = ACTIVE_GAMES.get(session_id)
    if orch is None:
        raise KeyError(f"No active game with session_id={session_id!r}")
    return orch


def unregister(session_id: str) -> None:
    ACTIVE_GAMES.pop(session_id, None)
