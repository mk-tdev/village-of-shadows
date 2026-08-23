"""Room/seat authorization for multi-human games (FE-09)."""

from __future__ import annotations

import hashlib
import secrets
import string
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Viewer:
    seat_id: str | None
    host: bool
    protected: bool


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_game_access(conn: Any, game_id: str, human_seat_ids: list[str]) -> dict:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        room_code = "".join(secrets.choice(alphabet) for _ in range(6))
        cursor = await conn.execute("SELECT 1 FROM game_hosts WHERE room_code = ?", (room_code,))
        if await cursor.fetchone() is None:
            break
    else:  # pragma: no cover - practically impossible
        raise RuntimeError("Could not allocate a room code.")
    host_token = secrets.token_urlsafe(32)
    seat_tokens = {seat_id: secrets.token_urlsafe(32) for seat_id in human_seat_ids}
    await conn.execute(
        "INSERT INTO game_hosts (game_id, room_code, host_token_hash) VALUES (?, ?, ?)",
        (game_id, room_code, _digest(host_token)),
    )
    await conn.executemany(
        "INSERT INTO seat_access_tokens (game_id, seat_id, token_hash) VALUES (?, ?, ?)",
        [(game_id, seat_id, _digest(token)) for seat_id, token in seat_tokens.items()],
    )
    await conn.commit()
    return {"room_code": room_code, "host_token": host_token, "seat_tokens": seat_tokens}


async def _is_protected(conn: Any, game_id: str) -> bool:
    cursor = await conn.execute("SELECT 1 FROM game_hosts WHERE game_id = ?", (game_id,))
    return await cursor.fetchone() is not None


async def authorize(
    conn: Any,
    game_id: str,
    *,
    seat_id: str | None = None,
    access_token: str | None = None,
    host_token: str | None = None,
) -> Viewer | None:
    protected = await _is_protected(conn, game_id)
    if not protected:
        return Viewer(seat_id=seat_id, host=True, protected=False)
    host = False
    if host_token:
        cursor = await conn.execute(
            "SELECT 1 FROM game_hosts WHERE game_id = ? AND host_token_hash = ?",
            (game_id, _digest(host_token)),
        )
        host = await cursor.fetchone() is not None
    seat_ok = False
    if seat_id and access_token:
        cursor = await conn.execute(
            """SELECT 1 FROM seat_access_tokens
               WHERE game_id = ? AND seat_id = ? AND token_hash = ?""",
            (game_id, seat_id, _digest(access_token)),
        )
        seat_ok = await cursor.fetchone() is not None
    if not host and not seat_ok:
        return None
    return Viewer(seat_id=seat_id if seat_ok else None, host=host, protected=True)


async def mark_claimed(conn: Any, game_id: str, seat_id: str) -> None:
    await conn.execute(
        """UPDATE seat_access_tokens SET claimed_at = COALESCE(claimed_at, CURRENT_TIMESTAMP)
           WHERE game_id = ? AND seat_id = ?""",
        (game_id, seat_id),
    )
    await conn.commit()


async def rotate_seat_token(conn: Any, game_id: str, seat_id: str) -> str:
    token = secrets.token_urlsafe(32)
    cursor = await conn.execute(
        "UPDATE seat_access_tokens SET token_hash = ?, claimed_at = NULL WHERE game_id = ? AND seat_id = ?",
        (_digest(token), game_id, seat_id),
    )
    if cursor.rowcount != 1:
        raise KeyError(seat_id)
    await conn.commit()
    return token


async def release_human_seat_to_ai(conn: Any, game_id: str, seat_id: str) -> bool:
    """Permanently revoke a room seat after the host assigns it to AI."""
    cursor = await conn.execute(
        "DELETE FROM seat_access_tokens WHERE game_id = ? AND seat_id = ?",
        (game_id, seat_id),
    )
    if cursor.rowcount != 1:
        return False
    await conn.execute(
        """UPDATE seats SET controller = 'ai', provider = 'mock', model_name = 'mock-v1'
           WHERE game_id = ? AND seat_id = ?""",
        (game_id, seat_id),
    )
    await conn.commit()
    return True


async def room_info(conn: Any, game_id: str) -> dict | None:
    cursor = await conn.execute(
        "SELECT room_code FROM game_hosts WHERE game_id = ?", (game_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    seats = await conn.execute(
        """SELECT s.seat_id, s.display_name, a.claimed_at
           FROM seats s JOIN seat_access_tokens a
             ON a.game_id = s.game_id AND a.seat_id = s.seat_id
           WHERE s.game_id = ? ORDER BY s.id""",
        (game_id,),
    )
    return {
        "room_code": row[0],
        "human_seats": [
            {"seat_id": seat_id, "name": name, "claimed": claimed is not None}
            for seat_id, name, claimed in await seats.fetchall()
        ],
    }
