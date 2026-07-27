"""The partial-observability boundary. Plan §3.3.

`build_agent_view` is a pure function of (GameState, seat_id) — never hand a
node, a tool, or a model the raw GameState. Every "agent knows too much" bug
traces back to something leaking outside this function.
"""

from app.models import GameState, LogEntry


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
