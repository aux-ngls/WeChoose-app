#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/reliure/mobile"
npm run dev:auto
