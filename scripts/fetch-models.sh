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

# City: Quaternius "Ultimate Buildings", "Modular Buildings", "Ultimate Nature", "Modular Streets" (all CC0 1.0)
#   mirrored at github.com/trebeljahr/quaternius-showcase (pinned commit below)
CITY_REPO="https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/0128ca510d653bb04d6d1e4885bd8890b5050b4f/public/glb"
CITY_FILES="
buildings_pack_2/Building1_Large buildings_pack_2/Building1_Small buildings_pack_2/Building2_Large
buildings_pack_2/Building2_Small buildings_pack_2/Building3_Big buildings_pack_2/Building3_Small
buildings_pack_2/Building4
buildings_pack_3/1Story_GableRoof_Mat buildings_pack_3/1Story_Mat buildings_pack_3/1Story_RoundRoof_Mat
buildings_pack_3/1Story_Sign_Mat buildings_pack_3/2Story_2_Mat buildings_pack_3/2Story_Balcony_Mat
buildings_pack_3/2Story_Center_Mat buildings_pack_3/2Story_Columns_Mat buildings_pack_3/2Story_Double_Mat
buildings_pack_3/2Story_GableRoof_Mat buildings_pack_3/2Story_Mat buildings_pack_3/2Story_RoundRoof_Mat
buildings_pack_3/2Story_Sidehouse_Mat buildings_pack_3/2Story_Sign_Mat buildings_pack_3/2Story_Stairs_Mat
buildings_pack_3/2Story_Wide_2Doors_Mat buildings_pack_3/2Story_Wide_Mat buildings_pack_3/3Story_Balcony_Mat
buildings_pack_3/3Story_Small_Mat buildings_pack_3/4Story_Center_Mat buildings_pack_3/4Story_Mat
buildings_pack_3/4Story_Wide_2Doors_Mat buildings_pack_3/6Story_Stack_Mat
nature_pack/CommonTree_1 nature_pack/CommonTree_2 nature_pack/CommonTree_3 nature_pack/CommonTree_4
nature_pack/CommonTree_5 nature_pack/BirchTree_1 nature_pack/BirchTree_2 nature_pack/BirchTree_3
nature_pack/PineTree_1 nature_pack/PineTree_2 nature_pack/PineTree_3 nature_pack/Willow_1
nature_pack/Bush_1 nature_pack/Bush_2 nature_pack/BushBerries_1 nature_pack/Flowers
nature_pack/Rock_Moss_1 nature_pack/Rock_Moss_2 nature_pack/Lilypad
street_pack/Streetlight_Single street_pack/TrafficLight_2
"
for f in $CITY_FILES; do
  out="assets-src/city/$f.glb"
  [ -s "$out" ] && continue
  mkdir -p "$(dirname "$out")"
  echo "downloading $f"
  curl -fsSL --retry 3 -o "$out" "$CITY_REPO/$f.glb"
done
echo "done"
