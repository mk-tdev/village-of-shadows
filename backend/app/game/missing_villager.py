"""An authored mystery inside the live game, with checkpointed, server-owned truth.

One validated interaction per node. Witness accounts are authored testimony;
subsequent council agents receive only their own memories and public evidence.
"""
from __future__ import annotations

import hashlib
import random

from langchain_core.runnables import RunnableConfig
from langgraph.types import interrupt

from app.models import GameState, MissingVillagerCase


def clues(game: GameState) -> dict[str, dict]:
    case = game.missing_villager
    framed = game.find_seat(case.framed).name
    return {
        "cloth": {"id": "cloth", "title": "The torn blue scarf", "location": "Window latch",
                  "text": f"A strip of {framed}'s blue scarf hangs on the outside latch. Its edge is neatly cut; the wood beneath it has no fresh scratch. Someone may have placed it here."},
        "tracks": {"id": "tracks", "title": "The broken heel", "location": "Ash beside the hearth",
                   "text": "One boot has a crescent missing from its right heel. The trail crosses the spilled hearth ash, then leads toward the old mill. A dropped brass key lies beside it."},
    }


def testimony(game: GameState, seat_id: str, question: str) -> str:
    case = game.missing_villager
    framed = game.find_seat(case.framed).name
    culprit = game.find_seat(case.culprit).name
    if seat_id == case.culprit:
        return (f"I was at the chapel until dawn. I saw {framed} heading toward this house. You should ask about that scarf."
                if question == "alibi" else
                "My right boot lost a piece of its heel weeks ago. Half the village wears boots like mine. And I have never carried a key to the mill.")
    if seat_id == case.framed:
        return ("I delivered firewood before sunset, then went home. I left my scarf on the bellkeeper's chair. I should have gone back for it."
                if question == "alibi" else
                "Yes, the scarf is mine. But that edge was cut, not torn. The bellkeeper borrowed it yesterday. A scarf cannot tell you who took him.")
    return (f"I was putting out the bakery lamps when I heard the scream. {culprit} hurried past toward the mill, limping. I did not see their face clearly until they turned under my lamp."
            if question == "alibi" else
            f"I repaired {culprit}'s right boot last winter. It still has a crescent missing from the heel. The bellkeeper told me the mill's spare key had vanished yesterday.")


def case_memory(game: GameState, seat_id: str) -> list[str]:
    case = game.missing_villager
    if case is None:
        return []
    facts: list[str] = []
    if seat_id == case.culprit:
        facts.append("You abducted the bellkeeper, locked him in the old mill, and planted the borrowed blue scarf. Your broken right heel left the ash trail. Conceal your guilt in council; you cannot change these facts.")
    elif seat_id == case.framed:
        facts.append("You are innocent of the abduction. You left your scarf with the bellkeeper after delivering firewood before sunset.")
    elif seat_id == case.witness:
        facts.append(testimony(game, seat_id, "alibi"))
        facts.append(testimony(game, seat_id, "evidence"))
    for key, answer in case.interviews.items():
        witness_id, question = key.rsplit(":", 1)
        if witness_id == seat_id or seat_id == case.investigator:
            facts.append(f"Private interview — {game.find_seat(witness_id).name}, asked about {question}, said: {answer}")
    return facts


def investigation_view(game: GameState) -> dict:
    """Only discovered facts and already-spoken testimony; never culprit IDs."""
    case = game.missing_villager
    records = clues(game)
    witnesses = sorted([case.culprit, case.framed, case.witness], key=lambda s: hashlib.sha256(f"{game.session_id}:{s}".encode()).hexdigest())
    choices = []
    if case.stage == "arrival":
        choices = [{"id": "enter", "label": "Follow the scream", "detail": "Enter the bellkeeper’s house"}]
    elif case.stage == "house":
        choices = [{"id": f"inspect:{key}", "label": item["location"], "detail": item["title"]} for key, item in records.items() if key not in case.discovered]
    elif case.stage == "interviews":
        choices = [
            {"id": f"ask:{seat_id}:{question}", "label": game.find_seat(seat_id).name,
             "detail": "Where were you when the scream sounded?" if question == "alibi" else "Explain the physical evidence."}
            for seat_id in witnesses for question in ("alibi", "evidence")
            if f"{seat_id}:{question}" not in case.interviews
        ]
        if all(any(key.startswith(f"{seat_id}:") for key in case.interviews) for seat_id in witnesses):
            choices += [{"id": "present:both", "label": "Present both clues", "detail": "Let the council hear the full physical record"},
                        {"id": "present:cloth", "label": "Present only the scarf", "detail": "Withhold the trail and key"},
                        {"id": "present:tracks", "label": "Present only the tracks", "detail": "Withhold the scarf"}]
    return {
        "stage": case.stage,
        "clues": [records[key] for key in case.discovered],
        "interviews": [{"name": game.find_seat(key.rsplit(":", 1)[0]).name, "question": key.rsplit(":", 1)[1], "text": answer} for key, answer in case.interviews.items()],
        "choices": choices,
        "questioned": len({key.rsplit(":", 1)[0] for key in case.interviews}),
    }


