#!/usr/bin/env bash
# Vendors the Poms spritesheets from screen.toys into assets/.
# The binaries are gitignored: this script is their provenance record.
#
# The per-tier name list is read from assets/manifest.json (the art-swap
# seam), not duplicated here, so swapping the character set means editing
# the manifest and re-running this script — no code change.
set -euo pipefail

BASE="https://screen.toys/poms/assets"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

total_expected=0

for tier in desktop mobile; do
  mkdir -p "$ROOT/assets/$tier"

  names=$(node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const tier = process.argv[2];
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "assets/manifest.json"), "utf8")
    );
    const t = manifest.tiers[tier];
    process.stdout.write([...t.characters, t.shockwave].join("\n"));
  ' "$ROOT" "$tier")

  while IFS= read -r name; do
    for ext in json webp; do
      file="${name}_${tier}.${ext}"
      dest="$ROOT/assets/$tier/$file"
      total_expected=$((total_expected + 1))
      if [ -s "$dest" ]; then
        echo "skip $tier/$file"
        continue
      fi
      echo "get  $tier/$file"
      curl -fsSL "$BASE/$tier/$file" -o "$dest.part"
      mv "$dest.part" "$dest"
    done
  done <<< "$names"
done

actual=$(find "$ROOT/assets/desktop" "$ROOT/assets/mobile" -type f \( -name '*.json' -o -name '*.webp' \) | wc -l | tr -d ' ')
if [ "$actual" -ne "$total_expected" ]; then
  echo "ERROR: expected $total_expected files (from manifest) but found $actual" >&2
  exit 1
fi
echo "done: $actual files"
