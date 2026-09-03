#!/usr/bin/env bash
# Builds the Chrome Web Store upload zip from the runtime files only.
#
# The zip is a build artifact: it is written to dist/, which is gitignored,
# and belongs on a GitHub Release rather than in git history. Committing one
# per version would add ~15MB to every clone, permanently.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./manifest.json').version")"
OUT="dist/pomium-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

# Runtime files only. Everything else — tests, docs, fixtures, this script,
# package.json, store assets — would ship dead weight and expose scaffolding
# to anyone who unpacks the published extension.
zip -r -q -X "$OUT" \
  manifest.json \
  src \
  icons \
  assets \
  -x '*.DS_Store' '*/.DS_Store'

SIZE="$(du -h "$OUT" | cut -f1)"
COUNT="$(unzip -l "$OUT" | tail -1 | awk '{print $2}')"
echo "built $OUT  ($SIZE, $COUNT files)"
echo
echo "Sanity check — the zip must contain manifest.json at its ROOT, not"
echo "inside a folder, or the Web Store rejects it:"
unzip -l "$OUT" | head -8
