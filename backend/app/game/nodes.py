"""LangGraph nodes. Plan §5.

Human turns use `interrupt()`, which — per LangGraph's own docs — re-runs a
node **from the top** on resume. Every node here is therefore kept minimal:
one seat's turn per node execution, looped via conditional self-edges
(`route_*` functions in graph.py) rather than a Python `for` loop with
`interrupt()` calls mixed into it. A node with a `for` loop containing both
AI calls and a human `interrupt()` would re-run the AI calls (and their
side effects: MCP tool calls, DB writes) every time that human's turn
resumes — see the module docstring in agent_turn.py and the design plan for
why this is the one rule that can't be relaxed here.
"""

from __future__ import annotations

import random
import hashlib

from langchain_core.runnables import RunnableConfig
from langgraph.types import interrupt

from app import persistence
from app.game import actions, registry
from app.game.rules import (
    WEREWOLF_NEGOTIATION_TOKEN_BUDGET,
    expected_werewolf,
    living_werewolves,
    resolve_werewolf_target,
    werewolf_turn_limit,
)
from app.game.seat_mind import remember, run_seat_turn
from app.game.views import build_agent_view
from app.models import GameState, Role, VillageEventState


class GraphState(dict):
    """TypedDict-like wrapper: the graph's only state key is "game", holding
    the live GameState. See registry.py for why nodes mutate it in place."""


def _sync(config: RunnableConfig, game: GameState):
    """Re-point the registry's live GameState at whatever object LangGraph
    just handed this node. Necessary because a resumed run (after an
    `interrupt()`) restores "game" from the checkpoint's serialized copy —
    a different Python object than the one before suspension — so anything
    reading `orch.state` (MCP tools, the SSE routes) must always go through
    this fresh reference, never a reference cached from an earlier node.

    Also emits the "node" SSE event that drives the frontend debug panel's
    live graph highlight. `langgraph_node` is metadata LangGraph attaches to
    every node invocation's config -- reading it here means every node
    reports itself for free, and `check_win` (registered twice, as
    check_win_night and check_win_vote) reports the correct one of the two
    rather than a single hardcoded name.

    The event also carries `phase`/`round` -- the *only* place the frontend
    otherwise learns those is the one-time initial "state" SSE snapshot on
    connect (see routers/stream.py), which is never refreshed afterward.
    Without this, `game.phase` on the frontend would freeze at whatever it
    was when the browser connected -- harmless in the old
    connect-after-auto-start design (the snapshot usually already showed a
    phase past "lobby" by the time anyone was watching), but a real bug now
    that a browser connects *before* the human clicks "Start Game" (see
    07-pausing-with-interrupt.md's `begin_game`): the frontend swaps its
    Start Game prompt for the real controls on `game.phase === "lobby"`, and
    had nothing that would ever tell it the phase moved on, so the prompt
    never went away. Piggy-backing on the "node" event (already fires on every
    node transition) means phase/round go stale for at most one node's worth of
    lag, not forever.
    """
    session_id = config["configurable"]["session_id"]
    orch = registry.get(session_id)
    orch.state = game
    node_name = config.get("metadata", {}).get("langgraph_node")
    if node_name:
        orch.current_node = node_name
        orch.publish("node", {"node": node_name, "phase": game.phase, "round": game.round})
    return orch


def _emit_turn(orch, seat_id: str | None, name: str | None) -> None:
    orch.publish("turn", {"seat_id": seat_id, "name": name})


def _turn_stamp(game: GameState, phase: str, index: int) -> str:
    """Identifies one seat's one turn, so its mind can tell a genuinely new
    turn from the same turn being replayed after a pause/resume (see
    seat_mind.py's `_ingest` for the corruption this prevents). Every
    component is read from the checkpointed GameState, so a replay
    reconstructs an identical stamp."""
    return f"{game.round}:{phase}:{index}"


def _describe_entry(entry: dict) -> str:
    kind = entry.get("type")
    name = entry.get("name")
    if kind == "statement" and name:
        return f'{name} said: "{entry.get("text") or ""}"'
    if kind == "vote" and name:
        return f"{name} voted for {entry.get('target')}"
    return entry.get("text") or ""


