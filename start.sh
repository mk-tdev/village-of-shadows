#!/usr/bin/env bash
# Starts the complete local stack: Next.js, FastAPI/LangGraph, and Postgres.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker Desktop is required. Install it, start it, then run ./start.sh." >&2
    exit 1
fi

echo "Building and starting Village of Shadows..."
docker compose up --build --detach
docker compose ps

echo
echo "Frontend: http://localhost:4001"
echo "Backend:  http://127.0.0.1:8000/health"
echo "Logs:     docker compose logs --follow"
echo
echo "Run ./stop.sh to stop development and test containers."
