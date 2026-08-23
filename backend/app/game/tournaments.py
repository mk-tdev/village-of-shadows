"""Balanced, budget-bounded autonomous model tournaments (FE-04)."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections import defaultdict
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app import persistence
from app.game import registry
from app.game.orchestrator import GameOrchestrator
from app.models import AgentConfig, GameState, Player, Role


STANDARD_ROLES: list[Role] = [
    "werewolf", "werewolf", "seer", "doctor", "villager", "villager", "villager",
]


class ModelPrice(BaseModel):
    provider: str
    model_name: str
    input_usd_per_million: float = Field(ge=0, default=0)
    output_usd_per_million: float = Field(ge=0, default=0)


class TournamentRequest(BaseModel):
    lineup: list[AgentConfig]
    game_count: int = Field(ge=1, le=50, default=6)
    concurrency: int = Field(ge=1, le=4, default=2)
    max_total_tokens: int = Field(ge=1_000, le=50_000_000, default=2_000_000)
    max_estimated_cost_usd: float = Field(ge=0, le=10_000, default=0)
    prices: list[ModelPrice] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_lineup(self):
        if len(self.lineup) != 7:
            raise ValueError("A tournament lineup must contain exactly seven seats.")
        if any(config.controller != "ai" for config in self.lineup):
            raise ValueError("Tournament seats must all be AI-controlled.")
        if any(not config.provider or not config.model_name for config in self.lineup):
            raise ValueError("Every tournament seat needs a provider and model name.")
        if len({config.seat_id for config in self.lineup}) != 7:
            raise ValueError("Tournament seat IDs must be unique.")
        return self


_TASKS: set[asyncio.Task] = set()


def launch(request: TournamentRequest, app_state: Any) -> str:
    tournament_id = str(uuid.uuid4())
    task = asyncio.create_task(_run(tournament_id, request, app_state))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    return tournament_id


async def prepare(request: TournamentRequest, app_state: Any) -> str:
    tournament_id = str(uuid.uuid4())
    await persistence.create_tournament(
        app_state.db_conn, tournament_id, request.model_dump(), request.game_count,
    )
    task = asyncio.create_task(_run(tournament_id, request, app_state, prepared=True))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    return tournament_id


def _rotated_roles(index: int) -> list[Role]:
    shift = index % len(STANDARD_ROLES)
    return STANDARD_ROLES[shift:] + STANDARD_ROLES[:shift]


def _price_table(request: TournamentRequest) -> dict[tuple[str, str], ModelPrice]:
    return {(price.provider, price.model_name): price for price in request.prices}


async def _one_game(index: int, request: TournamentRequest, app_state: Any) -> tuple[str, dict]:
    session_id = str(uuid.uuid4())
    players = [
        Player(
            seat_id=config.seat_id,
            name=config.display_name,
            personality=config.personality,
            controller="ai",
            provider=config.provider,
            model_name=config.model_name,
            endpoint=config.endpoint,
            behavior=config.behavior,
            resilience=config.resilience,
        )
        for config in request.lineup
    ]
    state = GameState(
        session_id=session_id,
        players=players,
        role_deck=_rotated_roles(index),
    )
    await persistence.create_game(app_state.db_conn, session_id, request.lineup, state.options)
    orch = GameOrchestrator(
        session_id, state, app_state.db_conn, app_state.graph, app_state.seat_mind,
    )
    registry.register(orch)
    started = time.monotonic()
    try:
        orch.start()
        await orch._task
        decisions = await persistence.get_decisions(app_state.db_conn, session_id)
        prices = _price_table(request)
        input_tokens = sum(int(row["input_tokens"] or 0) for row in decisions)
        output_tokens = sum(int(row["output_tokens"] or 0) for row in decisions)
        estimated_cost = 0.0
        for row in decisions:
            price = prices.get((row["provider"], row["model_name"]))
            if price:
                estimated_cost += (int(row["input_tokens"] or 0) / 1_000_000) * price.input_usd_per_million
                estimated_cost += (int(row["output_tokens"] or 0) / 1_000_000) * price.output_usd_per_million

        vote_accuracy: dict[str, dict[str, int]] = defaultdict(lambda: {"correct": 0, "false": 0})
        for entry in orch.state.log:
            if entry.type != "vote" or not entry.seat_id or not entry.target:
                continue
            target = orch.state.find_by_name(entry.target)
            bucket = vote_accuracy[entry.seat_id]
            bucket["correct" if target.role == "werewolf" else "false"] += 1
        seat_results = []
        for player in orch.state.players:
            death_round = next(
                (entry.round for entry in orch.state.log if entry.type == "death" and entry.seat_id == player.seat_id),
                orch.state.round + (1 if player.alive else 0),
            )
            rows = [row for row in decisions if row["seat_id"] == player.seat_id]
            seat_results.append({
                "seat_id": player.seat_id,
                "name": player.name,
                "provider": player.provider,
                "model_name": player.model_name,
                "role": player.role,
                "won": (
                    orch.state.winner == "werewolves" if player.role == "werewolf"
                    else orch.state.winner == "villagers"
                ),
                "alive": player.alive,
                "survival_rounds": death_round,
                "correct_votes": vote_accuracy[player.seat_id]["correct"],
                "false_votes": vote_accuracy[player.seat_id]["false"],
                "calls": len(rows),
                "input_tokens": sum(int(row["input_tokens"] or 0) for row in rows),
                "output_tokens": sum(int(row["output_tokens"] or 0) for row in rows),
                "average_latency_ms": round(sum(int(row["latency_ms"] or 0) for row in rows) / max(len(rows), 1)),
            })
        return session_id, {
            "winner": orch.state.winner,
            "rounds": orch.state.round,
            "duration_ms": int((time.monotonic() - started) * 1000),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": round(estimated_cost, 6),
            "seats": seat_results,
        }
    finally:
        registry.unregister(session_id)


async def _run(
    tournament_id: str,
    request: TournamentRequest,
    app_state: Any,
    *,
    prepared: bool = False,
) -> None:
    if not prepared:
        await persistence.create_tournament(
            app_state.db_conn, tournament_id, request.model_dump(), request.game_count,
        )
    await persistence.set_tournament_status(app_state.db_conn, tournament_id, "running")
    total_tokens = 0
    total_cost = 0.0
    # A monetary cap uses single-game batches so the next provider call never
    # starts after the cap has been reached. Without a cap, configured
    # concurrency is honored.
    width = 1 if request.max_estimated_cost_usd > 0 else request.concurrency
    try:
        for batch_start in range(0, request.game_count, width):
            if total_tokens >= request.max_total_tokens:
                await persistence.set_tournament_status(
                    app_state.db_conn, tournament_id, "stopped_budget",
                    stop_reason=f"Token budget reached ({total_tokens:,}).",
                )
                return
            if request.max_estimated_cost_usd > 0 and total_cost >= request.max_estimated_cost_usd:
                await persistence.set_tournament_status(
                    app_state.db_conn, tournament_id, "stopped_budget",
                    stop_reason=f"Estimated spend cap reached (${total_cost:.4f}).",
                )
                return
            indices = range(batch_start, min(batch_start + width, request.game_count))
            results = await asyncio.gather(*[_one_game(index, request, app_state) for index in indices])
            for index, (game_id, result) in zip(indices, results, strict=True):
                await persistence.record_tournament_game(
                    app_state.db_conn, tournament_id, game_id, index, result,
                )
                total_tokens += int(result["input_tokens"]) + int(result["output_tokens"])
                total_cost += float(result["estimated_cost_usd"])
        await persistence.set_tournament_status(app_state.db_conn, tournament_id, "completed")
    except Exception as exc:  # noqa: BLE001 - persisted diagnostic is the public contract
        await persistence.set_tournament_status(
            app_state.db_conn, tournament_id, "failed", stop_reason=f"{type(exc).__name__}: {exc}",
        )


def summarize(record: dict) -> dict:
    models: dict[tuple[str, str], dict[str, Any]] = {}
    for game in record["games"]:
        for seat in game["seats"]:
            key = (seat["provider"] or "unknown", seat["model_name"] or "unknown")
            row = models.setdefault(key, {
                "provider": key[0], "model_name": key[1], "games": 0, "wins": 0,
                "werewolf_games": 0, "werewolf_wins": 0, "correct_votes": 0,
                "false_votes": 0, "survival_rounds": 0, "calls": 0,
                "input_tokens": 0, "output_tokens": 0, "latency_total": 0,
            })
            row["games"] += 1
            row["wins"] += int(seat["won"])
            if seat["role"] == "werewolf":
                row["werewolf_games"] += 1
                row["werewolf_wins"] += int(seat["won"])
            for field in ("correct_votes", "false_votes", "survival_rounds", "calls", "input_tokens", "output_tokens"):
                row[field] += int(seat[field])
            row["latency_total"] += int(seat["average_latency_ms"]) * int(seat["calls"])
    table = []
    for row in models.values():
        calls = max(row.pop("calls"), 1)
        row["win_rate"] = round(row["wins"] / row["games"], 3)
        row["deception_success"] = round(row["werewolf_wins"] / max(row["werewolf_games"], 1), 3)
        row["average_survival"] = round(row.pop("survival_rounds") / row["games"], 2)
        row["average_latency_ms"] = round(row.pop("latency_total") / calls)
        table.append(row)
    return {
        **record,
        "summary": sorted(table, key=lambda row: (-row["win_rate"], row["model_name"])),
        "totals": {
            "tokens": sum(game["input_tokens"] + game["output_tokens"] for game in record["games"]),
            "estimated_cost_usd": round(sum(game["estimated_cost_usd"] for game in record["games"]), 6),
        },
    }
