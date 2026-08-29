# Village of Shadows — Feature Enhancement Backlog

This document captures potential enhancements for future implementation. The
features are intentionally independent enough to deliver one at a time, while
the suggested sequence at the end highlights useful dependencies.

Status legend:

- **Proposed** — captured for future design and implementation.
- **Planned** — scope agreed and ready to break into tasks.
- **In progress** — actively being implemented.
- **Complete** — shipped and verified.

All fifteen enhancements are now **Complete**. This document remains the
acceptance record for the shipped experiment platform.

For operational instructions, interpretation guidance, experiments, and
common analytical mistakes, use the
[Player and Experiment Guide](player-guides/README.md).

## FE-01: Real werewolf negotiation

**Status: Complete — implemented and verified on the werewolf-negotiation feature branch.**

Allow the two werewolves to conduct a private, multi-turn conversation before
committing the night's target. They should be able to disagree, persuade each
other, discuss threats, and coordinate deception for the following day.

Why it matters:

- Replaces independent target proposals with genuine agent-to-agent planning.
- Demonstrates cooperation between agents with shared information and goals.
- Produces more coherent day-time deception.

Initial acceptance criteria:

- Only living werewolves can see the private negotiation.
- Negotiation has a strict turn and token limit.
- Both werewolves can propose and revise a target.
- A deterministic rule resolves disagreement when the limit is reached.
- Negotiation messages appear only in God Mode and the post-game report.
- Pause, replay, and checkpoint restoration remain safe.

Implemented behavior:

- When both werewolves are alive, each receives an opening council turn and
  one revision turn. A human werewolf uses the same LangGraph interrupt path.
- `negotiate_message` is connection-bound through MCP and validates living
  role, exact turn ownership, legal target, one commit per turn, and an
  approximately 80-token provider-neutral message budget.
- Every new proposal replaces that wolf's previous target. Agreement wins;
  unresolved disagreement is resolved by the earliest living wolf in seating
  order, with a first-legal-target fallback if a provider never commits.
- Council messages and the final resolution are private log events. They are
  visible only to a living human werewolf or God Mode during play, and are
  reconstructed in the post-game Learning Debrief.
- One graph node owns one council turn. The seat-mind turn stamp and
  idempotent `(game_id, seq)` persistence path keep pause/resume replays from
  duplicating conversation or decisions.
- Backend coverage verifies identity, turn order, target and budget
  validation, revisions, deterministic resolution, persistence, and a full
  mock game.

## FE-02: Trust and suspicion system

**Status: Complete — implemented and verified on the trust-suspicion feature branch.**

Give every agent a private opinion of every other living player. Trust and
suspicion can change after statements, votes, contradictions, investigations,
deaths, and revealed roles.

Why it matters:

- Makes evolving beliefs explicit instead of leaving them only in prose.
- Helps agents maintain consistent theories across long games.
- Creates a powerful God Mode visualization of social dynamics.

Initial acceptance criteria:

- Suspicion is stored per observer and never shared automatically.
- Agents can explain the evidence behind a score change.
- A role reveal can update beliefs without rewriting historical values.
- God Mode can display a live relationship graph or matrix.
- The post-game report can replay belief changes over time.

Implemented behavior:

- PostgreSQL stores an immutable `agent_belief_events` ledger per observer and
  subject. Suspicion and confidence use bounded 0–100 scores; trust is the
  derived inverse rather than a second source of truth.
- `update_belief`, `get_my_beliefs`, and `get_my_belief_history` are
  connection-bound MCP tools. A model never supplies its observer identity.
- Every change includes a concise reason and may cite only a public event or
  that observer's own private event. Deterministic event keys make identical
  pause/replay writes idempotent.
- God Mode receives live `belief_update` events and renders an observer ×
  subject matrix plus recent evidence. Ordinary players never receive this
  information through their agent context.
- The Learning Debrief shows the final matrix and replays immutable revisions,
  including belief changes after deaths and revealed roles.
- Offline `mock-v1` seats also create belief revisions so the complete learning
  experience remains demonstrable without provider API keys.
- Backend coverage verifies observer isolation, hidden-evidence rejection,
  validation, role-reveal revision, idempotent replay, mock gameplay, and the
  real MCP protocol path. The production frontend build verifies the live and
  post-game views.

## FE-03: Branching replay

**Status: Complete — shipped with checkpoint-backed lineage and tests.**

Use LangGraph checkpoints to return to a previous decision, replace one human
or agent action, and continue the game as a new branch.

Why it matters:

- Shows how one decision changes an emergent multi-agent story.
- Turns checkpointing into an interactive learning tool.
- Makes nondeterminism visible and comparable.

Initial acceptance criteria:

