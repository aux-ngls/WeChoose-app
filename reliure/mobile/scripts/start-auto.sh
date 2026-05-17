#!/usr/bin/env bash
set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELIURE_DIR="$(cd "$MOBILE_DIR/.." && pwd)"
BACKEND_DIR="$RELIURE_DIR/backend"

MOBILE_PORT="${RELIURE_PORT:-8082}"
API_PORT="${RELIURE_API_PORT:-8092}"
EXPO_MODE="${RELIURE_EXPO_MODE:-lan}"
BACKEND_PID=""
BACKEND_LOG="${TMPDIR:-/tmp}/reliure-backend.log"

detect_host_ip() {
  if [ -n "${RELIURE_HOST_IP:-}" ]; then
    printf '%s\n' "$RELIURE_HOST_IP"
    return
  fi

  if command -v ipconfig >/dev/null 2>&1; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
    return
  fi

  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
    return
  fi

  printf '127.0.0.1\n'
}

api_alive() {
  curl -fsS --max-time 2 "$EXPO_PUBLIC_API_URL/health" >/dev/null 2>&1
}

cleanup() {
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "$MOBILE_DIR"

if [ ! -d node_modules ]; then
  echo "==> Dependencies missing, running npm install"
  npm install
fi

HOST_IP="$(detect_host_ip)"
HOST_IP="${HOST_IP:-127.0.0.1}"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://$HOST_IP:$API_PORT}"

echo "==> Reliure API: $EXPO_PUBLIC_API_URL"
if api_alive; then
  echo "==> Backend already running"
else
  echo "==> Starting Reliure backend on port $API_PORT"
  (
    cd "$BACKEND_DIR"
    python3 -m uvicorn main:app --host 0.0.0.0 --port "$API_PORT"
  ) >"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!

  for _ in $(seq 1 30); do
    if api_alive; then
      break
    fi
    sleep 1
  done

  if ! api_alive; then
    echo "==> Backend did not start. Last logs:"
    tail -40 "$BACKEND_LOG" || true
    exit 1
  fi
fi

echo "==> Starting Reliure mobile with Expo ($EXPO_MODE)"
case "$EXPO_MODE" in
  tunnel)
    npx expo start --tunnel --port "$MOBILE_PORT"
    ;;
  localhost)
    npx expo start --localhost --port "$MOBILE_PORT"
    ;;
  lan|*)
    npx expo start --lan --port "$MOBILE_PORT" --clear
    ;;
esac
