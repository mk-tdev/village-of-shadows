#!/usr/bin/env bash
# Starts the backend (FastAPI/uvicorn, port 8000) and frontend (Next.js, port
# 3000) as background processes, logging to logs/ and recording PIDs to .run/
# so stop.sh can find and kill exactly these processes later.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

mkdir -p logs .run

if lsof -ti ":$BACKEND_PORT" >/dev/null 2>&1 || lsof -ti ":$FRONTEND_PORT" >/dev/null 2>&1; then
    echo "Something is already listening on port $BACKEND_PORT or $FRONTEND_PORT."
    echo "Run ./stop.sh first, then try again."
    exit 1
fi

if [ ! -f backend/.env ]; then
    echo "Warning: backend/.env not found -- real (non-mock) provider seats will fail." >&2
fi

echo "Starting backend on :$BACKEND_PORT ..."
(
    cd backend
    uv run uvicorn app.main:app --reload --host 127.0.0.1 --port "$BACKEND_PORT"
) > logs/backend.log 2>&1 &
echo $! > .run/backend.pid

echo "Starting frontend on :$FRONTEND_PORT ..."
(
    cd frontend
    PORT="$FRONTEND_PORT" pnpm dev
) > logs/frontend.log 2>&1 &
echo $! > .run/frontend.pid

sleep 1
echo
echo "Backend:  http://127.0.0.1:$BACKEND_PORT   (log: logs/backend.log)"
echo "Frontend: http://localhost:$FRONTEND_PORT  (log: logs/frontend.log)"
echo
echo "Run ./stop.sh to stop everything."
