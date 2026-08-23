"""The single point where game rules are enforced and state is mutated.

Plan §6.1: "a single point (the tool handler) where you can enforce game
rules ... without ever trusting the model to have gotten that right."
These functions are that point. Both the MCP tool handlers (app/mcp_server)
and the human-input resume path (app/game/nodes.py) call the *same*
functions here — a human typing a name into the control and a model calling
a tool go through identical validation.
"""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING, Any

from app import persistence
from app.game.rules import (
    WEREWOLF_NEGOTIATION_CHAR_BUDGET,
    WEREWOLF_NEGOTIATION_TOKEN_BUDGET,
    expected_werewolf,
    living_werewolves,
)
from app.models import LogEntry

if TYPE_CHECKING:
    from app.game.orchestrator import GameOrchestrator


class ActionError(ValueError):
    """A rule violation — invalid target, wrong role, wrong phase, etc."""


NOTE_KINDS = {"suspicion", "clue", "theory", "lie", "alliance"}
MAX_ACTIVE_NOTES = 24


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
        state.night_target = target_name
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
    weight = 2 if player.role == "mayor" else 1
    state.vote_tally[target_name] = state.vote_tally.get(target_name, 0) + weight
    await _append_log(
        orch, type_="vote", seat_id=seat_id, name=player.name,
        text=(
            f"casts the Mayor's two votes to eliminate {target_name}."
            if weight == 2 else f"votes to eliminate {target_name}."
        ), thought=thought,
        target=target_name,
        private=bool(state.village_event and state.village_event.kind == "secret_vote"),
    )
    return {"ok": True, "target": target_name, "weight": weight}


async def hunter_retaliate(
    orch: "GameOrchestrator", seat_id: str, target_name: str, thought: str = "",
) -> dict[str, Any]:
    state = orch.state
    hunter = state.find_seat(seat_id)
    if hunter.role != "hunter" or hunter.alive or state.hunter_pending != seat_id:
        raise ActionError("Only the just-eliminated Hunter may take this action.")
    pool = [player.name for player in state.alive_players()]
    if target_name not in pool:
        raise ActionError(f"{target_name} is not a living Hunter target.")
    target = state.find_by_name(target_name)
    target.alive = False
    state.hunter_pending = None
    await _append_log(
        orch, type_="hunter", seat_id=seat_id, name=hunter.name,
        text=f"fires a final shot at {target.name}, who was a {target.role}.",
        thought=thought, target=target.name, private=False,
    )
    return {"ok": True, "target": target.name, "role": target.role}


async def write_note(orch: "GameOrchestrator", seat_id: str, note: str) -> dict[str, Any]:
    """Legacy tool wrapper: store an unclassified note as a theory."""
    return await record_private_note(orch, seat_id, kind="theory", content=note)


async def get_notes(orch: "GameOrchestrator", seat_id: str) -> list[str]:
    return await persistence.get_notes(orch.conn, orch.session_id, seat_id)


def _note_event_key(
    orch: "GameOrchestrator",
    seat_id: str,
    *,
    operation: str,
    note_id: str,
    kind: str,
    subject: str | None,
    content: str,
    source_seq: int | None,
) -> str:
    material = "|".join([
        orch.session_id, seat_id, str(orch.state.round), orch.state.phase,
        operation, note_id, kind, subject or "", content, str(source_seq),
    ])
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _clean_note_text(value: str, *, field: str, maximum: int) -> str:
    cleaned = " ".join(value.split())
    if not cleaned:
        raise ActionError(f"{field} cannot be empty.")
    if len(cleaned) > maximum:
        raise ActionError(f"{field} must be {maximum} characters or fewer.")
    return cleaned