- A user can select an eligible checkpoint from the timeline.
- The original game remains immutable and available.
- A new session records its parent session and branch point.
- Private knowledge and per-seat memories restore to the selected moment.
- Replayed tool calls do not duplicate persistence effects.
- The UI clearly distinguishes original and branched timelines.

Implemented behavior: the post-game branch tab lists only real human
interrupt checkpoints. The server clones the shared world and every per-seat
mind through that moment, creates a new protected room, reapplies the changed
answer through normal resume validation, and preserves an immutable parent
lineage banner.

## FE-04: Model tournament mode

**Status: Complete — shipped with balanced role rotation and budget stops.**

Run batches of games automatically and compare model performance across roles,
providers, prompts, and personalities.

Suggested measurements:

- Win rate by model and role
- Deception success
- Correct accusations and false accusations
- Tool-call reliability and fallback rate
- Average survival time
- Token usage, latency, and estimated cost
- Information leakage or rule violations

Initial acceptance criteria:

- Tournaments have configurable lineups, game count, and concurrency.
- Human seats can be replaced by tournament agents.
- Results persist independently from individual game logs.
- Role assignment is balanced across models where possible.
- A summary compares quality, reliability, speed, and cost.
- Rate limits and maximum spend can stop a tournament safely.

Implemented behavior: `/tournament` runs 1–50 all-agent games with bounded
concurrency, deterministic role rotation, persisted results, optional price
cards, hard token/spend stops, and an aggregate quality/reliability/speed/cost
table.

## FE-05: Post-game deception report

**Status: Complete — shipped as a fact/interpretation-separated forensic view.**

Generate a forensic account of how the social game unfolded rather than only
showing the final transcript and graph timeline.

The report should identify:

- Lies and misleading claims
- Which players believed or challenged each claim
- Major suspicion changes
- Vote pivots and decisive statements
- Correct clues that were ignored
- Private information used legally or leaked illegally
- The turning point that most influenced the outcome

Initial acceptance criteria:

- Analysis references exact persisted events and decisions.
- Facts and model-generated interpretations are visibly separated.
- Private material is available only with appropriate God Mode permission.
- The report can be exported or shared without exposing API keys.

Implemented behavior: the report cites immutable event sequences for public
claims, belief shifts, vote pivots, ignored Seer clues, redirection targets,
and a turning point. Persisted facts and deterministic interpretations use
separate fields; private analysis requires host authority and can be included
only in a secret God Mode replay.

## FE-06: Agent perspective viewer

**Status: Complete — shipped with event-bounded reconstruction and tests.**

Let a God Mode observer choose a player and inspect the game exactly as that
player saw it at a selected moment.

The view should include:

- Public transcript available at that time
- Role-specific private knowledge
- Persistent conversation history
- Private notes and current theories
- Available tools and legal targets
- The prompt or briefing used for that turn

Initial acceptance criteria:

- Perspective snapshots are reconstructed from persisted state.
- Future events and forbidden private information never leak into the view.
- Users can move between turns without modifying the game.
- The interface clearly identifies player, phase, round, and checkpoint.

Implemented behavior: God Mode selects a seat and event position to reconstruct
only the public transcript, role-private evidence, conversation, notes,
beliefs, available tools, legal targets, and briefing that existed by then.
Future-sourced records and other seats' private evidence are filtered on the
server.

## FE-07: Agent-authored private notes

**Status: Complete — implemented and verified on the agent-private-notes feature branch.**

Give agents structured tools for maintaining private working memory beyond the
raw conversation history.

Implemented MCP tools:

- `record_private_note` classifies a new `suspicion`, `clue`, `theory`, `lie`,
  or `alliance` and can cite a visible transcript event.
- `revise_private_note` appends a new version of an active note.
- `retire_private_note` closes a disproved theory without deleting history.
- `get_my_notes` returns the latest active notebook contents.
- `get_my_note_history` returns only the calling seat's immutable revisions.

Initial acceptance criteria:

- Notes are isolated per seat.
- Every update records its source event and timestamp.
- Agents can revise or retire a theory without deleting history.
- Notes survive pause, resume, and replay correctly.
- God Mode can inspect note evolution.

Implementation notes:

- PostgreSQL stores an immutable `agent_note_events` ledger with deterministic
  event keys, so pause/resume replays cannot duplicate side effects.
- A source may be a public log event or the calling seat's own private event;
  another seat's private evidence is rejected by the validation layer.
- SSE sends an observer snapshot on connection and individual updates during
  play. The UI reveals them only in God Mode.
- The Learning Debrief preserves the same note evolution after the game.
- Tests cover lifecycle history, ownership isolation, invisible-source
  rejection, idempotent replay, and the real MCP protocol path.

## FE-08: Additional roles

**Status: Complete — shipped as the optional expanded pack.**

