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

from langchain_core.runnables import RunnableConfig
from langgraph.types import interrupt

from app import persistence
from app.game import actions, registry
from app.game.agent_turn import run_agent_turn
from app.models import GameState, Role


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
    07-pausing-with-interrupt.md's `begin_game`): the "Ready when you are"
    overlay checks `game.phase === "lobby"` and had nothing that would ever
    tell it the phase moved on, so it never closed. Piggy-backing on the
    "node" event (already fires on every node transition) means phase/round
    go stale for at most one node's worth of lag, not forever.
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


def _maybe_pause(orch, game: GameState) -> None:
    """Pause-via-interrupt. Deliberately placed at the very end of a node,
    always *after* any human `interrupt()` call earlier in that same node
    body (e.g. night_wolves' human branch) -- never before it.

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


async def _log(orch, *, type_: str, text: str, seat_id: str | None = None, target: str | None = None) -> None:
    from app.models import LogEntry

    state = orch.state
    entry = LogEntry(
        seq=state.next_seq(), round=state.round, phase=state.phase, type=type_,
        seat_id=seat_id, target=target, text=text,
    )
    state.log.append(entry)
    await persistence.record_log_entry(orch.conn, orch.session_id, entry)
    orch.publish("log", entry.model_dump())


async def assign_roles(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)

    roles: list[Role] = ["werewolf", "werewolf", "seer", "doctor", "villager", "villager", "villager"]
    roles = roles[: len(game.players)]
    random.shuffle(roles)
    for player, role in zip(game.players, roles):
        player.role = role
        await persistence.set_seat_role(orch.conn, orch.session_id, player.seat_id, role)

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
    game.night_saved = None
    await _log_system(orch, f"Night {game.round} falls over the village.")
    _maybe_pause(orch, game)
    return {"game": game}


async def night_wolves(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    wolves = [p for p in game.players if p.role == "werewolf" and p.alive]

    if game.wolf_index >= len(wolves):
        return {"game": game}

    wolf = wolves[game.wolf_index]
    pool = [p.name for p in game.alive_players() if p.role != "werewolf"]
    if not pool:
        game.wolf_index += 1
        return {"game": game}

    _emit_turn(orch, wolf.seat_id, wolf.name)
    if wolf.controller == "human":
        answer = interrupt(
            {"kind": "night_action", "seat_id": wolf.seat_id, "prompt": "Choose which villager to attack.", "options": pool}
        )
        await actions.apply_night_action(orch, wolf.seat_id, answer["target"], answer.get("thought", ""))
    else:
        await run_agent_turn(
            orch, wolf, phase="night",
            system_prompt=_persona(wolf, game),
            user_prompt=(
                f"It is night {game.round}. Choose which villager the werewolves should attack tonight.\n"
                f"Options: {', '.join(pool)}\n"
                "Call `submit_night_action` with your chosen target."
            ),
            commit_tool_name="submit_night_action",
            fallback={"pool": pool},
        )
    game.wolf_index += 1
    _emit_turn(orch, None, None)
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
        await run_agent_turn(
            orch, doctor, phase="night",
            system_prompt=_persona(doctor, game),
            user_prompt=(
                f"It is night {game.round}. Choose who to secretly protect tonight (you may protect yourself).\n"
                f"Options: {', '.join(pool)}\n"
                "Call `submit_night_action` with your chosen target."
            ),
            commit_tool_name="submit_night_action",
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
        await run_agent_turn(
            orch, seer, phase="night",
            system_prompt=_persona(seer, game),
            user_prompt=(
                f"It is night {game.round}. Choose one player to secretly investigate — you will learn their true role.\n"
                f"Options: {', '.join(pool)}\n"
                "Call `submit_night_action` with your chosen target."
            ),
            commit_tool_name="submit_night_action",
            fallback={"pool": pool},
        )
    _emit_turn(orch, None, None)
    _maybe_pause(orch, game)
    return {"game": game}


async def resolve_night(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)

    victim_name = None
    if game.night_proposals:
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
        await _log_death(
            orch, seat_id=victim.seat_id, name=victim.name,
            text=f"Dawn breaks. The village finds {victim.name} dead. They were a {victim.role}.",
        )
    else:
        await _log_system(orch, "A quiet night. No one was harmed.")

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


async def day_discussion(state: dict, config: RunnableConfig) -> dict:
    game: GameState = state["game"]
    orch = _sync(config, game)
    alive = game.alive_players()

    if game.day_index >= len(alive):
        return {"game": game}

    speaker = alive[game.day_index]
    transcript = _round_transcript(game)
    _emit_turn(orch, speaker.seat_id, speaker.name)

    if speaker.controller == "human":
        answer = interrupt({"kind": "statement", "seat_id": speaker.seat_id, "prompt": "What do you want to say to the village?", "options": []})
        await actions.apply_statement(orch, speaker.seat_id, answer.get("text", "(says nothing)"))
    else:
        await run_agent_turn(
            orch, speaker, phase="day-discuss",
            system_prompt=_persona(speaker, game),
            user_prompt=(
                f"It is day {game.round}. Discussion so far this round:\n{transcript}\n"
                f"Alive players: {', '.join(p.name for p in alive)}.\n"
                "Give a short in-character spoken statement — accuse someone, defend yourself, or share a "
                "suspicion. Call `submit_statement` with what you say aloud."
            ),
            commit_tool_name="submit_statement",
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
    transcript = _round_transcript(game)
    _emit_turn(orch, voter.seat_id, voter.name)

    if voter.controller == "human":
        answer = interrupt({"kind": "vote", "seat_id": voter.seat_id, "prompt": "Cast your vote.", "options": pool})
        await actions.apply_vote(orch, voter.seat_id, answer["target"], answer.get("thought", ""))
    else:
        await run_agent_turn(
            orch, voter, phase="day-vote",
            system_prompt=_persona(voter, game),
            user_prompt=(
                f"It is time to vote in round {game.round}. Full discussion this round:\n{transcript}\n"
                f"Alive players you can vote for: {', '.join(pool)}.\n"
                "Call `submit_vote` with who you choose to eliminate."
            ),
            commit_tool_name="submit_vote",
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

    top = max(game.vote_tally.values())
    top_names = [n for n, c in game.vote_tally.items() if c == top]
    eliminated_name = random.choice(top_names)
    eliminated = game.find_by_name(eliminated_name)
    eliminated.alive = False
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

    winner = None
    if wolves == 0:
        winner = "villagers"
    elif wolves >= others:
        winner = "werewolves"

    if winner:
        game.winner = winner
        game.phase = "gameover"
        text = (
            "The village has rooted out every werewolf. Villagers win!"
            if winner == "villagers"
            else "The werewolves have taken the village. Werewolves win!"
        )
        from app.models import LogEntry

        entry = LogEntry(seq=game.next_seq(), round=game.round, phase=game.phase, type="winner", text=text)
        game.log.append(entry)
        await persistence.record_log_entry(orch.conn, orch.session_id, entry)
        await persistence.finish_game(orch.conn, orch.session_id, winner)
        orch.publish("log", entry.model_dump())
        orch.publish("game_over", {"winner": winner})
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
    return ctx


def _round_transcript(game: GameState) -> str:
    lines = [
        f"{e.name}: {e.text}"
        for e in game.log
        if e.round == game.round and e.type == "statement"
    ]
    return "\n".join(lines) if lines else "(no one has spoken yet)"
