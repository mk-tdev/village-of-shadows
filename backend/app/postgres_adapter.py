"""PostgreSQL compatibility layer for the pre-existing persistence calls."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

from psycopg import AsyncConnection, AsyncCursor


class DatabaseRow:
    __slots__ = ("_columns", "_values")

    def __init__(self, columns: Sequence[str], values: Sequence[Any]) -> None:
        self._columns = tuple(columns)
        self._values = tuple(values)

    def __getitem__(self, key: int | str) -> Any:
        if isinstance(key, str):
            return self._values[self._columns.index(key)]
        return self._values[key]

    def __iter__(self):
        return iter(self._values)

    def __len__(self) -> int:
        return len(self._values)

    def __eq__(self, other: object) -> bool:
        return self._values == (other._values if isinstance(other, DatabaseRow) else other)

    def __repr__(self) -> str:
        return repr(self._values)


def _row_factory(cursor: AsyncCursor[Any]):
    columns = tuple(column.name for column in cursor.description or ())
    return lambda values: DatabaseRow(columns, values)


def _postgres_sql(sql: str) -> str:
    translated = sql.replace("?", "%s")
    translated = translated.replace("private = 0", "private = FALSE")
    translated = translated.replace("private = 1", "private = TRUE")
    translated = translated.replace("active = 0", "active = FALSE")
    translated = translated.replace("active = 1", "active = TRUE")
    if "INSERT OR IGNORE" in translated.upper():
        translated = translated.replace("INSERT OR IGNORE", "INSERT")
        return f"{translated.rstrip()} ON CONFLICT DO NOTHING"
    return translated


class DatabaseConnection:
    """Psycopg connection exposing the aiosqlite subset the game uses."""

    def __init__(self, connection: AsyncConnection[Any]) -> None:
        self._connection = connection

    @classmethod
    async def connect(cls, database_url: str) -> "DatabaseConnection":
        connection = await AsyncConnection.connect(
            database_url,
            autocommit=False,
            row_factory=_row_factory,
        )
        return cls(connection)

    async def execute(
        self, sql: str, params: Sequence[Any] | None = None
    ) -> AsyncCursor[Any]:
        return await self._connection.execute(_postgres_sql(sql), params or ())

    async def executemany(
        self, sql: str, params_seq: Iterable[Sequence[Any]]
    ) -> None:
        async with self._connection.cursor() as cursor:
            await cursor.executemany(_postgres_sql(sql), params_seq)

    async def commit(self) -> None:
        await self._connection.commit()

    async def rollback(self) -> None:
        await self._connection.rollback()

    async def close(self) -> None:
        await self._connection.close()
