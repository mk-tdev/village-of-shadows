# Village of Shadows frontend

The frontend is a Next.js 16 application for the Village of Shadows multi-agent Werewolf experience.

## Routes

| Route | Purpose |
|---|---|
| `/` | Cinematic animated landing page introducing the game and agent architecture |
| `/setup` | Human-seat, provider, model, and personality configuration with model readiness checks |
| `/game/[sessionId]` | Live game, 3D village, human controls, God Mode, LangGraph diagrams, and Learning Debrief |
| `/how-to-play` | Rules, architecture overview, provider requirements, and suggested models |
| `/connect` | Full-screen presentation finale with the GitHub QR code and creator links |
| `/history` | Operator-only archive of hosted sessions, attendance, timing, outcomes, and public transcripts |

## Development

Install dependencies:

```bash
pnpm install
```

Run the frontend by itself:

```bash
pnpm dev
```

The standalone frontend normally opens at [http://localhost:3000](http://localhost:3000). When the repository-level `start.sh` script is used, the application opens at [http://localhost:4001](http://localhost:4001).

The FastAPI backend defaults to `http://127.0.0.1:8000`. To use a different backend, create `.env.local` with:

```dotenv
NEXT_PUBLIC_API_URL=https://your-backend.example.com
```

The backend must be reachable for setup preflight, game creation, SSE streaming, human actions, and graph introspection.

## Verification

```bash
pnpm lint
pnpm build
```

See the [repository README](../README.md) for architecture, backend setup, supported providers, testing, deployment notes, and the complete feature overview.
