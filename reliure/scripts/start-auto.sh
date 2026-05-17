#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${RELIURE_PORT:-8082}"

if [ ! -d node_modules ]; then
  echo "==> Dependencies missing, running npm install"
  npm install
fi

echo "==> Starting Reliure"
echo "==> First try: Expo tunnel"
echo "    If ngrok fails, Reliure will automatically restart in LAN mode."

set +e
npx expo start --tunnel --port "$PORT"
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  exit 0
fi

echo ""
echo "==> Tunnel failed. Falling back to LAN mode."
echo "    Make sure your phone and Mac are on the same Wi-Fi, then scan the new QR code."
echo ""
npx expo start --lan --port "$PORT" --clear
