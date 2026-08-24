# Configure the Experiment

This guide covers expanded roles, the Custom Agent Laboratory, persistent
relationships, and provider resilience. These options decide what kind of
experiment enters the village.

## Choose your own seat

The primary seat picker always shows all seven characters. Selecting one moves
the current browser's human identity to that seat; every other seat remains AI
unless it was deliberately invited as an additional human.

Open **Invite more human players** only for a shared room. Those checks create
extra private join links; they do not change which character the host plays.
This separation lets a solo player choose any character without first adding
or removing human controllers from the individual seat forms.

## Establish a baseline first

For a clean first comparison:

1. Use the standard role pack.
2. Disable village events and cross-game memory.
3. Keep all non-tested seats on the same model and profile.
4. Change one seat's model, persona, or behavior setting.
5. Write a prediction before starting.

Once the baseline is understood, add world complexity deliberately.

## FE-08 — Expanded roles

Enable **Expanded roles** under World rules. The seven-seat deck becomes two
Werewolves, Seer, Doctor, Hunter, Mayor, and Jester.

### Hunter

When the Hunter dies by vote or night attack, the graph suspends for a final
validated retaliation. A human Hunter selects a living target; an AI Hunter
acts through the same tool boundary.

Interpretation:

- The retaliation is a role action, not an ordinary vote.
- A delayed graph after the Hunter's death may be a legitimate interrupt.
- Evaluate whether the target followed the Hunter's earlier beliefs, not only
  whether it was correct.

### Mayor

The Mayor speaks normally, but each validated village vote counts twice.

Interpretation:

- The visible vote count and the final weighted tally may differ.
- A pivot by the Mayor can be decisive without any special model behavior.
- When comparing models, separate voting strategy from the server-enforced
  weight of the seat's role.

### Jester

The Jester wins immediately by being voted out.

Interpretation:

- Suspicious or contradictory behavior may be goal-directed rather than poor
  play.
- The Jester's victory is independent of the villager/werewolf contest.
- A high false-accusation count against the Jester may reflect the Jester's
  successful strategy.

### Comparison warning

Standard and expanded games are different experimental conditions. Do not mix
their win rates without labeling the role pack.

## FE-12 — Custom Agent Laboratory

Open **Custom agent laboratory** on an AI seat during setup.

### System prompt addition

Adds experiment-specific speaking or strategy direction. It cannot remove the
base role, information boundary, tool contract, or safety instructions.

Use it for a narrow hypothesis such as:

> Ask one evidence-seeking question before making an accusation.

Avoid long instructions that change several behaviors simultaneously.

### Risk tolerance

Higher values encourage bolder decisions under uncertainty. Lower values
encourage waiting for stronger evidence.

This is a behavioral direction, not a guaranteed probability of risky action.

### Honesty

Higher values encourage consistency with what the seat believes it knows;
lower values permit more strategic misdirection. Secret roles and objectives
still matter: a high-honesty werewolf may remain deceptive because revealing
the role would violate the game objective.

### Aggressiveness

Controls how strongly the persona tends to accuse, pressure, or challenge.
Aggressiveness is not the same as accuracy or hostility.

### Reasoning level

Selects low, medium, or high reasoning effort where the provider/model supports
it. Higher effort may improve deliberation but can increase latency and token
use. Provider behavior varies, so verify the result through metrics.

### Memory strategy

- **Recency:** emphasizes recent context; economical but may forget early clues.
- **Selective:** retains chosen salient evidence; a balanced default.
- **Exhaustive:** carries more history; richer context but greater token cost and
  potential distraction.

### Tool strategy

- **Cautious:** reads context more readily before committing.
- **Balanced:** mixes inspection and action.
- **Decisive:** moves toward commitment with fewer reads.

Tool strategy describes a tendency. The server still validates every call.

### Turn token budget

Caps how much model output a turn may consume. A small cap can make behavior
concise but may truncate complex planning. A large cap is permission, not a
guarantee that the model will use it.

### Presets

Save a successful configuration as a preset, duplicate it before changing one
field, export it for reproducibility, and assign it to another seat. Give
presets hypothesis-oriented names such as `cautious-selective-v1` rather than
`good-agent`.

### How to interpret an experiment profile

God Mode shows the exact effective versioned configuration checkpointed with
the game. Compare configured tendency, observed statement, tool path, and final
action. A mismatch is evidence about controllability, not automatically a bug.

## FE-13 — Persistent relationships across games

Enable **Cross-game relationships** under World rules only when recurring names
represent intentionally recurring personas.

### What is carried forward

At the end of an enabled game, selected high-confidence beliefs may become
source-cited observations about communication behavior, reliability, or prior
interaction.

### What is deliberately excluded

- previous secret roles;
- assumptions that a player is still a wolf, Seer, or other role;
- unrelated private data;
- memories from games where the feature was disabled.

### Inspect and manage the archive

Open `/relationships` to review source game/event references, edit an
observation, or erase it. Disabling cross-game relationships prevents both
loading and writing this memory for the new game.

### How to interpret effects

Cross-game memory introduces history as an experimental variable. A model's
early suspicion may come from prior communication behavior rather than this
game's first statement. Compare an enabled run against a disabled run with the
same personas before attributing the change to the current evidence.

### Useful experiment

Run two games with stable persona names, then replay the same lineup once with
relationships enabled and once disabled. Compare opening notes, early belief
scores, and first-round votes.

## FE-14 — Failure and resilience controls

Open **Failure & resilience policy** inside an AI seat's Agent Laboratory.

### Timeout

Maximum time allowed for one generation attempt. Too short can turn normal
provider latency into artificial failure; too long can make a live demo appear
stuck.

### Retries

Retries re-run generation only. They do not replay an already committed MCP
action. Use a small bounded count for transient network or rate-limit failures.

### Fallback provider and model

After primary attempts are exhausted, the configured fallback may generate the
turn. If no fallback model is configured, the validated deterministic rules
path can keep the world in a legal state.

### Pause after safe fallback

When enabled, the game pauses at a safe boundary after exhaustion so the host
can inspect what happened before continuing.

### Turn and game budgets

Per-turn token limits live in the behavior profile. The World rules include a
server-enforced total token ceiling. Tournament mode adds total token and
estimated spend caps.

### How to read resilience events

Distinguish:

- **retry:** another generation attempt by the same primary configuration;
- **fallback:** a different configured model/provider produced the decision;
- **deterministic action:** the rules layer selected a safe legal terminal
  action after model exhaustion;
- **pause:** the graph stopped at a valid boundary for host review;
- **budget stop:** the server refused further model usage after the ceiling.

### What not to conclude

A completed turn does not prove the primary model succeeded. Check the live
activity and technical report. Conversely, a fallback event does not invalidate
the whole game; it means the seat's model condition changed for that turn and
must be labeled in any comparison.

### Recommended live-demo policy

- timeout: high enough for the slowest expected reasoning model;
- retries: one or two;
- known-good low-cost fallback;
- pause after exhaustion enabled for an educational demo;
- conservative game token ceiling.

## Configuration worksheet

Record this before a comparison:

| Variable | Baseline | Experimental run |
|---|---|---|
| Model/provider |  |  |
| Personality |  |  |
| Prompt addition |  |  |
| Risk/honesty/aggression |  |  |
| Reasoning level |  |  |
| Memory strategy |  |  |
| Tool strategy |  |  |
| Role pack/events |  |  |
| Cross-game memory |  |  |
| Resilience policy |  |  |
| Token ceiling |  |  |

If more than one row changes, describe the run as exploratory rather than a
controlled comparison.
