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

This module owns the *mechanics* of executing one turn (provider resolution,
MCP session + identity binding, the tool loop, telemetry) but deliberately
does **not** own a seat's memory. `run_turn_with_history` takes whatever
conversation a caller has accumulated and returns the messages to append to
it, leaving the question of where that history lives — and how long it
survives — to `seat_mind.py`, which keeps one continuously-checkpointed
conversation per seat for a whole game. Keeping the split here means the MCP
identity boundary stays exactly as it was (a fresh session, freshly bound,
per turn — see 05-mcp-tool-server-identity.md) even though the *reasoning*
either side of it is now long-lived.
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, HumanMessage

from app import persistence
from app.adapters import get_chat_model
from app.config import settings
from app.game import actions
from app.mcp_server import identity

if TYPE_CHECKING:
    from app.game.orchestrator import GameOrchestrator
    from app.models import Player

MAX_TOOL_ITERATIONS = 4


async def run_turn_with_history(
    orch: "GameOrchestrator",
    player: "Player",
    *,
    phase: str,
    history: list[Any],
    commit_tool_name: str,
    fallback: dict[str, Any],
) -> tuple[dict[str, Any], list[Any], dict[str, Any]]:
    """Runs one turn as a *continuation* of `history` rather than from a
    blank slate, and returns
    `(committed_result, messages_to_append, committed_args)`.

    `committed_args` is what the agent actually decided — the arguments it
    passed to the commit tool. The caller keeps them so the same decision can
    be re-applied if the graph replays this turn (see `apply_commit`).

    The caller owns the conversation; this function only reads it and reports
    back what happened, so the same tool-calling machinery serves both a
    one-shot turn and a seat whose memory spans a whole game. Note it returns
    the new messages instead of mutating `history` in place: `seat_mind.py`
    folds them into LangGraph state through an `add_messages` reducer, which
    needs the delta, not a mutated list."""
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

    if orch.state.tokens_used >= orch.state.options.max_game_tokens:
        orch.publish("resilience", {
            "seat_id": player.seat_id,
            "name": player.name,
            "status": "game_token_budget",
            "candidate": "rules",
            "attempt": 0,
            "message": "The server-side game token budget is exhausted; using a validated deterministic action.",
        })
        return await _run_mock_turn(
            orch, player, phase=phase, history=history,
            commit_tool_name=commit_tool_name, fallback=fallback,
        )

    if chat_model is None:
        return await _run_mock_turn(
            orch, player, phase=phase, history=history,
            commit_tool_name=commit_tool_name, fallback=fallback,
        )

    return await _run_model_turn(
        orch, player, chat_model,
        phase=phase, history=history,
        commit_tool_name=commit_tool_name, fallback=fallback,
    )


