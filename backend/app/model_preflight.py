"""Read-only readiness checks for every AI model selected at setup.

The game used to discover an invalid model ID (or a model without tool
calling) only when that seat took its first turn.  A preflight sends one tiny
message through the same adapter and requires the model to produce a real
tool call before a game session is created.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Iterable

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from pydantic import BaseModel

from app.adapters import get_chat_model
from app.config import settings
from app.models import AgentConfig, Provider


class ModelPreflightResult(BaseModel):
    seat_id: str
    display_name: str
    provider: Provider
    model_name: str
    ok: bool
    message: str
    latency_ms: int


class ModelPreflightResponse(BaseModel):
    ok: bool
    results: list[ModelPreflightResult]


@tool
def confirm_game_model(code: str) -> str:
    """Confirm that this model can call game action tools. Use code 'ready'."""

    return code


def _configured_key(provider: Provider) -> str | None:
    return {
        "claude": settings.anthropic_api_key,
        "openai": settings.openai_api_key,
        "gemini": settings.google_api_key,
        "ollama_cloud": settings.ollama_api_key,
    }.get(provider)


def _safe_error(exc: BaseException) -> str:
    """Keep provider errors useful without ever reflecting an API key."""

    leaves: list[BaseException] = []

    def collect(error: BaseException) -> None:
        if isinstance(error, BaseExceptionGroup):
            for child in error.exceptions:
                collect(child)
        else:
            leaves.append(error)

    collect(exc)
    message = str(leaves[-1] if leaves else exc).strip() or type(exc).__name__
    for key in (
        settings.anthropic_api_key,
        settings.openai_api_key,
        settings.google_api_key,
        settings.ollama_api_key,
    ):
        if key:
            message = message.replace(key, "[redacted]")
    return message[:500]


async def _check_configuration(config: AgentConfig, timeout_seconds: float) -> tuple[bool, str, int]:
    started = time.perf_counter()
    provider = config.provider
    model_name = config.model_name
    assert provider is not None and model_name is not None

    if provider == "mock":
        return True, "Offline mock is ready; no provider call is required.", 0

    if provider != "ollama" and not _configured_key(provider):
        env_name = {
            "claude": "ANTHROPIC_API_KEY",
            "openai": "OPENAI_API_KEY",
            "gemini": "GOOGLE_API_KEY",
            "ollama_cloud": "OLLAMA_API_KEY",
        }[provider]
        return False, f"{env_name} is not configured on the backend.", 0

    try:
        chat_model = get_chat_model(config)
        assert chat_model is not None
        bound_model = chat_model.bind_tools([confirm_game_model])
        response = await asyncio.wait_for(
            bound_model.ainvoke(
                [
                    HumanMessage(
                        content=(
                            "This is a model readiness check. Call the confirm_game_model tool "
                            "now with code='ready'. Do not answer with normal text."
                        )
                    )
                ]
            ),
            timeout=timeout_seconds,
        )
        tool_calls = getattr(response, "tool_calls", None) or []
        valid_call = any(
            call.get("name") == confirm_game_model.name
            and (call.get("args") or {}).get("code") == "ready"
            for call in tool_calls
        )
        latency_ms = round((time.perf_counter() - started) * 1000)
        if not valid_call:
            return (
                False,
                "The model answered, but did not call the required tool. Choose a tool-calling model.",
                latency_ms,
            )
        return True, "Message and tool call succeeded.", latency_ms
    except TimeoutError:
        latency_ms = round((time.perf_counter() - started) * 1000)
        return False, f"Readiness check timed out after {timeout_seconds:g} seconds.", latency_ms
    except Exception as exc:  # provider SDKs expose many unrelated exception types
        latency_ms = round((time.perf_counter() - started) * 1000)
        return False, _safe_error(exc), latency_ms


async def preflight_models(
    configs: Iterable[AgentConfig], *, timeout_seconds: float = 45
) -> ModelPreflightResponse:
    """Check each unique provider/model/endpoint once, then report per seat."""

    ai_configs = [config for config in configs if config.controller == "ai"]
    invalid = [config for config in ai_configs if not config.provider or not config.model_name]
    valid = [config for config in ai_configs if config.provider and config.model_name]

    unique: dict[tuple[str, str, str | None], AgentConfig] = {}
    for config in valid:
        key = (config.provider or "", config.model_name or "", config.endpoint)
        unique.setdefault(key, config)

    checked = await asyncio.gather(
        *(_check_configuration(config, timeout_seconds) for config in unique.values())
    )
    by_key = dict(zip(unique, checked, strict=True))

    results: list[ModelPreflightResult] = []
    for config in ai_configs:
        if config in invalid:
            results.append(
                ModelPreflightResult(
                    seat_id=config.seat_id,
                    display_name=config.display_name,
                    provider=config.provider or "mock",
                    model_name=config.model_name or "",
                    ok=False,
                    message="Choose a provider and model.",
                    latency_ms=0,
                )
            )
            continue
        assert config.provider and config.model_name
        ok, message, latency_ms = by_key[(config.provider, config.model_name, config.endpoint)]
        results.append(
            ModelPreflightResult(
                seat_id=config.seat_id,
                display_name=config.display_name,
                provider=config.provider,
                model_name=config.model_name,
                ok=ok,
                message=message,
                latency_ms=latency_ms,
            )
        )

    return ModelPreflightResponse(ok=all(result.ok for result in results), results=results)
