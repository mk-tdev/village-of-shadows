# Third-party services, software, and assets

Village of Shadows is released under the [MIT License](LICENSE). That license
applies to this repository's original source code and project-authored assets;
it does not replace the licenses or terms of third-party dependencies and
services.

## Model and speech services

The application can be configured to call the following external services:

| Integration | Purpose | Data sent when enabled | Credentials |
|---|---|---|---|
| OpenAI API | Agent decisions; optional speech synthesis | The configured seat's system instructions, permitted game context, tool schema, and public line selected for speech | Server-side environment variable |
| Anthropic API | Agent decisions | The configured seat's system instructions, permitted game context, and tool schema | Server-side environment variable |
| Google Gemini API | Agent decisions | The configured seat's system instructions, permitted game context, and tool schema | Server-side environment variable |
| Ollama Cloud | Agent decisions | The configured seat's system instructions, permitted game context, and tool schema | Server-side environment variable |
| Local Ollama | Local agent decisions | The same seat-bounded prompt, sent only to the configured local endpoint | No hosted credential required |
| Mock provider | Offline deterministic play and testing | Nothing leaves the application | None |

Model access, retention, training, geographic processing, and billing are
governed by the account owner's agreement with the selected provider. This
repository does not redistribute provider models. API keys are read by the
backend and are not included in game state, logs, replay exports, or browser
responses.

## Principal open-source dependencies

The runtime dependency manifests are authoritative:

- [`backend/pyproject.toml`](backend/pyproject.toml) — FastAPI, LangGraph,
  LangChain provider adapters, MCP, aiosqlite, HTTPX, Pydantic Settings,
  SSE-Starlette, and Uvicorn.
- [`frontend/package.json`](frontend/package.json) — Next.js, React,
  Three.js, React Three Fiber, Tailwind CSS, TypeScript, and ESLint.

Each dependency remains subject to the license published by its maintainer and
recorded in the resolved package metadata. Before redistribution, deployers
should retain the lockfiles and run their normal software-composition and
license review against the exact resolved versions.

## Visual and audio assets

Project-authored interface art, portraits, role artifacts, poster imagery,
favicon, and promotional compositions were created for Village of Shadows,
including AI-assisted generation followed by project-specific selection,
editing, layout, and integration. They depict fictional people and places and
are not intended to identify real persons. The repository does not contain a
stock-photo dataset or scraped face collection.

Voice output is generated on demand only when a user enables Voice Council.
The authoritative council text remains visible in the interface. Generated
audio is cached by game event to avoid duplicate provider calls and can be
removed through the host-authorized game-data deletion endpoint.

## Standards and linked projects

References to LangGraph, LangChain, MCP, OpenAI, Anthropic, Google, Ollama,
Next.js, React, Three.js, FastAPI, Vercel, Render, or their marks indicate
technical interoperability only. No endorsement or sponsorship is implied.

## Explore village: characters (CC0)

The eight rigged villagers in `frontend/public/exploration/characters/` were
assembled for this project from Quaternius packs released under CC0 1.0
(https://creativecommons.org/publicdomain/zero/1.0/): Universal Base
Characters, Modular Character Outfits – Fantasy, and Universal Animation
Library 1 and 2 (https://quaternius.itch.io). Assembly, animation transfer,
tints and compression are recorded in `characters/PROVENANCE.md`.

## Explore village: environment (CC0)

PBR textures, props, plants and the night HDRI in
`frontend/public/exploration/env/` are from Poly Haven (https://polyhaven.com),
released under CC0. They were downsized, simplified and recompressed
(meshopt geometry, WebP textures). The list is in
`frontend/public/exploration/README.md`.

## Explore village: audio (CC0)

Footsteps, ambience, one-shots and music in `frontend/public/exploration/audio/`
come from Kenney (https://kenney.nl, CC0) and CC0-licensed Freesound
recordings (https://freesound.org). Per-file authors, source URLs and edits are
in `audio/PROVENANCE.md`. The creature snarls (`attack.mp3`, `growl.mp3`) are
CC0 recordings by Darsycho on OpenGameArt.
