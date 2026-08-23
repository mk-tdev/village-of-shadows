# Village of Shadows — Player and Experiment Guide

This guide explains how to **use**, **play**, and **interpret** every feature
added to Village of Shadows. It complements the engineering-focused
[Concept Guide](../concepts/README.md): the concept guide explains how the
system is built, while these pages explain what a player, facilitator, or
learner should do with it.

## Start with the question you want to answer

Village of Shadows is both a social game and an agentic-AI laboratory. A good
session begins with one question, not with every option enabled at once.

Examples:

- Does a more cautious persona update beliefs more slowly?
- Can two different models interpret the same public clue differently?
- Does a fallback model preserve a seat's strategy after a provider failure?
- What changes when one human accusation is replaced at the same checkpoint?
- Does a model vote more accurately as a villager than it deceives as a wolf?

Write the prediction on the setup page, change one major variable, finish the
game, then use the Learning Debrief to compare the prediction with persisted
evidence.

## Guide map

| Stage | Features covered | Guide |
|---|---|---|
| Configure | Expanded roles, Agent Laboratory, cross-game relationships, resilience | [Configure the experiment](02-configure-the-experiment.md) |
| Play | Werewolf negotiation, beliefs, private notes, multiple humans, Voice Council, village events | [Play the live council](01-play-the-live-council.md) |
| Observe | Graph nodes, live activity, context, memory, tool calls, God Mode | [Read the observability panels](05-read-the-observability-panels.md) |
| Debrief | Perspective, deception report, branching replay, shareable replay | [Use the post-game laboratory](03-use-the-post-game-laboratory.md) |
| Compare | Balanced autonomous model tournaments | [Run and interpret tournaments](04-run-model-tournaments.md) |

## Every shipped enhancement

| ID | Feature | Where it appears | Who can see it |
|---|---|---|---|
| FE-01 | Real werewolf negotiation | Night phase, feed, debrief | Living wolves; host in God Mode |
| FE-02 | Trust and suspicion | God Mode and Learning Debrief | Host observer; each agent sees only its own beliefs |
| FE-03 | Branching replay | Post-game **Branch replay** tab | Room host |
| FE-04 | Model tournament | `/tournament` | Tournament operator |
| FE-05 | Deception report | Post-game **Deception report** tab | Host; sanitized data in shared replays |
| FE-06 | Agent perspective viewer | God Mode debug panel | Host observer |
| FE-07 | Agent-authored private notes | God Mode and Learning Debrief | Host observer; each agent sees only its own notes |
| FE-08 | Expanded roles | Setup **World rules** | Everyone learns public rules; roles remain secret |
| FE-09 | Multiple human players | Setup, room lobby, game board | Each browser sees its own seat-private state |
| FE-10 | Voice Council | Top of the game page | Each viewer opts in independently |
| FE-11 | Dynamic village events | Round banner, feed, debrief | Permitted player views and God Mode |
| FE-12 | Custom Agent Laboratory | Each AI seat on setup | Configurator; host can inspect effective settings |
| FE-13 | Persistent relationships | World rules and `/relationships` | Opt-in experiment operator |
| FE-14 | Failure and resilience | Agent Laboratory, activity feed, report | Configurator and host observer |
| FE-15 | Shareable game replay | Post-game **Share replay** tab | Host publishes; link holders view the chosen scope |

## The interpretation ladder

When reading a game, move from strongest evidence to weakest:

1. **Server-validated outcome** — a vote, action, role reveal, death, rejection,
   or winner recorded by the rules engine.
2. **Persisted event** — a public or correctly scoped private statement with an
   immutable sequence number.
3. **Recorded model action** — the tool a model attempted and whether the
   validation layer accepted it.
4. **Stated rationale** — what an agent said motivated its action. This is
   useful behavioral evidence, but it is not hidden chain-of-thought and may be
   incomplete, strategic, or deceptive.
5. **Analytical interpretation** — a report's classification of a pivot, clue,
   redirection, or turning point. Follow its cited events before accepting it.

This ordering prevents a persuasive explanation from outweighing what the
system actually recorded.

## Four rules for responsible comparisons

### Change one primary variable

If model, persona, role pack, events, memory strategy, and prompt all change at
once, the result is entertaining but not attributable. Hold the rest constant
when the goal is learning.

### Separate game skill from model quality

A loss does not prove that a model is generally weak. Secret roles, seat order,
random deals, human choices, and other agents all affect the result. Repeated,
role-balanced tournaments provide stronger evidence than one game.

### Treat scores as model state, not objective truth

Suspicion, trust, confidence, and private notes describe what an agent believed
or chose to record. They are not probabilities calculated from ground truth.

### Use captions and persisted text as the record

Voice, animation, and camera direction increase immersion. They never change
the underlying action. If audio and text ever appear to disagree, the visible
persisted caption is authoritative.

## Recommended first learning session

1. Use the standard roles and disable village events and cross-game memory.
2. Choose one human seat and six `mock-v1` seats to learn the interface free.
3. Write a prediction about who will gain trust or be falsely accused.
4. Start the game with God Mode off for the first round.
5. Turn God Mode on and inspect graph activity, notes, beliefs, and tool calls.
6. Finish the game and open **Learning evidence**.
7. Use **Perspective** to inspect one surprising decision at the event before it
   happened.
8. Create one branch that changes a human answer.
9. Compare the original and branch without changing any other configuration.

## Recommended model experiment

1. Put two models under comparison into otherwise identical behavior profiles.
2. Give all remaining seats the same baseline model or `mock-v1`.
3. Keep the world rules fixed.
4. Record a prediction about voting accuracy, deception, or tool reliability.
5. Run a multiple-of-seven tournament when practical so role rotation is easier
   to interpret.
6. Compare outcome, correct and false votes, survival, latency, tokens, and
   fallback events together—never win rate alone.

## Privacy and authority

- A human join link is a seat credential. Share it only with that player.
- Only the room host can enable God Mode, control the room, branch a game, or
  publish a replay.
- Public replays exclude role-private evidence.
- God Mode replay links include a separate secret and should be treated as
  sensitive.
- Provider API keys remain on the backend and are never included in replays.
- Cross-game memory is opt-in and can be inspected, edited, or erased.

## Related documentation

- [Feature acceptance record](../feature-enhancements.md)
- [Agentic-AI Concept Guide](../concepts/README.md)
- [Deployment plan](../deployment-plan.md)
- [Three-minute demo guide](../codex-meetup-demo-guide.md)