def _briefing(game: GameState, seat, instruction: str) -> str:
    """What this seat is told at the start of its turn — deliberately only the
    *delta* since it last acted, never a restatement of the whole game.

    That's the payoff of giving each seat a persistent mind (seat_mind.py):
    it already remembers its own role, its own past actions, and everything it
    was told on previous turns, so repeating any of that would just be paying
    tokens to tell an agent what it already knows. What it genuinely cannot
    know is what happened while it wasn't acting, which is exactly this.

    Everything here comes through `build_agent_view` (views.py) rather than
    off `GameState` directly, so the partial-observability boundary is the
    thing feeding the agent rather than an afterthought — a werewolf's mind
    physically cannot be handed the seer's knowledge from here.

    The read cursor lives in `GameState`, so it is checkpointed and rolled
    back with everything else: a replayed turn recomputes the identical
    briefing rather than seeing an empty delta because the first attempt
    already consumed it."""
    view = build_agent_view(game, seat.seat_id)
    cursor = game.seat_log_cursor.get(seat.seat_id, 0)
    fresh = [
        e for e in view["public_transcript"]
        if e.get("seq", 0) >= cursor
        # Skip what this seat did itself. Its own statement and vote are
        # already in its conversation (it produced them -- the tool call and
        # the tool's result are both recorded there), so echoing them back as
        # news would be paying tokens to tell an agent what it just said.
        and not (e.get("seat_id") == seat.seat_id and e.get("type") in ("statement", "vote"))
    ]
    game.seat_log_cursor[seat.seat_id] = game.next_seq()

    lines: list[str] = []
    if fresh:
        lines.append("Since your last turn:")
        lines.extend(f"  - {text}" for e in fresh if (text := _describe_entry(e)))
    else:
        lines.append("Nothing new has happened since your last turn.")

    lines.append("")
    lines.append(f"Still alive: {', '.join(view['alive_players'])}.")
    if view.get("known_roles"):
        # The seer learned each of these on one of its own past turns, so it
        # is in its memory already -- restated compactly because it's small
        # and it's the seer's whole edge, not because the memory is untrusted.
        known = ", ".join(f"{name} is a {role}" for name, role in view["known_roles"].items())
        lines.append(f"You have secretly confirmed: {known}.")
    lines.append("")
    lines.append(instruction)
    return "\n".join(lines)


def _maybe_pause(orch, game: GameState) -> None:
    """Pause-via-interrupt. Deliberately placed at the very end of a node,
    always *after* any human `interrupt()` call earlier in that same node
    body (e.g. werewolf_negotiation's human branch) -- never before it.

    Why the ordering matters: LangGraph matches a resumed value to an
    `interrupt()` call by its position within the node, counted fresh from
    the top on every re-run (see the module docstring). If this pause check
    ran first, then the following sequence corrupts a human's answer:
    a human seat's turn suspends on *its* interrupt (position 0, no pause
    pending yet) -- while suspended, a pause gets requested -- the human
    submits their answer, so the node re-runs; `_maybe_pause` now fires
    *first* and becomes position 0 in this run, silently consuming the
    human's answer as its own resume value (returning instantly, pausing
    nothing), while the human's real interrupt call shifts to position 1
    and re-suspends with no answer yet -- the human's submission vanishes
    and they're asked the same question again. Keeping this call last in
    every node means it only ever occupies a position *after* a node's own
    interrupt (if any), so it can never shift and steal an answer meant for
    an earlier call. See docs/concepts/07-pausing-with-interrupt.md.
    """
    if not orch.pause_requested:
        return
    orch.pause_requested = False
    game.paused = True
    orch.publish("paused", {})
    interrupt({"kind": "paused"})
    game.paused = False
    orch.publish("resumed", {})


async def _log_system(orch, text: str) -> None:
    await _log(orch, type_="system", text=text)


async def _log_death(orch, *, seat_id: str, name: str, text: str) -> None:
    """A player died. The frontend needs this structured -- not just prose
    -- to flip that seat's card to dead without waiting on a full re-fetch."""
    await _log(orch, type_="death", seat_id=seat_id, target=name, text=text)


async def _log(
    orch,
    *,
    type_: str,
    text: str,
    seat_id: str | None = None,
    target: str | None = None,
    private: bool = False,
) -> None:
    from app.models import LogEntry

    state = orch.state
    entry = LogEntry(
        seq=state.next_seq(), round=state.round, phase=state.phase, type=type_,
        seat_id=seat_id, target=target, text=text, private=private,
    )
    state.log.append(entry)
    await persistence.record_log_entry(orch.conn, orch.session_id, entry)
    orch.publish("log", entry.model_dump())


