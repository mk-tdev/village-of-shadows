"""Safe, cached narration for public council statements only."""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings


VOICE_PALETTE = ("cedar", "marin", "onyx", "sage", "fable", "ballad", "ash")
_locks: dict[tuple[str, int], asyncio.Lock] = {}


@dataclass(frozen=True)
class CouncilLine:
    seq: int
    seat_id: str
    name: str
    personality: str
    text: str


class VoiceLineNotFoundError(LookupError):
    pass


class VoiceUnavailableError(RuntimeError):
    pass


def voice_for_seat(seat_id: str) -> str:
    """Give every seat a stable voice without storing another identifier."""
    digest = hashlib.sha256(seat_id.encode("utf-8")).digest()
    return VOICE_PALETTE[digest[0] % len(VOICE_PALETTE)]


def ancient_performance(line: CouncilLine) -> str:
    return (
        "Speak as a real inhabitant of an ancient, moonlit village council. "
        "Use natural human breath, restrained emotion, and a grave, intimate cadence. "
        "Sound weathered and believable, never like a cartoon, announcer, monster, or robot. "
        f"The speaker is {line.name}, whose manner is {line.personality or 'guarded'}. "
        "Let suspicion and danger sit beneath the words. Keep the delivery clear and unhurried."
    )


async def public_council_line(conn: Any, game_id: str, seq: int) -> CouncilLine:
    cursor = await conn.execute(
        """SELECT l.seq, l.seat_id, s.display_name, COALESCE(s.personality, ''), l.text
           FROM log_entries l
           JOIN seats s ON s.game_id = l.game_id AND s.seat_id = l.seat_id
           WHERE l.game_id = ? AND l.seq = ? AND l.type = 'statement'
             AND l.private = 0 AND l.text IS NOT NULL""",
        (game_id, seq),
    )
    row = await cursor.fetchone()
    if row is None:
        raise VoiceLineNotFoundError(seq)
    return CouncilLine(seq=row[0], seat_id=row[1], name=row[2], personality=row[3], text=row[4])


async def _cached_audio(
    conn: Any, game_id: str, seq: int, model: str, voice: str,
) -> tuple[bytes, str] | None:
    cursor = await conn.execute(
        """SELECT audio, content_type FROM voice_audio_cache
           WHERE game_id = ? AND log_seq = ? AND model = ? AND voice = ?""",
        (game_id, seq, model, voice),
    )
    row = await cursor.fetchone()
    return (bytes(row[0]), row[1]) if row else None


async def synthesize_openai(line: CouncilLine, voice: str, model: str) -> tuple[bytes, str]:
    if not settings.openai_api_key:
        raise VoiceUnavailableError("Lifelike council speech is not configured on this server.")
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "voice": voice,
                    "input": line.text[:4096],
                    "instructions": ancient_performance(line),
                    "response_format": "mp3",
                    "speed": 0.94,
                },
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise VoiceUnavailableError("The lifelike voice service could not generate this line.") from exc
    return response.content, response.headers.get("content-type", "audio/mpeg").split(";")[0]


async def get_or_create_council_audio(conn: Any, game_id: str, seq: int) -> tuple[bytes, str]:
    line = await public_council_line(conn, game_id, seq)
    model = settings.openai_tts_model
    voice = voice_for_seat(line.seat_id)
    cached = await _cached_audio(conn, game_id, seq, model, voice)
    if cached:
        return cached

    # Two human browsers can receive the same SSE event simultaneously. The
    # per-line lock avoids generating and billing the same immutable line twice.
    lock = _locks.setdefault((game_id, seq), asyncio.Lock())
    try:
        async with lock:
            cached = await _cached_audio(conn, game_id, seq, model, voice)
            if cached:
                return cached
            audio, content_type = await synthesize_openai(line, voice, model)
            await conn.execute(
                """INSERT OR IGNORE INTO voice_audio_cache
                   (game_id, log_seq, model, voice, audio, content_type)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (game_id, seq, model, voice, audio, content_type),
            )
            await conn.commit()
            return audio, content_type
    finally:
        _locks.pop((game_id, seq), None)
