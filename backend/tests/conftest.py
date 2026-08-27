"""Keep Postgres checkpointers and orchestrator tasks isolated between tests."""

import asyncio
from contextlib import suppress

import pytest_asyncio

from app.game import registry
from app.postgres_adapter import DatabaseConnection
from app.postgres_migrations import init_schema
from tests.helpers import database_url_for_tests


@pytest_asyncio.fixture(autouse=True)
async def clean_test_orchestrators():
    conn = await DatabaseConnection.connect(database_url_for_tests())
    await init_schema(conn)
    await conn.execute("TRUNCATE TABLE games CASCADE")
    checkpoint_table = await conn.execute("SELECT to_regclass('public.checkpoints')")
    if (await checkpoint_table.fetchone())[0] is not None:
        await conn.execute("TRUNCATE TABLE checkpoints, checkpoint_blobs, checkpoint_writes")
    await conn.commit()
    await conn.close()
    yield
    orchestrators = list(registry.ACTIVE_GAMES.values())
    registry.ACTIVE_GAMES.clear()
    for orchestrator in orchestrators:
        task = getattr(orchestrator, "_task", None)
        if task is not None and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        checkpointer_context = getattr(orchestrator, "_checkpointer_context", None)
        if checkpointer_context is not None:
            with suppress(Exception):
                await checkpointer_context.__aexit__(None, None, None)
        with suppress(Exception):
            await orchestrator.conn.close()
