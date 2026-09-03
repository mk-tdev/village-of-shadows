"""Read-only, game-scoped help for players during a live council."""

from __future__ import annotations

import re
import asyncio

from fastapi import APIRouter, HTTPException, Request
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.config import settings
from app.game import access, registry
from app.game.views import build_human_state_view

router = APIRouter(prefix="/games", tags=["guide"])


class GuideQuestion(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    seat_id: str
    access_token: str | None = None


ROLE_HELP = {
    "werewolf": "Werewolves privately coordinate one night target, then try to avoid being voted out during the day.",
    "seer": "The Seer may inspect one living player each night and learns that player's true role privately.",
    "doctor": "The Doctor may protect one living player each night, including themself, to stop that night's attack.",
    "villager": "Villagers have no night action. They learn through public discussion and vote together during the day.",
    "hunter": "When eliminated, the Hunter may choose one living player to take down before the game continues.",
    "mayor": "The Mayor participates normally, but their validated village vote counts twice.",
    "jester": "The Jester wins immediately if the village votes them out.",
}


def _is_game_question(message: str, names: list[str]) -> bool:
    words = set(re.findall(r"[a-z]+", message.lower()))
    game_words = {
        "game", "village", "werewolf", "wolf", "wolves", "role", "seer", "doctor", "villager",
        "hunter", "mayor", "jester", "night", "day", "dawn", "council", "vote", "voting",
        "player", "alive", "dead", "phase", "round", "turn", "action", "protect", "investigate",
        "accuse", "suspicion", "win", "winner", "rules", "happened", "transcript", "log",
    }
    return bool(words & game_words) or any(name.lower() in message.lower() for name in names)


def _answer(message: str, view: dict) -> str:
    """Answer only from the player-filtered game projection and static rules."""
    normalized = message.lower()
    players = view["players"]
    player_names = [player["name"] for player in players]
    if not _is_game_question(message, player_names):
        return "I can only help with this Village of Shadows game—its current state, visible events, roles, rules, and legal player actions."

    viewer = next((player for player in players if player["seat_id"] == view["access"]["seat_id"]), None)
    if any(word in normalized for word in {"my role", "my character", "what am i"}):
        if viewer and viewer.get("role"):
            return f"You are the {viewer['role']}. {ROLE_HELP.get(viewer['role'], 'Use the current prompt when the game asks you to act.')}"
        return "Your role has not been dealt yet, or it is not available in the current game view."

    mentioned_roles = [role for role in ROLE_HELP if role in normalized]
    if mentioned_roles:
        role = mentioned_roles[0]
        return ROLE_HELP[role]

    if any(word in normalized for word in {"status", "phase", "round", "turn", "active", "now"}):
        awaiting = view.get("awaiting")
        prompt = f" It is waiting for your {awaiting['kind'].replace('_', ' ')}." if awaiting else ""
        return f"The game is in round {view['round']}, phase {view['phase']}.{prompt}"

    if any(word in normalized for word in {"alive", "dead", "players", "who", "table"}):
        living = [player["name"] for player in players if player["alive"]]
        fallen = [player["name"] for player in players if not player["alive"]]
        answer = f"Alive: {', '.join(living) or 'nobody'}."
        if fallen:
            answer += f" Fallen: {', '.join(fallen)}."
        return answer

    if any(word in normalized for word in {"happened", "latest", "last", "event", "log", "said"}):
        visible = [entry for entry in view["log"] if entry.get("text")]
        if not visible:
            return "No visible game events have been recorded yet."
        recent = visible[-3:]
        return "Recent visible events: " + " ".join(entry["text"] for entry in recent)

    if any(word in normalized for word in {"can i", "legal", "action", "do i", "should i"}):
        awaiting = view.get("awaiting")
        if awaiting:
            return f"You currently have a legal {awaiting['kind'].replace('_', ' ')} action. Follow the prompt shown in the controls panel; the guide cannot submit it for you."
        return "There is no action waiting for you right now. The council will pause when your seat has a legal action."

    return "I can explain the current phase, roles, rules, visible events, living players, and your available action. Try asking about one of those."


def _guide_context(view: dict) -> dict:
    """A compact, player-filtered context window for the guide model.

    The browser projection is the privacy boundary; selecting only the recent
    visible transcript prevents a long game from becoming an unbounded model
    prompt. No graph state or tool is provided to this call.
    """
    return {
        "round": view["round"],
        "phase": view["phase"],
        "winner": view["winner"],
        "your_awaiting_action": view.get("awaiting"),
        "players": [
            {
                "name": player["name"],
                "alive": player["alive"],
                # This is already None for roles the current player is not
                # entitled to know. Do not ask the model to fill blanks in.
                "visible_role": player.get("role"),
            }
            for player in view["players"]
        ],
        "recent_visible_events": [
            {"round": entry["round"], "phase": entry["phase"], "type": entry["type"], "text": entry["text"]}
            for entry in view["log"][-18:]
        ],
    }


async def _answer_with_openai(message: str, view: dict) -> str:
    if not settings.openai_api_key:
        raise HTTPException(503, "Game Guide needs OPENAI_API_KEY configured on the backend.")
    from langchain_openai import ChatOpenAI

    model = ChatOpenAI(
        model=settings.game_guide_model,
        openai_api_key=settings.openai_api_key,
        use_responses_api=True,
        max_tokens=350,
    )
    instructions = """You are the read-only Village of Shadows Game Guide.
Answer only the player's question about this Werewolf game using the supplied
context and general role rules. Be concise and useful. Never make a game
action, recommend that an action was already submitted, call tools, or expose
or infer any role that is null/missing in the context. If a requested fact is
not visible in the context, say that the player cannot see it. Do not answer
questions unrelated to this game. Hidden reasoning is not available."""
    try:
        response = await asyncio.wait_for(
            model.ainvoke([
                SystemMessage(content=instructions),
                HumanMessage(content=(
                    f"Player question: {message}\n\n"
                    f"Permitted game context: {_guide_context(view)}"
                )),
            ]),
            timeout=25,
        )
    except TimeoutError:
        raise HTTPException(504, "The Game Guide timed out. Please try again.") from None
    except Exception as exc:  # Provider errors must not alter or expose game state.
        detail = str(exc).replace(settings.openai_api_key, "[redacted]") if settings.openai_api_key else str(exc)
        raise HTTPException(502, f"The Game Guide could not answer: {detail[:240]}") from None
    content = response.content
    if isinstance(content, str):
        return content.strip() or "The Game Guide did not return an answer."
    if isinstance(content, list):
        text = "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        ).strip()
        return text or "The Game Guide did not return an answer."
    return str(content).strip() or "The Game Guide did not return an answer."


@router.post("/{session_id}/guide")
async def game_guide(session_id: str, body: GuideQuestion, request: Request) -> dict:
    """Answer a game question without mutating graph state or calling a model."""
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "No active game is available for live guidance.") from None
    viewer = await access.authorize(
        request.app.state.db_conn,
        session_id,
        seat_id=body.seat_id,
        access_token=body.access_token,
    )
    if viewer is None or viewer.seat_id != body.seat_id:
        raise HTTPException(403, "This credential is not bound to that seat.")
    view = build_human_state_view(orch.state, seat_id=viewer.seat_id, host=False)
    question = body.message.strip()
    if not _is_game_question(question, [player["name"] for player in view["players"]]):
        return {"answer": "I can only help with this Village of Shadows game—its current state, visible events, roles, rules, and legal player actions."}
    return {"answer": await _answer_with_openai(question, view)}
