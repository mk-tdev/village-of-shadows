"""The single point where game rules are enforced and state is mutated.

Plan §6.1: "a single point (the tool handler) where you can enforce game
rules ... without ever trusting the model to have gotten that right."
These functions are that point. Both the MCP tool handlers (app/mcp_server)
and the human-input resume path (app/game/nodes.py) call the *same*
functions here — a human typing a name into the control and a model calling
a tool go through identical validation.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app import persistence
from app.models import LogEntry

if TYPE_CHECKING:
    from app.game.orchestrator import GameOrchestrator


class ActionError(ValueError):
    """A rule violation — invalid target, wrong role, wrong phase, etc."""


async def _append_log(
    orch: "GameOrchestrator",
    *,
    type_: str,
    seat_id: str | None = None,
    name: str | None = None,
    text: str | None = None,
    thought: str | None = None,
    target: str | None = None,
    private: bool = False,
) -> LogEntry:
    state = orch.state
    entry = LogEntry(
        seq=state.next_seq(),
        round=state.round,
        phase=state.phase,
        type=type_,
        seat_id=seat_id,
        name=name,
        text=text,
        thought=thought,
        target=target,
        private=private,
    )
    state.log.append(entry)
    await persistence.record_log_entry(orch.conn, orch.session_id, entry)
    orch.publish("log", entry.model_dump())
    return entry


async def apply_night_action(
    orch: "GameOrchestrator", seat_id: str, target_name: str, thought: str = ""
) -> dict[str, Any]:
    state = orch.state
    player = state.find_seat(seat_id)
    if not player.alive:
        raise ActionError("Dead seats cannot take night actions.")

    if player.role == "werewolf":
        pool = [p.name for p in state.alive_players() if p.role != "werewolf"]
        if target_name not in pool:
            raise ActionError(f"{target_name} is not a valid werewolf target.")
        state.night_proposals.append(target_name)
        await _append_log(
            orch, type_="werewolf", seat_id=seat_id, name=player.name,
            text=f"proposes attacking {target_name}.", thought=thought,
            target=target_name, private=True,
        )
        return {"ok": True, "target": target_name}

    if player.role == "doctor":
        pool = [p.name for p in state.alive_players()]
        if target_name not in pool:
            raise ActionError(f"{target_name} is not alive.")
        state.night_saved = target_name
        await _append_log(
            orch, type_="doctor", seat_id=seat_id, name=player.name,
            text=f"decides to protect {target_name}.", thought=thought,
            target=target_name, private=True,
        )
        return {"ok": True, "target": target_name}

    if player.role == "seer":
        pool = [p.name for p in state.alive_players() if p.name != player.name]
        if target_name not in pool:
            raise ActionError(f"{target_name} is not a valid seer target.")
        target = state.find_by_name(target_name)
        state.seer_knowledge.setdefault(seat_id, {})[target.name] = target.role
        # The initial SSE state snapshot is the only wholesale state payload
        # the browser receives. Publish this post-snapshot mutation as its own
        # structured delta so a human seer can see the result immediately
        # without enabling God Mode or refreshing the page.
        orch.publish(
            "seer_result",
            {"seat_id": seat_id, "target": target.name, "role": target.role},
        )
        await _append_log(
            orch, type_="seer", seat_id=seat_id, name=player.name,
            text=f"investigates {target_name} — discovers they are a {target.role}.",
            thought=thought, target=target_name, private=True,
        )
        return {"ok": True, "target": target_name, "role": target.role}

    raise ActionError(f"Seat {seat_id} has no night action to take.")


async def apply_statement(
    orch: "GameOrchestrator", seat_id: str, text: str, thought: str = ""
) -> dict[str, Any]:
    state = orch.state
    player = state.find_seat(seat_id)
    if not player.alive:
        raise ActionError("Dead seats cannot speak.")
    await _append_log(
        orch, type_="statement", seat_id=seat_id, name=player.name,
        text=text, thought=thought, private=False,
    )
    return {"ok": True}


async def apply_vote(
    orch: "GameOrchestrator", seat_id: str, target_name: str, thought: str = ""
) -> dict[str, Any]:
    state = orch.state
    player = state.find_seat(seat_id)
    if not player.alive:
        raise ActionError("Dead seats cannot vote.")
    pool = [p.name for p in state.alive_players() if p.name != player.name]
    if target_name not in pool:
        raise ActionError(f"{target_name} is not a valid vote target.")
    state.vote_tally[target_name] = state.vote_tally.get(target_name, 0) + 1
    await _append_log(
        orch, type_="vote", seat_id=seat_id, name=player.name,
        text=f"votes to eliminate {target_name}.", thought=thought,
        target=target_name, private=False,
    )
    return {"ok": True, "target": target_name}


async def write_note(orch: "GameOrchestrator", seat_id: str, note: str) -> dict[str, Any]:
    await persistence.record_note(orch.conn, orch.session_id, seat_id, orch.state.round, note)
    return {"ok": True}


async def get_notes(orch: "GameOrchestrator", seat_id: str) -> list[str]:
    return await persistence.get_notes(orch.conn, orch.session_id, seat_id)


async def get_vote_history(orch: "GameOrchestrator") -> list[dict]:
    return await persistence.get_vote_history(orch.conn, orch.session_id)


def get_public_transcript(orch: "GameOrchestrator") -> list[dict]:
    return [e.model_dump() for e in orch.state.log if not e.private]


async def negotiate_message(orch: "GameOrchestrator", seat_id: str, text: str) -> dict[str, Any]:
    """Private werewolf-channel chatter. Logged but not yet wired into a
    multi-turn negotiation loop in this pass — see plan §5 / README for the
    deferred multi-turn negotiation sub-loop this tool is reserved for."""
    player = orch.state.find_seat(seat_id)
    if player.role != "werewolf":
        raise ActionError("Only werewolves can use the private negotiation channel.")
    await _append_log(
        orch, type_="werewolf", seat_id=seat_id, name=player.name,
        text=text, private=True,
    )
    return {"ok": True}
