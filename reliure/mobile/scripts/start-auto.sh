#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${RELIURE_PORT:-8082}"

if [ ! -d node_modules ]; then
  echo "==> Dependencies missing, running npm install"
  npm install
fi

echo "==> Starting Reliure mobile"
echo "==> Trying Expo tunnel first"
set +e
npx expo start --tunnel --port "$PORT"
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  exit 0
fi

echo ""
echo "==> Tunnel failed, falling back to LAN."
echo "    Make sure your phone and Mac are on the same Wi-Fi."
echo ""
npx expo start --lan --port "$PORT" --clear
