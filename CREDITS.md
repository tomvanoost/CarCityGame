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
- **Vehicles**: Sketchfab models, see the table below. The built-in procedural models in
  `src/game/vehicles/` are only a fallback if a model fails to load.

<!-- sketchfab-vehicles:start -->
## Vehicles (Sketchfab)
All vehicle models come from [Sketchfab](https://sketchfab.com) (downloadable models). They were
**modified** for the game: simplified, textures resized/compressed, re-oriented and re-scaled, and some
uncolored models were given colors (`scripts/build-vehicles.mjs`). In the game they have look-alike names.

- **CC Attribution (BY):** free to use with credit (below).
- **NonCommercial (NC):** only for non-commercial use — the game must stay free (no ads, no paid items).
- **ShareAlike (SA):** the modified models are shared under the same license.

| Game id | Model | Author | License | Search (rank) |
|---|---|---|---|---|
| golfo-2025 | [2025 Volkswagen Golf R](https://sketchfab.com/3d-models/2025-volkswagen-golf-r-d1a0e38cbb2b4cb3b0da13c2ccdcf730) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2025 volkswagen golf" #1 |
| polino | [2024 Volkswagen Polo 170 TSI](https://sketchfab.com/3d-models/2024-volkswagen-polo-170-tsi-ec0f4dfd1ca84a859725e4002e9cf120) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 volkswagen polo" #1 |
| cinque | [2021 Fiat e500](https://sketchfab.com/3d-models/2021-fiat-e500-94dd3a8ce4ad45c8819541a33cb400b2) | [tonielpro520](https://sketchfab.com/tonielpro520) | CC Attribution | "fiat 500e" #2 |
| kuper | [Mini Cooper S Facelift](https://sketchfab.com/3d-models/mini-cooper-s-facelift-2baca439d2494e02b99596014b49ebd3) | [Mona x Supercars](https://sketchfab.com/Car2022) | CC Attribution | "mini cooper se" #1 |
| klio | [2024 Renault Clio](https://sketchfab.com/3d-models/2024-renault-clio-5556b5741cf24e408dc03396d6d4caee) | [tonielpro520](https://sketchfab.com/tonielpro520) | CC Attribution | "2024 renault clio" #1 |
| yarus | [2020 Toyota Yaris Cross](https://sketchfab.com/3d-models/2020-toyota-yaris-cross-1b6dd834e8184851887ddeab1e83bc28) | [tonielpro520](https://sketchfab.com/tonielpro520) | CC Attribution | "2024 toyota yaris" #1 |
| teslo-modelo3 | [2024 Tesla Model 3 + Interior](https://sketchfab.com/3d-models/2024-tesla-model-3-interior-61ddcbdbd3854c239e0c95bf60b00022) | [tonielpro520](https://sketchfab.com/tonielpro520) | CC Attribution | "2024 tesla model 3" #1 |
| seel | [2024 BYD Seal](https://sketchfab.com/3d-models/2024-byd-seal-2e82d2aaaa3d47debf39b1160d3fe376) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 byd seal" #1 |
| oudi-a4 | [2024 Audi A4 B9 Car](https://sketchfab.com/3d-models/2024-audi-a4-b9-car-ed10dde4fab24ac89f8799597c8fe931) | [Maroi Mister Let Me Think Official 3D Studio](https://sketchfab.com/homicivan53) | CC Attribution | "2024 audi a4" #1 |
| beemer-3 | [2023 bmw 3 series](https://sketchfab.com/3d-models/2023-bmw-3-series-82534fdddd7e46e4bdb202d6c1d3c0e7) | [solid3DDD](https://sketchfab.com/solid3ddd) | CC Attribution | "2024 bmw 3 series" #1 |
| mersedez-c | [Mercedes-Benz C-Class W206 AMG-Line 2022](https://sketchfab.com/3d-models/mercedes-benz-c-class-w206-amg-line-2022-21393b5f402543848db2f26f95a2e9fa) | [ceron_alex](https://sketchfab.com/ceron_alex) | CC Attribution-NonCommercial | "2024 mercedes c-class" #1 |
| taykan | [2025 Porsche Taycan Turbo GT Weissach Package](https://sketchfab.com/3d-models/2025-porsche-taycan-turbo-gt-weissach-package-4e1abafe7cf5413587a421377624ba08) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 porsche taycan" #1 |
| modelo-y | [2025 Tesla Model Y](https://sketchfab.com/3d-models/2025-tesla-model-y-619601e7800d418da5922c4fa7833f74) | [BloxBloger](https://sketchfab.com/BloxBloger) | CC Attribution-NonCommercial | "tesla model y" #1 |
| id-vier | [2021 Volkswagen ID.4 X](https://sketchfab.com/3d-models/2021-volkswagen-id4-x-898fcce37f0948499d1b4c1effc051d1) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 volkswagen id.4" #1 |
| atto-3 | [2024 BYD Atto 3](https://sketchfab.com/3d-models/2024-byd-atto-3-f7ef899186d445d48e4781ddfc84fddc) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 byd atto 3" #1 |
| kio-ev6 | [2022 Kia EV6](https://sketchfab.com/3d-models/2022-kia-ev6-44d11e83ef40492bb4bc3d9fbc41e5e0) | [tonielpro520](https://sketchfab.com/tonielpro520) | CC Attribution | "kia ev6" #1 |
| volvu-xc90 | [Volvo XC90](https://sketchfab.com/3d-models/volvo-xc90-8135a6c9c9344079bfaefc9d747e2ceb) | [Nieve5677](https://sketchfab.com/niev) | CC Attribution | "volvo xc90" #6 (first result was a photoscan with ground attached) |
| rangy-rover | [2023 Land Rover Range Rover Sport](https://sketchfab.com/3d-models/2023-land-rover-range-rover-sport-c1105996547b4c4c8a4cfc3523a4c726) | [Silyboy](https://sketchfab.com/kaleemullah550) | CC Attribution | "2024 range rover" #1 |
| id-bus | [2023 Volkswagen ID Buzz GTX](https://sketchfab.com/3d-models/2023-volkswagen-id-buzz-gtx-3cc84dbea5b2495ba1f9468e8b4668d9) | [BloxBloger](https://sketchfab.com/BloxBloger) | CC Attribution-NonCommercial | "2024 volkswagen id. buzz" #1 |
| jiep | [2013 Equipped Jeep Wrangler Unlimited Rubicon](https://sketchfab.com/3d-models/2013-equipped-jeep-wrangler-unlimited-rubicon-e3ecbf7d1fda464cb84d4bf41925d383) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 jeep wrangler" #1 |
| porsha-911 | [2024 Porsche 992 GT3 R](https://sketchfab.com/3d-models/2024-porsche-992-gt3-r-b76c9b2ae2d548c3869426eac4ab8a19) | [Dave Love SketchFab](https://sketchfab.com/Tyler_Dave) | CC Attribution | "2024 porsche 911" #1 |
| korvet | [Chevrolet Corvette (C7)](https://sketchfab.com/3d-models/chevrolet-corvette-c7-2b509d1bce104224b147c81757f6f43a) | [Martin Trafas](https://sketchfab.com/TinoD2) | CC Attribution | "2024 chevrolet corvette" #1 |
| ferrara | [2020 Ferrari F8 Tributo](https://sketchfab.com/3d-models/2020-ferrari-f8-tributo-8a86c4d634f64f8b8ee836bc93fa6ac8) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 ferrari f8 tributo" #1 |
| maxlaren | [2021 McLaren 720S GT3X](https://sketchfab.com/3d-models/2021-mclaren-720s-gt3x-fd16600b1e594ceea5cec2470ab560c4) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution | "2024 mclaren 720s" #1 |
| hurricano | [2024 Lamborghini Huracan Sterrato](https://sketchfab.com/3d-models/2024-lamborghini-huracan-sterrato-7af3c1063acf4439a7e69e05eaf94b9b) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 lamborghini huracan" #1 |
| jessko | [2024 Koenigsegg Jesko Attack #7378](https://sketchfab.com/3d-models/2024-koenigsegg-jesko-attack-7378-e4e966bcfdf14a8dbc6c837764cb026b) | [HYPR:IMPS 3D](https://sketchfab.com/HYPRIMPS3D) | CC Attribution | "2024 koenigsegg jesko" #1 |
| chirone | [2022 Bugatti Chiron Profilee](https://sketchfab.com/3d-models/2022-bugatti-chiron-profilee-b28d46d8d28649729b81472969e35397) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 bugatti chiron" #1 |
| vespo | [Old Scooter](https://sketchfab.com/3d-models/old-scooter-5e9b5072b2224ba982366490ad5f31d9) | [Nadia Ribitis](https://sketchfab.com/ribitis) | CC Attribution | "vespa primavera" #1 |
| hondo-cbr | [Honda CBR650R](https://sketchfab.com/3d-models/honda-cbr650r-b9ec190f902d4180aa527659af3f5089) | [VTX](https://sketchfab.com/VTX_car) | CC Attribution-NonCommercial-ShareAlike | "honda cbr650r" #1 |
| kawa-z900 | [Z1000 2014](https://sketchfab.com/3d-models/z1000-2014-70cecfa5568347428c5ad72e9a156be9) | [e-restrepo1114](https://sketchfab.com/EmanuelRestrepoVelez) | CC Attribution | "2024 kawasaki z900" #2 (first result was a cartoon character riding a bike) |
| yamaho-r1 | [Yamaha R1](https://sketchfab.com/3d-models/yamaha-r1-7b3343ad0c0f4cbe94238c734e1b731a) | [ejsnowy](https://sketchfab.com/ejsnowy) | CC Attribution | "yamaha r1" #2 |
| harly | [Harley-Davidson Custom Road Glide Style Bagger](https://sketchfab.com/3d-models/harley-davidson-custom-road-glide-style-bagger-bd1640cecf8e438abe7a5749fc76a4ba) | [Tulio Portela](https://sketchfab.com/TulioPortela) | CC Attribution | "harley davidson street glide" #1 |
| beemer-gs | [2014 BMW R1200GS Adventure](https://sketchfab.com/3d-models/2014-bmw-r1200gs-adventure-e1e09934424d428d8e59e75c03568716) | [OUTPISTON](https://sketchfab.com/outpiston) | CC Attribution-NonCommercial-ShareAlike | "bmw r1300gs" #1 |
| dukati | [2021 Ducati Panigale V4 SP](https://sketchfab.com/3d-models/2021-ducati-panigale-v4-sp-8c0632e4c54249758114490390f0b73f) | [Carlito](https://sketchfab.com/brainlesszombie5) | CC Attribution | "2024 ducati panigale v4" #1 |
<!-- sketchfab-vehicles:end -->

## Rebuilding the models
```bash
./scripts/fetch-models.sh      # downloads the CC0 sources into assets-src/
node scripts/build-models.mjs  # writes optimized .glb files to public/models/
# Vehicles (needs the Sketchfab token, see docs/SKETCHFAB_SETUP.md):
NODE_USE_ENV_PROXY=1 node scripts/sketchfab-search.mjs     # pick models
NODE_USE_ENV_PROXY=1 node scripts/sketchfab-download.mjs   # download them
node scripts/build-vehicles.mjs                            # optimize -> public/models/vehicles
node scripts/sketchfab-credits.mjs                         # update this file
```