def _resolve_private_source(
    orch: "GameOrchestrator", seat_id: str, source_seq: int | None,
) -> int | None:
    # A seat may cite public evidence or one of its own private actions (for
    # example, the seer's investigation result). It may never cite another
    # seat's private event, which would turn note-taking into an information
    # leak across the partial-observability boundary.
    visible = [
        entry for entry in orch.state.log
        if not entry.private or entry.seat_id == seat_id
    ]
    if source_seq is None:
        return visible[-1].seq if visible else None
    if not any(entry.seq == source_seq for entry in visible):
        raise ActionError(f"Event {source_seq} is not visible to this seat.")
    return source_seq


async def _publish_note_event(
    orch: "GameOrchestrator", seat_id: str, event: dict, inserted: bool,
) -> dict[str, Any]:
    if inserted:
        player = orch.state.find_seat(seat_id)
        orch.publish("private_note", {**event, "name": player.name})
    return {"ok": True, "replayed": not inserted, "note": event}


async def record_private_note(
    orch: "GameOrchestrator",
    seat_id: str,
    *,
    kind: str,
    content: str,
    subject: str = "",
    source_seq: int | None = None,
) -> dict[str, Any]:
    player = orch.state.find_seat(seat_id)
    if not player.alive:
        raise ActionError("Dead seats cannot write private notes.")
    if kind not in NOTE_KINDS:
        raise ActionError(f"kind must be one of: {', '.join(sorted(NOTE_KINDS))}.")
    content = _clean_note_text(content, field="content", maximum=600)
    clean_subject = " ".join(subject.split()) or None
    if clean_subject and len(clean_subject) > 80:
        raise ActionError("subject must be 80 characters or fewer.")
    source_seq = _resolve_private_source(orch, seat_id, source_seq)

    provisional = _note_event_key(
        orch, seat_id, operation="create", note_id="new", kind=kind,
        subject=clean_subject, content=content, source_seq=source_seq,
    )
    note_id = f"note_{provisional[:12]}"
    event_key = _note_event_key(
        orch, seat_id, operation="create", note_id=note_id, kind=kind,
        subject=clean_subject, content=content, source_seq=source_seq,
    )
    existing = await persistence.get_note_event_by_key(orch.conn, event_key)
    if existing is not None:
        return await _publish_note_event(orch, seat_id, existing, False)

    active = await persistence.get_note_events(
        orch.conn, orch.session_id, seat_id, latest_only=True,
    )
    if sum(event["status"] == "active" for event in active) >= MAX_ACTIVE_NOTES:
        raise ActionError("Retire an existing note before creating another.")
    event, inserted = await persistence.record_note_event(
        orch.conn,
        session_id=orch.session_id,
        seat_id=seat_id,
        note_id=note_id,
        revision=1,
        operation="create",
        kind=kind,
        subject=clean_subject,
        content=content,
        status="active",
        source_seq=source_seq,
        source_phase=orch.state.phase,
        source_round=orch.state.round,
        event_key=event_key,
    )
    return await _publish_note_event(orch, seat_id, event, inserted)


async def revise_private_note(
    orch: "GameOrchestrator",
    seat_id: str,
    *,
    note_id: str,
    content: str,
    source_seq: int | None = None,
) -> dict[str, Any]:
    if not orch.state.find_seat(seat_id).alive:
        raise ActionError("Dead seats cannot revise private notes.")
    content = _clean_note_text(content, field="content", maximum=600)
    source_seq = _resolve_private_source(orch, seat_id, source_seq)
    latest = await persistence.get_latest_note_event(orch.conn, orch.session_id, seat_id, note_id)
    if latest is None:
        raise ActionError("No private note with that id belongs to this seat.")
    if latest["status"] == "retired":
        raise ActionError("A retired note cannot be revised; create a new theory instead.")

    event_key = _note_event_key(
        orch, seat_id, operation="revise", note_id=note_id, kind=latest["kind"],
        subject=latest["subject"], content=content, source_seq=source_seq,
    )
    existing = await persistence.get_note_event_by_key(orch.conn, event_key)
    if existing is not None:
        return await _publish_note_event(orch, seat_id, existing, False)
    event, inserted = await persistence.record_note_event(
        orch.conn,
        session_id=orch.session_id,
        seat_id=seat_id,
        note_id=note_id,
        revision=latest["revision"] + 1,
        operation="revise",
        kind=latest["kind"],
        subject=latest["subject"],
        content=content,
        status="active",
        source_seq=source_seq,
        source_phase=orch.state.phase,
        source_round=orch.state.round,
        event_key=event_key,
    )
    return await _publish_note_event(orch, seat_id, event, inserted)


