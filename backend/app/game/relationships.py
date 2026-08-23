"""Opt-in, role-agnostic continuity between games (FE-13)."""

from __future__ import annotations

import hashlib
from typing import Any

from app import persistence
from app.models import GameState


async def capture_game(conn: Any, state: GameState) -> None:
    if not state.options.cross_game_memory:
        return
    names = {player.seat_id: player.name for player in state.players}
    beliefs = await persistence.get_belief_events(conn, state.session_id, latest_only=True)
    for belief in beliefs:
        if int(belief["confidence"]) < 45:
            continue
        owner = names.get(belief["observer_seat_id"], belief["observer_seat_id"])
        subject = names.get(belief["subject_seat_id"], belief["subject_seat_id"])
        suspicion = int(belief["suspicion"])
        tendency = "unreliable or threatening" if suspicion >= 60 else "comparatively reliable"
        memory = (
            f"In a previous game I found {subject}'s communication {tendency} "
            f"({suspicion}/100 suspicion), based on the final evidence-backed belief revision. "
            "This is about observed behaviour only; all secret roles reset for every new game."
        )
        key = hashlib.sha256(
            f"{state.session_id}|{owner}|{subject}|{belief['revision']}".encode(),
        ).hexdigest()
        await persistence.record_relationship_memory(
            conn,
            owner_name=owner,
            subject_name=subject,
            memory=memory,
            source_game_id=state.session_id,
            source_seq=belief["source_seq"],
            event_key=key,
        )