async def _run_model_turn(
    orch: "GameOrchestrator",
    player: "Player",
    chat_model,
    *,
    phase: str,
    history: list[Any],
    commit_tool_name: str,
    fallback: dict[str, Any],
) -> tuple[dict[str, Any], list[Any], dict[str, Any]]:
    from app.models import AgentConfig
    from langchain_mcp_adapters.sessions import create_session
    from langchain_mcp_adapters.tools import load_mcp_tools

    from app.mcp_server.server import MODEL_VISIBLE_TOOLS

    token = identity.mint_token(orch.session_id, player.seat_id)
    tool_calls_log: list[dict] = []
    raw_responses: list[str] = []
    input_tokens = 0
    output_tokens = 0
    start = time.monotonic()
    # Everything this turn adds to the conversation. `history` itself is
    # never mutated -- the caller merges this delta into whatever store it
    # keeps the seat's memory in.
    appended: list[Any] = []

    async with create_session({"transport": "streamable_http", "url": settings.mcp_url}) as session:
        await session.initialize()
        await session.call_tool("bind_seat", {"token": token})
        orch.publish(
            "mcp", {"seat_id": player.seat_id, "name": player.name, "phase": phase, "action": "bind", "tool": None}
        )
        try:
            all_tools = await load_mcp_tools(session)
            model_tools = [t for t in all_tools if t.name in MODEL_VISIBLE_TOOLS]
            candidates: list[tuple[str, Any]] = [("primary", chat_model)]
            policy = player.resilience
            if policy.fallback_provider and policy.fallback_model:
                fallback_config = AgentConfig(
                    seat_id=player.seat_id,
                    display_name=player.name,
                    personality=player.personality,
                    controller=player.controller,
                    provider=policy.fallback_provider,
                    model_name=policy.fallback_model,
                    endpoint=player.endpoint,
                    behavior=player.behavior,
                    resilience=policy,
                )
                fallback_model = get_chat_model(fallback_config)
                if fallback_model is not None:
                    candidates.append(("fallback", fallback_model))
            tools_by_name = {t.name: t for t in model_tools}

            for _ in range(MAX_TOOL_ITERATIONS):
                ai_msg: AIMessage | None = None
                failure_messages: list[str] = []
                used_candidate = "primary"
                for candidate_name, candidate_model in candidates:
                    bound_model = candidate_model.bind_tools(model_tools)
                    try:
                        ai_msg = await _invoke_with_retry(
                            bound_model,
                            history + appended,
                            timeout_seconds=policy.timeout_seconds,
                            max_retries=policy.max_retries,
                            backoff_ms=policy.retry_backoff_ms,
                            on_retry=lambda attempt, message, candidate_name=candidate_name: orch.publish(
                                "resilience",
                                {
                                    "seat_id": player.seat_id,
                                    "name": player.name,
                                    "status": "retrying",
                                    "candidate": candidate_name,
                                    "attempt": attempt,
                                    "message": message,
                                },
                            ),
                        )
                        used_candidate = candidate_name
                        break
                    except Exception as exc:  # noqa: BLE001 - try configured recovery
                        failure_messages.append(f"{candidate_name}: {type(exc).__name__}: {exc}")
                if ai_msg is None:
                    tool_calls_log.append({
                        "tool": "__resilience__",
                        "args": {"attempts": policy.max_retries + 1},
                        "result": {"status": "exhausted", "errors": failure_messages},
                    })
                    orch.publish("resilience", {
                        "seat_id": player.seat_id,
                        "name": player.name,
                        "status": "deterministic_fallback",
                        "candidate": "rules",
                        "attempt": policy.max_retries + 1,
                        "message": "All configured providers failed; committing a validated safe action.",
                    })
                    if policy.pause_after_exhaustion:
                        orch.pause_requested = True
                    break
                if used_candidate == "fallback":
                    tool_calls_log.append({
                        "tool": "__resilience__",
                        "args": {},
                        "result": {"status": "fallback_model", "model": policy.fallback_model},
                    })
                    orch.publish("resilience", {
                        "seat_id": player.seat_id,
                        "name": player.name,
                        "status": "fallback_model",
                        "candidate": policy.fallback_model,
                        "attempt": 1,
                        "message": "Primary provider failed; fallback model completed the turn.",
                    })
                appended.append(ai_msg)
                raw_responses.append(ai_msg.text() if hasattr(ai_msg, "text") else str(ai_msg.content))
                usage = getattr(ai_msg, "usage_metadata", None)
                if usage:
                    input_tokens += usage.get("input_tokens") or 0
                    output_tokens += usage.get("output_tokens") or 0
                if output_tokens > player.behavior.turn_token_budget:
                    tool_calls_log.append({
                        "tool": "__resilience__",
                        "args": {"budget": player.behavior.turn_token_budget},
                        "result": {"status": "turn_token_budget"},
                    })
                    break

                if not ai_msg.tool_calls:
                    appended.append(
                        HumanMessage(
                            content="You must act by calling one of the provided tools, "
                            f"in particular `{commit_tool_name}` to finish your turn."
                        )
                    )
                    continue

                committed_result = None
                committed_args: dict[str, Any] = {}
                for tc in ai_msg.tool_calls:
                    tool = tools_by_name.get(tc["name"])
                    if tool is None:
                        continue
                    tool_message = await tool.ainvoke(tc)
                    orch.publish(
                        "mcp",
                        {"seat_id": player.seat_id, "name": player.name, "phase": phase, "action": "call", "tool": tc["name"]},
                    )
                    appended.append(tool_message)
                    result = _extract_structured_result(tool_message)
                    tool_calls_log.append({"tool": tc["name"], "args": tc["args"], "result": result})
                    if tc["name"] == commit_tool_name and result is not None:
                        committed_result = result
                        # Kept so a replayed turn can re-apply this exact
                        # decision without consulting the model again.
                        committed_args = dict(tc["args"] or {})

                if committed_result is not None:
                    return committed_result, appended, committed_args
        finally:
            identity.release(session)
            latency_ms = int((time.monotonic() - start) * 1000)
            await _record_decision(
                orch, player, phase=phase,
                prompt=_describe_prompt(history),
                raw_response="\n".join(raw_responses),
                tool_calls=tool_calls_log,
                latency_ms=latency_ms,
                input_tokens=input_tokens or None,
                output_tokens=output_tokens or None,
            )

    result, args = await _apply_fallback(orch, player, commit_tool_name, fallback)
    appended.append(AIMessage(content=f"(no tool committed; fell back to) {json.dumps(result)}"))
    return result, appended, args