Introduce optional roles that create new information patterns, objectives, and
night actions.

Candidate roles:

- **Hunter** — may eliminate another player when killed.
- **Witch** — has limited heal and poison actions.
- **Bodyguard** — protects a player with restrictions on repeated targets.
- **Fool/Jester** — wins by being voted out.
- **Alpha Werewolf** — has a stronger or asymmetric wolf ability.
- **Silencer** — prevents a selected player from speaking during discussion.
- **Mayor** — has a stronger or tie-breaking vote.

Initial acceptance criteria:

- Game configuration selects a valid role deck for the player count.
- Every role has explicit visibility, action, and win-condition rules.
- MCP tools validate role-specific actions server-side.
- New roles do not rely on prompt instructions for rule enforcement.
- The How to Play page describes the active role deck.

Implemented behavior: the expanded seven-seat deck adds Hunter, Mayor, and
Jester. Hunter retaliation uses a validated tool/human interrupt, Mayor votes
count twice in server state, and Jester has an independent vote-out win
condition. The standard deck remains the default.

## FE-09: Multiple human players

**Status: Complete — shipped with per-seat tokens, filtered SSE, and host recovery.**

Allow two or more people to join the same game from separate browsers while AI
agents fill the remaining seats.

Initial acceptance criteria:

- A host creates a room and receives a join code or link.
- Each human is authenticated or securely bound to one seat.
- Every browser receives only its permitted private state.
- Reconnects restore the correct seat and pending prompt.
- The graph can wait for different humans at different turns.
- Abandoned seats can be paused, replaced by AI, or ended by policy.

Implemented behavior: setup accepts multiple human seats and creates one
hash-stored access secret per browser plus a separate host secret. REST and SSE
project permitted state server-side. Links are rotatable; an absent invitee can
be released to the validated offline agent, including safe completion of a
currently pending interrupt, or the host can pause/stop the room.

## FE-10: Voice council

**Status: Complete — shipped as opt-in neural speech with a device fallback and authoritative captions.**

Give every agent a distinct voice and play discussion as a dramatic council
meeting. The active 3D portrait should react while its dialogue is spoken.

Initial acceptance criteria:

- Voice playback is opt-in and never auto-plays unexpectedly.
- Each seat can select a voice independently.
- Speech generation is cached by immutable transcript entry.
- Captions remain visible and are the authoritative content.
- Users can mute, skip, replay, and control playback speed.
- Costs and provider failures degrade cleanly back to text.

Implemented behavior: lifelike mode resolves only persisted public statements
and gives each seat a stable OpenAI voice with an ancient-village performance
direction. Generated audio is cached by immutable event, model, and voice so
multiple humans do not pay for the same line twice. If neural speech is not
configured or fails, the browser ranks natural installed voices and applies
restrained seat-specific pacing. Voice remains opt-in and AI-generated; mute,
skip, replay, engine, and pace controls never affect the authoritative caption
or game state.

## FE-11: Dynamic village events

**Status: Complete — shipped as an optional deterministic four-event ruleset.**

Introduce optional events that temporarily change the information or action
space and force agents to adapt.

Candidate events:

- Blackout
- Anonymous message
- Silenced discussion
- Discovered evidence
- Restricted or secret voting
- Forced testimony
- One-round protection or vulnerability

Initial acceptance criteria:

- Events are selected from a configured, server-validated ruleset.
- Their effects have explicit start and end boundaries.
- Agent and human views explain only the information they are allowed to know.
- Events are deterministic under checkpoint replay.
- The event system cannot bypass normal action validation.

Implemented behavior: one replay-deterministic event per round can silence one
speaker, seal votes until tally resolution, force testimony order, or publish
ambiguous evidence. Each effect is checkpointed, time-bounded, described in
permitted views, and implemented around the existing validated actions.

## FE-12: Custom agent laboratory

**Status: Complete — shipped with versioned presets and exact God Mode configuration.**

Expose controlled configuration for experimenting with different agent
behaviors without editing source code.

Possible controls:

- System prompt additions
- Personality and speaking style
- Risk tolerance
- Honesty or deception tendency
- Aggressiveness
- Reasoning level
- Memory strategy
- Tool-use strategy
- Token and time budget

Initial acceptance criteria:

- Configuration is validated and versioned with the game.
- The base role and safety prompts cannot be silently removed.
- A preset can be saved, duplicated, exported, and assigned to a seat.
- God Mode shows the exact effective configuration used for each agent.

Implemented behavior: per-seat controls cover prompt additions, risk, honesty,
aggression, reasoning, memory/tool strategy, turn token budget, timeout,
retries, and fallback policy. Presets are saveable, duplicable, exportable,
and assignable. Configuration is persisted with the game while the base role,
visibility, tool, and safety instructions remain immutable.

