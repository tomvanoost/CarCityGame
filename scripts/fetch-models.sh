#!/usr/bin/env bash
# Downloads the original CC0 source models into assets-src/ (not committed).
# Then run: node scripts/build-models.mjs
#
# Characters: "Ultimate Animated Character Pack" by Quaternius (CC0 1.0)
#   https://quaternius.com/packs/ultimatedanimatedcharacter.html
#   mirrored at github.com/pashaydev/Metamorph (pinned commit below)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="https://raw.githubusercontent.com/pashaydev/Metamorph/9231afc7fadd8c25b7d6cabc761f3878995ff903/assets/models/characters/druid/glTF"
OUT="assets-src/characters"
mkdir -p "$OUT"
for outfit in Casual Casual2 Casual3 Chef Cowboy Kimono OldClassy Suit Worker Pirate Viking Ninja; do
  for g in Male Female; do
    f="${outfit}_${g}.gltf"
    [ -s "$OUT/$f" ] && continue
    echo "downloading $f"
    curl -fsSL --retry 3 -o "$OUT/$f" "$REPO/$f"
  done
done
echo "done"
