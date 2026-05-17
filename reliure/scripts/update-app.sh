#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Reliure update"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "==> Pulling latest changes on $CURRENT_BRANCH"
  else
    echo "==> Pulling latest changes"
  fi
  git pull --ff-only
else
  echo "==> No git repository detected, skipping git pull"
  echo "    If Reliure is installed from an archive, replace the folder with the new archive first."
fi

echo "==> Installing dependencies"
npm install

echo "==> Checking TypeScript"
npm run typecheck

echo "==> Update complete"
echo "    If Expo is already running in Terminal 1, press r there to reload."
echo "    If tunnel mode fails, use: npm run dev:lan"
