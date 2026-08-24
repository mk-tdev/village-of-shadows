#!/usr/bin/env bash
# Stops everything start.sh started. Belt-and-suspenders on purpose: uvicorn
# --reload and pnpm/next each fork child processes (the reloader worker, the
# next-server), so killing only the recorded PID has repeatedly left orphans
# still holding the port during this project's development. This script
# kills every recorded PID, anything still listening on the development
# ports, and project-scoped test/dev processes (pytest, Playwright, Next,
# uvicorn, and friends), in that order. Pattern matches are checked against
# the process working directory so another project's test run is never killed.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-4001}"
EXTRA_DEV_PORTS="${EXTRA_DEV_PORTS:-3000}"

kill_pid_tree() {
    local pid="$1"
    [ -z "$pid" ] && return
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_pid_tree "$child"
    done
    kill -9 "$pid" >/dev/null 2>&1 || true
}

is_project_process() {
    local pid="$1"
    local cwd command
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$cwd" in
        "$ROOT_DIR"|"$ROOT_DIR"/*) return 0 ;;
    esac
    case "$command" in
        *"$ROOT_DIR"*) return 0 ;;
    esac
    return 1
}

kill_project_matches() {
    local pattern="$1"
    local pid
    for pid in $(pgrep -f "$pattern" 2>/dev/null || true); do
        [ "$pid" = "$$" ] && continue
        if is_project_process "$pid"; then
            echo "  stopping project process $pid ($pattern)"
            kill_pid_tree "$pid"
        fi
    done
}

echo "Stopping recorded processes..."
for pidfile in .run/*.pid; do
    [ -e "$pidfile" ] || continue
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    kill_pid_tree "$pid"
    rm -f "$pidfile"
done

echo "Killing anything on the configured development ports..."
for port in "$BACKEND_PORT" "$FRONTEND_PORT" ${EXTRA_DEV_PORTS//,/ }; do
    pids="$(lsof -ti ":$port" 2>/dev/null || true)"
    [ -n "$pids" ] && kill -9 $pids >/dev/null 2>&1 || true
done

echo "Stopping project-scoped development and test processes..."
for pattern in \
    "uvicorn" \
    "hypercorn" \
    "gunicorn" \
    "next-server" \
    "next dev" \
    "npm.*run.*dev" \
    "pnpm.*dev" \
    "vite" \
    "pytest" \
    "py.test" \
    "python.*-m.*pytest" \
    "playwright.*test" \
    "vitest" \
    "jest"; do
    kill_project_matches "$pattern"
done

sleep 1

still_up=""
for port in "$BACKEND_PORT" "$FRONTEND_PORT" ${EXTRA_DEV_PORTS//,/ }; do
    port_pids="$(lsof -ti ":$port" 2>/dev/null || true)"
    [ -n "$port_pids" ] && still_up="$still_up $port_pids"
done
if [ -n "$still_up" ]; then
    echo "Warning: a configured development port is still occupied (pid(s):$still_up)" >&2
    exit 1
fi

echo "All project development and test services stopped."