## FE-13: Persistent relationships across games

**Status: Complete — shipped as an opt-in, editable relationship archive.**

Allow recurring personas to remember selected experiences from earlier games,
such as betrayals, reliable allies, successful strategies, and repeated model
behavior.

Initial acceptance criteria:

- Cross-game memory is opt-in and separate from in-game memory.
- Users can inspect, edit, or erase stored relationship memories.
- Secret roles from previous games do not become assumptions of current roles.
- Memories cite the source game and event.
- A new game can disable cross-game influence completely.

Implemented behavior: final high-confidence belief revisions become
source-game/event-cited observations about communication behavior. Old reasons
and roles are deliberately not copied. `/relationships` lets users inspect,
edit, or erase entries; disabled games load and write none of them.

## FE-14: Failure and resilience controls

**Status: Complete — shipped with bounded recovery and visible diagnostics.**

Make long-running real-model games robust against transient provider errors,
rate limits, unavailable models, and cost overruns.

Possible controls:

- Per-seat timeout and retry policy
- Exponential backoff
- Model fallback chains
- Maximum turn and game cost
- Maximum tokens per decision
- Circuit breakers for failing providers
- Human approval before using a fallback model

Initial acceptance criteria:

- Retries never duplicate committed actions.
- Fallback usage is visible in the transcript and technical report.
- Budgets are enforced server-side.
- A failed provider can pause the game without corrupting state.
- Recovery behavior is covered by replay and persistence tests.

Implemented behavior: each seat has server-enforced timeouts, generation-only
retries with exponential backoff, an optional fallback model, a validated
deterministic terminal action, and an optional pause-after-exhaustion policy.
Turn and game token ceilings are enforced before further calls. Retry,
fallback, and budget events are streamed and persisted without replaying an
already committed tool action.

## FE-15: Shareable game replay

**Status: Complete — shipped with immutable public and secret God Mode snapshots.**

Create a read-only replay experience for completed games that can be shared
without access to the live session.

The replay may include:

- Public transcript and voting history
- Role reveals
- Animated 3D council state
- Graph and agent activity timeline
- Tool calls and model metrics
- Optional God Mode rationale and private actions
- Post-game deception analysis

Initial acceptance criteria:

- Public and God Mode replay links have separate authorization.
- API keys, raw provider credentials, and unrelated private data are excluded.
- Replay state comes from immutable persisted events or exported snapshots.
- A viewer can move by round, phase, event, or graph checkpoint.
- Links can be revoked or assigned an expiration date.

Implemented behavior: completed games can publish credential-free snapshots
with public events, graph steps, sanitized tool names/metrics, and deception
analysis. God Mode adds private evidence and requires a separately hashed URL
secret. The cinematic read-only viewer scrubs by immutable event sequence;
links can expire or be revoked without changing the source game.

## Suggested implementation order

### Phase 1 — Deeper agent behavior

1. **FE-07 Agent-authored private notes** — complete; supplies structured belief data.
2. **FE-02 Trust and suspicion system** — complete; adds scored relationship state.
3. **FE-01 Real werewolf negotiation** — complete; adds cooperative agent planning.

### Phase 2 — Understand and compare decisions

4. **FE-06 Agent perspective viewer** — exposes existing information boundaries.
5. **FE-05 Post-game deception report** — analyzes beliefs and decisions.
6. **FE-03 Branching replay** — compares alternate choices from checkpoints.
7. **FE-04 Model tournament mode** — evaluates models at scale.

### Phase 3 — Expand the game

8. **FE-08 Additional roles**
9. **FE-11 Dynamic village events**
10. **FE-12 Custom agent laboratory**
11. **FE-09 Multiple human players**

### Phase 4 — Immersion, continuity, and sharing

12. **FE-14 Failure and resilience controls**
13. **FE-10 Voice council**
14. **FE-13 Persistent relationships across games**
15. **FE-15 Shareable game replay**

## Cross-cutting requirements

Every enhancement should preserve these project invariants:

- LangGraph controls orchestration and legal state transitions; models choose
  behavior but do not enforce rules.
- Private information is filtered server-side before reaching a model or
  browser.
- Human and AI actions pass through the same validation layer.
- MCP identity comes from the bound connection, never a model-supplied seat ID.
- Pause, resume, retry, and replay do not duplicate committed effects.
- All new agent state is checkpointed or persisted deliberately.
- God Mode changes observability, not the information available to players.
- Provider failures degrade safely and remain visible in diagnostics.
- New behavior includes backend tests and synchronized concept documentation.

## Completion note

The original backlog is fully implemented. Further work should now be driven
by play-test evidence, provider telemetry, accessibility review, and focused
improvements to the experiment design rather than by unimplemented items in
this list.
