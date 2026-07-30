# 12. Giving each agent a memory: one subgraph per seat

**Files:** [`backend/app/game/seat_mind.py`](../../backend/app/game/seat_mind.py),
[`backend/app/game/nodes.py`](../../backend/app/game/nodes.py),
[`backend/app/game/agent_turn.py`](../../backend/app/game/agent_turn.py),
[`backend/app/main.py`](../../backend/app/main.py)

Read [02](02-langgraph-state-machine.md), [04](04-partial-observability-agent-view.md),
and [08](08-persistence-and-checkpointing.md) first. This doc builds directly
on all three: it adds a second *kind* of graph to the system, and its whole
mechanism is the checkpointer from 08 pointed at a different scope.

## The problem: seven agents with amnesia

Every AI turn used to be completely stateless. `run_agent_turn` built a
two-message conversation from scratch, ran the tool loop, and discarded it:

```python
messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
```

That list was a local variable. Nothing returned it, nothing stored it, and
the next time the same seat acted it started again from nothing. The
consequences were not subtle once you looked for them:

- The **seer** investigated someone each night and learned their role — and
  then had no memory of it. `seer_knowledge` was written to `GameState`
  (actions.py) but never read back into any prompt, so the seer's one
  advantage in the entire game was recorded for the *frontend's* benefit and
  hidden from the agent that earned it.
- A **werewolf** could accuse someone on day 1 and defend them on day 2, with
  no sense of contradiction, because it had never heard of day 1.
- **Nobody could ever be wrong**, because nobody remembered a prediction long
  enough to see it fail.

The only history any agent received was `_round_transcript`, which collected
statements from *the current round only* — so even the shared public
conversation reset every round. Each round was, in effect, played by seven
strangers who happened to have the same names as last round's players.

A human obviously doesn't play that way. You remember the whole game, and
almost all of your skill lives in that memory. So the goal here is the
straightforward one: give each seat a persistent agent whose conversation
spans the entire game.

## The mechanism: same subgraph, one thread per seat

Each seat's "mind" is a small compiled `StateGraph` whose state is, mostly,
the seat's message history:

