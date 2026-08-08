# Deployment and user-provided API keys plan

## Decision

Deploy the Next.js frontend on Vercel and the stateful FastAPI backend on a
container platform. For a free demo, use Render for the backend and Neon for
Postgres. Google Cloud Run is the more reliable backend alternative for a
public demo. Do not deploy the current backend as a Vercel Function: its
long-running LangGraph tasks, SSE connections, in-memory game registry,
in-process MCP server, and SQLite persistence do not fit a short-lived
serverless function lifecycle.

Recommended first topology:

```text
Browser
  -> Next.js frontend on Vercel
  -> FastAPI backend on Render or Cloud Run
       -> OpenAI / Gemini / Claude / Ollama Cloud
       -> in-process MCP server
       -> Neon Postgres
       -> ephemeral per-game API-key registry
```

## Hosting assessment

| Component | Recommendation | Notes |
| --- | --- | --- |
| Frontend | Vercel Hobby | Good fit for the Next.js UI and personal demo use. |
| Current FastAPI backend on Vercel | Do not use | Background graph tasks can outlive requests, while functions have finite execution windows. |
| Backend MVP | Render Free | Simple container deployment; cold starts and restarts are expected. |
| Backend alternative | Google Cloud Run | Better streaming/runtime behavior; billing must be enabled even when usage stays inside the free allowance. |
| Database | Neon Postgres | Durable external storage that can replace both SQLite uses. |
| Railway | Optional low-cost alternative | Easy deployment, but not permanently free. |

Render's free filesystem is ephemeral, so the local SQLite database cannot be
used there. Render's free Postgres also expires after 30 days, which is why a
separate Neon database is preferred.

## User-provided API-key design

Collect one key per provider used by a game, not one key per seat. Multiple
seats using different OpenAI models can share the user's OpenAI key for that
game.

For the MVP, provider keys must be:

- entered into masked fields in the setup page;
- transmitted once to the FastAPI backend over HTTPS;
- held only in backend process memory;
- kept outside `AgentConfig`, `Player`, `GameState`, LangGraph state, and seat
  memory;
- excluded from Postgres, checkpoints, logs, analytics, SSE events, URLs, and
  exception messages;
- deleted when the game finishes, stops, expires, or fails irrecoverably; and
- entered again after a backend restart.

The UI must disclose that the key is temporarily transmitted to and used by
the application's backend. Users should create a dedicated provider key with
restricted permissions, a small budget, and billing alerts.

Do not call model providers directly from the browser and do not store provider
keys in `localStorage` or `sessionStorage`.

## Implementation phases

### 1. Replace SQLite with Postgres

1. Add an async Postgres connection pool.
2. Migrate `games`, `seats`, `log_entries`, `agent_decisions`, and
   `agent_notes`.
3. Replace `AsyncSqliteSaver` with LangGraph's `AsyncPostgresSaver`.
4. Introduce versioned database migrations.
5. Add a unique `(game_id, seq)` constraint for idempotent logs.
6. Use JSONB for structured tool-call data.
7. Add expiry fields for retention and cleanup.

### 2. Separate credentials from game state

Introduce a `CredentialBundle` request that is separate from the existing seat
configuration. Add an in-memory credential registry keyed by `game_id`, with a
creation time and hard expiry. The registry must have explicit cleanup paths
for game completion, stop, failure, and timeout.

### 3. Refactor provider construction

Change model construction from global deployment credentials to per-game
credentials:

```text
get_chat_model(agent_config, game_credentials)
```

Validate that every selected AI provider has a key and that the selected model
is accessible before beginning the game. Redact SDK errors before returning
them to the browser or logs.

### 4. Add game-session authorization

Keep the UUID `game_id` as a public identifier and issue a separate,
high-entropy control token when a game is created. Require that token for
begin, stream, input, pause, continue, stop, state, decisions, timeline, and
credential re-entry.

Replace native `EventSource` with fetch-based SSE so the control token can be
sent in an Authorization header. The control token may be stored in
`sessionStorage`; provider API keys may not.

Add strict production CORS origins, body-size limits, rate limiting,
concurrency limits, maximum game duration/rounds, model-call limits, security
headers, and a restrictive Content Security Policy.

