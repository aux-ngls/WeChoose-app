#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
git pull --ff-only
cd reliure/mobile
npm install
npm run typecheck
