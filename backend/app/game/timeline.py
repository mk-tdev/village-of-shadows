"""Reconstructs a finished game's execution history from the checkpointer.

This is LangGraph's *time travel* put to use. Because every step of the graph
was checkpointed anyway — to make `interrupt()` durable (see
08-persistence-and-checkpointing.md) — the complete history of how a game ran
is already sitting in `village.db`. Nothing here records anything during play;
it all comes from `aget_state_history`, after the fact.

That distinction is the interesting part. The conventional way to build a
post-game report is to emit trace events as you go and store them somewhere:
a second write path, a schema for it, and the standing risk of the trace
disagreeing with reality. Here the trace *is* reality — the same checkpoints
the orchestrator would resume from.

Two histories get walked, because there are two graphs:

  * the main game graph, one thread per game — the stage-by-stage progression
  * each seat's mind, one thread per seat (see seat_mind.py) — how many turns
    that agent actually took and how much it ended up remembering

## What the checkpoint history can and cannot tell you

Reliable: the sequence of nodes, how many times each ran (which is how the
conditional self-edges show up concretely), the step count, and the wall-clock
gaps between steps.

**Not reliable: treating a snapshot's `values` as "the state before that
snapshot's `next` node ran."** Verified false in this codebase — the checkpoint
labelled `next=start_night` already contains `start_night`'s own log entry.
The cause is architectural: nodes here mutate one shared `GameState` in place
rather than returning fresh copies (deliberately — see nodes.py's `_sync` and
registry.py), so what lands in a given checkpoint depends on when it was
serialized relative to further mutation of that same object. It's deterministic,
not racy, but it is not a clean point-in-time snapshot.

So this module deliberately keeps the two apart: **graph mechanics** come from
the checkpoint history, and **the narrative of what happened** comes from the
game log, which is authoritative and ordered by `seq`. Mixing them would
produce a report that looks precise and mis-attributes actions to the wrong
node.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models import GameState

# Surfaced in the payload so a reader of the summary sees the same caveat the
# module docstring explains, rather than trusting a suspiciously tidy trace.
STATE_CAVEAT = (
    "Node order, counts and timing come from the checkpoint history. The "
    "per-step state is shown as it was checkpointed, which is not a clean "
    "before/after boundary: nodes mutate one shared GameState in place, so a "
    "checkpoint can already include the write of the node listed as next. "
    "The event narrative below is taken from the game log instead, which is "
    "ordered and authoritative."
)


def _parse(ts: Any) -> datetime | None:
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts)
        except ValueError:
            return None
    return None


def _describe_entry(entry: Any) -> str:
    """One line of narrative from an authoritative log entry."""
    who = entry.name
    if entry.type == "statement" and who:
        return f"{who} spoke"
    if entry.type == "vote" and who:
        return f"{who} voted for {entry.target}"
    if entry.type == "werewolf" and who:
        return f"{who} (werewolf) proposed attacking {entry.target}"
    if entry.type == "doctor" and who:
        return f"{who} (doctor) protected {entry.target}"
    if entry.type == "seer" and who:
        return f"{who} (seer) investigated {entry.target}"
    return entry.text or entry.type


async def _seat_memory(seat_mind: Any, session_id: str, seat_id: str) -> dict[str, int]:
    """Depth of one seat's remembered conversation, and how many checkpoints
    that thread accumulated.

    Checkpoints are *not* turns: each `ainvoke` of a mind writes several (its
    input, plus one per node it runs through), so a four-turn seat shows
    roughly seventeen. Turn counts come from the game log instead, where one
    entry really does mean one action."""
    from app.game.seat_mind import mind_config

    if seat_mind is None:
        return {"messages": 0, "checkpoints": 0}

    depth = 0
    count = 0
    try:
        async for snap in seat_mind.aget_state_history(mind_config(session_id, seat_id)):
            count += 1
            depth = max(depth, len((snap.values or {}).get("messages") or []))
    except Exception:  # noqa: BLE001 - a seat that never acted has no thread
        pass
    return {"messages": depth, "checkpoints": count}


async def build_timeline(graph: Any, seat_mind: Any, session_id: str) -> dict:
    """Walk both checkpoint histories and assemble the post-game report."""
    config = {"configurable": {"thread_id": session_id}}

    # aget_state_history yields newest-first; execution order is the reverse.
    snapshots = [s async for s in graph.aget_state_history(config)]
    snapshots.reverse()

    if not snapshots:
        # Normal for an abandoned game -- stop_game reclaims its threads on
        # purpose (see orchestrator.discard_checkpoints).
        return {"session_id": session_id, "available": False, "steps": [], "seats": [], "events": []}

    steps: list[dict] = []
    node_counts: dict[str, int] = {}
    first_at = _parse(snapshots[0].created_at)
    previous_at = first_at

    for snap in snapshots:
        metadata = snap.metadata or {}
        step = metadata.get("step")
        # step -1 is the initial input, before any node has run; it carries no
        # game state and would show up as a phantom first stage.
        if step is not None and step < 0:
            continue

        game: GameState | None = (snap.values or {}).get("game")
        node = snap.next[0] if snap.next else None
        at = _parse(snap.created_at)
        if node:
            node_counts[node] = node_counts.get(node, 0) + 1

        steps.append({
            "step": step,
            "next_node": node,
            "phase": game.phase if game else None,
            "round": game.round if game else None,
            "alive": len(game.alive_players()) if game else None,
            "log_count": len(game.log) if game else None,
            "at": at.isoformat() if at else None,
            "elapsed_ms": int((at - previous_at).total_seconds() * 1000) if at and previous_at else None,
            "checkpoint_id": snap.config.get("configurable", {}).get("checkpoint_id"),
            "source": metadata.get("source"),
        })
        previous_at = at or previous_at

    final: GameState | None = snapshots[-1].values.get("game")
    last_at = _parse(snapshots[-1].created_at)

    events: list[dict] = []
    if final is not None:
        for entry in final.log:
            events.append({
                "seq": entry.seq,
                "round": entry.round,
                "phase": entry.phase,
                "type": entry.type,
                "private": entry.private,
                "text": _describe_entry(entry),
            })

    ACTION_TYPES = {"statement", "vote", "werewolf", "doctor", "seer"}
    seats: list[dict] = []
    if final is not None:
        for player in final.players:
            memory = (
                {"messages": 0, "checkpoints": 0}
                if player.controller == "human"
                else await _seat_memory(seat_mind, session_id, player.seat_id)
            )
            seats.append({
                "seat_id": player.seat_id,
                "name": player.name,
                "role": player.role,
                "alive": player.alive,
                "controller": player.controller,
                "provider": player.provider,
                "model_name": player.model_name,
                "memory_messages": memory["messages"],
                "memory_checkpoints": memory["checkpoints"],
                # From the log, not the checkpoint count -- see _seat_memory.
                "turns": len([
                    e for e in final.log
                    if e.seat_id == player.seat_id and e.type in ACTION_TYPES
                ]),
            })

    phases: list[dict] = []
    for step in steps:
        label = f"{step['phase']}#{step['round']}"
        if not phases or phases[-1]["label"] != label:
            phases.append({"label": label, "phase": step["phase"],
                           "round": step["round"], "from_step": step["step"]})

    return {
        "session_id": session_id,
        "available": True,
        "caveat": STATE_CAVEAT,
        "winner": final.winner if final else None,
        "rounds": final.round if final else None,
        "phase": final.phase if final else None,
        "total_steps": len(steps),
        "started_at": first_at.isoformat() if first_at else None,
        "ended_at": last_at.isoformat() if last_at else None,
        "duration_ms": (
            int((last_at - first_at).total_seconds() * 1000) if first_at and last_at else None
        ),
        "node_counts": sorted(
            ({"node": n, "count": c} for n, c in node_counts.items()),
            key=lambda row: (-row["count"], row["node"]),
        ),
        "phases": phases,
        "steps": steps,
        "events": events,
        "seats": seats,
    }
