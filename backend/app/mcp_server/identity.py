"""Seat identity, bound to the MCP connection — never to a model-supplied
argument. Plan §6.2.

The orchestrator mints a one-time token for (game_id, seat_id) and calls the
`bind_seat` tool itself, over the session it just opened for that seat's
turn, *before* handing the model any tools. `bind_seat` is filtered out of
the tool list a model ever sees (see agent_turn.py) — the model has no way
to call it, and no gameplay tool accepts a seat_id argument, so there is no
argument through which a model could impersonate another seat.
"""

import secrets

# token -> (game_id, seat_id), consumed on first use
_PENDING: dict[str, tuple[str, str]] = {}

# server-side session object -> (game_id, seat_id), for the lifetime of one
# agent turn's MCP connection
_BOUND: dict[object, tuple[str, str]] = {}


def mint_token(game_id: str, seat_id: str) -> str:
    token = secrets.token_urlsafe(24)
    _PENDING[token] = (game_id, seat_id)
    return token


def bind(session: object, token: str) -> tuple[str, str]:
    identity = _PENDING.pop(token, None)
    if identity is None:
        raise PermissionError("Invalid or already-used binding token.")
    _BOUND[session] = identity
    return identity


def resolve(session: object) -> tuple[str, str]:
    identity = _BOUND.get(session)
    if identity is None:
        raise PermissionError("This MCP session has not bound a seat identity yet.")
    return identity


def release(session: object) -> None:
    _BOUND.pop(session, None)
