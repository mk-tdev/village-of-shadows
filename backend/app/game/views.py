"""The partial-observability boundary. Plan §3.3.

`build_agent_view` is a pure function of (GameState, seat_id) — never hand a
node, a tool, or a model the raw GameState. Every "agent knows too much" bug
traces back to something leaking outside this function.
"""

from app.models import GameState, LogEntry


def log_visible_to_human(state: GameState, entry: LogEntry, seat_id: str | None, host: bool) -> bool:
    if host:
        return True
    if not entry.private:
        return True
    if seat_id is None:
        return False
    if entry.seat_id == seat_id:
        return True
    viewer = state.find_seat(seat_id)
    return (
        viewer.alive
        and viewer.role == "werewolf"
        and entry.type in {"werewolf", "werewolf_negotiation"}
    )


def build_human_state_view(
    state: GameState,
    *,
    seat_id: str | None,
    host: bool,
) -> dict:
    """Browser boundary: never serialize raw orchestration bookkeeping."""
    viewer = state.find_seat(seat_id) if seat_id else None
    players = []
    for player in state.players:
        role = None
        if host or player.seat_id == seat_id or not player.alive:
            role = player.role
        elif viewer and viewer.alive and viewer.role == "werewolf" and player.role == "werewolf":
            role = player.role
        # The browser receives a deliberately small player projection.  Raw
        # Player serialization would expose custom prompts, fallback
        # endpoints and relationship memories to every joined human.
        projected = {
            "seat_id": player.seat_id,
            "name": player.name,
            "personality": player.personality,
            "controller": player.controller,
            "provider": player.provider,
            "model_name": player.model_name,
            "role": role,
            "alive": player.alive,
        }
        if host:
            projected["behavior"] = player.behavior.model_dump()
            projected["resilience"] = player.resilience.model_dump()
        players.append(projected)
    awaiting = (
        state.awaiting.model_dump()
        if state.awaiting is not None and state.awaiting.seat_id == seat_id
        else None
    )
    knowledge = state.seer_knowledge if host else (
        {seat_id: state.seer_knowledge.get(seat_id, {})} if seat_id else {}
    )
    return {
        "session_id": state.session_id,
        "players": players,
        "round": state.round,
        "phase": state.phase,
        "log": [
            entry.model_dump() for entry in state.log
            if log_visible_to_human(state, entry, seat_id, host)
        ],
        "seer_knowledge": knowledge,
        "winner": state.winner,
        "awaiting": awaiting,
        "paused": state.paused,
        "options": state.options.model_dump(),
        "village_event": state.village_event.model_dump() if state.village_event else None,
        "access": {"seat_id": seat_id, "god_mode": host, "protected": True},
    }


def build_agent_view(state: GameState, seat_id: str) -> dict:
    player = state.find_seat(seat_id)
    public_log: list[LogEntry] = [e for e in state.log if not e.private]

    view: dict = {
        "your_name": player.name,
        "your_role": player.role,
        "alive_players": [p.name for p in state.alive_players()],
        "public_transcript": [e.model_dump() for e in public_log],
    }

    if player.role == "werewolf":
        teammate = next(
            (p for p in state.players if p.role == "werewolf" and p.seat_id != seat_id),
            None,
        )
        view["teammate"] = teammate.name if teammate and teammate.alive else None

    if player.role == "seer":
        view["known_roles"] = state.seer_knowledge.get(seat_id, {})

    return view