async def retire_private_note(
    orch: "GameOrchestrator",
    seat_id: str,
    *,
    note_id: str,
    reason: str,
    source_seq: int | None = None,
) -> dict[str, Any]:
    if not orch.state.find_seat(seat_id).alive:
        raise ActionError("Dead seats cannot retire private notes.")
    reason = _clean_note_text(reason, field="reason", maximum=600)
    source_seq = _resolve_private_source(orch, seat_id, source_seq)
    latest = await persistence.get_latest_note_event(orch.conn, orch.session_id, seat_id, note_id)
    if latest is None:
        raise ActionError("No private note with that id belongs to this seat.")
    event_key = _note_event_key(
        orch, seat_id, operation="retire", note_id=note_id, kind=latest["kind"],
        subject=latest["subject"], content=reason, source_seq=source_seq,
    )
    existing = await persistence.get_note_event_by_key(orch.conn, event_key)
    if existing is not None:
        return await _publish_note_event(orch, seat_id, existing, False)
    if latest["status"] == "retired":
        raise ActionError("This private note is already retired.")
    event, inserted = await persistence.record_note_event(
        orch.conn,
        session_id=orch.session_id,
        seat_id=seat_id,
        note_id=note_id,
        revision=latest["revision"] + 1,
        operation="retire",
        kind=latest["kind"],
        subject=latest["subject"],
        content=reason,
        status="retired",
        source_seq=source_seq,
        source_phase=orch.state.phase,
        source_round=orch.state.round,
        event_key=event_key,
    )
    return await _publish_note_event(orch, seat_id, event, inserted)


async def get_note_history(orch: "GameOrchestrator", seat_id: str) -> list[dict]:
    return await persistence.get_note_events(orch.conn, orch.session_id, seat_id)


def _belief_event_key(
    orch: "GameOrchestrator",
    observer_seat_id: str,
    subject_seat_id: str,
    suspicion: int,
    confidence: int,
    reason: str,
    source_seq: int | None,
) -> str:
    material = "|".join([
        orch.session_id, observer_seat_id, subject_seat_id,
        str(orch.state.round), orch.state.phase, str(suspicion), str(confidence),
        reason, str(source_seq),
    ])
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _enrich_belief(orch: "GameOrchestrator", event: dict) -> dict:
    observer = orch.state.find_seat(event["observer_seat_id"])
    subject = orch.state.find_seat(event["subject_seat_id"])
    return {
        **event,
        "observer_name": observer.name,
        "subject_name": subject.name,
        "subject_alive": subject.alive,
    }


