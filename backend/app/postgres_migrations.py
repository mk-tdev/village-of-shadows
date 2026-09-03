"""Versioned application-schema bootstrap for PostgreSQL.

LangGraph creates its own checkpoint tables through ``AsyncPostgresSaver``.
This module only owns Village of Shadows' application data.
"""

from app.postgres_adapter import DatabaseConnection
from app.postgres_schema import POSTGRES_SCHEMA


async def init_schema(conn: DatabaseConnection) -> None:
    await conn.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
               version INTEGER PRIMARY KEY,
               applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    cursor = await conn.execute(
        "SELECT 1 FROM schema_migrations WHERE version = 1"
    )
    if await cursor.fetchone() is None:
        await conn.execute(POSTGRES_SCHEMA)
        await conn.execute("INSERT INTO schema_migrations (version) VALUES (1)")
    cursor = await conn.execute(
        "SELECT 1 FROM schema_migrations WHERE version = 2"
    )
    if await cursor.fetchone() is None:
        # Existing deployments already have `games`, so the archive fields
        # need an additive migration instead of relying on CREATE TABLE IF
        # NOT EXISTS above.
        await conn.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS started_at TIMESTAMP")
        await conn.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP")
        await conn.execute(
            """CREATE TABLE IF NOT EXISTS game_participants (
                   game_id TEXT NOT NULL REFERENCES games(id),
                   seat_id TEXT NOT NULL,
                   country_code TEXT,
                   joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                   last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                   PRIMARY KEY(game_id, seat_id)
               )"""
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_game_participants_game ON game_participants(game_id, joined_at)"
        )
        await conn.execute("INSERT INTO schema_migrations (version) VALUES (2)")
    cursor = await conn.execute(
        "SELECT 1 FROM schema_migrations WHERE version = 3"
    )
    if await cursor.fetchone() is None:
        for column, kind in (
            ("browser_name", "TEXT"), ("os_name", "TEXT"), ("language", "TEXT"),
            ("timezone", "TEXT"), ("device_class", "TEXT"), ("viewport_size", "TEXT"),
            ("connection_type", "TEXT"), ("save_data", "BOOLEAN"),
            ("actions_taken", "INTEGER NOT NULL DEFAULT 0"),
        ):
            await conn.execute(f"ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS {column} {kind}")
        await conn.execute("INSERT INTO schema_migrations (version) VALUES (3)")
    await conn.commit()