async def assign_roles(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)

    default_deck: list[Role] = (
        ["werewolf", "werewolf", "seer", "doctor", "hunter", "mayor", "jester"]
        if game.options.role_pack == "expanded"
        else ["werewolf", "werewolf", "seer", "doctor", "villager", "villager", "villager"]
    )
    roles: list[Role] = game.role_deck or default_deck
    roles = roles[: len(game.players)]
    if game.role_deck is None:
        random.shuffle(roles)
    for player, role in zip(game.players, roles):
        player.role = role
        await persistence.set_seat_role(orch.conn, orch.session_id, player.seat_id, role)

    # The frontend's `game.players` otherwise only ever comes from the
    # one-time initial "state" SSE snapshot (see stream.py) -- since
    # begin_game (07-pausing-with-interrupt.md) now decouples game creation
    # from graph start, that snapshot is always taken *before* roles exist,
    # and no other event refreshes the player list afterward. Without this,
    # "god mode" (PlayerCard.tsx's roleKnown) has nothing to reveal until the
    # browser is refreshed and re-fetches a snapshot from after this point.
    orch.publish("roles_assigned", {"players": [p.model_dump() for p in game.players]})

    await _log_system(
        orch, "Seven villagers gather as the sun sets. Among them, some are not what they seem."
    )
    _maybe_pause(orch, game)
    return {"game": game}