async def update_belief(
    orch: "GameOrchestrator",
    observer_seat_id: str,
    *,
    subject: str,
    suspicion: int,
    confidence: int,
    reason: str,
    source_seq: int | None = None,
) -> dict[str, Any]:
    """Append one evidence-backed, seat-private trust/suspicion revision."""
    observer = orch.state.find_seat(observer_seat_id)
    if not observer.alive:
        raise ActionError("Dead seats cannot update beliefs.")
    clean_subject = " ".join(subject.split())
    target = next((player for player in orch.state.players if player.name == clean_subject), None)
    if target is None:
        raise ActionError(f"{subject} is not a player in this game.")
    if target.seat_id == observer_seat_id:
        raise ActionError("A seat cannot assign a suspicion score to itself.")
    if isinstance(suspicion, bool) or not isinstance(suspicion, int) or not 0 <= suspicion <= 100:
        raise ActionError("suspicion must be an integer from 0 to 100.")
    if isinstance(confidence, bool) or not isinstance(confidence, int) or not 0 <= confidence <= 100:
        raise ActionError("confidence must be an integer from 0 to 100.")
    clean_reason = _clean_note_text(reason, field="reason", maximum=400)
    source_seq = _resolve_private_source(orch, observer_seat_id, source_seq)
    event_key = _belief_event_key(
        orch, observer_seat_id, target.seat_id, suspicion, confidence,
        clean_reason, source_seq,
    )
    existing = await persistence.get_belief_event_by_key(orch.conn, event_key)
    if existing is not None:
        return {"ok": True, "replayed": True, "belief": _enrich_belief(orch, existing)}

    latest = await persistence.get_latest_belief_event(
        orch.conn, orch.session_id, observer_seat_id, target.seat_id,
    )
    event, inserted = await persistence.record_belief_event(
        orch.conn,
        session_id=orch.session_id,
        observer_seat_id=observer_seat_id,
        subject_seat_id=target.seat_id,
        revision=(latest["revision"] + 1) if latest else 1,
        suspicion=suspicion,
        confidence=confidence,
        reason=clean_reason,
        source_seq=source_seq,
        source_phase=orch.state.phase,
        source_round=orch.state.round,
        event_key=event_key,
    )
    enriched = _enrich_belief(orch, event)
    if inserted:
        orch.publish("belief_update", enriched)
    return {"ok": True, "replayed": not inserted, "belief": enriched}


async def get_beliefs(orch: "GameOrchestrator", seat_id: str) -> list[dict]:
    events = await persistence.get_belief_events(
        orch.conn, orch.session_id, seat_id, latest_only=True,
    )
    return [_enrich_belief(orch, event) for event in events]


async def get_belief_history(orch: "GameOrchestrator", seat_id: str) -> list[dict]:
    events = await persistence.get_belief_events(orch.conn, orch.session_id, seat_id)
    return [_enrich_belief(orch, event) for event in events]


async def get_vote_history(orch: "GameOrchestrator") -> list[dict]:
    return await persistence.get_vote_history(orch.conn, orch.session_id)


def get_public_transcript(orch: "GameOrchestrator") -> list[dict]:
    return [e.model_dump() for e in orch.state.log if not e.private]


async def negotiate_message(
    orch: "GameOrchestrator", seat_id: str, text: str, target: str,
) -> dict[str, Any]:
    """Commit one bounded turn in the private werewolf council."""
    state = orch.state
    player = orch.state.find_seat(seat_id)
    if player.role != "werewolf":
        raise ActionError("Only werewolves can use the private negotiation channel.")
    if not player.alive:
        raise ActionError("Dead werewolves cannot take part in the private council.")
    if state.phase != "night" or len(living_werewolves(state)) < 2:
        raise ActionError("Werewolf negotiation is available only at night while both werewolves live.")

    expected = expected_werewolf(state)
    if expected is None or expected.seat_id != seat_id:
        raise ActionError("It is not this werewolf's negotiation turn.")
    if state.wolf_negotiation_commits.get(state.wolf_index) is not None:
        raise ActionError("This werewolf council turn has already been committed.")

    clean_text = " ".join(text.split())
    if not clean_text:
        raise ActionError("A private negotiation message cannot be empty.")
    if len(clean_text) > WEREWOLF_NEGOTIATION_CHAR_BUDGET:
        raise ActionError(
            "Private negotiation messages must stay within the "
            f"approximately {WEREWOLF_NEGOTIATION_TOKEN_BUDGET}-token budget."
        )
    legal = [candidate.name for candidate in state.alive_players() if candidate.role != "werewolf"]
    if target not in legal:
        raise ActionError(f"{target} is not a legal werewolf target.")

    state.wolf_proposals[seat_id] = target
    state.wolf_negotiation_commits[state.wolf_index] = seat_id
    await _append_log(
        orch,
        type_="werewolf_negotiation",
        seat_id=seat_id,
        name=player.name,
        text=clean_text,
        target=target,
        private=True,
    )
    return {"ok": True, "target": target, "turn": state.wolf_index + 1}
