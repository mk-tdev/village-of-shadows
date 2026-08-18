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
        # follow_redirects=True: mounting the sub-app at "/mcp" (below) means
        # a request to exactly "/mcp" gets a 307 to "/mcp/" before the
        # sub-app's own route matches -- the same redirect real agents'
        # httpx clients (via langchain-mcp-adapters) already follow
        # transparently in production.
        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), headers=headers, timeout=timeout, auth=auth,
            follow_redirects=True,
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
        AgentConfig(seat_id="seat_0", display_name="Mara", personality="sly", controller="ai", provider="mock", model_name="mock-v1"),
        AgentConfig(seat_id="seat_1", display_name="Elin", personality="careful", controller="ai", provider="mock", model_name="mock-v1"),
    ]
    players = [
        Player(seat_id="seat_0", name="Mara", personality="sly", controller="ai", role="villager"),
        Player(seat_id="seat_1", name="Elin", personality="careful", controller="ai", role="villager"),
    ]
    state = GameState(session_id=session_id, players=players, phase="day-discuss")
    await persistence.create_game(conn, session_id, configs)
    orch = GameOrchestrator(session_id, state, conn, graph)
    registry.register(orch)

    # Mount at "/mcp" exactly like main.py does -- rather than pointing the
    # client straight at the unwrapped sub-app -- so this test actually
    # exercises the real routing agents connect through in production. This
    # is what catches the double-mount bug where FastMCP's own internal
    # route (also "/mcp" by default) plus this mount prefix would silently
    # require "/mcp/mcp", 404-ing every real agent's MCP connection while
    # every other test kept passing because none of them went through a
    # mount at all.
    from starlette.applications import Starlette

    app_asgi = Starlette(routes=[])
    app_asgi.mount("/mcp", mcp.streamable_http_app())
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
                assert "record_private_note" in tool_names
                assert "get_my_note_history" in tool_names
                assert "update_belief" in tool_names
                assert "get_my_beliefs" in tool_names

                bind_result = await session.call_tool("bind_seat", {"token": token})
                assert _parse_result(bind_result) == {"ok": True, "game_id": session_id, "seat_id": "seat_0"}

                # A gameplay tool call now resolves identity from the bound
                # session -- note it takes no seat_id argument at all.
                result = await session.call_tool("submit_statement", {"text": "Hello, village."})
                assert _parse_result(result) == {"ok": True}

                note_result = await session.call_tool(
                    "record_private_note",
                    {
                        "kind": "theory",
                        "subject": "the village",
                        "content": "My opening claim was deliberately neutral.",
                        "source_seq": 0,
                    },
                )
                note = _parse_result(note_result)["note"]
                history_payload = _parse_result(await session.call_tool("get_my_note_history", {}))
                history = history_payload.get("result", history_payload)
                assert history == [note]
                assert note["seat_id"] == "seat_0"

                belief_result = await session.call_tool(
                    "update_belief",
                    {
                        "subject": "Elin",
                        "suspicion": 62,
                        "confidence": 51,
                        "reason": "Elin's silence deserves attention.",
                        "source_seq": 0,
                    },
                )
                belief = _parse_result(belief_result)["belief"]
                beliefs_payload = _parse_result(await session.call_tool("get_my_beliefs", {}))
                beliefs = beliefs_payload.get("result", beliefs_payload)
                assert beliefs == [belief]
                assert belief["observer_seat_id"] == "seat_0"
                assert belief["subject_seat_id"] == "seat_1"

    assert state.log[-1].text == "Hello, village."
    assert state.log[-1].seat_id == "seat_0"
