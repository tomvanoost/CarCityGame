# Credits

## 3D models
- **Characters**: "Ultimate Animated Character Pack" by [Quaternius](https://quaternius.com),
  license **CC0 1.0** (public domain). Source: https://quaternius.com/packs/ultimatedanimatedcharacter.html
  The fighting animations (punch, shoot, sword, death, hit) are removed in
  `scripts/build-models.mjs`, because CarCityGame is non-violent.
- **Vehicles**: made in code (`src/game/vehicles/`). Shapes are inspired by
  real cars; all names are look-alike names, and no real logos are used.

## Rebuilding the models
```bash
./scripts/fetch-models.sh      # downloads the CC0 sources into assets-src/
node scripts/build-models.mjs  # writes optimized .glb files to public/models/
```
