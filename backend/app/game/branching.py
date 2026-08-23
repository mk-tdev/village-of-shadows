"""Checkpoint-backed counterfactual game branches (FE-03)."""

from __future__ import annotations

import uuid
from typing import Any

from app import persistence
from app.game import registry
from app.game.orchestrator import GameOrchestrator
from app.game.seat_mind import mind_config
from app.models import AgentConfig, AwaitingInput, GameState


def _interrupt_payload(snapshot: Any) -> dict | None:
    for task in snapshot.tasks or ():
        for item in task.interrupts or ():
            value = getattr(item, "value", None)
            if isinstance(value, dict) and value.get("kind") not in {None, "paused"}:
                return value
    return None


async def branch_points(graph: Any, session_id: str) -> list[dict]:
    config = {"configurable": {"thread_id": session_id}}
    points: list[dict] = []
    async for snapshot in graph.aget_state_history(config):
        payload = _interrupt_payload(snapshot)
        game = (snapshot.values or {}).get("game")
        checkpoint_id = snapshot.config.get("configurable", {}).get("checkpoint_id")
        if payload is None or game is None or checkpoint_id is None:
            continue
        points.append({
            "checkpoint_id": checkpoint_id,
            "created_at": str(snapshot.created_at),
            "round": game.round,
            "phase": game.phase,
            "log_seq": game.log[-1].seq if game.log else -1,
            "log_count": len(game.log),
            "seat_id": payload["seat_id"],
            "kind": payload["kind"],
            "prompt": payload.get("prompt", ""),
            "options": payload.get("options", []),
        })
    points.sort(key=lambda point: (point["log_count"], point["created_at"]))
    return points


def _predecessor(game: GameState, awaiting: AwaitingInput) -> str:
    if awaiting.kind == "werewolf_negotiation":
        return "start_night" if game.wolf_index == 0 else "werewolf_negotiation"
    if awaiting.kind == "statement":
        return "select_village_event" if game.day_index == 0 else "day_discussion"
    if awaiting.kind == "vote":
        return "start_vote" if game.vote_index == 0 else "voting"
    if awaiting.kind == "hunter_action":
        return "resolve_night" if game.phase == "night" else "resolve_vote"
    player = game.find_seat(awaiting.seat_id)
    if player.role == "doctor":
        return "resolve_wolf_plan"
    if player.role == "seer":
        return "night_doctor"
    return "start_night"


async def _snapshot_for(graph: Any, session_id: str, checkpoint_id: str) -> Any:
    config = {"configurable": {"thread_id": session_id}}
    async for snapshot in graph.aget_state_history(config):
        if snapshot.config.get("configurable", {}).get("checkpoint_id") == checkpoint_id:
            return snapshot
    raise KeyError(checkpoint_id)


async def _clone_minds(
    seat_mind: Any,
    parent_id: str,
    child_id: str,
    players: list[Any],
    branch_created_at: str,
) -> None:
    for player in players:
        if player.controller == "human":
            continue
        source = None
        async for snapshot in seat_mind.aget_state_history(mind_config(parent_id, player.seat_id)):
            if str(snapshot.created_at) <= branch_created_at:
                source = snapshot
                break
        if source is None:
            continue
        values = dict(source.values or {})
        keep = {
            key: values[key]
            for key in ("messages", "last_turn_stamp", "commit_args", "result")
            if key in values
        }
        if keep:
            await seat_mind.aupdate_state(
                mind_config(child_id, player.seat_id), keep, as_node="deliberate",
            )


async def create_branch(
    *,
    graph: Any,
    seat_mind: Any,
    conn: Any,
    parent_session_id: str,
    checkpoint_id: str,
    replacement: dict,
) -> GameOrchestrator:
    snapshot = await _snapshot_for(graph, parent_session_id, checkpoint_id)
    payload = _interrupt_payload(snapshot)
    source: GameState | None = (snapshot.values or {}).get("game")
    if payload is None or source is None:
        raise ValueError("The selected checkpoint is not a playable human decision.")

    awaiting = AwaitingInput(**payload)
    child_id = str(uuid.uuid4())
    child_state = source.model_copy(deep=True)
    child_state.session_id = child_id
    child_state.awaiting = awaiting
    child_state.paused = False

    configs = [
        AgentConfig(
            seat_id=player.seat_id,
            display_name=player.name,
            personality=player.personality,
            controller=player.controller,
            provider=player.provider,
            model_name=player.model_name,
            endpoint=player.endpoint,
            behavior=player.behavior,
            resilience=player.resilience,
        )
        for player in child_state.players
    ]
    await persistence.create_game(conn, child_id, configs, child_state.options)
    for player in child_state.players:
        if player.role:
            await persistence.set_seat_role(conn, child_id, player.seat_id, player.role)
    branch_seq = child_state.log[-1].seq if child_state.log else -1
    await persistence.clone_history_prefix(
        conn,
        parent_game_id=parent_session_id,
        child_game_id=child_id,
        through_seq=branch_seq,
    )
    await persistence.create_branch_record(
        conn,
        child_game_id=child_id,
        parent_game_id=parent_session_id,
        checkpoint_id=checkpoint_id,
        branch_log_seq=branch_seq,
        replaced_seat_id=awaiting.seat_id,
        replaced_kind=awaiting.kind,
        replacement=replacement,
    )
    await _clone_minds(
        seat_mind, parent_session_id, child_id, child_state.players, str(snapshot.created_at),
    )

    orch = GameOrchestrator(child_id, child_state, conn, graph, seat_mind)
    registry.register(orch)
    predecessor = _predecessor(child_state, awaiting)
    await graph.aupdate_state(orch.config, {"game": child_state}, as_node=predecessor)
    orch.started = True
    # Re-enter the selected node so LangGraph creates a real interrupt in the
    # child thread, then replace that decision through the normal resume path.
    await orch._run(None)
    if orch.state.awaiting is None:
        raise RuntimeError("The cloned branch did not restore its human interrupt.")
    if orch.state.awaiting.seat_id != awaiting.seat_id or orch.state.awaiting.kind != awaiting.kind:
        raise RuntimeError("The cloned branch restored a different human decision.")
    orch.resume(replacement)
    return orch
