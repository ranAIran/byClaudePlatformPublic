#!/usr/bin/env bash
# Bundles the shared web app into the APK's assets: the very same files the web version serves.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/life/android/app/src/main/assets/www"
rm -rf "$OUT"
mkdir -p "$OUT/life" "$OUT/quest/icons"
cp -r "$ROOT/life/app" "$OUT/life/app"
cp -r "$ROOT/quest/vendor" "$OUT/quest/vendor"
cp "$ROOT/quest/world.js" "$ROOT/quest/content.js" "$OUT/quest/"
cp "$ROOT/quest/icons/favicon-32.png" "$OUT/quest/icons/"
echo "Web app copied to $OUT"
