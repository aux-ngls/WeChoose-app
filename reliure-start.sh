#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/reliure"
npm run dev:auto
