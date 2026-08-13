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
import json
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


async def _seat_memory(seat_mind: Any, session_id: str, seat_id: str) -> dict[str, Any]:
    """Depth of one seat's remembered conversation, and how many checkpoints
    that thread accumulated.

    Checkpoints are *not* turns: each `ainvoke` of a mind writes several (its
    input, plus one per node it runs through), so a four-turn seat shows
    roughly seventeen. Turn counts come from the game log instead, where one
    entry really does mean one action."""
    from app.game.seat_mind import mind_config

    if seat_mind is None:
        return {"messages": 0, "checkpoints": 0, "progression": []}

    depth = 0
    snapshots: list[Any] = []
    try:
        async for snap in seat_mind.aget_state_history(mind_config(session_id, seat_id)):
            snapshots.append(snap)
    except Exception:  # noqa: BLE001 - a seat that never acted has no thread
        pass

    # Histories arrive newest-first. Keep only changes in depth so the learner
    # sees memory grow per turn, rather than a noisy line for every internal
    # node checkpoint in the seat-mind subgraph.
    progression: list[dict[str, int]] = []
    for snap in reversed(snapshots):
        messages = len((snap.values or {}).get("messages") or [])
        depth = max(depth, messages)
        if not progression or progression[-1]["messages"] != messages:
            progression.append({"stage": len(progression) + 1, "messages": messages})

    return {"messages": depth, "checkpoints": len(snapshots), "progression": progression}


def _tool_calls(decision: dict) -> list[dict]:
    raw = decision.get("tool_calls")
    if isinstance(raw, list):
        return raw
    if not isinstance(raw, str) or not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    return parsed if isinstance(parsed, list) else []


def _tool_status(tool: str, result: Any) -> str:
    """Classify calls without pretending every read tool is a game action."""
    if not tool.startswith("submit_"):
        return "read"
    if isinstance(result, dict) and result.get("ok") is True:
        return "accepted"
    return "rejected"


def _action_summary(tool: str, args: Any) -> str:
    args = args if isinstance(args, dict) else {}
    if tool == "submit_statement":
        text = str(args.get("text") or "spoke")
        return text if len(text) <= 110 else f"{text[:107]}..."
    if tool in {"submit_vote", "submit_night_action"}:
        return f"targeted {args.get('target') or 'no target'}"
    if tool == "write_note":
        return "updated private notes"
    return tool.replace("_", " ")


