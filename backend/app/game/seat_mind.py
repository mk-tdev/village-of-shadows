"""One seat's mind: a LangGraph subgraph holding that seat's own continuous
conversation for the entire game.

## Why this exists

Before this, every AI turn was stateless. `run_agent_turn` built
`[SystemMessage(persona), HumanMessage(prompt)]` from scratch, ran a tool
loop, and threw the conversation away when the function returned. An agent
had no idea what it had done thirty seconds earlier: a seer re-learned
nothing from its own past investigations, a werewolf couldn't stay consistent
with accusations it had made itself, and nobody could notice they'd been
wrong. Every round was an independent execution by a stranger wearing the
same name.

A human player obviously doesn't work that way — they remember the whole game
and play accordingly. So each seat now gets a *persistent* agent: one
conversation, created when roles are assigned, appended to on every one of
that seat's turns, alive until the game ends.

## How the persistence actually works

Each seat's mind is the **same compiled subgraph** invoked under its **own
`thread_id`** (`"{session_id}:{seat_id}"`), sharing the very same
`AsyncSqliteSaver` the main game graph already uses for interrupt/resume
(see main.py, 08-persistence-and-checkpointing.md). LangGraph restores that
thread's `messages` on every invocation and persists whatever the turn adds,
so "memory" is not a new mechanism this project invented — it's the
checkpointer already in the stack, scoped per seat instead of per game.

A distinct `thread_id` per seat, rather than one thread with a per-seat
`checkpoint_ns`: `checkpoint_ns` is primarily how LangGraph namespaces a
subgraph *nested inside a parent node*, and the seat occupying a given node
here changes on every execution (`night_wolves` runs once per wolf via a
conditional self-edge — see graph.py), so there is no stable node position to
hang a namespace off. "Different conversation = different thread" is both
simpler and the better-supported path for invoking a graph standalone.

Compiled once at startup and shared by all seats: separate compiled copies
per seat would buy nothing, because memory isolation comes from the thread
id, not from having distinct graph objects.

## The division of responsibility

The main graph stays completely authoritative over the *game* — turn order,
who is alive, roles, votes, deaths, win conditions, phase transitions,
persistence, SSE. A mind never reads `GameState`; it only ever sees what the
orchestrator hands it, which is filtered through `build_agent_view`
(views.py, the partial-observability boundary). That is what structurally
stops a werewolf's mind from seeing the seer's knowledge, rather than trusting
prompt wording to hide it.

And because a mind already remembers its own turns, the orchestrator sends
only the *delta* since that seat last acted, never a restatement of history.
That is both cheaper and closer to how a real player experiences a game: you
remember your own play, and you get told what just happened.
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.game import registry
from app.game.agent_turn import run_turn_with_history


class MindState(TypedDict, total=False):
    """`messages` is the seat's memory and the only key that accumulates --
    everything else is per-invocation input or output, overwritten each turn.

    `last_turn_stamp` exists purely to make a turn idempotent; see
    `_ingest` for the replay it defends against."""

    messages: Annotated[list[AnyMessage], add_messages]
    persona: str
    briefing: str
    turn_stamp: str
    phase: str
    commit_tool: str
    fallback: dict[str, Any]
    result: dict[str, Any] | None
    last_turn_stamp: str | None
    replayed: bool


def _ingest(state: MindState, config: RunnableConfig) -> dict[str, Any]:
    """Seeds the persona exactly once, appends this turn's briefing, and
    detects a replayed turn.

    **The replay this guards against is real, and subtle.** `_maybe_pause`
    runs at the *end* of every node in nodes.py, so the order inside an AI
    node is: invoke this mind, apply its decision, then possibly
    `interrupt()` for a pause. When the game continues, LangGraph re-runs that
    node from the top (see 03-human-in-the-loop-interrupt.md and 07's
    interrupt-ordering pitfall) -- which would invoke this mind a *second*
    time for the same turn.

    The main graph's own `GameState` survives that unharmed, because it gets
    rolled back to the pre-node checkpoint and simply recomputed. A seat's
    memory does not: it lives in a *different* checkpoint thread that the main
    graph's rollback knows nothing about, so the second invocation would
    append a duplicate exchange and permanently corrupt that agent's history
    of its own play. Stamping each turn with `(round, phase, seat's turn
    index)` -- all values that *are* rolled back, so they come back identical
    on a replay -- lets the mind recognise "I have already lived this turn"
    and hand back the decision it made the first time instead of reliving it.
    """
    stamp = state.get("turn_stamp")
    if stamp is not None and stamp == state.get("last_turn_stamp"):
        return {"replayed": True}

    updates: dict[str, Any] = {"replayed": False, "last_turn_stamp": stamp}
    new_messages: list[AnyMessage] = []

    # The persona is static for the whole game (a seat's role never changes),
    # so it belongs at the head of the conversation once -- re-sending it every
    # turn would stack duplicate system messages as the game went on.
    if not state.get("messages"):
        persona = state.get("persona")
        if persona:
            new_messages.append(SystemMessage(content=persona))

    briefing = state.get("briefing")
    if briefing:
        new_messages.append(HumanMessage(content=briefing))

    if new_messages:
        updates["messages"] = new_messages
    return updates


def _route_after_ingest(state: MindState) -> str:
    return END if state.get("replayed") else "deliberate"


async def _deliberate(state: MindState, config: RunnableConfig) -> dict[str, Any]:
    """Runs the actual turn: the model (or the mock stand-in) in a tool-calling
    loop against a freshly-bound MCP session, continuing this seat's remembered
    conversation rather than starting a new one.

    The orchestrator and player are looked up from the registry via
    `session_id`/`seat_id` in `config` rather than passed through graph state,
    for the same reason nodes.py's `_sync` does it: a live orchestrator holds
    an open DB connection and SSE subscriber queues, none of which can be
    serialized into a checkpoint."""
    session_id = config["configurable"]["session_id"]
    seat_id = config["configurable"]["seat_id"]
    orch = registry.get(session_id)
    player = orch.state.find_seat(seat_id)

    result, appended = await run_turn_with_history(
        orch, player,
        phase=state.get("phase", orch.state.phase),
        history=list(state.get("messages") or []),
        commit_tool_name=state["commit_tool"],
        fallback=state.get("fallback") or {},
    )
    return {"result": result, "messages": appended}


def build_seat_mind(checkpointer):
    """Compiled once at startup and shared by every seat -- see the module
    docstring on why per-seat compiled copies would be pointless."""
    builder = StateGraph(MindState)
    builder.add_node("ingest", _ingest)
    builder.add_node("deliberate", _deliberate)
    builder.add_edge(START, "ingest")
    builder.add_conditional_edges("ingest", _route_after_ingest, [END, "deliberate"])
    builder.add_edge("deliberate", END)
    return builder.compile(checkpointer=checkpointer)


def mind_config(session_id: str, seat_id: str) -> dict[str, Any]:
    """The config that selects *this seat's* memory. The `thread_id` is what
    makes each seat's conversation independent, and deliberately does not
    collide with the main game graph's own `thread_id` (the bare
    `session_id`)."""
    return {
        "configurable": {
            "thread_id": f"{session_id}:{seat_id}",
            "session_id": session_id,
            "seat_id": seat_id,
        }
    }


async def run_seat_turn(
    orch,
    player,
    *,
    phase: str,
    briefing: str,
    turn_stamp: str,
    commit_tool: str,
    fallback: dict[str, Any],
) -> dict[str, Any]:
    """Take one turn as `player`, continuing that seat's game-long
    conversation. Returns the committed decision dict, exactly like the
    stateless `run_agent_turn` this replaced, so the call sites in nodes.py
    changed only in what they pass, not in what they get back."""
    mind = orch.seat_mind
    if mind is None:
        raise RuntimeError(
            "This orchestrator has no seat_mind, so AI seats have nowhere to "
            "remember their turns. Build one with build_seat_mind(checkpointer) "
            "and pass it to GameOrchestrator (see main.py)."
        )
    state = await mind.ainvoke(
        {
            "persona": _persona_for(orch, player),
            "briefing": briefing,
            "turn_stamp": turn_stamp,
            "phase": phase,
            "commit_tool": commit_tool,
            "fallback": fallback,
        },
        config=mind_config(orch.session_id, player.seat_id),
    )
    return state.get("result") or {}


def _persona_for(orch, player) -> str:
    # Imported lazily: nodes.py imports this module, so a module-level import
    # of nodes here would be circular.
    from app.game.nodes import _persona

    return _persona(player, orch.state)


async def remember(orch, seat_id: str, note: str) -> None:
    """Append something to a seat's memory **without** invoking its model.

    Used for outcome deltas -- "the village cast out Bram; he was a villager"
    -- pushed to every surviving seat after `resolve_night`/`resolve_vote`.
    Seven extra model calls per round purely to "reflect" would be expensive
    and worse: writing the outcome straight into each conversation means every
    seat simply *knows* it next time it reasons, which is exactly what a human
    player carries between rounds. This is what turns memory from "stays
    consistent" into "notices it was wrong."
    """
    mind = orch.seat_mind
    await mind.aupdate_state(
        mind_config(orch.session_id, seat_id),
        {"messages": [HumanMessage(content=note)]},
    )
