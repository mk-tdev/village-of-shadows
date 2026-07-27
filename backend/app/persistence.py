import json

import aiosqlite

from app.models import AgentConfig, LogEntry


async def create_game(conn: aiosqlite.Connection, session_id: str, seats: list[AgentConfig]) -> None:
    await conn.execute(
        "INSERT INTO games (id, status, winner) VALUES (?, 'in_progress', NULL)",
        (session_id,),
    )
    await conn.executemany(
        """INSERT INTO seats (game_id, seat_id, display_name, personality, controller, provider, model_name)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        [
            (session_id, s.seat_id, s.display_name, s.personality, s.controller, s.provider, s.model_name)
            for s in seats
        ],
    )
    await conn.commit()


async def set_seat_role(conn: aiosqlite.Connection, session_id: str, seat_id: str, role: str) -> None:
    await conn.execute(
        "UPDATE seats SET role = ? WHERE game_id = ? AND seat_id = ?",
        (role, session_id, seat_id),
    )
    await conn.commit()


async def finish_game(conn: aiosqlite.Connection, session_id: str, winner: str) -> None:
    await conn.execute(
        "UPDATE games SET status = 'finished', winner = ? WHERE id = ?",
        (winner, session_id),
    )
    await conn.commit()


async def record_log_entry(conn: aiosqlite.Connection, session_id: str, entry: LogEntry) -> None:
    await conn.execute(
        """INSERT INTO log_entries (game_id, seq, round, phase, type, seat_id, text, thought, private)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            session_id,
            entry.seq,
            entry.round,
            entry.phase,
            entry.type,
            entry.seat_id,
            entry.text,
            entry.thought,
            entry.private,
        ),
    )
    await conn.commit()


async def record_agent_decision(
    conn: aiosqlite.Connection,
    *,
    session_id: str,
    seat_id: str,
    round: int,
    phase: str,
    provider: str | None,
    model_name: str | None,
    prompt: str,
    raw_response: str,
    tool_calls: list[dict],
    latency_ms: int,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> None:
    await conn.execute(
        """INSERT INTO agent_decisions
           (game_id, seat_id, round, phase, provider, model_name, prompt, raw_response, tool_calls,
            latency_ms, input_tokens, output_tokens)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            session_id,
            seat_id,
            round,
            phase,
            provider,
            model_name,
            prompt,
            raw_response,
            json.dumps(tool_calls),
            latency_ms,
            input_tokens,
            output_tokens,
        ),
    )
    await conn.commit()


async def record_note(conn: aiosqlite.Connection, session_id: str, seat_id: str, round: int, note: str) -> None:
    await conn.execute(
        "INSERT INTO agent_notes (game_id, seat_id, round, note) VALUES (?, ?, ?, ?)",
        (session_id, seat_id, round, note),
    )
    await conn.commit()


async def get_notes(conn: aiosqlite.Connection, session_id: str, seat_id: str) -> list[str]:
    cursor = await conn.execute(
        "SELECT note FROM agent_notes WHERE game_id = ? AND seat_id = ? ORDER BY round, id",
        (session_id, seat_id),
    )
    rows = await cursor.fetchall()
    return [r[0] for r in rows]


async def get_vote_history(conn: aiosqlite.Connection, session_id: str) -> list[dict]:
    cursor = await conn.execute(
        "SELECT round, seat_id, text FROM log_entries WHERE game_id = ? AND type = 'vote' ORDER BY seq",
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [{"round": r[0], "seat_id": r[1], "text": r[2]} for r in rows]


async def get_decisions(conn: aiosqlite.Connection, session_id: str) -> list[dict]:
    cursor = await conn.execute(
        """SELECT seat_id, round, phase, provider, model_name, prompt, raw_response, tool_calls,
                  latency_ms, input_tokens, output_tokens, created_at
           FROM agent_decisions WHERE game_id = ? ORDER BY id""",
        (session_id,),
    )
    rows = await cursor.fetchall()
    cols = [
        "seat_id", "round", "phase", "provider", "model_name", "prompt",
        "raw_response", "tool_calls", "latency_ms", "input_tokens", "output_tokens", "created_at",
    ]
    return [dict(zip(cols, row)) for row in rows]