```python
class MindState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    ...
    last_turn_stamp: str | None
```
([seat_mind.py:71-87](../../backend/app/game/seat_mind.py#L71-L87))

`messages` is the only key with a reducer, so it's the only key that
*accumulates*; everything else is per-invocation input or output, overwritten
each turn. Memory then comes entirely from where that state is stored:

```python
return {
    "configurable": {
        "thread_id": f"{session_id}:{seat_id}",
        ...
    }
}
```
([seat_mind.py:229-235](../../backend/app/game/seat_mind.py#L229-L235))

The mind is compiled **once** at startup, sharing the very same
`AsyncSqliteSaver` the main game graph already uses for interrupt/resume:

```python
app.state.graph = build_graph(checkpointer)
app.state.seat_mind = build_seat_mind(checkpointer)
```
([main.py:24-29](../../backend/app/main.py#L24-L29))

So "agent memory" is not a new subsystem. It's the checkpointer from
[08](08-persistence-and-checkpointing.md), scoped per *seat* instead of per
*game*. LangGraph restores that thread's `messages` on every invocation and
persists whatever the turn appends, in the same `village.db` as everything
else. Seven conversations, one store, separated by thread id.

**Two design choices worth being explicit about**, because the obvious
alternatives look equivalent and aren't:

*Why a distinct `thread_id` rather than a per-seat `checkpoint_ns`.*
`checkpoint_ns` is primarily how LangGraph namespaces a subgraph **nested
inside a parent node** via `add_node`. That doesn't fit here: `night_wolves`
runs once per wolf through a conditional self-edge (see
[graph.py](../../backend/app/game/graph.py) and
[02](02-langgraph-state-machine.md)), so the seat occupying any given node
position changes on every execution — there is no stable position to hang a
namespace off. "Different conversation = different thread" is both simpler and
the better-supported path for invoking a graph standalone.

*Why one compiled graph shared by all seats, not seven copies.* Memory
isolation comes from the thread id, not from having distinct graph objects.
Compiling seven identical graphs and giving them seven threads produces
exactly the same behavior as compiling one and giving it seven threads — at
seven times the cost, per game. If you find yourself building N copies of an
identical agent graph to get N memories, the copies aren't what's giving you
the memories.

## Who knows what: the orchestrator stays in charge

The main graph remains completely authoritative over the *game*: turn order,
who's alive, roles, votes, deaths, win conditions, phase transitions,
persistence, SSE. Nothing about that changed. What's new is a second
responsibility — deciding what each mind is allowed to learn.

Nothing a mind is *told* comes from `GameState` directly. It only ever sees a
briefing the orchestrator hands it, and that briefing is built through
`build_agent_view` ([04](04-partial-observability-agent-view.md)):

(To be precise about the boundary, since it's easy to overstate: a mind's
*execution* does reach `GameState` — `_deliberate` looks its player up on
`orch.state`, and a committed tool call mutates it through `actions.py`. What
the boundary guarantees is narrower and is the part that matters: no game
information reaches a model's context except through `build_agent_view`.)

```python
view = build_agent_view(game, seat.seat_id)
cursor = game.seat_log_cursor.get(seat.seat_id, 0)
fresh = [
    e for e in view["public_transcript"]
    if e.get("seq", 0) >= cursor
    and not (e.get("seat_id") == seat.seat_id and e.get("type") in ("statement", "vote"))
]
game.seat_log_cursor[seat.seat_id] = game.next_seq()
```
([nodes.py:95-127](../../backend/app/game/nodes.py#L95-L127))

This is a nice side effect of the change: `build_agent_view` used to be
reachable only as an *optional* MCP tool (`get_my_private_context`) that a
model might or might not bother to call. It's now the enforced input contract
for every AI turn. A werewolf's mind physically cannot be handed the seer's
knowledge, because the only path into it goes through the function that
filters by role.

**The briefing is a delta, never a recap.** Because a mind already remembers
its own role, its own past actions, and every previous briefing, restating any
of that would be paying tokens to tell an agent what it already knows. What it
genuinely can't know is what happened while it wasn't acting — so that, plus
the current legal options, is all it gets. The filter above also drops the
seat's *own* statements and votes, since those are already in its conversation
as its own tool calls.

The read cursor lives in `GameState`
([models.py:103](../../backend/app/models.py#L103)) rather than in the mind,
specifically so it's checkpointed and rolled back with the rest of the game —
see the pitfall below for why that matters.

What one seat actually remembers, from a real (mock-provider) game:

```
[system] You are Bram... Your secret role is: seer... Each night you secretly
         learn one player's true role.
[human ] Since your last turn:
           - Seven villagers gather as the sun sets...
           - Night 1 falls over the village. The werewolves wake first…
         Still alive: Mara, Tomas, Elin, Bram, Sable, Corvin, Petra.
         It is night 1. Choose one player to secretly investigate...
[ai    ] called submit_night_action with {"target": "Petra", "role": "villager"}
[human ] Since your last turn:
           - Dawn breaks. The village finds Petra dead. They were a villager.
           - Day 1 discussion begins.
           - Mara said: "..."
         Still alive: Mara, Tomas, Elin, Bram, Sable, Corvin.
         You have secretly confirmed: Petra is a villager.
         It is day 1. Give a short in-character spoken statement...
[ai    ] called submit_statement with {"ok": true}
...
[human ] The werewolves have taken the village. Werewolves win!
```

Note what that seer now has that it structurally could not have before: its
own investigation result, carried forward under its own account of making it.

## Reflection, without paying for it

Memory alone makes an agent *consistent*. What makes it adapt is noticing
outcomes — "I voted for Bram, Bram was a villager, my read was wrong."

The tempting way to build that is a reflection step that calls the model after
each round to write a belief update. That's seven extra API calls per round for
something you can get for free: the outcome is *already* a log entry, so the
delta briefing carries it into each seat's next turn automatically, and the
model reasons over it when it next thinks. No extra call, and — because the
cursor is checkpointed — no extra idempotency problem either.

The one case the briefing can't cover is the end of the game, since nobody
gets another turn:

```python
if orch.seat_mind is not None:
    for player in game.players:
        if player.controller == "ai":
            await remember(orch, player.seat_id, text)
```
([nodes.py:534-541](../../backend/app/game/nodes.py#L534-L541))

`remember` appends straight into a seat's conversation with `aupdate_state` and
**no model invocation**
([seat_mind.py:234-249](../../backend/app/game/seat_mind.py#L234-L249)), so
every agent's remembered game ends with how it actually turned out instead of
stopping mid-round. That's mostly for whoever inspects a finished game later,
but it's the same mechanism a richer reflection pass would use.

## The pitfall: a pause would have corrupted every agent's memory

This one is worth understanding in detail, because it's a genuinely new failure
mode created by adding a second checkpoint scope — and it's invisible until
someone pauses a game.

`_maybe_pause` runs at the **end** of every node
([07](07-pausing-with-interrupt.md)). So the order inside an AI node is:

1. invoke the seat's mind → it appends this turn to its conversation
2. apply the resulting decision to `GameState`
3. `_maybe_pause` → `interrupt()`, if a pause was requested

When the game continues, LangGraph re-runs that node **from the top**
([03](03-human-in-the-loop-interrupt.md)). Step 1 therefore happens *again*
for the same turn.

For `GameState` that's harmless, and has always been: it gets rolled back to
the pre-node checkpoint and recomputed, so a re-run produces the same result.
**A seat's memory is not rolled back**, because it lives in a different
checkpoint thread that the main graph's rollback knows nothing about. The
second invocation would append a duplicate exchange — and permanently corrupt
that agent's record of its own play, in a way no amount of replaying would
clean up.

The fix is turn-level idempotency. Every turn is stamped with values that
*are* part of the rolled-back `GameState`, so a replay reconstructs an
identical stamp:

```python
def _turn_stamp(game: GameState, phase: str, index: int) -> str:
    return f"{game.round}:{phase}:{index}"
```
([nodes.py:76-83](../../backend/app/game/nodes.py#L76-L83))

and the mind's first node compares it against the last one it saw:

```python
stamp = state.get("turn_stamp")
if stamp is not None and stamp == state.get("last_turn_stamp"):
    return {"replayed": True}
```
([seat_mind.py:124-126](../../backend/app/game/seat_mind.py#L124-L126))

A replayed turn takes the other branch out of `ingest`
([seat_mind.py:148-149](../../backend/app/game/seat_mind.py#L148-L149)) instead
of living the turn twice.

### The half-fix that made it worse, and the actual fix

The first version of that branch routed a replay straight to `END` and returned
the cached `result`. That protected memory and introduced a *second*, worse bug:
**the game action was never re-applied.**

The two rollbacks are asymmetric in both directions, and only one direction was
being handled. Memory must not be written twice — but `GameState` **was** rolled
back, so the vote or statement applied on the first attempt is genuinely gone
and has to land again. Measured, by pausing at the end of a real `voting` node:

```
UNPAUSED  round 1: 7 votes  ['Mara','Tomas','Elin','Bram','Sable','Corvin','Petra']
PAUSED    round 1: 5 votes  ['Tomas','Elin','Bram','Corvin','Petra']   <- Mara's vote gone
```

Silently. No error, no warning — a seat simply didn't vote, because the guard
told the node "already handled" and the node discards the return value anyway.

The fix is a third node, `_reapply`
([seat_mind.py:152-181](../../backend/app/game/seat_mind.py#L152-L181)), which
re-performs the action from the arguments the agent committed the first time,
with no model call:

```python
args = state.get("commit_args")
...
result = await apply_commit(orch, player, state["commit_tool"], args)
```

Re-applying from stored arguments rather than re-asking the model matters twice
over: it costs no API call, and it keeps the game consistent with what the agent
*remembers* deciding. Note that the cached `result` alone was not enough to do
this — `apply_statement` returns a bare `{"ok": True}` with the spoken text
nowhere in it — which is why `commit_args` is threaded back out of
`run_turn_with_history` alongside it.

**The generalised lesson, sharper than the first one:** when state lives in two
scopes with different rollback behaviour, an idempotency guard has to be applied
*per effect*, not per turn. "Has this already happened?" had two different
correct answers here — yes for the memory write, no for the game action — and a
single boolean covering the whole turn was guaranteed to get one of them wrong.

Two smaller consequences of the same rollback asymmetry, both now handled:
`record_log_entry` dedupes on `(game_id, seq)`
([persistence.py:51-84](../../backend/app/persistence.py#L51-L84)) because rows
written before a pause aren't rolled back either, and `discard_checkpoints`
([orchestrator.py:136-162](../../backend/app/game/orchestrator.py#L136-L162))
reclaims a game's eight checkpoint threads when it's abandoned — on an explicit
*stop* only, never a natural finish, since a completed game's per-seat
conversations are the most interesting thing to go back and read.

**The general lesson:** the moment you keep agent state in a scope that your
orchestrator's checkpoint/rollback doesn't cover, "the node just re-runs
safely" stops being true. Anything with side effects outside the rolled-back
state — a second checkpoint thread, an external write, a queued message — needs
its own idempotency key, and that key has to be derived from state that *is*
rolled back, or it won't match on the replay.

(One residue of the same root cause is left deliberately: duplicate `"log"`
**SSE events** on a replay. The frontend already discards those by `seq` on
arrival ([10](10-frontend-observability.md)), so suppressing them server-side
would add a second mechanism to solve a problem the receiver has already
solved. The *rows* were worth deduping because nothing downstream was
protecting them.)

## What the split with `agent_turn.py` buys

`agent_turn.py` still owns the *mechanics* of one turn — provider resolution,
opening an MCP session, binding identity, the tool loop, telemetry — and
deliberately does not own memory:

```python
async def run_turn_with_history(
    orch, player, *, phase, history, commit_tool_name, fallback,
) -> tuple[dict[str, Any], list[Any]]:
```
([agent_turn.py:49-67](../../backend/app/game/agent_turn.py#L49-L67))

It reads whatever conversation the caller has and returns `(result,
messages_to_append)` — the delta, not a mutated list, because the mind folds it
in through an `add_messages` reducer.

Keeping that seam matters for one specific reason: the MCP identity boundary
from [05](05-mcp-tool-server-identity.md) is **unchanged**. Every turn still
opens a fresh session and re-binds the seat with a fresh token, even though the
reasoning either side of it is now long-lived. Memory got persistent;
authorization deliberately did not.

## Making it visible in the debug panel

A persistent-memory design you can't observe is indistinguishable from a
claim, so both halves of it are surfaced in the debug panel
([10](10-frontend-observability.md)).

**The subgraph's structure**, introspected from the compiled graph exactly the
way the main diagram already was — `/graph/structure` now reports both graphs:

```python
return {
    **_describe(request.app.state.graph),
    "seat_mind": _describe(seat_mind) if seat_mind is not None else None,
}
```
([routers/graph.py:32-41](../../backend/app/routers/graph.py#L32-L41))

Nested rather than merged into the main node list, because these are nodes of
a *different* graph running under a different checkpoint thread — flattening
them would draw edges between the two that don't exist. The rendered diagram
shows `START → ingest → deliberate → END` plus the conditional shortcut from
`ingest` straight to `END`, which is the replay guard above made visible.

**How much each agent actually remembers**, which is the more interesting
half, because it changes as a game runs:

```python
orch.publish("memory", {
    "seat_id": player.seat_id,
    "name": player.name,
    "messages": len(messages),
    "replayed": bool(state.get("replayed")),
})
```
([seat_mind.py:278-283](../../backend/app/game/seat_mind.py#L278-L283))

Published after every turn and shown as a `Mem` column beside the token
metrics. The count is read off the checkpointed state the turn already
returned, so reporting it costs nothing extra. Watching those numbers diverge
is the whole point: a seat that died in round 1 stops at a handful of
messages while a survivor climbs past a dozen, and the difference is exactly
the context its next decision is made against.

Worth noting what this column is *not*: the `In`/`Out` token columns next to
it are per-call figures, so they don't obviously reveal that context is
growing. `Mem` is cumulative by construction.

## Cost, and when this stops working

Raw whole-game accumulation is viable here because the games are short. By its
final turns a seat carries its persona plus its own handful of turns — on the
order of a few thousand tokens — and a full seven-seat game is roughly 75 AI
turns. There's no summarization or trimming, and at this scale there shouldn't
be.

That's a property of the game, not of the design. A long-running agent would
need a compaction strategy in `_ingest`, which is exactly where it would go:
the one place that decides what a mind sees before it thinks.
