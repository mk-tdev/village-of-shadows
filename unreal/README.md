# Village of Shadows — Unreal forest episode

Native Unreal 5.8 C++ first-person forest exploration on `codex/unreal-agentic-game`.
Follow the lantern path, speak to three spectral villagers, earn their seals,
and leave through the far gate. This is a short development slice, not a finished
commercial game.

## Play on this Mac

1. Start Docker Desktop, then run `docker compose up -d postgres` from the repository.
2. In `backend/`, run `.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`.
3. Run `bash unreal/play.sh` from the repository. This builds the native module
   and opens Unreal in game mode, without requiring editor interaction.
4. WASD walks; mouse looks; Shift runs; F toggles the lantern. R toggles
   auto-walk along the path with a steady view; S cancels it. Auto-walk stops
   at the next spirit. Press R again after talking to continue.
5. Press E near Sable on the entrance path, Elin at the well, or Corvin near
   the chapel. Type a line and press Enter or Speak. Listen to their concerns.
   Their live AI decides whether to trust you with a seal. Select Return to
   the forest to resume walking.
6. With all three seals, leave through the wooden gate at the far end.

Dialogue uses the configured server-side OpenAI key and incurs API usage.
Each walk allows sixty successful dialogue lines. Replies use generated
AI character voices. Click **Talk with microphone**, speak, then click
**Stop recording & send**. macOS may ask for UnrealEditor microphone access.
Recording is capped at twenty seconds; leaving the dialog cancels without sending.
Recordings go to OpenAI for transcription; the application stores transcripts,
not microphone audio. Generated character audio is cached for replay.

The first Xcode launch may require `xcodebuild -downloadComponent MetalToolchain`.
Close the game with the window close control or Command-Q. The backend stays
running. Closing the game starts a new forest session on the next launch.

## Current scope

- First-person forest with textured tree, fern, rock, and robed spirit meshes.
- Modular timber village, open-door interiors, well, chapel, lantern path, and exit.
- Separate live conversation memories for three spirits, persisted in PostgreSQL.
- Validated speaking, recoil, and seal-granting decisions; three-seal objective.
- Procedural wind ambience, floating spectral figures, and natural AI-voiced replies.
- Input retry preserves the line and request identifier, avoiding duplicate calls.
- No API keys embedded in the Unreal project.

Not yet implemented: rigged production characters, continuous realtime voice,
spatial voice/lip sync, combat, multiplayer, save-slot UI, or packaged distribution.
Spirits currently use detailed static robed meshes with floating/recoil movement.
The forest episode is separate from the existing council's LangGraph sequence.
The earlier council client is retained in `ShadowGameMode.cpp`, no longer default.

Poly Haven assets are CC0; source URLs, authors, and checksums are in
`SourceAssets/*/provenance.json`. The source downloader verifies checksums;
`import_forest.py` imports and prepares materials through Unreal Python.

## Verification

From `backend/`, `.venv/bin/python ../unreal/test_forest_api.py` checks authentication,
validation, memory isolation, idempotency, and completion with substituted decisions.
`--live` makes a paid AI call; add `--voice` to test synthesis and transcription.
Tests remove only their own forest session and voice cache, never
truncate existing games. The older council contract test remains available.

Verified on this Mac: native compilation, imported materials, forest rendering,
auto-walk to Sable, opening character dialogue, live AI reply and seal update,
and the server speech-generation/transcription round-trip. Physical microphone
capture still requires explicit permission and a user-audio test.

Engine installation is external to Git. Source and config are versioned;
Binaries, Intermediate, Saved and shader caches are ignored.
