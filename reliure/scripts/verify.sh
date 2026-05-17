#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> TypeScript"
npm run typecheck

if [ "${RELIURE_EXPORT:-1}" = "0" ]; then
  echo "==> Export checks skipped because RELIURE_EXPORT=0"
  exit 0
fi

VERIFY_DIR="$ROOT_DIR/dist-verify"
rm -rf "$VERIFY_DIR"

echo "==> Expo Android export"
npx expo export --platform android --output-dir "$VERIFY_DIR/android"

echo "==> Expo web export"
npx expo export --platform web --output-dir "$VERIFY_DIR/web"

rm -rf "$VERIFY_DIR"
echo "==> Reliure verification complete"
