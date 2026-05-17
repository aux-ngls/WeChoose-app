#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOBILE_DIR="$ROOT_DIR/reliure/mobile"

cd "$ROOT_DIR"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "==> Pulling latest Reliure/Qulte changes"
  git pull --ff-only
fi

cd "$MOBILE_DIR"
echo "==> Installing mobile dependencies"
npm install

echo "==> Checking mobile TypeScript"
npm run typecheck

echo "==> Reliure mobile is up to date"
echo "    If Expo is running, press r in its terminal to reload."
