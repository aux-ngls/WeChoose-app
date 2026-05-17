#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT_DIR="$(dirname "$ROOT_DIR")"
APP_DIR_NAME="$(basename "$ROOT_DIR")"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
STAMP="$(date -u +"%Y%m%d-%H%M%S")"
CREATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
RELEASE_DIR="${RELIURE_RELEASE_DIR:-"$PARENT_DIR/reliure-releases"}"
ARCHIVE_NAME="reliure-mobile-v${VERSION}-${STAMP}.tar.gz"
LATEST_NAME="reliure-mobile-latest.tar.gz"
ARCHIVE_PATH="$RELEASE_DIR/$ARCHIVE_NAME"
LATEST_PATH="$RELEASE_DIR/$LATEST_NAME"
PARENT_LATEST_PATH="$PARENT_DIR/$LATEST_NAME"
METADATA_PATH="$RELEASE_DIR/latest.json"
CHECKSUM_PATH="$LATEST_PATH.sha256"

mkdir -p "$RELEASE_DIR"

if [ "${RELIURE_SKIP_VERIFY:-0}" != "1" ]; then
  echo "==> Running release verification"
  npm run verify
else
  echo "==> Verification skipped because RELIURE_SKIP_VERIFY=1"
fi

echo "==> Creating release archive"
tar \
  --exclude='node_modules' \
  --exclude='.expo' \
  --exclude='dist' \
  --exclude='dist-verify' \
  --exclude='.git' \
  --exclude='*.tar.gz' \
  -czf "$ARCHIVE_PATH" \
  -C "$PARENT_DIR" \
  "$APP_DIR_NAME"

cp "$ARCHIVE_PATH" "$LATEST_PATH"
cp "$ARCHIVE_PATH" "$PARENT_LATEST_PATH"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$LATEST_PATH" > "$CHECKSUM_PATH"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$LATEST_PATH" > "$CHECKSUM_PATH"
fi

cat > "$METADATA_PATH" <<JSON
{
  "app": "Reliure",
  "version": "$VERSION",
  "created_at": "$CREATED_AT",
  "archive": "$ARCHIVE_PATH",
  "latest": "$LATEST_PATH",
  "portable_latest": "$PARENT_LATEST_PATH"
}
JSON

echo "==> Release ready"
echo "Archive: $ARCHIVE_PATH"
echo "Latest:  $LATEST_PATH"
echo "Copy:    $PARENT_LATEST_PATH"
