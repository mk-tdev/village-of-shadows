"""Immutable, credential-free replay exports (FE-15)."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from app import persistence
from app.game import insights, timeline
from app.models import GameState


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _tool_names(raw: str) -> list[str]:
    try:
        calls = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    return [str(call.get("tool")) for call in calls if call.get("tool")]


async def build_snapshot(
    *,
    graph: Any,
    seat_mind: Any,
    conn: Any,
    state: GameState,
    scope: str,
) -> dict:
    god = scope == "god"
    report = await timeline.build_timeline(graph, seat_mind, state.session_id, conn)
    decisions = await persistence.get_decisions(conn, state.session_id)
    events = [
        entry.model_dump()
        for entry in state.log
        if god or not entry.private
    ]
    players = [
        {
            "seat_id": player.seat_id,
            "name": player.name,
            "personality": player.personality,
            "controller": player.controller,
            "provider": player.provider,
            "model_name": player.model_name,
            "role": player.role,
            "alive": player.alive,
        }
        for player in state.players
    ]
    snapshot = {
        "version": 1,
        "game_id": state.session_id,
        "scope": scope,
        "winner": state.winner,
        "rounds": state.round,
        "players": players,
        "events": events,
        "graph": {
            "steps": [
                {
                    "step": step["step"], "next_node": step["next_node"],
                    "phase": step["phase"], "round": step["round"],
                    "elapsed_ms": step["elapsed_ms"],
                }
                for step in report.get("steps", [])
            ],
            "node_counts": report.get("node_counts", []),
        },
        "metrics": [
            {
                "seat_id": decision["seat_id"],
                "round": decision["round"],
                "phase": decision["phase"],
                "provider": decision["provider"],
                "model_name": decision["model_name"],
                "latency_ms": decision["latency_ms"],
                "input_tokens": decision["input_tokens"],
                "output_tokens": decision["output_tokens"],
                "tools": _tool_names(decision["tool_calls"]),
            }
            for decision in decisions
        ],
        "deception_report": await insights.build_deception_report(conn, state, include_private=god),
    }
    if god:
        snapshot["private_notes"] = await persistence.get_note_events(conn, state.session_id)
        snapshot["belief_events"] = await persistence.get_belief_events(conn, state.session_id)
    return snapshot


async def create_share(
    *,
    graph: Any,
    seat_mind: Any,
    conn: Any,
    state: GameState,
    scope: str,
    expires_in_hours: int | None,
) -> dict:
    share_id = secrets.token_urlsafe(12)
    secret = secrets.token_urlsafe(28) if scope == "god" else None
    expires = (
        datetime.now(UTC) + timedelta(hours=expires_in_hours)
        if expires_in_hours is not None else None
    )
    snapshot = await build_snapshot(
        graph=graph, seat_mind=seat_mind, conn=conn, state=state, scope=scope,
    )
    await persistence.create_replay_share(
        conn,
        share_id=share_id,
        game_id=state.session_id,
        scope=scope,
        secret_hash=_hash(secret) if secret else None,
        snapshot=snapshot,
        expires_at=expires.isoformat() if expires else None,
    )
    return {"share_id": share_id, "scope": scope, "secret": secret, "expires_at": expires.isoformat() if expires else None}


async def resolve_share(conn: Any, share_id: str, secret: str | None) -> dict | None:
    share = await persistence.get_replay_share(conn, share_id)
    if share is None or share["revoked_at"] is not None:
        return None
    if share["expires_at"]:
        expiry = datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=UTC)
        if datetime.now(UTC) >= expiry:
            return None
    if share["scope"] == "god" and (not secret or _hash(secret) != share["secret_hash"]):
        return None
    return {
        "id": share["id"],
        "scope": share["scope"],
        "created_at": share["created_at"],
        "expires_at": share["expires_at"],
        "snapshot": share["snapshot"],
    }
