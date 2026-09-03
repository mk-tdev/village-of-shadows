"""Authorization boundary for the deployment-wide operator game archive."""

from __future__ import annotations

import hmac

from fastapi import HTTPException, Request

from app.config import settings


def require_game_history_access(request: Request) -> None:
    configured = settings.game_history_access_key
    supplied = request.headers.get("x-game-history-key")
    if not configured:
        raise HTTPException(
            503,
            "Game history is disabled. Set GAME_HISTORY_ACCESS_KEY in the backend deployment.",
        )
    if not supplied or not hmac.compare_digest(supplied, configured):
        raise HTTPException(403, "A valid game archive key is required.")
