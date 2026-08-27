import json

from app.postgres_adapter import DatabaseConnection

from app.models import AgentConfig, GameOptions, LogEntry


async def create_game(
    conn: DatabaseConnection,
    session_id: str,
    seats: list[AgentConfig],
    options: GameOptions | None = None,
) -> None:
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
    resolved_options = options or GameOptions()
    await conn.execute(
        """INSERT INTO game_configs (game_id, options_json, seats_json)
           VALUES (?, ?, ?)""",
        (
            session_id,
            resolved_options.model_dump_json(),
            json.dumps([seat.model_dump(mode="json") for seat in seats]),
        ),
    )
    await conn.commit()


async def get_game_config(conn: DatabaseConnection, session_id: str) -> dict | None:
    cursor = await conn.execute(
        "SELECT options_json, seats_json FROM game_configs WHERE game_id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return {"options": json.loads(row[0]), "seats": json.loads(row[1])}


async def set_seat_role(conn: DatabaseConnection, session_id: str, seat_id: str, role: str) -> None:
    await conn.execute(
        "UPDATE seats SET role = ? WHERE game_id = ? AND seat_id = ?",
        (role, session_id, seat_id),
    )
    await conn.commit()


async def finish_game(conn: DatabaseConnection, session_id: str, winner: str) -> None:
    await conn.execute(
        "UPDATE games SET status = 'finished', winner = ? WHERE id = ?",
        (winner, session_id),
    )
    await conn.commit()


async def stop_game(conn: DatabaseConnection, session_id: str) -> None:
    """A user-initiated abandon, distinct from finish_game's natural
    win/loss conclusion -- 'stopped' rather than 'finished', with no
    winner, so a later look at the games table can tell the two apart."""
    await conn.execute(
        "UPDATE games SET status = 'stopped' WHERE id = ?",
        (session_id,),
    )
    await conn.commit()


async def delete_game_data(conn: DatabaseConnection, session_id: str) -> dict[str, int]:
    """Permanently remove one game's persisted data and derived exports.

    The host-facing API calls this only after credential validation and after
    checkpoint threads have been reclaimed. Cross-game memories and replay
    snapshots are derived from the source game, so they are erased with it
    instead of leaving private or decontextualized fragments behind.
    """
    cursor = await conn.execute("SELECT 1 FROM games WHERE id = ?", (session_id,))
    if await cursor.fetchone() is None:
        raise KeyError(session_id)

    tournament_cursor = await conn.execute(
        "SELECT DISTINCT tournament_id FROM tournament_games WHERE game_id = ?",
        (session_id,),
    )
    tournament_ids = [row[0] for row in await tournament_cursor.fetchall()]
    tables = [
        "voice_audio_cache",
        "replay_shares",
        "cross_game_memories",
        "seat_access_tokens",
        "game_hosts",
        "game_configs",
        "tournament_games",
        "game_branches",
        "agent_belief_events",
        "agent_note_events",
        "agent_notes",
        "agent_decisions",
        "log_entries",
        "seats",
    ]
    counts: dict[str, int] = {}
    try:
        await conn.execute("BEGIN")
        for table in tables:
            if table == "cross_game_memories":
                result = await conn.execute(
                    "DELETE FROM cross_game_memories WHERE source_game_id = ?", (session_id,),
                )
            elif table == "game_branches":
                result = await conn.execute(
                    "DELETE FROM game_branches WHERE child_game_id = ? OR parent_game_id = ?",
                    (session_id, session_id),
                )
            else:
                result = await conn.execute(f"DELETE FROM {table} WHERE game_id = ?", (session_id,))
            counts[table] = max(result.rowcount, 0)
        result = await conn.execute("DELETE FROM games WHERE id = ?", (session_id,))
        counts["games"] = max(result.rowcount, 0)
        for tournament_id in tournament_ids:
            await conn.execute(
                """UPDATE tournaments
                   SET games_completed = (
                       SELECT COUNT(*) FROM tournament_games WHERE tournament_id = ?
                   )
                   WHERE id = ?""",
                (tournament_id, tournament_id),
            )
        await conn.commit()
    except Exception:
        await conn.rollback()
        raise
    return counts


async def record_log_entry(conn: DatabaseConnection, session_id: str, entry: LogEntry) -> None:
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
    conn: DatabaseConnection,
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


async def record_note(conn: DatabaseConnection, session_id: str, seat_id: str, round: int, note: str) -> None:
    await conn.execute(
        "INSERT INTO agent_notes (game_id, seat_id, round, note) VALUES (?, ?, ?, ?)",
        (session_id, seat_id, round, note),
    )
    await conn.commit()


async def get_notes(conn: DatabaseConnection, session_id: str, seat_id: str) -> list[str]:
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
    conn: DatabaseConnection,
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
    conn: DatabaseConnection, event_key: str,
) -> dict | None:
    cursor = await conn.execute(
        f"SELECT {', '.join(NOTE_EVENT_COLUMNS)} FROM agent_note_events WHERE event_key = ?",
        (event_key,),
    )
    return _note_event(await cursor.fetchone())


