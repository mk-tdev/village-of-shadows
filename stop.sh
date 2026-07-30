#!/usr/bin/env bash
# Stops everything start.sh started. Belt-and-suspenders on purpose: uvicorn
# --reload and pnpm/next each fork child processes (the reloader worker, the
# next-server), so killing only the recorded PID has repeatedly left orphans
# still holding the port during this project's development. This script
# kills the recorded PIDs, anything still listening on the two ports, and
# anything matching the dev-server command lines, in that order.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-4001}"

kill_pid_tree() {
    local pid="$1"
    [ -z "$pid" ] && return
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_pid_tree "$child"
    done
    kill -9 "$pid" >/dev/null 2>&1 || true
}

echo "Stopping recorded processes..."
for pidfile in .run/backend.pid .run/frontend.pid; do
    if [ -f "$pidfile" ]; then
        pid="$(cat "$pidfile")"
        kill_pid_tree "$pid"
        rm -f "$pidfile"
    fi
done

echo "Killing anything on port $BACKEND_PORT or $FRONTEND_PORT..."
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    pids="$(lsof -ti ":$port" 2>/dev/null || true)"
    [ -n "$pids" ] && kill -9 $pids >/dev/null 2>&1 || true
done

echo "Killing any matching dev-server processes..."
pkill -9 -f "uvicorn app.main:app" >/dev/null 2>&1 || true
pkill -9 -f "next-server" >/dev/null 2>&1 || true
pkill -9 -f "next dev" >/dev/null 2>&1 || true
pkill -9 -f "pnpm dev" >/dev/null 2>&1 || true

sleep 1

still_up="$(lsof -ti ":$BACKEND_PORT" -ti ":$FRONTEND_PORT" 2>/dev/null || true)"
if [ -n "$still_up" ]; then
    echo "Warning: something is still listening on :$BACKEND_PORT or :$FRONTEND_PORT (pid(s): $still_up)" >&2
    exit 1
fi

echo "All stopped. Ports $BACKEND_PORT and $FRONTEND_PORT are free."
