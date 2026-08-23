# 16. Real werewolf negotiation

**Files:** [`backend/app/game/graph.py`](../../backend/app/game/graph.py),
[`backend/app/game/nodes.py`](../../backend/app/game/nodes.py),
[`backend/app/game/rules.py`](../../backend/app/game/rules.py),
[`backend/app/game/actions.py`](../../backend/app/game/actions.py), and
[`frontend/components/Controls.tsx`](../../frontend/components/Controls.tsx).

## Cooperation needs a protocol, not a shared prompt

The original game asked each werewolf for an independent target and tallied
the answers. That demonstrated parallel decisions, but not cooperation. The
new night graph contains a real private council:

```text
start_night → werewolf_negotiation ⟲ → resolve_wolf_plan
  → night_doctor → night_seer → resolve_night
```

When both wolves live, the self-edge runs four times: wolf A opens, wolf B
responds, wolf A revises, and wolf B revises. Each execution is still one
minimal LangGraph node, so a human wolf can suspend on `interrupt()` without
replaying another seat's earlier model call.

## Private, identity-bound turns

The model commits through `negotiate_message(text, target)`. Like every game
tool, it does not accept a seat ID. MCP resolves the calling seat from its
bound connection, and the action layer then checks:

- the caller is a living werewolf;
- both wolves are still alive and the phase is night;
- this caller owns the current council turn;
- the turn has not already committed;
- the proposed target is a living non-werewolf; and
- the private message fits the provider-neutral channel budget.

The channel is stored as private `werewolf_negotiation` log events. Ordinary
villagers never see them. A living human werewolf sees the channel because it
is their role-authorized information; God Mode reveals it for teaching, and
the completed-game report reconstructs the whole exchange.

## Bounded autonomy

The council allows persuasion without allowing an unbounded agent loop. Each
wolf receives two turns and the committed message is capped at 320 characters,
an approximately 80-token cross-provider budget. Exact tokenizers differ
across Claude, OpenAI, Gemini, and Ollama, so the server enforces one stable
provider-neutral boundary instead of pretending those token counts are
identical.

Every proposal replaces that wolf's earlier proposal. The agents are free to
agree, resist, or change their minds, but they do not control how a stalemate
is resolved.

## Deterministic disagreement

`resolve_werewolf_target` is ordinary server code. If both latest proposals
match, that target wins. If they differ after the final turn, the earliest
living wolf in seating order acts as pack leader. If no provider commits a
legal proposal, the first legal target in seating order is used.

That distinction is the architectural lesson: agents create the plan, while
the graph supplies time, boundaries, and a deterministic terminal condition.
There is no fifth “judge” model, no random tie-break, and no opportunity for a
conversation to hold the game forever.

## Human and replay safety

A human werewolf receives a `werewolf_negotiation` interrupt with the same
legal target list. The UI collects a private message and target, then resumes
the graph through the existing input endpoint. The answer reaches the same
`actions.negotiate_message` validation used by an AI's MCP call.

If a pause lands after an AI council turn, LangGraph re-runs that one node on
resume. The per-seat mind recognizes its stable turn stamp and re-applies the
stored tool arguments without calling the model again. The rolled-back game
state recreates the same log sequence number, and SQLite's existing
`(game_id, seq)` guard prevents a duplicate persisted event. The result is one
remembered message, one game effect, and one visible council turn.

## What the learner can inspect

During play, God Mode shows the private exchange and each proposed target. In
the Learning Debrief, council turns are grouped by night and end with the
server's final target and resolution rule. This makes cooperation observable:
the learner can compare models and personalities, see who revised, and test
whether the same evidence produces agreement or invokes the pack-leader rule.
