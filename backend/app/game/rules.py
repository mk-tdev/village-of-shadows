"""Small deterministic rule helpers shared by graph nodes and actions.

Models may argue about a plan, but they never decide how disagreement is
resolved.  Keeping that policy here makes the werewolf council replayable and
testable without consulting another model.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import GameState, Player


# Each living wolf gets an opening proposal and one revision.  The committed
# private channel message is capped with a provider-neutral approximate token
# budget (four characters per token) because the configured seats may use
# tokenizers from several different model families.
WEREWOLF_NEGOTIATION_PASSES = 2
WEREWOLF_NEGOTIATION_TOKEN_BUDGET = 80
WEREWOLF_NEGOTIATION_CHAR_BUDGET = WEREWOLF_NEGOTIATION_TOKEN_BUDGET * 4


def living_werewolves(game: "GameState") -> list["Player"]:
    return [player for player in game.players if player.role == "werewolf" and player.alive]


def werewolf_turn_limit(game: "GameState") -> int:
    wolves = living_werewolves(game)
    if len(wolves) <= 1:
        return len(wolves)
    return len(wolves) * WEREWOLF_NEGOTIATION_PASSES


def expected_werewolf(game: "GameState") -> "Player | None":
    wolves = living_werewolves(game)
    if not wolves:
        return None
    return wolves[game.wolf_index % len(wolves)]


def resolve_werewolf_target(game: "GameState") -> tuple[str | None, str]:
    """Resolve the latest proposals without randomness.

    Agreement wins immediately.  If the wolves still disagree after their
    final revision, the earliest living wolf in council seating order acts as
    pack leader and their latest legal proposal wins.  If a provider failed
    before producing any proposal, the first legal target in seating order is
    used so the graph can continue safely.
    """

    wolves = living_werewolves(game)
    legal = [player.name for player in game.alive_players() if player.role != "werewolf"]
    proposals = {
        wolf.seat_id: game.wolf_proposals[wolf.seat_id]
        for wolf in wolves
        if game.wolf_proposals.get(wolf.seat_id) in legal
    }

    if proposals and len(set(proposals.values())) == 1:
        return next(iter(proposals.values())), "agreement"

    for wolf in wolves:
        target = proposals.get(wolf.seat_id)
        if target is not None:
            return target, f"pack-leader tie-break ({wolf.name})"

    return (legal[0], "first legal target fallback") if legal else (None, "no legal target")
