"""Runs one seat's turn: either a real model in a tool-calling loop against
the MCP server, or (for provider="mock"/no chat model) a scripted decision
that still drives its result through the same `actions.py` functions a real
tool call would. Plan §6.1/§7.

The tool-calling loop, not JSON parsing, is how an agent acts — see plan
§6.1 for why. If a model never calls the commit tool after a couple of
tries, we fall back to a safe default rather than crash the game (plan §7).

Every turn also emits a "decision" SSE event carrying token usage — this is
the data behind the frontend debug panel's per-agent context/token metrics,
the other half of the "showcase agentic engineering" ask alongside the
graph-flow view (see routers/graph.py).
"""

from __future__ import annotations

import json
import random
import time
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app import persistence
from app.adapters import get_chat_model
from app.config import settings
from app.game import actions
from app.mcp_server import identity

if TYPE_CHECKING:
    from app.game.orchestrator import GameOrchestrator
    from app.models import Player

MAX_TOOL_ITERATIONS = 4


async def run_agent_turn(
    orch: "GameOrchestrator",
    player: "Player",
    *,
    phase: str,
    system_prompt: str,
    user_prompt: str,
    commit_tool_name: str,
    fallback: dict[str, Any],
) -> dict[str, Any]:
    """Returns the commit tool's result dict — either the model's real
    choice, or the fallback if it never commits."""
    from app.models import AgentConfig

    config = AgentConfig(
        seat_id=player.seat_id,
        display_name=player.name,
        personality=player.personality,
        controller=player.controller,
        provider=player.provider,
        model_name=player.model_name,
        endpoint=player.endpoint,
    )
    chat_model = get_chat_model(config)

    if chat_model is None:
        return await _run_mock_turn(
            orch, player, phase=phase, system_prompt=system_prompt, user_prompt=user_prompt,
            commit_tool_name=commit_tool_name, fallback=fallback,
        )

    return await _run_model_turn(
        orch, player, chat_model,
        phase=phase, system_prompt=system_prompt, user_prompt=user_prompt,
        commit_tool_name=commit_tool_name, fallback=fallback,
    )


async def _run_model_turn(
    orch: "GameOrchestrator",
    player: "Player",
    chat_model,
    *,
    phase: str,
    system_prompt: str,
    user_prompt: str,
    commit_tool_name: str,
    fallback: dict[str, Any],
) -> dict[str, Any]:
    from langchain_mcp_adapters.sessions import create_session
    from langchain_mcp_adapters.tools import load_mcp_tools

    from app.mcp_server.server import MODEL_VISIBLE_TOOLS

    token = identity.mint_token(orch.session_id, player.seat_id)
    tool_calls_log: list[dict] = []
    raw_responses: list[str] = []
    input_tokens = 0
    output_tokens = 0
    start = time.monotonic()

    async with create_session({"transport": "streamable_http", "url": settings.mcp_url}) as session:
        await session.initialize()
        await session.call_tool("bind_seat", {"token": token})
        try:
            all_tools = await load_mcp_tools(session)
            model_tools = [t for t in all_tools if t.name in MODEL_VISIBLE_TOOLS]
            bound_model = chat_model.bind_tools(model_tools)
            tools_by_name = {t.name: t for t in model_tools}

            messages: list[Any] = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]

            for _ in range(MAX_TOOL_ITERATIONS):
                ai_msg: AIMessage = await bound_model.ainvoke(messages)
                messages.append(ai_msg)
                raw_responses.append(ai_msg.text() if hasattr(ai_msg, "text") else str(ai_msg.content))
                usage = getattr(ai_msg, "usage_metadata", None)
                if usage:
                    input_tokens += usage.get("input_tokens") or 0
                    output_tokens += usage.get("output_tokens") or 0

                if not ai_msg.tool_calls:
                    messages.append(
                        HumanMessage(
                            content="You must act by calling one of the provided tools, "
                            f"in particular `{commit_tool_name}` to finish your turn."
                        )
                    )
                    continue

                committed_result = None
                for tc in ai_msg.tool_calls:
                    tool = tools_by_name.get(tc["name"])
                    if tool is None:
                        continue
                    tool_message = await tool.ainvoke(tc)
                    messages.append(tool_message)
                    result = _extract_structured_result(tool_message)
                    tool_calls_log.append({"tool": tc["name"], "args": tc["args"], "result": result})
                    if tc["name"] == commit_tool_name and result is not None:
                        committed_result = result

                if committed_result is not None:
                    return committed_result
        finally:
            identity.release(session)
            latency_ms = int((time.monotonic() - start) * 1000)
            await _record_decision(
                orch, player, phase=phase,
                prompt=f"{system_prompt}\n---\n{user_prompt}",
                raw_response="\n".join(raw_responses),
                tool_calls=tool_calls_log,
                latency_ms=latency_ms,
                input_tokens=input_tokens or None,
                output_tokens=output_tokens or None,
            )

    return await _apply_fallback(orch, player, commit_tool_name, fallback)


