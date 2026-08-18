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


async def stop_game(conn: aiosqlite.Connection, session_id: str) -> None:
    """A user-initiated abandon, distinct from finish_game's natural
    win/loss conclusion -- 'stopped' rather than 'finished', with no
    winner, so a later look at the games table can tell the two apart."""
    await conn.execute(
        "UPDATE games SET status = 'stopped' WHERE id = ?",
        (session_id,),
    )
    await conn.commit()


async def record_log_entry(conn: aiosqlite.Connection, session_id: str, entry: LogEntry) -> None:
    """Idempotent on `(game_id, seq)`.

    A node re-runs from the top when the graph resumes after a pause (see
    03-human-in-the-loop-interrupt.md), and while `GameState` is rolled back so
    the in-memory log recomputes cleanly, rows already written here are not --
    so a plain INSERT left duplicate rows behind every time a pause landed
    mid-turn. `seq` is assigned from the rolled-back log's length, so a replay
    reproduces the same value, which makes it a natural dedup key. Guarded with
    NOT EXISTS rather than a UNIQUE constraint so existing databases (created
    by `CREATE TABLE IF NOT EXISTS`) get the fix without a migration.

    The frontend already deduped these on `seq` when they arrived over SSE;
    this closes the same hole on the persistence side."""
    await conn.execute(
        """INSERT INTO log_entries (game_id, seq, round, phase, type, seat_id, text, thought, private)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
               SELECT 1 FROM log_entries WHERE game_id = ? AND seq = ?
           )""",
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
            session_id,
            entry.seq,
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
    """Compatibility view of the active structured notes as plain strings."""
    events = await get_note_events(conn, session_id, seat_id, latest_only=True)
    return [event["content"] for event in events if event["status"] == "active"]


NOTE_EVENT_COLUMNS = [
    "id", "game_id", "seat_id", "note_id", "revision", "operation", "kind",
    "subject", "content", "status", "source_seq", "source_phase", "source_round",
    "event_key", "created_at",
]


def _note_event(row: tuple | None) -> dict | None:
    if row is None:
        return None
    event = dict(zip(NOTE_EVENT_COLUMNS, row))
    created_at = event.get("created_at")
    if created_at is not None:
        event["created_at"] = str(created_at)
    return event


async def record_note_event(
    conn: aiosqlite.Connection,
    *,
    session_id: str,
    seat_id: str,
    note_id: str,
    revision: int,
    operation: str,
    kind: str,
    subject: str | None,
    content: str,
    status: str,
    source_seq: int | None,
    source_phase: str,
    source_round: int,
    event_key: str,
) -> tuple[dict, bool]:
    """Append one immutable notebook event, idempotent on ``event_key``."""
    existing = await get_note_event_by_key(conn, event_key)
    if existing is not None:
        return existing, False

    await conn.execute(
        """INSERT OR IGNORE INTO agent_note_events
           (game_id, seat_id, note_id, revision, operation, kind, subject, content, status,
            source_seq, source_phase, source_round, event_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            session_id, seat_id, note_id, revision, operation, kind, subject, content,
            status, source_seq, source_phase, source_round, event_key,
        ),
    )
    await conn.commit()
    inserted = await get_note_event_by_key(conn, event_key)
    if inserted is None:  # pragma: no cover - protects against a corrupt DB
        raise RuntimeError("Notebook event could not be persisted.")
    return inserted, True


async def get_note_event_by_key(
    conn: aiosqlite.Connection, event_key: str,
) -> dict | None:
    cursor = await conn.execute(
        f"SELECT {', '.join(NOTE_EVENT_COLUMNS)} FROM agent_note_events WHERE event_key = ?",
        (event_key,),
    )
    return _note_event(await cursor.fetchone())


async def get_latest_note_event(
    conn: aiosqlite.Connection, session_id: str, seat_id: str, note_id: str,
) -> dict | None:
    cursor = await conn.execute(
        f"""SELECT {', '.join(NOTE_EVENT_COLUMNS)} FROM agent_note_events
            WHERE game_id = ? AND seat_id = ? AND note_id = ?
            ORDER BY revision DESC LIMIT 1""",
        (session_id, seat_id, note_id),
    )
    return _note_event(await cursor.fetchone())


async def get_note_events(
    conn: aiosqlite.Connection,
    session_id: str,
    seat_id: str | None = None,
    *,
    latest_only: bool = False,
) -> list[dict]:
    where = "WHERE game_id = ?"
    params: list[object] = [session_id]
    if seat_id is not None:
        where += " AND seat_id = ?"
        params.append(seat_id)

    cursor = await conn.execute(
        f"""SELECT {', '.join(NOTE_EVENT_COLUMNS)} FROM agent_note_events
            {where} ORDER BY id""",
        params,
    )
    events = [_note_event(row) for row in await cursor.fetchall()]
    typed_events = [event for event in events if event is not None]
    if not latest_only:
        return typed_events

    latest: dict[tuple[str, str], dict] = {}
    for event in typed_events:
        latest[(event["seat_id"], event["note_id"])] = event
    return list(latest.values())


BELIEF_EVENT_COLUMNS = [
    "id", "game_id", "observer_seat_id", "subject_seat_id", "revision",
    "suspicion", "confidence", "reason", "source_seq", "source_phase",
    "source_round", "event_key", "created_at",
]


def _belief_event(row: tuple | None) -> dict | None:
    if row is None:
        return None
    event = dict(zip(BELIEF_EVENT_COLUMNS, row))
    created_at = event.get("created_at")
    if created_at is not None:
        event["created_at"] = str(created_at)
    event["trust"] = 100 - int(event["suspicion"])
    return event


async def record_belief_event(
    conn: aiosqlite.Connection,
    *,
    session_id: str,
    observer_seat_id: str,
    subject_seat_id: str,
    revision: int,
    suspicion: int,
    confidence: int,
    reason: str,
    source_seq: int | None,
    source_phase: str,
    source_round: int,
    event_key: str,
) -> tuple[dict, bool]:
    """Append one private belief revision, idempotent on ``event_key``."""
    existing = await get_belief_event_by_key(conn, event_key)
    if existing is not None:
        return existing, False

    await conn.execute(
        """INSERT OR IGNORE INTO agent_belief_events
           (game_id, observer_seat_id, subject_seat_id, revision, suspicion,
            confidence, reason, source_seq, source_phase, source_round, event_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            session_id, observer_seat_id, subject_seat_id, revision, suspicion,
            confidence, reason, source_seq, source_phase, source_round, event_key,
        ),
    )
    await conn.commit()
    inserted = await get_belief_event_by_key(conn, event_key)
    if inserted is None:  # pragma: no cover - protects against a corrupt DB
        raise RuntimeError("Belief event could not be persisted.")
    return inserted, True


async def get_belief_event_by_key(
    conn: aiosqlite.Connection, event_key: str,
) -> dict | None:
    cursor = await conn.execute(
        f"SELECT {', '.join(BELIEF_EVENT_COLUMNS)} FROM agent_belief_events WHERE event_key = ?",
        (event_key,),
    )
    return _belief_event(await cursor.fetchone())


async def get_latest_belief_event(
    conn: aiosqlite.Connection,
    session_id: str,
    observer_seat_id: str,
    subject_seat_id: str,
) -> dict | None:
    cursor = await conn.execute(
        f"""SELECT {', '.join(BELIEF_EVENT_COLUMNS)} FROM agent_belief_events
            WHERE game_id = ? AND observer_seat_id = ? AND subject_seat_id = ?
            ORDER BY revision DESC LIMIT 1""",
        (session_id, observer_seat_id, subject_seat_id),
    )
    return _belief_event(await cursor.fetchone())


async def get_belief_events(
    conn: aiosqlite.Connection,
    session_id: str,
    observer_seat_id: str | None = None,
    *,
    latest_only: bool = False,
) -> list[dict]:
    where = "WHERE game_id = ?"
    params: list[object] = [session_id]
    if observer_seat_id is not None:
        where += " AND observer_seat_id = ?"
        params.append(observer_seat_id)

    cursor = await conn.execute(
        f"""SELECT {', '.join(BELIEF_EVENT_COLUMNS)} FROM agent_belief_events
            {where} ORDER BY id""",
        params,
    )
    events = [_belief_event(row) for row in await cursor.fetchall()]
    typed_events = [event for event in events if event is not None]
    if not latest_only:
        return typed_events

    latest: dict[tuple[str, str], dict] = {}
    for event in typed_events:
        latest[(event["observer_seat_id"], event["subject_seat_id"])] = event
    return list(latest.values())


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
