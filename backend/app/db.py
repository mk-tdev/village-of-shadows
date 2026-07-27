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
"""


async def init_schema(conn: aiosqlite.Connection) -> None:
    await conn.executescript(SCHEMA)
    await conn.commit()
