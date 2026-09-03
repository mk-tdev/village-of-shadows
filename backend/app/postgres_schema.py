POSTGRES_SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    id            TEXT PRIMARY KEY,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at    TIMESTAMP,
    finished_at   TIMESTAMP,
    status        TEXT NOT NULL,
    winner        TEXT
);

CREATE TABLE IF NOT EXISTS seats (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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

-- FE-03: every counterfactual is a new immutable game thread.  The source
-- remains untouched and this row provides the lineage shown by the UI.
CREATE TABLE IF NOT EXISTS game_branches (
    child_game_id       TEXT PRIMARY KEY REFERENCES games(id),
    parent_game_id      TEXT NOT NULL REFERENCES games(id),
    checkpoint_id       TEXT NOT NULL,
    branch_log_seq      INTEGER NOT NULL,
    replaced_seat_id    TEXT NOT NULL,
    replaced_kind       TEXT NOT NULL,
    replacement_json    TEXT NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_branches_parent
ON game_branches(parent_game_id, created_at);

-- FE-04: tournament definitions and immutable per-game measurements.
CREATE TABLE IF NOT EXISTS tournaments (
    id              TEXT PRIMARY KEY,
    status          TEXT NOT NULL,
    config_json     TEXT NOT NULL,
    games_requested INTEGER NOT NULL,
    games_completed INTEGER NOT NULL DEFAULT 0,
    stop_reason     TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at     TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_games (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
    game_id         TEXT NOT NULL REFERENCES games(id),
    game_index      INTEGER NOT NULL,
    result_json     TEXT NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, game_index)
);

CREATE INDEX IF NOT EXISTS idx_tournament_games_parent
ON tournament_games(tournament_id, game_index);

-- FE-12: immutable launch configuration. Checkpoints also contain the same
-- values, while this compact row remains easy to inspect independently.
CREATE TABLE IF NOT EXISTS game_configs (
    game_id       TEXT PRIMARY KEY REFERENCES games(id),
    options_json  TEXT NOT NULL,
    seats_json    TEXT NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FE-09: opaque browser credentials are stored only as SHA-256 digests.
-- A host credential controls the room; each human credential is bound to
-- exactly one seat and is checked again for every submitted action.
CREATE TABLE IF NOT EXISTS game_hosts (
    game_id          TEXT PRIMARY KEY REFERENCES games(id),
    room_code        TEXT NOT NULL UNIQUE,
    host_token_hash  TEXT NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seat_access_tokens (
    game_id          TEXT NOT NULL REFERENCES games(id),
    seat_id          TEXT NOT NULL,
    token_hash       TEXT NOT NULL,
    claimed_at       TIMESTAMP,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(game_id, seat_id),
    UNIQUE(token_hash)
);

-- Operator-facing attendance metadata. We record only an ISO country code,
-- never the source IP address used to infer it. A row is created once a
-- human actually opens their protected seat, rather than merely when the
-- room host issues an invitation.
CREATE TABLE IF NOT EXISTS game_participants (
    game_id       TEXT NOT NULL REFERENCES games(id),
    seat_id       TEXT NOT NULL,
    country_code  TEXT,
    browser_name  TEXT,
    os_name       TEXT,
    language      TEXT,
    timezone      TEXT,
    device_class  TEXT,
    viewport_size TEXT,
    connection_type TEXT,
    save_data     BOOLEAN,
    actions_taken INTEGER NOT NULL DEFAULT 0,
    joined_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(game_id, seat_id)
);

CREATE INDEX IF NOT EXISTS idx_game_participants_game
ON game_participants(game_id, joined_at);

-- FE-13: opt-in continuity. Memories describe observed behaviour and always
-- cite a source game/event; current secret roles are never stored here.
CREATE TABLE IF NOT EXISTS cross_game_memories (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_name      TEXT NOT NULL,
    subject_name    TEXT NOT NULL,
    memory          TEXT NOT NULL,
    source_game_id  TEXT NOT NULL REFERENCES games(id),
    source_seq      INTEGER,
    event_key       TEXT NOT NULL UNIQUE,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at       TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cross_game_memory_owner
ON cross_game_memories(owner_name, active, created_at);

-- FE-15: immutable, revocable replay exports. God exports require a second
-- unguessable secret; neither form stores credentials or provider endpoints.
CREATE TABLE IF NOT EXISTS replay_shares (
    id              TEXT PRIMARY KEY,
    game_id         TEXT NOT NULL REFERENCES games(id),
    scope           TEXT NOT NULL,
    secret_hash     TEXT,
    snapshot_json   TEXT NOT NULL,
    expires_at      TIMESTAMP,
    revoked_at      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_replay_shares_game
ON replay_shares(game_id, created_at);

-- Public council speech is immutable by (game, log sequence). Caching the
-- generated audio prevents replay, reconnects, and multiple human viewers
-- from paying for the same line more than once.
CREATE TABLE IF NOT EXISTS voice_audio_cache (
    game_id       TEXT NOT NULL REFERENCES games(id),
    log_seq       INTEGER NOT NULL,
    model         TEXT NOT NULL,
    voice         TEXT NOT NULL,
    audio         BYTEA NOT NULL,
    content_type  TEXT NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(game_id, log_seq, model, voice)
);

CREATE INDEX IF NOT EXISTS idx_voice_audio_cache_game
ON voice_audio_cache(game_id, log_seq);
"""