### 5. Close hosted-environment attack paths

The user-controlled local Ollama endpoint is an SSRF risk on a hosted backend.
In hosted mode:

- disable arbitrary and localhost Ollama endpoints;
- allow only fixed HTTPS provider endpoints;
- reject loopback, private, link-local, and cloud metadata addresses; and
- keep custom Ollama endpoints available only for local/self-hosted mode.

Validate model-name length and allowed characters before passing values to
provider SDKs.

### 6. Update the credential UX

Show one masked key field for every provider currently used by an AI seat.
Explain which seats use it, provide a Validate action, show safe provider
errors, and clear the field after game creation. Do not place analytics or
third-party scripts on the credential-entry page.

### 7. Recover from backend restarts

When a requested game is absent from the in-memory registry, load its latest
checkpoint from Postgres and reconstruct the orchestrator. If a model turn
still needs credentials, publish `credentials_required`, ask the player to
re-enter the missing keys, and resume from the checkpoint after validation.

The first demo release may instead declare interrupted games unrecoverable,
but the UI must say so clearly. Restart recovery is required before describing
the service as production-ready.

### 8. Make streaming reconnect-safe

- Reconnect with exponential backoff.
- Add monotonically increasing IDs to SSE events.
- Resume from the last received event where possible.
- Send an initial observability snapshot after reconnect.
- Preserve idempotency for duplicate logs and state updates.
- Show credential re-entry when durable game state exists but ephemeral keys
  have been lost.

### 9. Containerize and deploy

Backend requirements:

- production Dockerfile;
- Uvicorn without `--reload`;
- bind to `0.0.0.0:$PORT`;
- liveness and readiness endpoints;
- explicit internal MCP URL such as `http://127.0.0.1:$PORT/mcp`;
- one backend instance initially;
- graceful shutdown that allows active graphs to checkpoint; and
- deployment secrets for `DATABASE_URL`, CORS, checkpoint encryption, and
  session signing, but never user provider keys.

Frontend requirements:

- deploy `frontend/` to Vercel;
- set `NEXT_PUBLIC_API_URL` to the backend HTTPS URL;
- separate preview and production environment configuration; and
- later use related custom domains such as `play.example.com` and
  `api.example.com`.

### 10. Add retention and cleanup

- Active games: retain until completion or expiry.
- Finished games: retain for a short documented window such as 24 hours or
  seven days.
- Abandoned games: delete checkpoints immediately.
- Provider keys: delete immediately when the game ends.
- Expired logs and checkpoint threads: clean opportunistically during normal
  requests so the free MVP does not require a paid scheduler.

## Security and reliability test plan

Tests must prove that:

1. Provider keys never appear in database rows, checkpoints, SSE events,
   browser storage, logs, or exception messages.
2. Two simultaneous games cannot access each other's credentials.
3. A control token cannot operate another game.
4. Invalid provider errors are redacted.
5. Arbitrary/private provider endpoints are rejected.
6. Expired and completed sessions destroy their credential bundles.
7. SSE reconnection does not duplicate game actions.
8. Human interrupts survive reconnects.
9. A restarted backend can reconstruct a game after credentials are
   re-entered.
10. Postgres replay does not duplicate votes, statements, logs, or seat
    memory.

Run at least one real end-to-end game for every provider before exposing that
provider publicly.

## Rollout order

1. Postgres migration.
2. Container deployment with mock agents only.
3. Game-session authorization.
4. Ephemeral credential registry.
5. OpenAI BYOK integration.
6. Gemini BYOK integration.
7. Claude and Ollama Cloud integration.
8. Redaction, SSRF, and isolation tests.
9. Restart recovery and reconnect hardening.
10. Public demo with strict concurrency and retention limits.

## References

- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel background-task lifecycle](https://vercel.com/kb/guide/troubleshooting-inconsistent-logs-in-vercel-functions)
- [Render free-tier limitations](https://render.com/docs/free)
- [Cloud Run streaming guidance](https://docs.cloud.google.com/run/docs/triggering/websockets)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Neon pricing](https://neon.com/pricing)
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [OpenAI API-key safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key)
- [Gemini API-key guidance](https://ai.google.dev/gemini-api/docs/api-key)