async def open_case(state: dict, config: RunnableConfig) -> dict:
    from app.game.nodes import _sync, _log_system
    game = state["game"]
    orch = _sync(config, game)
    if game.missing_villager is None:
        rng = random.Random(f"{game.session_id}:missing-villager")
        innocents = [p for p in game.players if p.controller == "ai" and p.role != "werewolf"]
        rng.shuffle(innocents)
        game.missing_villager = MissingVillagerCase(
            investigator=next(p.seat_id for p in game.players if p.controller == "human"),
            culprit=rng.choice([p.seat_id for p in game.players if p.role == "werewolf"]),
            framed=innocents[0].seat_id, witness=innocents[1].seat_id,
        )
        game.phase = "investigation"
        await _log_system(orch, "A scream cuts through the fog. The bellkeeper's door hangs open. His lantern is still warm. Investigate before the first council; someone in this village knows where he is.")
    return {"game": game}


async def investigate(state: dict, config: RunnableConfig) -> dict:
    from app.game.nodes import _sync, _log, _maybe_pause
    game = state["game"]
    orch = _sync(config, game)
    case = game.missing_villager
    view = investigation_view(game)
    turn_id = f"case:{case.revision}"
    allowed = [choice["id"] for choice in view["choices"]]
    answer = interrupt({"kind": "investigation", "seat_id": case.investigator, "turn_id": turn_id,
                        "prompt": "Night of the Missing Villager", "options": allowed, "investigation": view})
    action = answer.get("action")
    if action not in allowed or answer.get("turn_id") != turn_id:
        raise ValueError("Invalid or stale investigation action")
    message = None
    public = False
    if action == "enter":
        case.stage = "house"
        message = "Inside the bellkeeper's house: a chair on its side, a guttering lantern, and two traces that do not tell the same story."
    elif action.startswith("inspect:"):
        key = action.split(":", 1)[1]
        case.discovered.append(key)
        message = f"Physical evidence — {clues(game)[key]['title']}: {clues(game)[key]['text']}"
        if len(case.discovered) == 2:
            case.stage = "interviews"
    elif action.startswith("ask:"):
        seat_id, question = action[4:].rsplit(":", 1)
        text = testimony(game, seat_id, question)
        case.interviews[f"{seat_id}:{question}"] = text
        message = f"Private witness account (unverified) — {game.find_seat(seat_id).name}, {question}: {text}"
    else:
        selection = action.split(":", 1)[1]
        case.presented = ["cloth", "tracks"] if selection == "both" else [selection]
        case.stage = "complete"
        message = "Evidence presented at the first council by " + game.find_seat(case.investigator).name + ":\n" + "\n".join(clues(game)[key]["text"] for key in case.presented)
        message += "\nThe investigator also questioned three witnesses privately. Ask for their accounts; testimony is not a confirmed fact. The bellkeeper may still be alive."
        public = True
    case.revision += 1
    await _log(orch, type_="system", text=message, seat_id=case.investigator, private=not public)
    _maybe_pause(orch, game)
    return {"game": game}


async def consequence(state: dict, config: RunnableConfig) -> dict:
    from app.game.nodes import _sync, _log_system
    game = state["game"]
    orch = _sync(config, game)
    case = game.missing_villager
    if case is None or case.consequence is not None or game.round != 1:
        return {"game": game}
    culprit = game.find_seat(case.culprit)
    if not culprit.alive:
        case.consequence = "rescued"
        text = "At dusk, the search party finds the bellkeeper alive in the old mill. The cast-out wolf carried the matching key. Tonight he will watch the investigator's door: his warning prevents one attack on the investigator during Night 2. The other wolf is still among you."
    else:
        case.consequence = "missing"
        text = "At dusk, the search party reaches an empty mill. A rope has been cut and fresh tracks vanish into the forest. The bellkeeper is still missing. No one will be watching the investigator's door tonight. The next night follows the ordinary hunt rules."
    await _log_system(orch, text)
    return {"game": game}
