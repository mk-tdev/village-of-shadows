# Read the Observability Panels

The game exposes orchestration, model usage, memory, tools, private state, and
checkpoint history. This page explains what each signal means and—equally
important—what it does not mean.

## God Mode changes observation, not the game

Only the host can use God Mode. Enabling it reveals protected observer data in
the UI; it does not add knowledge to an agent, change a role, alter a prompt, or
bypass action validation.

Play with God Mode off when you want an authentic player experience. Turn it on
when teaching, debugging, or examining information boundaries.

## Live activity

The activity feed is the chronological engineering narration of the running
system.

Typical signals include:

- a LangGraph node becoming active;
- a seat's turn beginning;
- a seat-mind memory step;
- an MCP session or tool call;
- an accepted decision;
- a belief or note update;
- retry, fallback, budget, pause, or resume events.

### Interpretation

Activity proves that an observable system event occurred. It does not expose
hidden chain-of-thought. A `thinking` or turn-start event means the model path
began, not that every later statement in a rationale is literally how the
model computed the answer.

## LangGraph world graph

The graph controls phase and turn transitions: role assignment, night,
discussion, voting, resolution, win checks, and human suspension.

### Active node

The highlighted node is the world step currently executing or most recently
reported. A node may repeat for different players or rounds.

### Full-screen execution inspector

Choose **Expand graph** to open the unobstructed live view. The main canvas can
be panned, zoomed, and fitted to the viewport. Its execution rail lists recent
node transitions newest-first, while the active-agent panel shows the separate
per-seat mind subgraph and its loop counts.

Read these references together:

- the glowing node is the current world step;
- solid boxes are compiled nodes, not generated screenshots;
- dashed routes are conditional possibilities;
- the execution rail is the observed path through those possibilities; and
- the active-agent mind is a nested decision process invoked by the world
  graph, not another shared global agent.

The presentation borrows the useful graph-plus-trace reading pattern familiar
from LangSmith, but all data comes from this application's compiled graph and
live SSE activity. Closing the inspector does not pause or alter execution.

### Edges

An edge means the compiled graph permits a transition. It is not a transcript
of the path until activity and checkpoints show that it was traversed.

### Waiting state

If the graph waits on a human turn, it is suspended at an interrupt. This is a
successful human-in-the-loop condition, not polling and not an error.

### What the graph does not decide

It decides whose turn and which actions are legal. It does not choose whom an
agent trusts, accuses, protects, investigates, or attacks.

## Per-seat mind graph and memory

Every AI seat owns an independent checkpoint thread and conversation history.
The world graph asks one mind for a decision; that mind receives only its
permitted view and the changes since it last acted.

### Memory messages

The cumulative number of messages retained for the seat's mind. This differs
from input tokens for one call.

- memory messages usually grow across the game;
- input/output token columns describe provider-reported usage for decisions;
- memory strategy affects what is retained or emphasized;
- a larger memory is not automatically a better memory.

### Context usage

Input tokens approximate how much content the provider processed for a call.
Output tokens describe generated content. Missing provider usage should be read
as unavailable, not zero.

High input usage can come from long public history, private role evidence,
notes, beliefs, tool schemas, or exhaustive memory. Compare like-for-like
providers and configurations.

## Tool calls

Agents act through identity-bound MCP tools.

### Read calls

Inspect permitted context, notes, beliefs, tools, or legal targets. A read call
does not change the shared game world.

### Accepted action

The validation layer accepted a game-changing commitment such as a statement,
vote, target, protection, investigation, note update, or belief update.

### Rejected action

The tool call violated current rules, turn ownership, target legality,
information visibility, payload constraints, or idempotency conditions.

A rejection is not necessarily a system failure. It demonstrates that model
autonomy remained inside server-enforced boundaries. Repeated rejections can
indicate a model/tool-contract mismatch worth investigating.

### Identity

The model does not supply a trusted seat ID. The MCP session binds the caller to
a seat, preventing a model from acting as another player merely by naming it.

## Stated rationale

God Mode may show a model's concise stated rationale or decision explanation.
Use it to understand declared strategy and compare it with later behavior.

Do not call it chain-of-thought. It may be abbreviated, post-hoc, mistaken, or
strategically deceptive. Persisted actions and validation results remain the
stronger evidence.

## Private notes versus beliefs

- **Notes** are structured qualitative memory: clue, theory, suspicion, lie, or
  alliance.
- **Beliefs** are quantitative observer-to-subject suspicion/confidence
  revisions with reasons.

They can disagree. A model may retain a theory while lowering confidence, or
change a score without recording a new note. Inspect both before judging
consistency.

## Agent configuration

God Mode shows the exact checkpointed Agent Laboratory profile: model,
personality, prompt addition, risk, honesty, aggressiveness, reasoning, memory,
tool strategy, token cap, and resilience policy.

This is the intended experimental treatment. Observed behavior is the result.
The configuration does not guarantee compliance; the gap is itself measurable.

## Technical timeline

After the game, the technical trace reconstructs checkpoint history.

### Step duration

Useful for locating slow nodes, but not a pure model benchmark. It may include
network, tool, persistence, queueing, and human-related boundaries.

### Checkpoints

Durable graph snapshots make interruption, restoration, and branching possible.
Checkpoint count is an execution measure, not a quality score.

### Event sequence

The immutable log sequence is the best join key across transcript, notes,
beliefs, reports, perspectives, and replays.

## Reading one decision end to end

1. Find the public statement or action and its event sequence.
2. Identify the active world node and acting seat.
3. Open the seat's Perspective just before the action.
4. Read available public and role-private evidence.
5. Inspect the seat's notes and beliefs.
6. Check model/provider, memory, context, and resilience configuration.
7. Follow its MCP reads and commitment.
8. Confirm accepted or rejected validation.
9. Compare the stated rationale with the observable action.
10. Follow downstream belief revisions, votes, and outcomes.

## Diagnosing common situations

### “The page is waiting”

Check for a human interrupt, pause state, provider generation, retry backoff, or
server cold start before calling it stuck.

### “The model knew a secret”

Use Perspective at the exact prior event. Check public hints and lucky inference
before concluding leakage.

### “The agent changed its mind”

Find the belief or note revision and cited source. Change with evidence is often
healthy adaptation.

### “The tool was called twice”

Distinguish generation retries, read calls, rejected attempts, and committed
actions. Idempotent persistence prevents replay from duplicating the same
committed effect.

### “The fastest model is best”

Compare quality, reliability, and cost. Speed alone is one operational metric.

### “The voice sounded certain”

Generated performance is not evidence of model confidence. Read confidence
scores, wording, and action history instead.

## Teaching sequence for a live demo

1. Point to the world graph: **the graph owns the rules**.
2. Point to the active seat-mind: **each agent owns private context and memory**.
3. Point to Perspective: **information is filtered before the model sees it**.
4. Point to an MCP call: **agents request actions through validated tools**.
5. Point to a rejected or accepted status: **the server, not the model, enforces
   legality**.
6. Point to memory and beliefs: **state persists independently per seat**.
7. Trigger a human turn: **execution genuinely suspends**.
8. Open the debrief: **the run becomes evidence for the next experiment**.
