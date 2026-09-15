# 24. Bilingual teaching council

## Session options and repeated discussion

`GameOptions.language` accepts `en` or `zh` (Simplified Chinese/Mandarin).
`discussion_rounds` accepts 1–5, default 3. These fields use the existing JSON
options persistence and checkpoint/branch serialization, so a restored session
retains its language and debate length. The UI language is a separate local
preference; changing it does not rewrite the shared game or old statements.

The graph still performs exactly one speaker per node execution. `day_index`
now counts all speaking turns across the day's passes. Speaker selection uses
`day_index % living_count`; the edge loops until `living_count * discussion_rounds`.
Turn stamps include the full index, so pass two cannot reuse pass one's committed
decision. Human statement prompts carry the same pass-specific turn ID: an earlier
UI lock keyed only by day/phase/seat incorrectly kept the next pass disabled.
The browser now remounts input for each turn and sends that ID with the answer;
stale modern-client answers are rejected. Legacy requests without IDs remain
compatible. Human interrupts, pause replay, and per-seat memory continue to use
the same mechanisms. A silenced player loses their speaking turns for that day.
Later passes ask agents to respond to specific claims instead of repeating a speech.

Every `_briefing` explicitly requests the session language without translating
names or tool identifiers. Public game text is generated in that language;
technical traces and externally supplied model/personality identifiers remain
original evidence. The mock provider remains scripted, not a real language model.

## Exact-line speech and synchronized presentation

A pitfall this project hit: the browser selected only the latest statement on
an SSE update and cancelled whatever was already speaking. Async generation
could then finish out of order, causing voice and captions to disagree.

`VoiceCouncil` now queues immutable public statement sequence IDs in order.
It never narrates role-private events. Audio playback events identify the active
sequence; the main feed scrolls to/highlights that exact bubble, and the floating
chat shows the same line while audio plays. The server's game transcript remains
live; the audio queue does not hold the graph hostage to a slow or muted client.
A visible queue count and Skip/Replay let viewers manage any narration backlog.

Generation uses the existing authenticated `/games/{id}/voice/{seq}` endpoint.
The server retrieves text from the immutable public log and caches the resulting
OpenAI audio. There is no arbitrary-text narration endpoint and no automatic
fallback to low-quality browser voices. Failures offer Retry/Skip with text intact.
Disabling, skipping, or leaving cancels pending work, and generation tokens stop
late responses from resurrecting cancelled audio. Game pause and microphone
recording pause playback; music also falls silent during microphone capture.
Long historical statements exceeding the speech API limit fail explicitly instead
of silently truncating the spoken text.

## Human speech input

`MicrophoneInput` requests microphone access only after an explicit player click.
Recordings stop at 60 seconds; tracks and pending requests are released on cancel,
unmount, or turn change. It sends WebM/MP4/OGG to a seat-authenticated transcription
endpoint. The server validates language, MIME, size (8 MiB), current input turn,
and an eight-attempt per-turn budget before calling `gpt-4o-transcribe`.
Recordings are not stored by the app. Chinese is transcribed rather than translated.

The returned transcript fills an editable field. It never bypasses normal input
validation or automatically casts a vote. For a target decision, the player reads
the transcript then selects the intended legal target. This is turn-based
record/transcribe/review interaction, not an always-listening realtime voice agent.

## Presentation and teaching

Compact/Wide presentation and English/Chinese interface preferences are persisted
locally, with usable defaults if browser storage is blocked. The floating public
chat appears when the main transcript has scrolled above the viewport, stacked
above the mini council. Neither floating panel exposes private role information.
The subtle synthesized horror score has an independent volume control and ducks
beneath dialogue.

See [the five teaching activities](../teaching/finals-classroom-activities.md),
[VoiceCouncil](../../frontend/components/VoiceCouncil.tsx),
[MicrophoneInput](../../frontend/components/MicrophoneInput.tsx),
[voice routes](../../backend/app/routers/voice.py), and
[discussion nodes](../../backend/app/game/nodes.py).

Speech API references: [text to speech](https://developers.openai.com/api/docs/guides/text-to-speech)
and [file transcription](https://developers.openai.com/api/docs/guides/speech-to-text).

## Demo length and photo characters

Setup now defaults to **one discussion round**. Quick demo (1), Short discussion (2), Full debate (3), and a 1–5 selector appear above the seat choices. This controls each living player's speaking turns per discussion phase, before voting; it does not limit the total number of day/night cycles. The server keeps its existing default of three for older API clients that omit the option.

Every human seat in setup has an optional **Your village character** panel. Upload a clear single-person JPEG, PNG or WebP, generate, inspect the reference and result, then choose **Use this character**. Invited humans can perform the same flow for their own seat in the game lobby. The host should wait for participants to finish before starting. Character changes are locked once play begins.

The [character router](../../backend/app/routers/characters.py) validates image content, size and dimensions, removes photo metadata, and calls OpenAI's Images edit API with a face-preserving, photorealistic village costume prompt. `CHARACTER_IMAGE_MODEL` defaults to `gpt-image-2.5-sunburst`; `OPENAI_API_KEY` is required. The integration follows the [official image generation guide](https://developers.openai.com/api/docs/guides/image-generation). Only generated full-figure art and a derived portrait are stored in PostgreSQL; source photos are sent to OpenAI for processing but are not persisted by this app. Results are AI-generated and likeness requires user review. The studio allows two concurrent generations and at most 30 attempts per hour per backend process, with no automatic paid retries.

Generated art uses unguessable capability URLs and is visible to room participants. The ID travels with each seat through configuration, game state and checkpoint branches. Lobby changes require the matching seat credential, update only that seat, and broadcast a public `character_updated` event. The [character context](../../frontend/components/CharacterAssets.tsx) supplies the same identity to setup portraits, player cards, chat entries, the village scene and the floating council. These are composited full-figure images, consistent with the existing scene, rather than rigged 3D meshes.

Validation: round boundaries at 1, 2, 3 and 5 passes, invalid/oversized uploads, generated image persistence, distinct identities for two human seats, credential isolation, and rejection after the game starts are covered by [character tests](../../backend/tests/test_characters.py). Provider generation is mocked in the deterministic suite; face likeness must be reviewed with a real reference photo.

Browser verification also exercised a live generation using an existing synthetic Mara portrait, applied its full-body result in setup, and loaded it in a two-human game. No personal user photo was used. English/Chinese presets and per-human studio controls were checked.

### Pitfall: Docker dependency drift broke photo generation

The character router imports Pillow. Adding it to `pyproject.toml` and `uv.lock` made the development virtual environment work, but Docker installs from `backend/requirements.lock`. Leaving that export stale caused the entire API to exit with `ModuleNotFoundError: PIL`; browsers reported a refused connection. Regenerate the production export with `uv export --frozen --no-dev --format requirements-txt --output-file requirements.lock` from `backend` whenever dependencies change. Compose now checks the API's `/health` endpoint before starting the frontend, and `start.sh` waits for health and prints backend logs on failure.

### Pitfall: microphone controls leaked into voting

The shared target-selection UI accidentally rendered the discussion microphone and transcript during votes and night actions, although those actions submit only a selected target. Speech capture is now shown only for statements and private werewolf negotiation; voting, healing, investigation and other target selections retain their dedicated controls.
