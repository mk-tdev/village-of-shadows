# Run and Interpret Model Tournaments

Tournament mode is the guide for FE-04. It runs repeated all-agent games with
role rotation and aggregates performance, reliability, latency, token use, and
estimated cost.

Open `/tournament` from the application.

## FE-04 — Model tournament mode

## When to use tournament mode

Use a tournament when the question requires repeated evidence:

- Which model votes more accurately across roles?
- Which model survives longer?
- Which model is more effective as a werewolf?
- Which configuration is faster or less expensive?
- Does a behavior preset improve outcomes consistently?

Use an ordinary human game for interaction design, narrative, or
human-in-the-loop learning. Tournament mode contains no human seat interrupts.

## Configure the lineup

Each of seven seats needs a provider and model. Model names remain editable, so
use exact IDs available to your account.

For a controlled model comparison:

1. Keep persona and behavior profile equivalent unless those are the tested
   variables.
2. Place each tested model into the lineup.
3. Fill remaining seats with a stable baseline.
4. Avoid changing provider, persona, prompt, and memory policy simultaneously.

Every real model passes the same readiness gate used by live games: it must
answer a test message and call the required test tool before the tournament can
proceed.

## Choose run controls

### Games

Choose 1–50. Seven games or a multiple of seven is a useful starting point for
a seven-seat role rotation, but balance also depends on the exact lineup and
completed runs. More games reduce the influence of one unusual deal but cost
more time and tokens.

### Concurrency

Choose 1–4. Higher concurrency reduces wall-clock duration but increases
simultaneous provider load and the chance of rate limiting. It does not grant a
model more reasoning effort.

### Token ceiling

This is a hard aggregate stop. The server ends the tournament safely rather
than beginning calls beyond the configured total.

### Spend cap

The estimated USD ceiling requires model price cards in the tournament API. A
value of zero means no positive spend cap is applied. The current web form does
not expose price-card entry, so its estimated cost remains zero unless the
tournament is created through an API client that supplies prices. Always use
the provider's billing dashboard as the financial source of truth.

## Launch and monitor

Select **Run balanced tournament**. The result panel shows queued/running/
completed status, worlds completed, aggregate tokens, estimated spend, and any
stop reason.

Individual games persist separately from the tournament aggregate so a result
can be traced back to game evidence.

## Interpret the result table

### Games

Number of completed seat-game observations attributed to the model. Compare
rates only when sample sizes are visible and reasonably similar.

### Win percentage

Share of games where the seat's faction or independent objective won. This is
an outcome metric affected by teammates, opponents, role, and deal.

### Wolf win percentage / deception success

How often the model's werewolf games ended in a werewolf victory. It is not a
direct linguistic deception score; inspect individual reports to understand
how the victory occurred.

### Correct votes

Votes whose target was a werewolf. The current aggregate does not exclude a
werewolf voting for another werewolf, so treat this as target alignment rather
than a pure villager-accuracy score. Opportunity and survival also affect the
raw count.

### False votes

Votes whose target was not a werewolf. Interpret together with correct votes,
the voter's role, and number of voting opportunities.

### Average survival

How long the seat remained alive. Survival can reflect good defense, teammate
behavior, threat perception, luck, or passivity. Longer is not always better:
a Seer who reveals decisive evidence and dies may have played effectively.

### Average latency

Mean generation/action latency for the model. It is environment-specific and
can be influenced by provider load, retries, network location, and reasoning
level.

### Tokens and estimated cost

Use these to compare efficiency only when task conditions and token accounting
are equivalent. Some provider APIs report usage differently; missing usage is
not zero usage.

## Separate quality, reliability, speed, and cost

Do not collapse the tournament into one winner without defining priorities.

| Dimension | Useful signals |
|---|---|
| Quality | faction win rate, correct/false votes, deception success |
| Reliability | readiness failures, retries, fallbacks, rejected tools, completed games |
| Speed | average latency and total tournament duration |
| Cost | reported tokens and estimated spend |

A model can lead one dimension and trail another.

## Fair-comparison checklist

- Same world rules and role pack.
- Balanced role exposure.
- Same non-tested behavior settings.
- Same fallback policy, or fallback results labeled separately.
- Similar number of completed observations.
- Budget stops and provider failures disclosed.
- More than one tournament before making a broad claim.
- Individual game evidence inspected for surprising aggregates.

## Common analytical mistakes

### Declaring a winner from one or two games

Small samples are dominated by role assignment and interaction effects.

### Comparing raw correct-vote counts

A seat eliminated early had fewer opportunities. Consider survival and games
completed.

### Counting fallback output as primary-model behavior

Inspect resilience diagnostics. A completed action may have been produced by a
fallback or deterministic safe path.

### Treating latency as a permanent model property

Latency varies with provider conditions, account tier, region, reasoning level,
and concurrency.

### Treating win rate as general intelligence

This tournament measures behavior inside one adversarial social environment,
not broad capability.

## Suggested experiment designs

### Model-only comparison

- Same personality and Agent Laboratory profile.
- Two or more models under test.
- Stable baseline seats.
- Standard roles, events off, relationships off.

### Persona sensitivity

- Same model in multiple seats.
- Different persona or one behavioral slider.
- Compare beliefs, votes, survival, and deception—not just winner.

### Memory strategy comparison

- Same model and persona.
- Recency vs selective vs exhaustive memory.
- Compare tokens, latency, early-clue retention, and late-game accuracy.

### Resilience comparison

- Same primary model.
- Different timeout/retry/fallback policies.
- Induce only realistic transient failures.
- Compare completion, fallback rate, latency, and outcome labels.

## Reporting a result responsibly

Use wording such as:

> Across 28 role-rotated games under the standard role pack, configuration A
> produced more correct village votes and lower latency than configuration B.
> Four turns used a fallback model, so primary-only conclusions remain limited.

Include the lineup, number of games, world rules, behavior profile, budget,
fallback policy, provider date, and any stopped or failed runs.
