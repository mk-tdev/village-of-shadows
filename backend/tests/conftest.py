"""Keep per-test SQLite checkpoint workers from surviving their event loop."""

import asyncio
from contextlib import suppress

import pytest_asyncio

from app.game import registry


@pytest_asyncio.fixture(autouse=True)
async def clean_test_orchestrators():
    yield
    orchestrators = list(registry.ACTIVE_GAMES.values())
    registry.ACTIVE_GAMES.clear()
    for orch in orchestrators:
        task = getattr(orch, "_task", None)
        if task is not None and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        with suppress(Exception):
            await orch.conn.close()
