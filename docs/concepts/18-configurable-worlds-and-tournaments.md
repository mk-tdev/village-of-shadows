# 18. Configurable worlds and model tournaments

**Files:** [`models.py`](../../backend/app/models.py),
[`tournaments.py`](../../backend/app/game/tournaments.py),
[`AgentLabPanel.tsx`](../../frontend/components/AgentLabPanel.tsx), and
[`TournamentLab.tsx`](../../frontend/components/TournamentLab.tsx).

## Prompts may influence behavior; rules must enforce it

The Agent Laboratory versions behavior settings with the game: risk, honesty,
aggression, reasoning depth, memory strategy, tool strategy, and token budget.
A custom prompt addition is appended after the immutable base identity, role,
visibility, and safety instructions. God Mode reads the persisted configuration
rather than whatever happens to remain in browser state.

Expanded roles and village events live in checkpointed `GameState`. Hunter
retaliation, Mayor vote weight, Jester victory, silence, secret ballots, forced
testimony, and discovered evidence are server transitions. A model cannot opt
out of them by misunderstanding a prompt.

## Comparison requires experimental controls

Tournament mode turns all seven seats into agents, rotates the role deck once
per game, persists each result, and aggregates role-aware wins, deception,
vote accuracy, survival, latency, tokens, and estimated spend. Concurrency is
bounded. Token and monetary ceilings stop the batch before it silently becomes
an unbounded provider bill.

This is not a claim that one Werewolf score defines model quality. It is an
instrument: fix the world and configuration, vary one model or persona, repeat,
and inspect evidence across several emergent runs.
