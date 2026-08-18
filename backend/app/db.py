import aiosqlite

SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    id            TEXT PRIMARY KEY,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status        TEXT NOT NULL,
    winner        TEXT
);

CREATE TABLE IF NOT EXISTS seats (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL REFERENCES games(id),
    seat_id       TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    personality   TEXT,
    controller    TEXT NOT NULL,
    provider      TEXT,
    model_name    TEXT,
    role          TEXT
);

CREATE TABLE IF NOT EXISTS log_entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL REFERENCES games(id),
    seq           INTEGER NOT NULL,
    round         INTEGER NOT NULL,
    phase         TEXT NOT NULL,
    type          TEXT NOT NULL,
    seat_id       TEXT,
    text          TEXT,
    thought       TEXT,
    private       BOOLEAN NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_decisions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL REFERENCES games(id),
    seat_id       TEXT NOT NULL,
    round         INTEGER NOT NULL,
    phase         TEXT NOT NULL,
    provider      TEXT,
    model_name    TEXT,
    prompt        TEXT,
    raw_response  TEXT,
    tool_calls    TEXT,
    latency_ms    INTEGER,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_notes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL REFERENCES games(id),
    seat_id       TEXT NOT NULL,
    round         INTEGER NOT NULL,
    note          TEXT NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FE-07: an immutable, replay-safe notebook ledger. `agent_notes` remains
-- above so databases created by older builds keep working; all new note
-- tools write here. A revision or retirement is another row, never an
-- UPDATE, which lets God Mode reconstruct how a theory changed over time.
CREATE TABLE IF NOT EXISTS agent_note_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL REFERENCES games(id),
    seat_id       TEXT NOT NULL,
    note_id       TEXT NOT NULL,
    revision      INTEGER NOT NULL,
    operation     TEXT NOT NULL,
    kind          TEXT NOT NULL,
    subject       TEXT,
    content       TEXT NOT NULL,
    status        TEXT NOT NULL,
    source_seq    INTEGER,
    source_phase  TEXT NOT NULL,
    source_round  INTEGER NOT NULL,
    event_key     TEXT NOT NULL UNIQUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, seat_id, note_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_agent_note_events_owner
ON agent_note_events(game_id, seat_id, note_id, revision);

-- FE-02: each observer's evolving opinion of another seat. Values are
-- appended rather than updated so God Mode and the post-game debrief can
-- replay exactly when and why trust changed. Suspicion is 0 (trusted) to
-- 100 (certain threat); trust is the derived inverse shown by the UI.
CREATE TABLE IF NOT EXISTS agent_belief_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         TEXT NOT NULL REFERENCES games(id),
    observer_seat_id TEXT NOT NULL,
    subject_seat_id  TEXT NOT NULL,
    revision        INTEGER NOT NULL,
    suspicion       INTEGER NOT NULL CHECK(suspicion BETWEEN 0 AND 100),
    confidence      INTEGER NOT NULL CHECK(confidence BETWEEN 0 AND 100),
    reason          TEXT NOT NULL,
    source_seq      INTEGER,
    source_phase    TEXT NOT NULL,
    source_round    INTEGER NOT NULL,
    event_key       TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, observer_seat_id, subject_seat_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_agent_belief_events_pair
ON agent_belief_events(game_id, observer_seat_id, subject_seat_id, revision);
"""


async def init_schema(conn: aiosqlite.Connection) -> None:
    await conn.executescript(SCHEMA)
    await conn.commit()
