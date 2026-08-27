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
    await conn.commit()
