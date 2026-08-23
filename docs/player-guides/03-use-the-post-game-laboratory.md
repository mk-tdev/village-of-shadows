# Use the Post-game Laboratory

When a game ends, choose **Learning debrief** instead of treating the winner as
the only result. The debrief is a focused workspace with Overview, Learning
evidence, Deception report, Branch replay, Technical trace, and Share replay.

## Begin with Overview

Compare the winner, rounds, human turns, model tool calls, private events,
belief revisions, wall-clock duration, and your pre-game prediction.

The outcome answers *what happened*. The remaining tabs help answer *how the
system reached it* and *what to test next*.

## Read Learning evidence before interpretation

Expand one evidence group at a time:

- human interrupts and information boundaries;
- accepted, read-only, and rejected tool calls;
- memory growth by seat;
- trust and suspicion revisions;
- private note evolution;
- same-round model comparisons.

Use immutable event sequence numbers to connect a conclusion to the transcript.

## FE-05 — Post-game deception report

Open **Deception report**.

### What it surfaces

- public claims and potentially misleading statements;
- major suspicion changes;
- voting pivots;
- Seer clues that were revealed or ignored;
- a cited turning point.

### Facts versus interpretation

The report separates persisted facts from analytical interpretation. A fact
should point to a recorded event, vote, role reveal, or belief revision. An
interpretation explains why those facts may constitute deception, redirection,
or a turning point.

### How to investigate one claim

1. Note the cited event sequence.
2. Read the public statement exactly as delivered.
3. Inspect what the speaker legally knew at that moment in Perspective.
4. Compare later belief revisions and votes.
5. Check the final role reveal.
6. Decide whether the claim was a lie, a mistake, an incomplete inference, or a
   strategically ambiguous statement.

### What not to conclude

- A false statement is not automatically intentional deception.
- A true statement is not automatically honest; it may be selectively framed.
- A stated rationale is not hidden chain-of-thought.
- A turning point is a useful explanation, not proof that no other event
  mattered.

### Useful learning question

Did the successful deception change beliefs, change votes, or merely coincide
with an outcome caused by another event? Follow the full chain.

## FE-06 — Agent perspective viewer

The Perspective viewer appears in the host's God Mode engineering panel. Select
a seat and an event boundary.

### What the snapshot contains

- public transcript through the selected sequence;
- that role's permitted private evidence;
- persistent conversation memory through that moment;
- active private notes and beliefs;
- available tools and legal targets;
- the briefing used for the turn;
- phase and round context.

Moving backward removes future statements, discoveries, notes, and belief
updates. This is a reconstruction of what the seat could know then—not a filter
applied to today's final state.

### How to analyze a surprising decision

1. Find the decision in the transcript or tool table.
2. Set Perspective to the acting seat.
3. Move the event boundary immediately before the action.
4. Read the visible transcript and role evidence.
5. Inspect active notes and belief scores.
6. Check which tools and targets were legal.
7. Judge the action against this bounded evidence, not against the final reveal
   you now know.

### What Perspective proves

It can show that information was available or unavailable to the seat and that
future evidence was excluded. It cannot prove that the model attended to every
available detail or reveal private hidden chain-of-thought.

### Leakage check

If an agent appears to use forbidden knowledge, inspect Perspective first. Then
check the exact public wording and tool history. Role-private evidence from
another seat should never appear; a genuine violation is a security issue,
whereas a lucky guess is not.

## FE-03 — Branching replay

Open the completed game's **Branch replay** tab. It lists eligible real human
interrupt checkpoints.

### Create a branch

1. Choose the checkpoint associated with a human statement, vote, or night
   action.
2. Review the original answer and the state at that point.
3. Enter one replacement answer.
4. Create the branch.
5. Enter the new protected room and continue the game.

The original game remains immutable. The new game shows a lineage banner with
its parent and branch event.

### What is restored

- the shared LangGraph world through the checkpoint;
- alive/dead state, phase, round, and role-private knowledge;
- each seat's checkpointed conversation memory;
- notes and beliefs available through the branch point;
- the same deterministic village event conditions.

The replacement travels through ordinary resume and rule validation. It is not
an out-of-band database edit.

### How to compare original and branch

Use a causal chain:

`changed answer → next statements/actions → belief changes → votes/deaths → outcome`

Record the earliest event where the timelines diverge after the replacement.
Later differences may be cascading consequences rather than direct effects.

### What not to conclude

- One branch does not establish that the changed answer always causes the new
  outcome; model generation can be nondeterministic.
- A changed winner does not mean every later decision improved.
- A similar ending does not mean the replacement had no effect; compare beliefs,
  tools, and path length.

### Stronger branch experiment

Repeat the same branch configuration more than once or use deterministic/mock
seats when you want to isolate orchestration behavior from model sampling.

## FE-15 — Shareable game replay

Only the host can publish a replay. Open **Share replay** after completion.

### Public replay

Use this for social posts, demos, and general review. It contains a sanitized,
read-only snapshot with public transcript, voting history, role reveals,
cinematic state, graph/activity evidence, sanitized tool names and metrics, and
public deception analysis.

It excludes role-private actions and host-only evidence.

### God Mode replay

Use this for trusted reviewers or technical teaching. It may include private
actions, role-private evidence, and stated rationale. It requires a separate
secret in addition to the replay identifier.

Treat the full link as sensitive.

### Expiration and revocation

Set an expiration when the audience or event is time-limited. Revocation
disables the link without mutating the original game. Existing exported
snapshots are immutable; publishing a second replay creates a separate record.

### Data never exported

- provider API keys;
- live seat and host credentials;
- provider endpoints;
- raw prompts;
- checkpoint identifiers not needed by the viewer;
- unrelated private data.

### Replay interpretation

The scrubber moves by immutable event sequence. Animation is a projection of
recorded state, not a rerun of the agents. The replay cannot generate new
decisions or alter the source session.

### Before sharing checklist

- Choose Public unless private evidence is essential.
- Open the generated link in a signed-out/private browser.
- Scrub through role reveals and the final event.
- Verify that no private council or investigation appears in a public replay.
- Add an expiration for temporary reviewers.
- Revoke test links you no longer need.

## Technical trace — how to read it

The Technical trace reconstructs checkpoint history rather than relying on a
handwritten summary.

- **Graph steps** show orchestration transitions, not model reasoning steps.
- **Elapsed time** localizes slow portions of the graph but includes provider,
  tool, persistence, and scheduling effects.
- **Checkpoint count** indicates saved execution history, not the number of
  meaningful decisions.
- **Memory checkpoints** belong to independent per-seat mind threads.
- **Self-edges** can represent repeated per-player phases and are legitimate
  state-machine movement.

## A complete post-game investigation

1. Compare outcome with prediction in Overview.
2. Read the validated tool table in Learning evidence.
3. Choose one major belief change and follow its event citation.
4. Reconstruct the deciding seat's Perspective immediately before action.
5. Check whether the Deception report's turning point fits the evidence.
6. Read the Technical trace for interrupt, retry, fallback, or latency context.
7. Create one controlled branch.
8. Publish only the replay scope appropriate for the audience.
