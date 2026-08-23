# 20. Resilience, voice, and cross-game continuity

**Files:** [`agent_turn.py`](../../backend/app/game/agent_turn.py),
[`relationships.py`](../../backend/app/game/relationships.py),
[`voice.py`](../../backend/app/game/voice.py), and
[`VoiceCouncil.tsx`](../../frontend/components/VoiceCouncil.tsx).

## Retry generation, never a committed action

Provider recovery wraps only the model-generation call. Timeouts and bounded
exponential retries happen before MCP tools execute. If the primary provider
fails, an explicitly configured fallback model may try; exhaustion produces a
server-validated deterministic action and can request a pause at the next safe
boundary. Turn and game token budgets are enforced server-side, and every
retry, fallback, or budget stop becomes an observable resilience event and a
persisted decision diagnostic.

## Immersion must not redefine truth

Voice Council is disabled until the viewer opts in. Its lifelike mode sends no
browser-authored text: the backend resolves the requested sequence number to a
persisted, public `statement` and rejects private or non-statement events. It
then gives the seat a stable OpenAI voice with an ancient-village performance
direction. Audio is cached by game, immutable log sequence, model, and voice,
so two human browsers do not generate or pay for the same line twice.

If neural speech is not configured or fails, the browser ranks its installed
voices for natural English speakers, avoids known novelty/compact engines, and
uses restrained seat-specific pacing and pitch. Mute, skip, replay, engine,
and pace controls never modify game state. Speech failure always falls back to
the caption because persisted text—not generated audio—is authoritative. The
interface explicitly labels neural narration as AI-generated.

## Continuity must not smuggle old secrets into a new world

Cross-game relationships are separately opt-in. At game end, high-confidence
belief revisions become source-cited communication observations. The original
reason and role are deliberately not copied: every new deal resets secret
roles. Users can inspect, edit, or erase the archive, and disabling the option
keeps it out of both the prompt and the game.