async def get_latest_note_event(
    conn: DatabaseConnection, session_id: str, seat_id: str, note_id: str,
) -> dict | None:
    cursor = await conn.execute(
        f"""SELECT {', '.join(NOTE_EVENT_COLUMNS)} FROM agent_note_events
            WHERE game_id = ? AND seat_id = ? AND note_id = ?
            ORDER BY revision DESC LIMIT 1""",
        (session_id, seat_id, note_id),
    )
    return _note_event(await cursor.fetchone())


async def get_note_events(
    conn: DatabaseConnection,
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
    conn: DatabaseConnection,
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
    conn: DatabaseConnection, event_key: str,
) -> dict | None:
    cursor = await conn.execute(
        f"SELECT {', '.join(BELIEF_EVENT_COLUMNS)} FROM agent_belief_events WHERE event_key = ?",
        (event_key,),
    )
    return _belief_event(await cursor.fetchone())


async def get_latest_belief_event(
    conn: DatabaseConnection,
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
    conn: DatabaseConnection,
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


async def get_vote_history(conn: DatabaseConnection, session_id: str) -> list[dict]:
    cursor = await conn.execute(
        "SELECT round, seat_id, text FROM log_entries WHERE game_id = ? AND type = 'vote' ORDER BY seq",
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [{"round": r[0], "seat_id": r[1], "text": r[2]} for r in rows]


async def get_decisions(conn: DatabaseConnection, session_id: str) -> list[dict]:
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


async def create_branch_record(
    conn: DatabaseConnection,
    *,
    child_game_id: str,
    parent_game_id: str,
    checkpoint_id: str,
    branch_log_seq: int,
    replaced_seat_id: str,
    replaced_kind: str,
    replacement: dict,
) -> None:
    await conn.execute(
        """INSERT INTO game_branches
           (child_game_id, parent_game_id, checkpoint_id, branch_log_seq,
            replaced_seat_id, replaced_kind, replacement_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            child_game_id, parent_game_id, checkpoint_id, branch_log_seq,
            replaced_seat_id, replaced_kind, json.dumps(replacement),
        ),
    )
    await conn.commit()


async def get_branch_lineage(conn: DatabaseConnection, session_id: str) -> dict | None:
    cursor = await conn.execute(
        """SELECT child_game_id, parent_game_id, checkpoint_id, branch_log_seq,
                  replaced_seat_id, replaced_kind, replacement_json, created_at
           FROM game_branches WHERE child_game_id = ?""",
        (session_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    keys = [
        "child_game_id", "parent_game_id", "checkpoint_id", "branch_log_seq",
        "replaced_seat_id", "replaced_kind", "replacement_json", "created_at",
    ]
    result = dict(zip(keys, row))
    result["replacement"] = json.loads(result.pop("replacement_json"))
    result["created_at"] = str(result["created_at"])
    return result


async def clone_history_prefix(
    conn: DatabaseConnection,
    *,
    parent_game_id: str,
    child_game_id: str,
    through_seq: int,
) -> None:
    """Copy immutable evidence up to the fork without mutating the source."""
    await conn.execute(
        """INSERT INTO log_entries
           (game_id, seq, round, phase, type, seat_id, text, thought, private, created_at)
           SELECT ?, seq, round, phase, type, seat_id, text, thought, private, created_at
           FROM log_entries WHERE game_id = ? AND seq <= ? ORDER BY seq""",
        (child_game_id, parent_game_id, through_seq),
    )
    await conn.execute(
        """INSERT INTO agent_note_events
           (game_id, seat_id, note_id, revision, operation, kind, subject, content,
            status, source_seq, source_phase, source_round, event_key, created_at)
           SELECT ?, seat_id, note_id, revision, operation, kind, subject, content,
                  status, source_seq, source_phase, source_round,
                  ? || ':branch-note:' || id, created_at
           FROM agent_note_events
           WHERE game_id = ? AND (source_seq IS NULL OR source_seq <= ?)""",
        (child_game_id, child_game_id, parent_game_id, through_seq),
    )
    await conn.execute(
        """INSERT INTO agent_belief_events
           (game_id, observer_seat_id, subject_seat_id, revision, suspicion,
            confidence, reason, source_seq, source_phase, source_round, event_key, created_at)
           SELECT ?, observer_seat_id, subject_seat_id, revision, suspicion,
                  confidence, reason, source_seq, source_phase, source_round,
                  ? || ':branch-belief:' || id, created_at
           FROM agent_belief_events
           WHERE game_id = ? AND (source_seq IS NULL OR source_seq <= ?)""",
        (child_game_id, child_game_id, parent_game_id, through_seq),
    )
    await conn.commit()


async def create_tournament(
    conn: DatabaseConnection,
    tournament_id: str,
    config: dict,
    games_requested: int,
) -> None:
    await conn.execute(
        """INSERT INTO tournaments (id, status, config_json, games_requested)
           VALUES (?, 'queued', ?, ?)""",
        (tournament_id, json.dumps(config), games_requested),
    )
    await conn.commit()


async def set_tournament_status(
    conn: DatabaseConnection,
    tournament_id: str,
    status: str,
    *,
    stop_reason: str | None = None,
) -> None:
    finished = status in {"completed", "stopped_budget", "failed", "cancelled"}
    await conn.execute(
        """UPDATE tournaments SET status = ?, stop_reason = ?,
           finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE finished_at END
           WHERE id = ?""",
        (status, stop_reason, finished, tournament_id),
    )
    await conn.commit()


async def record_tournament_game(
    conn: DatabaseConnection,
    tournament_id: str,
    game_id: str,
    game_index: int,
    result: dict,
) -> None:
    await conn.execute(
        """INSERT INTO tournament_games
           (tournament_id, game_id, game_index, result_json) VALUES (?, ?, ?, ?)""",
        (tournament_id, game_id, game_index, json.dumps(result)),
    )
    await conn.execute(
        "UPDATE tournaments SET games_completed = games_completed + 1 WHERE id = ?",
        (tournament_id,),
    )
    await conn.commit()


async def get_tournament(conn: DatabaseConnection, tournament_id: str) -> dict | None:
    cursor = await conn.execute(
        """SELECT id, status, config_json, games_requested, games_completed,
                  stop_reason, created_at, finished_at
           FROM tournaments WHERE id = ?""",
        (tournament_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    keys = [
        "id", "status", "config_json", "games_requested", "games_completed",
        "stop_reason", "created_at", "finished_at",
    ]
    result = dict(zip(keys, row))
    result["config"] = json.loads(result.pop("config_json"))
    result["created_at"] = str(result["created_at"])
    result["finished_at"] = str(result["finished_at"]) if result["finished_at"] else None
    game_cursor = await conn.execute(
        "SELECT game_id, game_index, result_json FROM tournament_games WHERE tournament_id = ? ORDER BY game_index",
        (tournament_id,),
    )
    result["games"] = [
        {"game_id": game_id, "game_index": index, **json.loads(payload)}
        for game_id, index, payload in await game_cursor.fetchall()
    ]
    return result


RELATIONSHIP_COLUMNS = [
    "id", "owner_name", "subject_name", "memory", "source_game_id",
    "source_seq", "active", "created_at", "edited_at",
]


async def record_relationship_memory(
    conn: DatabaseConnection,
    *,
    owner_name: str,
    subject_name: str,
    memory: str,
    source_game_id: str,
    source_seq: int | None,
    event_key: str,
) -> None:
    await conn.execute(
        """INSERT OR IGNORE INTO cross_game_memories
           (owner_name, subject_name, memory, source_game_id, source_seq, event_key)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (owner_name, subject_name, memory, source_game_id, source_seq, event_key),
    )
    await conn.commit()


async def get_relationship_memories(
    conn: DatabaseConnection,
    owner_name: str | None = None,
    *,
    include_inactive: bool = False,
) -> list[dict]:
    clauses = []
    params: list[object] = []
    if owner_name:
        clauses.append("owner_name = ?")
        params.append(owner_name)
    if not include_inactive:
        clauses.append("active = 1")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    cursor = await conn.execute(
        f"SELECT {', '.join(RELATIONSHIP_COLUMNS)} FROM cross_game_memories {where} ORDER BY id DESC",
        params,
    )
    return [dict(zip(RELATIONSHIP_COLUMNS, row)) for row in await cursor.fetchall()]


async def edit_relationship_memory(conn: DatabaseConnection, memory_id: int, memory: str) -> bool:
    cursor = await conn.execute(
        "UPDATE cross_game_memories SET memory = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?",
        (memory, memory_id),
    )
    await conn.commit()
    return cursor.rowcount == 1


async def delete_relationship_memory(conn: DatabaseConnection, memory_id: int) -> bool:
    cursor = await conn.execute("DELETE FROM cross_game_memories WHERE id = ?", (memory_id,))
    await conn.commit()
    return cursor.rowcount == 1


async def create_replay_share(
    conn: DatabaseConnection,
    *,
    share_id: str,
    game_id: str,
    scope: str,
    secret_hash: str | None,
    snapshot: dict,
    expires_at: str | None,
) -> None:
    await conn.execute(
        """INSERT INTO replay_shares
           (id, game_id, scope, secret_hash, snapshot_json, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (share_id, game_id, scope, secret_hash, json.dumps(snapshot), expires_at),
    )
    await conn.commit()


async def get_replay_share(conn: DatabaseConnection, share_id: str) -> dict | None:
    cursor = await conn.execute(
        """SELECT id, game_id, scope, secret_hash, snapshot_json, expires_at,
                  revoked_at, created_at
           FROM replay_shares WHERE id = ?""",
        (share_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    keys = [
        "id", "game_id", "scope", "secret_hash", "snapshot_json",
        "expires_at", "revoked_at", "created_at",
    ]
    result = dict(zip(keys, row))
    result["snapshot"] = json.loads(result.pop("snapshot_json"))
    for key in ("expires_at", "revoked_at", "created_at"):
        result[key] = str(result[key]) if result[key] is not None else None
    return result


async def list_replay_shares(conn: DatabaseConnection, game_id: str) -> list[dict]:
    cursor = await conn.execute(
        """SELECT id, scope, expires_at, revoked_at, created_at
           FROM replay_shares WHERE game_id = ? ORDER BY created_at DESC""",
        (game_id,),
    )
    return [
        {
            "id": row[0], "scope": row[1],
            "expires_at": str(row[2]) if row[2] else None,
            "revoked_at": str(row[3]) if row[3] else None,
            "created_at": str(row[4]),
        }
        for row in await cursor.fetchall()
    ]


async def revoke_replay_share(conn: DatabaseConnection, game_id: str, share_id: str) -> bool:
    cursor = await conn.execute(
        """UPDATE replay_shares SET revoked_at = CURRENT_TIMESTAMP
           WHERE id = ? AND game_id = ? AND revoked_at IS NULL""",
        (share_id, game_id),
    )
    await conn.commit()
    return cursor.rowcount == 1