async def start_night(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    if game.phase != "lobby":
        game.round += 1
    game.phase = "night"
    game.wolf_index = 0
    game.night_proposals = []
    game.wolf_proposals = {}
    game.wolf_negotiation_commits = {}
    game.night_target = None
    game.night_saved = None
    game.village_event = None
    # On the first night only, say what order the night runs in. Without it the
    # night looks like it skips around the table at random -- it doesn't, but
    # the reason isn't visible: night turns are dispatched by *role* (see
    # werewolf_negotiation/night_doctor/night_seer below, which look their seat up by
    # role and ignore seat position), while roles were dealt randomly in
    # assign_roles. So the 5th seat acting first is normal, and only makes
    # sense once you know the wolves go first. Repeating this every night would
    # just be noise, hence round 1 only.
    #
    # Deliberately states the fixed ritual order rather than who is actually
    # alive to take each turn: this entry is public (see _log_system), so
    # "the doctor is gone" would leak a role to every seat.
    if game.round == 1:
        await _log_system(
            orch,
            f"Night {game.round} falls over the village. The werewolves wake first, then the "
            "doctor, then the seer — night turns follow role, not seating order.",
        )
    else:
        await _log_system(orch, f"Night {game.round} falls over the village.")
    _maybe_pause(orch, game)
    return {"game": game}


def _werewolf_negotiation_briefing(game: GameState, wolf, pool: list[str]) -> str:
    channel = [
        entry
        for entry in game.log
        if entry.round == game.round
        and entry.type == "werewolf_negotiation"
        and entry.seat_id is not None
    ]
    exchange = "\n".join(
        f"  - {entry.name}: {entry.text} (currently favors {entry.target})"
        for entry in channel
    ) or "  - No one has spoken yet."
    wolves = living_werewolves(game)
    proposals = ", ".join(
        f"{member.name} → {game.wolf_proposals.get(member.seat_id, 'undecided')}"
        for member in wolves
    )
    return _briefing(
        game,
        wolf,
        (
            f"It is night {game.round}. You are speaking in the private werewolf council; only living "
            "werewolves can hear this channel. Persuade your teammate and coordinate tomorrow's cover story.\n"
            f"Private council so far:\n{exchange}\n"
            f"Latest proposals: {proposals}.\n"
            f"Legal targets: {', '.join(pool)}.\n"
            f"This is council turn {game.wolf_index + 1} of {werewolf_turn_limit(game)}. You may revise "
            f"your earlier target. Call `negotiate_message` with a private message, your target, and no "
            f"more than approximately {WEREWOLF_NEGOTIATION_TOKEN_BUDGET} tokens of message text."
        ),
    )


async def werewolf_negotiation(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    wolves = living_werewolves(game)

    if game.wolf_index >= werewolf_turn_limit(game):
        return {"game": game}

    wolf = expected_werewolf(game)
    if wolf is None:
        return {"game": game}
    pool = [p.name for p in game.alive_players() if p.role != "werewolf"]
    if not pool:
        game.wolf_index = werewolf_turn_limit(game)
        return {"game": game}

    _emit_turn(orch, wolf.seat_id, wolf.name)
    if len(wolves) == 1:
        if wolf.controller == "human":
            answer = interrupt(
                {"kind": "night_action", "seat_id": wolf.seat_id, "prompt": "Choose which villager to attack.", "options": pool}
            )
            await actions.apply_night_action(orch, wolf.seat_id, answer["target"], answer.get("thought", ""))
        else:
            await run_seat_turn(
                orch, wolf, phase="night",
                briefing=_briefing(game, wolf, (
                    f"It is night {game.round}. You are the only living werewolf. Choose a villager to attack.\n"
                    f"Options: {', '.join(pool)}\n"
                    "Call `submit_night_action` with your chosen target."
                )),
                turn_stamp=_turn_stamp(game, "night-wolf-solo", game.wolf_index),
                commit_tool="submit_night_action",
                fallback={"pool": pool},
            )
    else:
        if wolf.controller == "human":
            answer = interrupt({
                "kind": "werewolf_negotiation",
                "seat_id": wolf.seat_id,
                "prompt": "Privately persuade your fellow werewolf and propose tonight's target.",
                "options": pool,
                "turn_id": _turn_stamp(game, "werewolf-negotiation", game.wolf_index),
            })
            await actions.negotiate_message(
                orch,
                wolf.seat_id,
                answer.get("text", "I favor this target."),
                answer["target"],
            )
        else:
            await run_seat_turn(
                orch,
                wolf,
                phase="night-negotiation",
                briefing=_werewolf_negotiation_briefing(game, wolf, pool),
                turn_stamp=_turn_stamp(game, "werewolf-negotiation", game.wolf_index),
                commit_tool="negotiate_message",
                fallback={
                    "pool": pool,
                    "text": "I favor this target as the strongest threat; we should redirect suspicion tomorrow.",
                },
            )
    game.wolf_index += 1
    _emit_turn(orch, None, None)
    _maybe_pause(orch, game)
    return {"game": game}


async def resolve_wolf_plan(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    wolves = living_werewolves(game)

    if len(wolves) > 1:
        game.night_target, method = resolve_werewolf_target(game)
        if game.night_target is not None:
            await _log(
                orch,
                type_="werewolf_negotiation",
                text=f"The pack commits to attacking {game.night_target} via {method}.",
                target=game.night_target,
                private=True,
            )
    elif game.night_target is None and game.night_proposals:
        game.night_target = game.night_proposals[-1]

    _maybe_pause(orch, game)
    return {"game": game}


async def night_doctor(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    doctor = next((p for p in game.players if p.role == "doctor" and p.alive), None)
    if doctor is None:
        return {"game": game}

    pool = [p.name for p in game.alive_players()]
    _emit_turn(orch, doctor.seat_id, doctor.name)
    if doctor.controller == "human":
        answer = interrupt(
            {"kind": "night_action", "seat_id": doctor.seat_id, "prompt": "Choose who to secretly protect tonight.", "options": pool}
        )
        await actions.apply_night_action(orch, doctor.seat_id, answer["target"], answer.get("thought", ""))
    else:
        await run_seat_turn(
            orch, doctor, phase="night",
            briefing=_briefing(game, doctor, (
                f"It is night {game.round}. Choose who to secretly protect tonight (you may protect yourself).\n"
                f"Options: {', '.join(pool)}\n"
                "Call `submit_night_action` with your chosen target."
            )),
            turn_stamp=_turn_stamp(game, "night-doctor", 0),
            commit_tool="submit_night_action",
            fallback={"pool": pool},
        )
    _emit_turn(orch, None, None)
    _maybe_pause(orch, game)
    return {"game": game}


async def night_seer(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    seer = next((p for p in game.players if p.role == "seer" and p.alive), None)
    if seer is None:
        return {"game": game}

    pool = [p.name for p in game.alive_players() if p.name != seer.name]
    if not pool:
        return {"game": game}

    _emit_turn(orch, seer.seat_id, seer.name)
    if seer.controller == "human":
        answer = interrupt(
            {"kind": "night_action", "seat_id": seer.seat_id, "prompt": "Choose one player to secretly investigate.", "options": pool}
        )
        await actions.apply_night_action(orch, seer.seat_id, answer["target"], answer.get("thought", ""))
    else:
        await run_seat_turn(
            orch, seer, phase="night",
            briefing=_briefing(game, seer, (
                f"It is night {game.round}. Choose one player to secretly investigate — you will learn their true role.\n"
                f"Options: {', '.join(pool)}\n"
                "Call `submit_night_action` with your chosen target."
            )),
            turn_stamp=_turn_stamp(game, "night-seer", 0),
            commit_tool="submit_night_action",
            fallback={"pool": pool},
        )
    _emit_turn(orch, None, None)
    _maybe_pause(orch, game)
    return {"game": game}


async def resolve_night(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)

    victim_name = game.night_target
    if victim_name is None and game.night_proposals:
        tally: dict[str, int] = {}
        for name in game.night_proposals:
            tally[name] = tally.get(name, 0) + 1
        top = max(tally.values())
        victim_name = random.choice([n for n, c in tally.items() if c == top])

    if victim_name and victim_name == game.night_saved:
        await _log_system(
            orch, f"Someone crept toward {victim_name} in the dark — but they were protected. No one died last night."
        )
    elif victim_name:
        victim = game.find_by_name(victim_name)
        victim.alive = False
        if victim.role == "hunter":
            game.hunter_pending = victim.seat_id
        await _log_death(
            orch, seat_id=victim.seat_id, name=victim.name,
            text=f"Dawn breaks. The village finds {victim.name} dead. They were a {victim.role}.",
        )
    else:
        await _log_system(orch, "A quiet night. No one was harmed.")

    _maybe_pause(orch, game)
    return {"game": game}


async def hunter_retaliation(state: dict, config: RunnableConfig) -> dict:
    """The expanded deck's one-shot, server-validated death retaliation."""
    game: GameState = state["game"]
    orch = _sync(config, game)
    if game.hunter_pending is None:
        return {"game": game}
    hunter = game.find_seat(game.hunter_pending)
    pool = [player.name for player in game.alive_players()]
    if not pool:
        game.hunter_pending = None
        return {"game": game}
    _emit_turn(orch, hunter.seat_id, hunter.name)
    if hunter.controller == "human":
        answer = interrupt({
            "kind": "hunter_action",
            "seat_id": hunter.seat_id,
            "prompt": "Your final shot: choose one living player to take with you.",
            "options": pool,
        })
        await actions.hunter_retaliate(
            orch, hunter.seat_id, answer["target"], answer.get("thought", ""),
        )
    else:
        await run_seat_turn(
            orch, hunter, phase="hunter-retaliation",
            briefing=(
                "You have been eliminated, but your Hunter role grants one final shot. "
                f"Choose one living target: {', '.join(pool)}. Call `hunter_retaliate`."
            ),
            turn_stamp=_turn_stamp(game, "hunter-retaliation", game.next_seq()),
            commit_tool="hunter_retaliate",
            fallback={"pool": pool},
        )
    _emit_turn(orch, None, None)
    _maybe_pause(orch, game)
    return {"game": game}


async def start_day(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    game.phase = "day-discuss"
    game.day_index = 0
    await _log_system(orch, f"Day {game.round} discussion begins.")
    _maybe_pause(orch, game)
    return {"game": game}


async def select_village_event(state: dict, config: RunnableConfig) -> dict:
    """Choose one deterministic, bounded round modifier from server rules."""
    game: GameState = state["game"]
    orch = _sync(config, game)
    if not game.options.village_events:
        game.village_event = None
        return {"game": game}

    digest = hashlib.sha256(f"{game.session_id}:{game.round}:event".encode()).digest()
    kinds = ["silence", "secret_vote", "forced_testimony", "discovered_evidence"]
    kind = kinds[digest[0] % len(kinds)]
    living = game.alive_players()
    target = living[digest[1] % len(living)] if living else None
    descriptions = {
        "silence": f"A choking fog steals {target.name}'s voice for this council." if target else "A choking fog settles over the council.",
        "secret_vote": "The ballot is sealed. Individual votes remain hidden until the village resolves them.",
        "forced_testimony": f"The old bell names {target.name}. They must address the council first." if target else "The old bell demands testimony.",
        "discovered_evidence": f"Fresh claw-marked tracks are discovered near {target.name}'s home. The clue may be genuine or planted." if target else "Ambiguous tracks are found at dawn.",
    }
    event = VillageEventState(
        kind=kind,
        round=game.round,
        target_seat_id=target.seat_id if target else None,
        description=descriptions[kind],
    )
    game.village_event = event
    game.event_history.append(event)
    await _log(orch, type_="village_event", text=event.description)
    _maybe_pause(orch, game)
    return {"game": game}


def _discussion_order(game: GameState):
    living = game.alive_players()
    event = game.village_event
    if event and event.kind == "forced_testimony" and event.target_seat_id:
        living.sort(key=lambda player: player.seat_id != event.target_seat_id)
    return living


async def day_discussion(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    alive = _discussion_order(game)

    if game.day_index >= len(alive):
        return {"game": game}

    speaker = alive[game.day_index]
    _emit_turn(orch, speaker.seat_id, speaker.name)

    event = game.village_event
    if event and event.kind == "silence" and event.target_seat_id == speaker.seat_id:
        await _log_system(orch, f"{speaker.name} is silenced by the round event and loses this speaking turn.")
        game.day_index += 1
        _emit_turn(orch, None, None)
        _maybe_pause(orch, game)
        return {"game": game}

    if speaker.controller == "human":
        answer = interrupt({"kind": "statement", "seat_id": speaker.seat_id, "prompt": "What do you want to say to the village?", "options": []})
        await actions.apply_statement(orch, speaker.seat_id, answer.get("text", "(says nothing)"))
    else:
        await run_seat_turn(
            orch, speaker, phase="day-discuss",
            briefing=_briefing(game, speaker, (
                f"It is day {game.round}. Give a short in-character spoken statement — accuse someone, "
                "defend yourself, or share a suspicion. Call `submit_statement` with what you say aloud."
            )),
            turn_stamp=_turn_stamp(game, "day-discuss", game.day_index),
            commit_tool="submit_statement",
            fallback={"text": "stays quiet, watching the others."},
        )
    game.day_index += 1
    _emit_turn(orch, None, None)
    _maybe_pause(orch, game)
    return {"game": game}


async def start_vote(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    game.phase = "day-vote"
    game.vote_index = 0
    game.vote_tally = {}
    await _log_system(orch, "The village must vote. Who will be cast out?")
    _maybe_pause(orch, game)
    return {"game": game}


async def voting(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    alive = game.alive_players()

    if game.vote_index >= len(alive):
        return {"game": game}

    voter = alive[game.vote_index]
    pool = [p.name for p in alive if p.name != voter.name]
    _emit_turn(orch, voter.seat_id, voter.name)

    if voter.controller == "human":
        answer = interrupt({"kind": "vote", "seat_id": voter.seat_id, "prompt": "Cast your vote.", "options": pool})
        await actions.apply_vote(orch, voter.seat_id, answer["target"], answer.get("thought", ""))
    else:
        await run_seat_turn(
            orch, voter, phase="day-vote",
            briefing=_briefing(game, voter, (
                f"It is time to vote in round {game.round}.\n"
                f"Players you can vote for: {', '.join(pool)}.\n"
                "Call `submit_vote` with who you choose to eliminate."
            )),
            turn_stamp=_turn_stamp(game, "day-vote", game.vote_index),
            commit_tool="submit_vote",
            fallback={"pool": pool},
        )
    game.vote_index += 1
    _emit_turn(orch, None, None)
    _maybe_pause(orch, game)
    return {"game": game}


async def resolve_vote(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)

    if not game.vote_tally:
        await _log_system(orch, "No votes were cast. The village remains as it was.")
        return {"game": game}

    if game.village_event and game.village_event.kind == "secret_vote":
        totals = ", ".join(f"{name}: {count}" for name, count in sorted(game.vote_tally.items()))
        await _log_system(orch, f"The sealed ballot opens. Final tally — {totals}.")

    top = max(game.vote_tally.values())
    top_names = [n for n, c in game.vote_tally.items() if c == top]
    eliminated_name = random.choice(top_names)
    eliminated = game.find_by_name(eliminated_name)
    eliminated.alive = False
    if eliminated.role == "hunter":
        game.hunter_pending = eliminated.seat_id
    if eliminated.role == "jester":
        game.winner = "jester"
    await _log_death(
        orch, seat_id=eliminated.seat_id, name=eliminated.name,
        text=f"The village has spoken. {eliminated.name} is cast out — they were a {eliminated.role}.",
    )
    _maybe_pause(orch, game)
    return {"game": game}


async def check_win(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)

    wolves = len([p for p in game.alive_players() if p.role == "werewolf"])
    others = len([p for p in game.alive_players() if p.role != "werewolf"])

    winner = game.winner
    if winner is None and wolves == 0:
        winner = "villagers"
    elif winner is None and wolves >= others:
        winner = "werewolves"

    if winner:
        game.winner = winner
        game.phase = "gameover"
        text = {
            "villagers": "The village has rooted out every werewolf. Villagers win!",
            "werewolves": "The werewolves have taken the village. Werewolves win!",
            "jester": "The village cast out the Jester. Their impossible performance wins the game!",
        }[winner]
        from app.models import LogEntry

        entry = LogEntry(seq=game.next_seq(), round=game.round, phase=game.phase, type="winner", text=text)
        game.log.append(entry)
        await persistence.record_log_entry(orch.conn, orch.session_id, entry)
        await persistence.finish_game(orch.conn, orch.session_id, winner)
        from app.game.relationships import capture_game
        await capture_game(orch.conn, game)
        orch.publish("log", entry.model_dump())
        orch.publish("game_over", {"winner": winner})

        # Close out every agent's own record of the game. Nobody gets another
        # turn after this, so there is no future briefing to carry the result
        # -- without this, each seat's remembered game would just stop
        # mid-round with no idea how it ended. Written straight into the
        # conversation with no model call (see seat_mind.remember), and safe
        # from the pause/resume replay other nodes have to guard against
        # because this branch deliberately never calls `_maybe_pause`.
        if orch.seat_mind is not None:
            for player in game.players:
                if player.controller == "ai":
                    await remember(orch, player.seat_id, text)
    else:
        # Pausing a game that just ended is a no-op the player would never
        # ask for -- only check when there's more game left to play.
        _maybe_pause(orch, game)

    return {"game": game}


def _persona(player, game: GameState) -> str:
    ctx = (
        f"You are {player.name}, a {player.personality} villager playing a social deduction party "
        f"game called Werewolf. Your secret role is: {player.role}. Stay fully in character. Keep "
        "everything you say short — one or two sentences, natural spoken dialogue, no stage directions."
    )
    if player.role == "werewolf":
        teammate = next((p for p in game.players if p.role == "werewolf" and p.seat_id != player.seat_id), None)
        if teammate:
            ctx += (
                f" Your fellow werewolf is {teammate.name}. You must never reveal that you or "
                f"{teammate.name} are werewolves — deflect suspicion and blend in."
            )
    elif player.role == "seer":
        ctx += " Each night you secretly learn one player's true role."
    elif player.role == "doctor":
        ctx += " Each night you may secretly protect one player (including yourself) from being killed."
    elif player.role == "hunter":
        ctx += " If you are eliminated, you receive one final server-validated shot at a living player."
    elif player.role == "mayor":
        ctx += " Your public vote counts twice; use that authority carefully."
    elif player.role == "jester":
        ctx += " You win only if the village votes you out. Encourage suspicion without explicitly revealing this role."
    behavior = player.behavior
    ctx += (
        f" Experiment profile v{behavior.version}: risk {behavior.risk_tolerance}/100, "
        f"honesty {behavior.honesty}/100, aggression {behavior.aggressiveness}/100, "
        f"{behavior.reasoning_level} reasoning, {behavior.memory_strategy} memory, "
        f"and {behavior.tool_strategy} tool use."
    )
    if behavior.system_prompt_addition:
        ctx += f" Additional speaking direction: {behavior.system_prompt_addition}"
    if player.cross_game_memories:
        ctx += " Opt-in memories from earlier games (behaviour only; roles reset): " + " ".join(
            memory.memory for memory in player.cross_game_memories[-6:]
        )
    ctx += (
        " Maintain a concise private notebook when evidence changes. Use record_private_note for a new "
        "suspicion, clue, theory, lie, or alliance; cite the visible event seq when possible. Use "
        "revise_private_note when your belief changes and retire_private_note when evidence disproves it, "
        "so your earlier reasoning remains auditable. Use get_my_beliefs and update_belief to keep an "
        "evidence-backed 0-100 suspicion score for other players; update it when statements, votes, deaths, "
        "or role discoveries materially change your view. Never put secret-role facts into public speech."
    )
    return ctx