def _extract_structured_result(tool_message) -> dict | None:
    artifact = getattr(tool_message, "artifact", None)
    if artifact is not None and getattr(artifact, "structured_content", None) is not None:
        return artifact.structured_content

    # FastMCP only populates `structuredContent` when a tool's return
    # annotation is concrete enough to build an output schema from (a bare
    # `dict` isn't) — our tools all return plain JSON-serializable dicts, so
    # fall back to parsing the text content it always produces instead.
    content = tool_message.content if hasattr(tool_message, "content") else None
    text = content if isinstance(content, str) else None
    if text is None and isinstance(content, list) and content:
        first = content[0]
        text = first.get("text") if isinstance(first, dict) else getattr(first, "text", None)
    if text:
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return None
    return None


async def _run_mock_turn(
    orch: "GameOrchestrator",
    player: "Player",
    *,
    phase: str,
    system_prompt: str,
    user_prompt: str,
    commit_tool_name: str,
    fallback: dict[str, Any],
) -> dict[str, Any]:
    """Offline stand-in for a real model: picks a random legal option and
    routes it through the exact same `actions.py` call a real tool
    invocation would make, so the rest of the pipeline (validation,
    persistence, SSE) is exercised identically. Token counts are estimated
    from text length (~4 chars/token) rather than real API usage — there is
    no API call to measure — so the debug panel still has something to show
    when running fully offline."""
    start = time.monotonic()
    result = await _apply_fallback(orch, player, commit_tool_name, fallback)
    latency_ms = int((time.monotonic() - start) * 1000)
    raw_response = json.dumps(result)
    await _record_decision(
        orch, player, phase=phase,
        prompt=f"{system_prompt}\n---\n{user_prompt}",
        raw_response=raw_response,
        tool_calls=[{"tool": commit_tool_name, "args": result, "result": result}],
        latency_ms=latency_ms,
        input_tokens=_estimate_tokens(system_prompt) + _estimate_tokens(user_prompt),
        output_tokens=_estimate_tokens(raw_response),
    )
    return result


async def _record_decision(
    orch: "GameOrchestrator",
    player: "Player",
    *,
    phase: str,
    prompt: str,
    raw_response: str,
    tool_calls: list[dict],
    latency_ms: int,
    input_tokens: int | None,
    output_tokens: int | None,
) -> None:
    await persistence.record_agent_decision(
        orch.conn,
        session_id=orch.session_id,
        seat_id=player.seat_id,
        round=orch.state.round,
        phase=phase,
        provider=player.provider,
        model_name=player.model_name,
        prompt=prompt,
        raw_response=raw_response,
        tool_calls=tool_calls,
        latency_ms=latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    orch.publish("decision", {
        "seat_id": player.seat_id,
        "name": player.name,
        "provider": player.provider,
        "model_name": player.model_name,
        "phase": phase,
        "latency_ms": latency_ms,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated": player.provider in (None, "mock"),
    })


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


async def _apply_fallback(
    orch: "GameOrchestrator", player: "Player", commit_tool_name: str, fallback: dict[str, Any]
) -> dict[str, Any]:
    target = fallback.get("target") or _random_target(fallback.get("pool", []))
    thought = fallback.get("thought", "considers the options in silence.")
    if commit_tool_name == "submit_night_action":
        return await actions.apply_night_action(orch, player.seat_id, target, thought)
    if commit_tool_name == "submit_statement":
        text = fallback.get("text", "stays quiet, watching the others.")
        return await actions.apply_statement(orch, player.seat_id, text, thought)
    if commit_tool_name == "submit_vote":
        return await actions.apply_vote(orch, player.seat_id, target, thought)
    raise ValueError(f"Unknown commit tool: {commit_tool_name}")


def _random_target(pool: list[str]) -> str | None:
    return random.choice(pool) if pool else None