async def _invoke_with_retry(
    bound_model: Any,
    messages: list[Any],
    *,
    timeout_seconds: int,
    max_retries: int,
    backoff_ms: int,
    on_retry,
) -> AIMessage:
    """Retry model generation only; committed tool actions never repeat."""
    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await asyncio.wait_for(
                bound_model.ainvoke(messages), timeout=timeout_seconds,
            )
        except Exception as exc:  # noqa: BLE001 - provider SDK errors vary
            last_error = exc
            if attempt >= max_retries:
                break
            on_retry(attempt + 1, f"{type(exc).__name__}: {exc}")
            if backoff_ms:
                await asyncio.sleep((backoff_ms / 1000) * (2 ** attempt))
    assert last_error is not None
    raise last_error


def _describe_prompt(history: list[Any]) -> str:
    """What to store as this turn's "prompt" for the debug panel. Once a seat
    has a game-long conversation, dumping the whole thing per turn would make
    every decision row enormous and near-identical; the useful part is the
    persona it's operating under plus the briefing it was just handed, so
    record the first message and the last one, with a marker for the depth of
    accumulated memory in between."""
    if not history:
        return ""
    first = _message_text(history[0])
    if len(history) == 1:
        return first
    last = _message_text(history[-1])
    if len(history) == 2:
        return f"{first}\n---\n{last}"
    return f"{first}\n--- [+{len(history) - 2} remembered messages] ---\n{last}"


def _message_text(message: Any) -> str:
    # `.text` is a property on current LangChain messages but was a method on
    # older ones, so accept either rather than pinning to one.
    text = getattr(message, "text", None)
    if isinstance(text, str):
        return text
    if callable(text):
        try:
            return text()
        except Exception:
            pass
    content = getattr(message, "content", message)
    return content if isinstance(content, str) else str(content)


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
    history: list[Any],
    commit_tool_name: str,
    fallback: dict[str, Any],
) -> tuple[dict[str, Any], list[Any], dict[str, Any]]:
    """Offline stand-in for a real model: picks a random legal option and
    routes it through the exact same `actions.py` call a real tool
    invocation would make, so the rest of the pipeline (validation,
    persistence, SSE) is exercised identically. Token counts are estimated
    from text length (~4 chars/token) rather than real API usage — there is
    no API call to measure — so the debug panel still has something to show
    when running fully offline.

    It still returns a message to append, even though no model was consulted.
    That keeps a mock seat's remembered conversation structurally identical to
    a real one (briefing, then what it did, then the next briefing), so the
    memory mechanism in `seat_mind.py` is genuinely exercised by the offline
    test suite rather than only on paths that cost money."""
    start = time.monotonic()
    result, args = await _apply_fallback(orch, player, commit_tool_name, fallback)
    tool_calls = [{"tool": commit_tool_name, "args": args, "result": result}]
    target = args.get("target")
    # Hunter retaliation is taken by an already-dead seat. The action is
    # legal, but the unrelated mock-only belief revision is not: dead seats
    # must never alter private beliefs after their final action.
    if player.alive and target and target != player.name:
        suspicion, confidence, reason = _mock_belief_update(
            player, phase, commit_tool_name, target, result,
        )
        belief_args = {
            "subject": target,
            "suspicion": suspicion,
            "confidence": confidence,
            "reason": reason,
            "source_seq": None,
        }
        belief_result = await actions.update_belief(
            orch, player.seat_id, **belief_args,
        )
        tool_calls.append({
            "tool": "update_belief", "args": belief_args, "result": belief_result,
        })
    latency_ms = int((time.monotonic() - start) * 1000)
    raw_response = json.dumps(result)
    prompt = _describe_prompt(history)
    await _record_decision(
        orch, player, phase=phase,
        prompt=prompt,
        raw_response=raw_response,
        tool_calls=tool_calls,
        latency_ms=latency_ms,
        input_tokens=_estimate_tokens(prompt),
        output_tokens=_estimate_tokens(raw_response),
    )
    return result, [AIMessage(content=f"(mock) called {commit_tool_name} with {raw_response}")], args


