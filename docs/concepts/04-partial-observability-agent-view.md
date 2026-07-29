# 4. Partial observability: `build_agent_view`

**Files:** [`backend/app/game/views.py`](../../backend/app/game/views.py)

## The problem this solves

`GameState` is one object holding *everything*: every player's true role,
the seer's accumulated knowledge, who the werewolves' teammate is, the full
log including private werewolf chatter. That's necessarily true — the
orchestrator needs the whole picture to run the game. But if you hand that
whole object to a werewolf's language model as "context," the model can
trivially see the seer's role, the doctor's protection target, and every
other secret the game logic depends on being hidden. This is the single
biggest way a multi-agent game like this actually breaks: not a bug in the
rules, but the *context* silently leaking information no character in the
fiction could know.

## One pure function as the only door out

```python
"""`build_agent_view` is a pure function of (GameState, seat_id) — never
hand a node, a tool, or a model the raw GameState. Every "agent knows too
much" bug traces back to something leaking outside this function."""

def build_agent_view(state: GameState, seat_id: str) -> dict:
    player = state.find_seat(seat_id)
    public_log: list[LogEntry] = [e for e in state.log if not e.private]

    view: dict = {
        "your_name": player.name,
        "your_role": player.role,
        "alive_players": [p.name for p in state.alive_players()],
        "public_transcript": [e.model_dump() for e in public_log],
    }

    if player.role == "werewolf":
        teammate = next(
            (p for p in state.players if p.role == "werewolf" and p.seat_id != seat_id),
            None,
        )
        view["teammate"] = teammate.name if teammate and teammate.alive else None

    if player.role == "seer":
        view["known_roles"] = state.seer_knowledge.get(seat_id, {})

    return view
```
([views.py](../../backend/app/game/views.py))

The design constraint stated in the docstring is the entire point:
`build_agent_view` takes the *full* state and a *seat_id*, and returns a
strictly smaller `dict` — never the other way around, never a shortcut that
skips this function. Concretely:

- Every seat gets `alive_players` and the **public** transcript
  (`e for e in state.log if not e.private` — private log entries, like
  werewolf night proposals, are filtered out for everyone except the roles
  entitled to them).
- Only a werewolf's view gets a `teammate` field, and even then, only if
  that teammate is still alive — a dead teammate's identity fades from what
  a werewolf would think to check on, mirroring "why would you still be
  wondering who your dead ally was."
- Only a seer's view gets `known_roles`, and only *that seer's own*
  accumulated knowledge (`state.seer_knowledge.get(seat_id, {})`) — a
  dict keyed by seat_id specifically so two seers in a larger game (not
  currently possible with the fixed 7-role deck, but the shape allows it)
  would each only see their own investigations.
- A doctor or plain villager gets neither extra field — nothing beyond the
  shared basics.

## Where this gets called

There are two callers, and the difference between them is worth
understanding, because it changed.

**Reactively, as an MCP tool.** `build_agent_view` backs the
`get_my_private_context` tool
([mcp_server/server.py:48-55](../../backend/app/mcp_server/server.py#L48-L55)),
so a model that wants to ask "what do I, personally, know right now?" gets
its answer through this function and no other route.

**Proactively, as the input contract for every AI turn.** This is the newer
one. When each seat gained a persistent conversation
([12](12-per-seat-agent-memory-subgraphs.md)), something had to decide what
that conversation gets told at the start of each turn — and `_briefing` in
`nodes.py` builds it entirely out of this view
([nodes.py:95-127](../../backend/app/game/nodes.py#L95-L127)), never off raw
`GameState`.

That second caller matters more than it might look. Previously this function
was only reachable if a model *chose* to call the tool — plenty of turns never
did, which meant the boundary was well-designed but frequently unexercised,
while the actual prompt text was assembled by hand in each node. Now the
boundary is on the default path: a werewolf's agent cannot be handed the
seer's knowledge, because the only code that composes what an agent sees goes
through the function that filters by role. There is still no informal second
path where a node reads `game.seer_knowledge[seat_id]` directly and stuffs it
into a prompt string — and that's now true of the main path, not just the
optional one.

## Why this matters more here than in a typical web app

In a normal multi-tenant app, "user A can't see user B's data" is enforced
by auth checks on API endpoints — a fairly mechanical, well-understood
problem. Here, the "user" whose access you're restricting is a language
model receiving a block of text as its prompt. A model given leaked
information doesn't throw a 403 — it just *uses it*, seamlessly, and the
resulting behavior (a werewolf case that reads like it psychically knows the
doctor's plan) is a subtle correctness bug, not an error a test can easily
catch without specifically checking for the leak. That's why
`build_agent_view` is written as a single, small, easy-to-audit function
with an explicit "never hand raw `GameState` to anything" rule attached to
it in the docstring, rather than scattering role-based filtering logic
across every prompt-building call site.
