"""Read-only learning views reconstructed from persisted game evidence.

These helpers deliberately do not ask a model to explain another model.  A
perspective is a filtered projection of the actual log, notebook, belief and
decision ledgers; the deception report keeps persisted facts separate from
deterministic interpretations.  That makes both views safe to revisit and
stable under checkpoint replay.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from typing import Any

from app import persistence
from app.game.views import build_agent_view
from app.models import GameState, LogEntry, Player


PHASE_ORDER = {"lobby": 0, "night": 1, "day-discuss": 2, "day-vote": 3, "gameover": 4}


def _event_visible_to(entry: LogEntry, player: Player) -> bool:
    if not entry.private:
        return True
    if entry.seat_id == player.seat_id:
        return True
    return player.role == "werewolf" and entry.type in {"werewolf", "werewolf_negotiation"}


def _available_tools(state: GameState, player: Player, phase: str) -> list[str]:
    tools = [
        "get_game_state",
        "get_public_log",
        "get_my_notes",
        "get_my_note_history",
        "get_my_beliefs",
        "get_my_belief_history",
        "record_private_note",
        "revise_private_note",
        "retire_private_note",
        "update_belief",
    ]
    if not player.alive:
        return tools
    if phase == "day-discuss":
        tools.append("speak")
    elif phase == "day-vote":
        tools.append("vote")
    elif phase == "night":
        if player.role == "werewolf":
            living_wolves = [p for p in state.players if p.alive and p.role == "werewolf"]
            tools.append("negotiate_message" if len(living_wolves) > 1 else "werewolf_choose_target")
        elif player.role == "seer":
            tools.append("seer_inspect")
        elif player.role == "doctor":
            tools.append("doctor_protect")
    return tools


def _legal_targets(state: GameState, player: Player, phase: str) -> list[str]:
    living = [p for p in state.alive_players() if p.seat_id != player.seat_id]
    if phase == "night" and player.role == "werewolf":
        living = [p for p in living if p.role != "werewolf"]
    if phase == "night" and player.role == "doctor":
        living = list(state.alive_players())
    return [p.name for p in living]


def _at_or_before(round_: int, phase: str, target_round: int, target_phase: str) -> bool:
    return (round_, PHASE_ORDER.get(phase, 99)) <= (
        target_round,
        PHASE_ORDER.get(target_phase, 99),
    )


async def build_perspective(
    conn: Any,
    state: GameState,
    seat_id: str,
    through_seq: int | None = None,
) -> dict[str, Any]:
    """Reconstruct exactly what one seat could know through a public moment."""
    player = state.find_seat(seat_id)
    last_seq = state.log[-1].seq if state.log else -1
    selected_seq = last_seq if through_seq is None else min(max(through_seq, -1), last_seq)
    prefix = [entry for entry in state.log if entry.seq <= selected_seq]
    moment = prefix[-1] if prefix else None
    phase = moment.phase if moment else state.phase
    round_ = moment.round if moment else state.round

    historical = state.model_copy(deep=True)
    historical.log = prefix
    # Role-specific discoveries must be reconstructed from events rather than
    # copied from the final state, otherwise the viewer would leak future seer
    # results when the slider is moved backwards.
    historical.seer_knowledge = {}
    if player.role == "seer":
        historical.seer_knowledge[player.seat_id] = {
            entry.target: entry.text.rsplit(" ", 1)[-1]
            for entry in prefix
            if entry.type == "seer"
            and entry.seat_id == player.seat_id
            and entry.target
            and entry.text
        }

    view = build_agent_view(historical, seat_id)
    visible_events = [entry.model_dump() for entry in prefix if _event_visible_to(entry, player)]
    notes = await persistence.get_note_events(conn, state.session_id, seat_id)
    notes = [
        note for note in notes
        if note["source_seq"] is None or int(note["source_seq"]) <= selected_seq
    ]
    beliefs = await persistence.get_belief_events(conn, state.session_id, seat_id)
    beliefs = [
        belief for belief in beliefs
        if belief["source_seq"] is None or int(belief["source_seq"]) <= selected_seq
    ]
    decisions = await persistence.get_decisions(conn, state.session_id)
    seat_decisions = [
        decision for decision in decisions
        if decision["seat_id"] == seat_id
        and _at_or_before(
            int(decision["round"]), str(decision["phase"]), round_, phase,
        )
    ]

    latest_notes: dict[str, dict] = {}
    for note in notes:
        latest_notes[note["note_id"]] = note
    active_notes = [note for note in latest_notes.values() if note["status"] == "active"]
    latest_beliefs: dict[str, dict] = {}
    for belief in beliefs:
        latest_beliefs[belief["subject_seat_id"]] = belief

    conversation: list[dict[str, Any]] = []
    for decision in seat_decisions:
        conversation.extend([
            {"role": "briefing", "content": decision["prompt"], "round": decision["round"], "phase": decision["phase"]},
            {"role": "agent", "content": decision["raw_response"], "round": decision["round"], "phase": decision["phase"]},
        ])

    return {
        "session_id": state.session_id,
        "seat_id": seat_id,
        "name": player.name,
        "role": player.role,
        "alive": player.alive,
        "round": round_,
        "phase": phase,
        "through_seq": selected_seq,
        "max_seq": last_seq,
        "moments": [
            {
                "seq": entry.seq,
                "round": entry.round,
                "phase": entry.phase,
                "label": entry.text or entry.type,
            }
            for entry in state.log
            if not entry.private
        ],
        "public_transcript": view["public_transcript"],
        "visible_events": visible_events,
        "private_knowledge": {
            key: value for key, value in view.items()
            if key not in {"your_name", "your_role", "alive_players", "public_transcript"}
        },
        "conversation_history": conversation,
        "current_briefing": seat_decisions[-1]["prompt"] if seat_decisions else None,
        "private_notes": active_notes,
        "beliefs": list(latest_beliefs.values()),
        "available_tools": _available_tools(historical, player, phase),
        "legal_targets": _legal_targets(historical, player, phase),
    }


async def build_deception_report(conn: Any, state: GameState, include_private: bool) -> dict[str, Any]:
    """Build a forensic report with an explicit fact/interpretation boundary."""
    names = {player.seat_id: player.name for player in state.players}
    roles = {player.seat_id: player.role for player in state.players}
    statements = [entry for entry in state.log if entry.type == "statement"]
    votes = [entry for entry in state.log if entry.type == "vote"]
    deaths = [entry for entry in state.log if entry.type == "death"]
    beliefs = await persistence.get_belief_events(conn, state.session_id)

    claims: list[dict[str, Any]] = []
    for entry in statements:
        role = roles.get(entry.seat_id or "")
        is_wolf = role == "werewolf"
        claims.append({
            "seq": entry.seq,
            "round": entry.round,
            "speaker": names.get(entry.seat_id or "", entry.name or "Unknown"),
            "text": entry.text or "",
            "fact": f"Persisted public statement at event #{entry.seq}.",
            "interpretation": (
                "The speaker was a werewolf, so this public framing served the hidden wolf objective; "
                "the text alone does not prove which sentence was knowingly false."
                if is_wolf else
                "The speaker was not a werewolf; the statement may still have been mistaken or strategically misleading."
            ),
            "classification": "wolf-framing" if is_wolf else "uncertain",
        })

    vote_rounds: dict[int, list[LogEntry]] = defaultdict(list)
    for vote in votes:
        vote_rounds[vote.round].append(vote)
    pivots: list[dict[str, Any]] = []
    prior_by_seat: dict[str, str] = {}
    for vote in votes:
        target = vote.target or (vote.text or "").removeprefix("votes for ")
        prior = prior_by_seat.get(vote.seat_id or "")
        if prior is not None and prior != target:
            pivots.append({
                "seq": vote.seq,
                "round": vote.round,
                "player": names.get(vote.seat_id or "", vote.name or "Unknown"),
                "from": prior,
                "to": target,
                "fact": f"The persisted vote changed from {prior} to {target} across rounds.",
                "interpretation": "The change may reflect new evidence, persuasion, or strategic redirection.",
            })
        prior_by_seat[vote.seat_id or ""] = target

    belief_shifts: list[dict[str, Any]] = []
    prior_suspicion: dict[tuple[str, str], int] = {}
    for belief in beliefs:
        key = (belief["observer_seat_id"], belief["subject_seat_id"])
        previous = prior_suspicion.get(key)
        if previous is not None and abs(int(belief["suspicion"]) - previous) >= 20:
            belief_shifts.append({
                "observer": names.get(key[0], key[0]),
                "subject": names.get(key[1], key[1]),
                "from": previous,
                "to": belief["suspicion"],
                "reason": belief["reason"],
                "source_seq": belief["source_seq"],
            })
        prior_suspicion[key] = int(belief["suspicion"])

    ignored_clues: list[dict[str, Any]] = []
    if include_private:
        for entry in state.log:
            if entry.type != "seer" or not entry.target or not entry.text or "werewolf" not in entry.text:
                continue
            later_votes = [
                vote for vote in votes
                if vote.seq > entry.seq and (vote.target == entry.target or entry.target in (vote.text or ""))
            ]
            eliminated = any(death.target == entry.target or entry.target in (death.text or "") for death in deaths)
            if not eliminated:
                ignored_clues.append({
                    "seq": entry.seq,
                    "seer": names.get(entry.seat_id or "", entry.name or "Seer"),
                    "target": entry.target,
                    "fact": f"The seer privately identified {entry.target} as a werewolf.",
                    "interpretation": (
                        f"Only {len(later_votes)} later persisted vote(s) targeted that player before the game ended."
                    ),
                })

    decisive = deaths[-1] if deaths else (votes[-1] if votes else None)
    turning_point = None
    if decisive:
        turning_point = {
            "seq": decisive.seq,
            "fact": decisive.text or decisive.type,
            "interpretation": (
                "This is the latest irreversible elimination before the recorded outcome and is therefore the strongest deterministic turning-point candidate."
            ),
        }

    wolf_votes = Counter(
        vote.target or (vote.text or "").removeprefix("votes for ")
        for vote in votes if roles.get(vote.seat_id or "") == "werewolf"
    )
    return {
        "session_id": state.session_id,
        "winner": state.winner,
        "scope": "god" if include_private else "public",
        "method": (
            "Facts are direct persisted events or revealed roles. Interpretations are deterministic heuristics, "
            "not hidden chain-of-thought and not a second model's speculation."
        ),
        "claims": claims,
        "vote_pivots": pivots,
        "belief_shifts": belief_shifts if include_private else [],
        "ignored_clues": ignored_clues,
        "turning_point": turning_point,
        "wolf_redirection_targets": [
            {"target": target, "votes": count} for target, count in wolf_votes.most_common()
        ] if include_private else [],
    }