def _mock_belief_update(
    player: "Player",
    phase: str,
    commit_tool_name: str,
    target: str,
    result: dict[str, Any],
) -> tuple[int, int, str]:
    """Give free/offline games visible belief evolution without pretending
    the scripted mock is doing hidden model reasoning."""
    if player.role == "seer" and result.get("role"):
        is_werewolf = result["role"] == "werewolf"
        return (
            98 if is_werewolf else 4,
            100,
            f"My private investigation identified {target} as {result['role']}.",
        )
    if commit_tool_name == "submit_vote":
        return 78, 72, f"I voted for {target}; they remain my strongest current suspect."
    if player.role == "doctor" and commit_tool_name == "submit_night_action":
        return 24, 42, f"I protected {target}, reflecting provisional trust rather than certainty."
    if player.role == "werewolf" and commit_tool_name == "submit_night_action":
        return 36, 30, f"I selected {target} as a strategic threat, not as a role conclusion."
    if player.role == "werewolf" and commit_tool_name == "negotiate_message":
        return 36, 30, f"I proposed {target} as a strategic threat, not as a role conclusion."
    return 56, 35, f"I am watching {target} after this {phase} exchange, but evidence is limited."


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
    orch.state.tokens_used += int(input_tokens or 0) + int(output_tokens or 0)
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
        "game_tokens_used": orch.state.tokens_used,
        "game_token_budget": orch.state.options.max_game_tokens,
    })


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


async def apply_commit(
    orch: "GameOrchestrator", player: "Player", commit_tool_name: str, args: dict[str, Any]
) -> dict[str, Any]:
    """Perform a turn's committed action from explicit arguments.

    Split out so a decision can be applied *twice from the same arguments* —
    once when the agent makes it, and again if the graph replays that node
    after a pause. `seat_mind.py`'s `_reapply` is the second caller; see the
    replay pitfall in 12-per-seat-agent-memory-subgraphs.md for why re-applying
    is necessary rather than redundant."""
    target = args.get("target")
    thought = args.get("thought", "")
    if commit_tool_name == "submit_night_action":
        return await actions.apply_night_action(orch, player.seat_id, target, thought)
    if commit_tool_name == "submit_statement":
        text = args.get("text", "stays quiet, watching the others.")
        return await actions.apply_statement(orch, player.seat_id, text, thought)
    if commit_tool_name == "submit_vote":
        return await actions.apply_vote(orch, player.seat_id, target, thought)
    if commit_tool_name == "negotiate_message":
        return await actions.negotiate_message(
            orch,
            player.seat_id,
            args.get("text", "I favor this target."),
            target,
        )
    if commit_tool_name == "hunter_retaliate":
        return await actions.hunter_retaliate(orch, player.seat_id, target, thought)
    raise ValueError(f"Unknown commit tool: {commit_tool_name}")


async def _apply_fallback(
    orch: "GameOrchestrator", player: "Player", commit_tool_name: str, fallback: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Returns `(result, args_used)` — the arguments matter to the caller, not
    just the outcome, because a replayed turn has to reproduce this exact
    decision without re-deriving it (the random pick below would choose
    differently the second time)."""
    args: dict[str, Any] = {
        "target": fallback.get("target") or _random_target(fallback.get("pool", [])),
        "thought": fallback.get("thought", "considers the options in silence."),
    }
    if commit_tool_name == "submit_statement":
        args["text"] = fallback.get("text", "stays quiet, watching the others.")
    if commit_tool_name == "negotiate_message":
        args["text"] = fallback.get(
            "text",
            f"I favor {args['target']} as the strongest threat; we should redirect suspicion tomorrow.",
        )
    return await apply_commit(orch, player, commit_tool_name, args), args


def _random_target(pool: list[str]) -> str | None:
    return random.choice(pool) if pool else None
