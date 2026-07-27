"""Graph wiring. Plan §5.

assign_roles -> start_night -> [night_wolves]* -> night_doctor -> night_seer
  -> resolve_night -> check_win -> END | start_day
start_day -> [day_discussion]* -> start_vote -> [voting]* -> resolve_vote
  -> check_win -> END | start_night (next round)

`[x]*` = conditional self-edge, one seat's turn per execution (see nodes.py
docstring for why this can't be a plain Python loop).
"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.game import nodes
from app.models import GameState


class GraphState(TypedDict):
    game: GameState


def _route_night_wolves(state: GraphState) -> str:
    game = state["game"]
    wolves_alive = len([p for p in game.players if p.role == "werewolf" and p.alive])
    return "night_wolves" if game.wolf_index < wolves_alive else "night_doctor"


def _route_day_discussion(state: GraphState) -> str:
    game = state["game"]
    return "day_discussion" if game.day_index < len(game.alive_players()) else "start_vote"


def _route_voting(state: GraphState) -> str:
    game = state["game"]
    return "voting" if game.vote_index < len(game.alive_players()) else "resolve_vote"


def _route_after_night_check(state: GraphState) -> str:
    return END if state["game"].winner else "start_day"


def _route_after_vote_check(state: GraphState) -> str:
    return END if state["game"].winner else "start_night"


def build_graph(checkpointer):
    builder = StateGraph(GraphState)

    builder.add_node("assign_roles", nodes.assign_roles)
    builder.add_node("start_night", nodes.start_night)
    builder.add_node("night_wolves", nodes.night_wolves)
    builder.add_node("night_doctor", nodes.night_doctor)
    builder.add_node("night_seer", nodes.night_seer)
    builder.add_node("resolve_night", nodes.resolve_night)
    builder.add_node("check_win_night", nodes.check_win)
    builder.add_node("start_day", nodes.start_day)
    builder.add_node("day_discussion", nodes.day_discussion)
    builder.add_node("start_vote", nodes.start_vote)
    builder.add_node("voting", nodes.voting)
    builder.add_node("resolve_vote", nodes.resolve_vote)
    builder.add_node("check_win_vote", nodes.check_win)

    builder.add_edge(START, "assign_roles")
    builder.add_edge("assign_roles", "start_night")
    builder.add_edge("start_night", "night_wolves")
    builder.add_conditional_edges("night_wolves", _route_night_wolves, ["night_wolves", "night_doctor"])
    builder.add_edge("night_doctor", "night_seer")
    builder.add_edge("night_seer", "resolve_night")
    builder.add_edge("resolve_night", "check_win_night")
    builder.add_conditional_edges("check_win_night", _route_after_night_check, [END, "start_day"])
    builder.add_edge("start_day", "day_discussion")
    builder.add_conditional_edges("day_discussion", _route_day_discussion, ["day_discussion", "start_vote"])
    builder.add_edge("start_vote", "voting")
    builder.add_conditional_edges("voting", _route_voting, ["voting", "resolve_vote"])
    builder.add_edge("resolve_vote", "check_win_vote")
    builder.add_conditional_edges("check_win_vote", _route_after_vote_check, [END, "start_night"])

    return builder.compile(checkpointer=checkpointer)
