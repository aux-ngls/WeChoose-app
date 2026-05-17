#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-}"
TARGET_DIR="${2:-"$HOME/reliure"}"

if [ -z "$ARCHIVE_PATH" ]; then
  for candidate in "$HOME/Downloads/reliure-mobile-latest.tar.gz" "$HOME/Desktop/reliure-mobile-latest.tar.gz" "$PWD/reliure-mobile-latest.tar.gz"; do
    if [ -f "$candidate" ]; then
      ARCHIVE_PATH="$candidate"
      break
    fi
  done
fi

if [ -z "$ARCHIVE_PATH" ] || [ ! -f "$ARCHIVE_PATH" ]; then
  echo "Archive introuvable."
  echo "Usage: bash install-from-archive.sh /chemin/reliure-mobile-latest.tar.gz"
  exit 1
fi

echo "==> Installing Reliure from $ARCHIVE_PATH"
rm -rf "$TARGET_DIR"
mkdir -p "$(dirname "$TARGET_DIR")"
tar -xzf "$ARCHIVE_PATH" -C "$(dirname "$TARGET_DIR")"

cd "$TARGET_DIR"
bash scripts/install-or-update.sh

echo ""
echo "==> Installation complete"
echo "Terminal 1:"
echo "  cd $TARGET_DIR"
echo "  npm run dev:auto"
echo ""
echo "Or double-click:"
echo "  $TARGET_DIR/Lancer Reliure.command"
