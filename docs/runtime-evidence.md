# Runtime evidence

This document records reproducible verification for the GOAI 2026 semi-final
build. It is intentionally based on commands that can be rerun from a clean
checkout, not screenshots of an unrepeatable environment.

## Verification commands

```bash
cd backend
uv run pytest -q

cd ../frontend
npm run lint
npm run build
```

The backend suite covers graph flow, human interrupts, private human views,
MCP identity and tools, model preflight, multi-human rooms, pause/resume,
belief and note ledgers, special roles, village events, werewolf negotiation,
branching, tournaments, replay sharing, voice boundaries, resilience, and
host-authorized data deletion.

`mock-v1` is the no-key reproducibility path. It exercises the real graph,
interrupt/resume, tool validation, persistence, SSE events, checkpointing,
debrief, and win conditions without claiming that deterministic mock behavior
represents a hosted model's quality. Provider comparison must be rerun with
the evaluator's own authorized model accounts and is guarded by the same
preflight route used by the UI.

## Evidence produced by each completed game

- outcome, rounds, wall-clock duration, event count, and graph-step count;
- complete phase and checkpoint timeline;
- human interrupt positions and submitted action types;
- accepted, rejected, and read-only tool-call counts;
- public/private event split and role-private discoveries;
- per-seat model, turn count, memory messages, and checkpoints;
- immutable belief/note revisions with source event references;
- same-stage decisions for comparing different models;
- a five-question browser-local concept check and exportable Markdown learning
  report.

## Verified result — 25 August 2026

| Check | Result |
|---|---|
| Backend test suite | **70 passed** in 3.66 seconds |
| Frontend lint | **Passed** with zero errors |
| Next.js production build | **Passed**; 11 routes generated |

Pytest reported two non-failing warnings: one upstream MCP client deprecation
notice and one prior SQLite worker-shutdown warning in an existing village-event
test. Neither warning changed a test outcome. The verification does not claim
performance or learning-effectiveness results from hosted models; those remain
controlled experiments for the evaluator's authorized provider accounts.
