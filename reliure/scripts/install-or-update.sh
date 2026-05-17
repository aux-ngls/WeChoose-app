#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Installing/updating Reliure dependencies"
npm install

echo "==> Checking Reliure"
npm run typecheck

echo "==> Reliure is ready"
echo "    Start it with: npm run dev:auto"
