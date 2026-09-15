#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_ROOT="${UNREAL_ENGINE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"
PROJECT_FILE="$PROJECT_ROOT/unreal/VillageOfShadows/VillageOfShadows.uproject"
if ! curl --fail --silent --max-time 3 http://127.0.0.1:8000/health >/dev/null; then
  echo "Start the local backend first; see unreal/README.md." >&2
  exit 1
fi
bash "$ENGINE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" VillageOfShadowsEditor Mac Development "$PROJECT_FILE" -WaitMutex
exec "$ENGINE_ROOT/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PROJECT_FILE" -game -windowed -ResX=1440 -ResY=900
