# Credits

## 3D models
- **Characters**: "Ultimate Animated Character Pack" by [Quaternius](https://quaternius.com),
  license **CC0 1.0** (public domain). Source: https://quaternius.com/packs/ultimatedanimatedcharacter.html
  The fighting animations (punch, shoot, sword, death, hit) are removed in
  `scripts/build-models.mjs`, because CarCityGame is non-violent.
- **City** (all CC0 1.0, by Quaternius): "Ultimate Buildings Pack" + "Modular Buildings Pack"
  (houses, townhouses, shops, apartments), "Ultimate Nature Pack" (trees, bushes, flowers, rocks,
  lily pads) and "Modular Streets Pack" (street lights, traffic lights).
  Sources: https://quaternius.com/packs/ultimatetexturedbuildings.html, https://quaternius.com/packs/buildings.html,
  https://quaternius.com/packs/ultimatenature.html, https://quaternius.com/packs/modularstreets.html
  Models are simplified and recolored by `scripts/build-models.mjs`.
- **Roads, towers, gas station, park pond/fountain, sky**: made in code (`src/game/city/`, `src/game/world/`).
- **Vehicles**: made in code (`src/game/vehicles/`). Shapes are inspired by
  real cars; all names are look-alike names, and no real logos are used.

## Rebuilding the models
```bash
./scripts/fetch-models.sh      # downloads the CC0 sources into assets-src/
node scripts/build-models.mjs  # writes optimized .glb files to public/models/
```
