#!/usr/bin/env bash
# Stops local Village of Shadows Docker services without deleting databases.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if command -v docker >/dev/null 2>&1; then
    docker compose down
    docker compose -f compose.test.yaml down
fi

echo "All local Village of Shadows containers stopped."
echo "Postgres volumes remain intact; use Docker volume removal only when you explicitly want a fresh database."
