# Data Sources and Compliance Statement

**Project:** Village of Shadows
**Version:** GOAI 2026 semi-final build
**Track:** Boundless Agents — AI + Education
**Maintainer:** Muthukumar Arunachalam
**Public repository:** https://github.com/mk-tdev/village-of-shadows

## 1. Purpose and scope

Village of Shadows is an open-source educational simulation for learning
agentic-AI concepts through a complete multi-agent social-deduction game. It
is not a learning-management system, an automated assessment service, a
teacher replacement, or a high-stakes decision system. The application does
not require a student account, institutional record, legal name, email
address, demographic profile, biometric identifier, or academic grade.

The learner configures AI seats, predicts behavior, participates as a player,
observes orchestration and agent evidence, completes a five-question concept
check, and exports a learning report. Assessment answers and the pre-game
prediction stay in the learner's browser local storage unless the learner
chooses to download and share the report.

## 2. Data sources

Village of Shadows does not train or fine-tune a model and does not use a
curated human-subject dataset. Runtime information comes from the following
sources:

| Source | Examples | Origin | Use |
|---|---|---|---|
| Synthetic game definition | Roles, phases, legal actions, deterministic village events | Project-authored rules | Authoritative world state and validation |
| Project-authored fictional content | Character names, personas, prompts, explanations, concept questions | Repository content | Agent identity and learning scaffolding |
| User-entered session content | Seat display names, custom personas, human statements, votes, night actions | Players in a game room | Participation in the current simulation |
| Configured model output | Stated rationale, public speech, structured tool calls | Selected OpenAI, Anthropic, Gemini, Ollama, or mock model | Agent behavior inside the simulation |
| System telemetry | Graph step, phase, event sequence, latency, token counts, accepted/rejected tool result | Application runtime | God Mode, debugging, debrief, and evaluation |
| Browser-local learning data | Pre-game prediction, concept-check answers, score | Learner's browser | Closed-loop reflection and optional report export |
| Optional generated speech | Public council text and synthesized audio | OpenAI speech API or device fallback | Opt-in narration |

The interface artwork depicts a fictional village and fictional characters.
It is not derived from a face-recognition dataset and is not used for identity
matching or biometric inference.

## 3. Processing and external recipients

When a hosted model is enabled, the backend sends that provider only the
configured seat's instructions, persona, permitted game context, conversation
history, and tool definitions needed for the current turn. Role-private
information is filtered by the application before prompt construction. A
provider may therefore receive private information legitimately available to
that seat, but it does not receive another seat's hidden notebook or a global
private transcript.

The supported external recipients are OpenAI, Anthropic, Google Gemini, and
Ollama Cloud. A local Ollama endpoint and the deterministic mock provider allow
operation without sending game prompts to a hosted model. Provider-specific
processing, retention, and training controls are governed by the deployer's
account and agreement with that provider.

API keys are configured as backend environment variables. They are not placed
in browser bundles, stored in game records, written to replay snapshots, or
returned through the API. The current public deployment is operator-keyed; it
does not collect model API keys from visitors.

## 4. Stored information and retention

PostgreSQL stores the minimum state needed to run, reconnect, inspect, and replay
a session:

- game status, configured seats, provider/model identifiers, and secret roles;
- public and role-private event logs;
- model prompts, raw responses, stated rationale, tool calls, latency, and
  token counts used for technical inspection;
- per-seat notes, belief revisions, and LangGraph checkpoints;
- SHA-256 digests of room host/seat credentials (never the plaintext tokens);
- optional cross-game relationship memories when explicitly enabled;
- immutable replay snapshots when explicitly published;
- cached audio for opt-in public narration.

Stopping a game preserves its audit record but removes resumable checkpoint
threads. A host can permanently erase a game's records and derived artifacts
with `DELETE /games/{session_id}/data?host_token=...`. That operation removes
the primary game row, seats, logs, decisions, notes, beliefs, configuration,
room credentials, replay snapshots, voice cache, source-derived cross-game
memories, branch links, tournament linkage, and checkpoint threads.

The reference self-hosted deployment does not impose a universal automatic
retention period because storage belongs to the deployer. Operators must set a
retention schedule appropriate to their audience and jurisdiction, secure or
encrypt their PostgreSQL service and backups as needed, and provide a contact route for deletion
requests. The public demo should be treated as an ephemeral demonstration: do
not enter real personal, confidential, educational-record, or sensitive data.

## 5. Access control and information boundaries

- Every protected room has an unguessable host token and one unguessable token
  per human seat; only SHA-256 digests are stored.
- Each request is rebound to the authorized seat before a private view or
  action is accepted.
- The human-facing state projection removes other roles, private logs, and
  prompts that the viewer is not entitled to see.
- God Mode and complete technical reports require the host credential.
- Public replay exports exclude private material. God Mode exports require a
  second secret and can expire or be revoked.
- MCP actions are bound to agent identity and checked against the current role,
  phase, target, and game rules before state changes.

These boundaries reduce accidental disclosure but do not turn the reference
app into a formally certified security product. Internet-facing operators must
also use TLS, restrict database access, rotate provider credentials, monitor
abuse, and apply platform-level rate limits and backups.

## 6. Educational and minor-safety boundaries

The simulation teaches orchestration, human-in-the-loop interrupts, partial
observability, memory, tool validation, model comparison, and replay through a
fictional game involving deception and elimination. It is intended for guided
technical learning and may not suit younger learners without educator review.

- No advertising, behavioral profiling, or sale of learner data is built in.
- No automated grade is sent to a teacher, school, employer, or admissions
  system.
- The concept-check score is formative, browser-local, revisable, and
  downloadable only by the learner.
- Educators should explain that models can be wrong, manipulative, biased, or
  inconsistent and should select age-appropriate models and personas.
- Deployments serving children must obtain any required institutional or
  parental approvals and configure provider accounts for the applicable age,
  region, and content policies.

## 7. Model behavior, explainability, and safety

The app displays observable evidence: the model's stated rationale, public
speech, tool calls, rule-validation outcome, memory growth, belief changes,
latency, and token counts. It does not claim to reveal hidden chain-of-thought.
God Mode is a debugging and teaching view, not a guarantee that a stated
rationale is faithful to a model's internal computation.

Safety controls include model preflight, finite turns, bounded retry/fallback
policies, token ceilings, legal-action schemas, identity-bound tools, server
validation, host pause/stop controls, deterministic safe fallbacks, and visible
failure signals. These controls bound actions inside the game; they do not
eliminate all harmful, biased, or inappropriate model-generated language.

## 8. Intellectual property and licensing

Original source code is released under the MIT License. Third-party libraries,
model services, and standards remain governed by their own licenses and terms.
The project's dependency and service disclosure is maintained in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). Deployers are responsible
for verifying that their selected model, provider plan, region, generated
content use, and distribution method are permitted.

## 9. Known limitations and operator responsibilities

- The reference project has not undergone an independent privacy, security,
  accessibility, or pedagogical certification.
- Model prompts and responses may contain personal information if a user puts
  it into a name, persona, or message; the UI therefore warns against entering
  sensitive data and this statement requires operators to communicate the same.
- PostgreSQL provides durable state for the reference deployment, but it is not
  a substitute for production tenancy controls, managed secrets, backups, and
  retention policy.
- External model and hosting availability can fail or change independently of
  this repository.
- Replay sharing is an intentional disclosure action. Hosts must inspect the
  selected scope and protect any secret link.

For the public project, compliance or deletion concerns can be raised through
the repository's GitHub issue tracker without including game secrets, API keys,
or other sensitive content.
