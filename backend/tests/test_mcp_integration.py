"""Exercises the real MCP protocol path — ASGI mount, tool listing, and the
identity-binding rule from plan §6.2 — independent of any LLM. The graph
smoke tests cover the mock provider's shortcut path (agent_turn.py bypasses
MCP entirely for provider="mock"); this test covers the one thing nothing
else does without a live model key: a genuine MCP ClientSession calling
`bind_seat` then a gameplay tool over HTTP, proving identity really is
bound to the connection and not spoofable via an argument.
"""

import json
import uuid

import httpx
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app import persistence
from app.game import registry
from app.game.orchestrator import GameOrchestrator
from app.mcp_server import identity
from app.mcp_server.server import mcp
from app.models import AgentConfig, GameState, Player


def _parse_result(call_tool_result) -> dict:
    if call_tool_result.structuredContent is not None:
        return call_tool_result.structuredContent
    return json.loads(call_tool_result.content[0].text)


def _asgi_http_client_factory(app):
    def factory(headers=None, timeout=None, auth=None):
        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), headers=headers, timeout=timeout, auth=auth
        )

    return factory


@pytest.mark.asyncio
async def test_bind_seat_then_gameplay_tool_over_real_mcp_session(tmp_path):
    import aiosqlite
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    from app.db import init_schema
    from app.game.graph import build_graph

    conn = await aiosqlite.connect(str(tmp_path / "mcp_test.db"))
    await init_schema(conn)
    checkpointer = AsyncSqliteSaver(conn)
    await checkpointer.setup()
    graph = build_graph(checkpointer)

    session_id = str(uuid.uuid4())
    configs = [
        AgentConfig(seat_id="seat_0", display_name="Mara", personality="sly", controller="ai", provider="mock", model_name="mock-v1")
    ]
    players = [Player(seat_id="seat_0", name="Mara", personality="sly", controller="ai", role="villager")]
    state = GameState(session_id=session_id, players=players, phase="day-discuss")
    await persistence.create_game(conn, session_id, configs)
    orch = GameOrchestrator(session_id, state, conn, graph)
    registry.register(orch)

    app_asgi = mcp.streamable_http_app()
    token = identity.mint_token(session_id, "seat_0")

    async with mcp.session_manager.run():
        async with streamablehttp_client(
            "http://127.0.0.1:8000/mcp", httpx_client_factory=_asgi_http_client_factory(app_asgi)
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()

                tool_names = {t.name for t in (await session.list_tools()).tools}
                assert "bind_seat" in tool_names
                assert "submit_statement" in tool_names

                bind_result = await session.call_tool("bind_seat", {"token": token})
                assert _parse_result(bind_result) == {"ok": True, "game_id": session_id, "seat_id": "seat_0"}

                # A gameplay tool call now resolves identity from the bound
                # session -- note it takes no seat_id argument at all.
                result = await session.call_tool("submit_statement", {"text": "Hello, village."})
                assert _parse_result(result) == {"ok": True}

    assert state.log[-1].text == "Hello, village."
    assert state.log[-1].seat_id == "seat_0"