def _build_learning_debrief(final: GameState, seats: list[dict], decisions: list[dict]) -> dict:
    """Turn the technical trace into evidence for a closed learning loop.

    This deliberately reports observable behavior (actions, tool results,
    memory depth, and information boundaries), not hidden chain-of-thought.
    """
    by_id = {player.seat_id: player for player in final.players}
    public_events = [entry for entry in final.log if not entry.private]
    private_events = [entry for entry in final.log if entry.private]
    human = next((player for player in final.players if player.controller == "human"), None)
    action_types = {"statement", "vote", "werewolf", "doctor", "seer"}

    human_interrupts: list[dict] = []
    if human is not None:
        for entry in final.log:
            if entry.seat_id != human.seat_id or entry.type not in action_types:
                continue
            kind = "statement" if entry.type == "statement" else "vote" if entry.type == "vote" else "night_action"
            human_interrupts.append({
                "seq": entry.seq,
                "round": entry.round,
                "phase": entry.phase,
                "kind": kind,
                "action": _describe_entry(entry),
            })

    calls: list[dict] = []
    commit_by_stage: dict[tuple[int, str], list[dict]] = {}
    for decision in decisions:
        player = by_id.get(decision.get("seat_id"))
        for call in _tool_calls(decision):
            tool = str(call.get("tool") or "unknown_tool")
            status = _tool_status(tool, call.get("result"))
            row = {
                "seat_id": decision.get("seat_id"),
                "name": player.name if player else decision.get("seat_id"),
                "provider": decision.get("provider"),
                "model_name": decision.get("model_name"),
                "round": decision.get("round"),
                "phase": decision.get("phase"),
                "tool": tool,
                "status": status,
                "summary": _action_summary(tool, call.get("args")),
            }
            calls.append(row)
            if tool.startswith("submit_"):
                key = (int(decision.get("round") or 0), str(decision.get("phase") or "unknown"))
                commit_by_stage.setdefault(key, []).append(row)

    comparisons = []
    for (round_number, phase), rows in commit_by_stage.items():
        if len(rows) < 2:
            continue
        comparisons.append({
            "round": round_number,
            "phase": phase,
            "context": (
                "These seats acted in the same round and phase. They shared the public conversation, "
                "while role-specific context and turn order could still differ."
            ),
            "decisions": rows,
        })

    memory = []
    for seat in seats:
        if seat["controller"] == "human":
            continue
        progression = seat.get("memory_progression") or []
        first = next((point["messages"] for point in progression if point["messages"] > 0), 0)
        memory.append({
            "seat_id": seat["seat_id"],
            "name": seat["name"],
            "model_name": seat.get("model_name"),
            "start_messages": first,
            "end_messages": seat["memory_messages"],
            "growth": max(0, seat["memory_messages"] - first),
            "progression": progression,
        })

    accepted = sum(call["status"] == "accepted" for call in calls)
    rejected = sum(call["status"] == "rejected" for call in calls)
    read_calls = sum(call["status"] == "read" for call in calls)
    total_growth = sum(item["growth"] for item in memory)

    concept_evidence = [
        {
            "concept": "Human in the loop",
            "evidence": (
                f"Execution suspended for {len(human_interrupts)} human turn(s); each response re-entered the same rule boundary used by agents."
            ),
        },
        {
            "concept": "Partial observability",
            "evidence": (
                f"The shared transcript contained {len(public_events)} public event(s), while {len(private_events)} event(s) stayed role-private."
            ),
        },
        {
            "concept": "Validated tool use",
            "evidence": (
                f"Models made {len(calls)} recorded tool call(s): {accepted} accepted committed action(s), {read_calls} context/memory read(s), and {rejected} rejected action(s). "
                f"Human actions also passed through the same validation functions ({len(human_interrupts)} completed)."
            ),
        },
        {
            "concept": "Persistent independent memory",
            "evidence": (
                f"{len(memory)} seat-mind thread(s) accumulated {total_growth} messages beyond their initial remembered context without sharing a global history."
            ),
        },
        {
            "concept": "Emergent multi-agent behavior",
            "evidence": (
                f"The game produced {len(comparisons)} comparable multi-seat decision stage(s) across {final.round} round(s), ending with {final.winner}."
            ),
        },
    ]

    return {
        "human_interrupts": human_interrupts,
        "partial_observability": {
            "public_events": len(public_events),
            "private_events": len(private_events),
            "seer_discoveries": sum(len(knowledge) for knowledge in final.seer_knowledge.values()),
            "explanation": (
                "Every seat received the public transcript plus only its role-authorized private context. "
                "God Mode reveals those boundaries after the fact; it never changes what agents were allowed to see."
            ),
        },
        "tool_calls": calls,
        "tool_totals": {
            "all": len(calls),
            "accepted": accepted,
            "rejected": rejected,
            "reads": read_calls,
        },
        "memories": memory,
        "comparisons": comparisons,
        "concept_evidence": concept_evidence,
        "next_experiments": [
            "Keep every setting fixed and change one model. Predict which accusation or vote will change.",
            "Use one model in every AI seat, then vary only personalities to isolate persona effects.",
            "Replay with God Mode off, record your trust ranking, then compare it with the revealed private trace.",
            "Compare memory growth and tool choices between a short game and a game that survives more rounds.",
        ],
    }


async def build_timeline(graph: Any, seat_mind: Any, session_id: str, conn: Any | None = None) -> dict:
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
                {"messages": 0, "checkpoints": 0, "progression": []}
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
                "memory_progression": memory["progression"],
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

    decisions: list[dict] = []
    if conn is not None:
        from app import persistence

        decisions = await persistence.get_decisions(conn, session_id)

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
        "learning_debrief": _build_learning_debrief(final, seats, decisions) if final else None,
    }
