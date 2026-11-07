#!/usr/bin/env bash
# Bundles the shared web app into the APK's assets: the very same files the web version serves.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/life/android/app/src/main/assets/www"
rm -rf "$OUT"
mkdir -p "$OUT/life"
cp -r "$ROOT/life/app" "$OUT/life/app"
# The whole quest: it is the Latent Archipelago app, and its engine is shared with Life.
cp -r "$ROOT/quest" "$OUT/quest"
rm -f "$OUT/quest/README.md" "$OUT/quest/preview.html" "$OUT/quest/preview.js"
echo "Web app copied to $OUT"
