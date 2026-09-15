# 23 — Native Unreal clients and bounded character minds

## Forest exploration (current default)

`unreal/VillageOfShadows/Source/VillageOfShadows/ForestGameMode.cpp` is the
first-person forest client. Nearby-character dialogue goes to the new
`backend/app/routers/forest.py`, not directly to a provider.

Each spirit has an independent twelve-exchange history and a distinct concern.
The existing provider adapter supplies the configured OpenAI model. Structured
output bounds decisions to speaking, recoiling, or granting that spirit's seal.
Unreal animates recoil and displays the server's seal count; the exit requires
all three seals. This is a separate exploration episode, not a port of the
council's LangGraph turn sequence. Models cannot execute Unreal commands or
grant another character's seal.

An additive PostgreSQL table stores histories, seals, turn counts, and request
receipts, alongside a hash of the session bearer token. A dedicated transaction
and row lock serialize concurrent retries: the same request identifier returns
the saved response; different dialogue with that identifier is rejected. Model
failure rolls back the transaction. The client retains its line and identifier.
There is a forty-second model timeout, a 1,200-character input bound, and a
sixty-successful-line limit per walk. Session creation is local and unauthenticated;
this is not a global spending cap. Public hosting requires account authentication
and rate/budget controls.

The native token is in memory only. Database memory survives server restart, but
closing the client starts a new walk. Proximity and locomotion are single-player
rules, not authoritative multiplayer observations. The model decides subjective
trust; it does not verify physical evidence from player claims.

## Voice conversation

The character dialog offers explicit click-to-record, click-to-stop input,
capped at twenty seconds. Leaving the dialog cancels capture without uploading.
Capture buffers are memory-only. Mono PCM WAV goes to the authenticated
`/forest/transcribe` endpoint, which validates format, size, and duration before
calling OpenAI transcription. A walk is limited to 120 transcription attempts.
The transcript becomes a normal dialogue turn and is saved with the spirit's
memory. The recording itself is not stored by this application.

The reply's saved request identifier authorizes `/forest/voice/{request_id}`.
The server chooses the character's built-in voice and speaks only the saved
reply; clients cannot supply arbitrary synthesis text. Generated 24kHz PCM is
cached in PostgreSQL, so replay does not regenerate audio. Unreal plays it via
a procedural sound wave. Leaving the dialog or recording another line stops
playback and invalidates late voice callbacks. Voices are disclosed as AI-generated.
This is turn-based recorded speech, not a continuous realtime voice connection;
transcription, reasoning, and speech synthesis each contribute latency.

The [official speech guide](https://developers.openai.com/api/docs/guides/text-to-speech)
documents voice instructions and PCM encoding; the
[transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text)
documents bounded file transcription. These informed the native audio transport.

`unreal/test_forest_api.py` checks authentication, isolated memory, idempotency,
validation, and three-seal completion with a substituted decision function.
Its explicit `--live` mode tests a real provider. It removes only its own session
and never truncates existing games.

### Native-build pitfalls found

Imported materials need saved instanced-static-mesh usage flags or game mode
substitutes fallback materials on foliage. Mesh references must include the
Interchange-generated `StaticMeshes` directory. Player placement belongs in
`RestartPlayer`, because a pawn may not exist yet in game-mode `BeginPlay`.

## Earlier council client (retained, no longer the default)

The Unreal prototype adds a second presentation client. It does not duplicate
LangGraph or give a model direct access to Unreal actors. Its runtime module
is `unreal/VillageOfShadows/Source/VillageOfShadows/ShadowGameMode.cpp`.

## Game loop

The client preflights its six AI configurations, creates a seven-seat game,
and begins it with the returned host credential. Its subsequent state requests
use only Mara’s seat credential. Human inputs resume the same graph used by
the browser: investigation, discussion, voting, and role actions.

The current investigation testimony is authored; the later council is agentic.
Unreal provides controls and staging, while the server validates legal choices
and owns the canonical evidence, private roles, agent memories, and outcome.

## Snapshot transport

This initial native client polls the existing filtered state endpoint once per
second rather than consuming browser EventSource/SSE. Only one snapshot request
is in flight at a time. Log sequence numbers avoid duplicate displayed lines;
human action buttons are disabled while submission is in flight. A brief
accepted-turn suppression prevents a stale snapshot from immediately reviving
the action just submitted. This is client UX protection, not a replacement for
server validation or a durable exactly-once transport.

Connection errors are displayed and polling retries. Pause recovery uses the
existing host continue endpoint. Credentials remain in memory; persistent
native session recovery is still future work. Future physical-world actions
will need authoritative observation and completion contracts before they can
become facts in an agent’s private view.

## Development boundaries

Practice uses deterministic mock agents through the real graph/tool path. Live
mode uses server-configured OpenAI credentials and incurs model charges.
The native client never reads backend environment files or embeds model keys.
The current 3D actors are presentation placeholders and do not encode secret roles.

The executable API smoke test in `unreal/test_council_api.py` checks a complete
practice match and verifies hidden roles are absent from the human state.
