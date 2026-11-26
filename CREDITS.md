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

## Sounds
- **Car horn** (`public/sounds/horn.mp3`): "Car Honk" by Dragon Studio (Pixabay sound 386166, supplied by
  the project owner), Pixabay Content License (free to use, no attribution required; credited anyway).
  Trimmed and made mono with ffmpeg. All other sounds are synthesized in `src/game/play/sounds.ts`.

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
| seel | [2024 BYD Seal](https://sketchfab.com/3d-models/2024-byd-seal-2e82d2aaaa3d47debf39b1160d3fe376) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 byd seal" #1 |
| taykan | [2025 Porsche Taycan Turbo GT Weissach Package](https://sketchfab.com/3d-models/2025-porsche-taycan-turbo-gt-weissach-package-4e1abafe7cf5413587a421377624ba08) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 porsche taycan" #1 |
| id-vier | [2021 Volkswagen ID.4 X](https://sketchfab.com/3d-models/2021-volkswagen-id4-x-898fcce37f0948499d1b4c1effc051d1) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 volkswagen id.4" #1 |
| atto-3 | [2024 BYD Atto 3](https://sketchfab.com/3d-models/2024-byd-atto-3-f7ef899186d445d48e4781ddfc84fddc) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "2024 byd atto 3" #1 |
| hyundo-kono | [2026 Hyundai Kona Limited](https://sketchfab.com/3d-models/2026-hyundai-kona-limited-000ae8ac48a24f78841b0c6053f48030) | [twr422](https://sketchfab.com/twr422) | CC Attribution | supplied by the game owner, matched on Sketchfab |
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
| politie | [2012 BMW M6 Coupe (F13) - Patrol](https://sketchfab.com/3d-models/2012-bmw-m6-coupe-f13-patrol-df09eab1442d43cdadab51d329045c02) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "police car" (chosen from 3 candidates after rendering) |
| brandweer | [firetruck](https://sketchfab.com/3d-models/firetruck-cb0c3a0c2dcb4b68a8de4ffb3265157d) | [Niclas](https://sketchfab.com/niclas.schoepe) | CC Attribution | "fire truck" (chosen from 4 candidates after rendering) |
| ambulance | [HSE Irish Ambulance](https://sketchfab.com/3d-models/hse-irish-ambulance-478663159a014ccca6e12ed4ded8a26b) | [Alexandrovich](https://sketchfab.com/alexandrovich) | CC Attribution | "ambulance" (chosen from 3 candidates after rendering) |
| vespo | [Old Scooter](https://sketchfab.com/3d-models/old-scooter-5e9b5072b2224ba982366490ad5f31d9) | [Nadia Ribitis](https://sketchfab.com/ribitis) | CC Attribution | "vespa primavera" #1 |
| hondo-cbr | [Honda CBR650R](https://sketchfab.com/3d-models/honda-cbr650r-b9ec190f902d4180aa527659af3f5089) | [VTX](https://sketchfab.com/VTX_car) | CC Attribution-NonCommercial-ShareAlike | "honda cbr650r" #1 |
| kawa-z900 | [Z1000 2014](https://sketchfab.com/3d-models/z1000-2014-70cecfa5568347428c5ad72e9a156be9) | [e-restrepo1114](https://sketchfab.com/EmanuelRestrepoVelez) | CC Attribution | "2024 kawasaki z900" #2 (first result was a cartoon character riding a bike) |
| yamaho-r1 | [Yamaha R1](https://sketchfab.com/3d-models/yamaha-r1-7b3343ad0c0f4cbe94238c734e1b731a) | [ejsnowy](https://sketchfab.com/ejsnowy) | CC Attribution | "yamaha r1" #2 |
| harly | [Harley-Davidson Custom Road Glide Style Bagger](https://sketchfab.com/3d-models/harley-davidson-custom-road-glide-style-bagger-bd1640cecf8e438abe7a5749fc76a4ba) | [Tulio Portela](https://sketchfab.com/TulioPortela) | CC Attribution | "harley davidson street glide" #1 |
| beemer-gs | [2014 BMW R1200GS Adventure](https://sketchfab.com/3d-models/2014-bmw-r1200gs-adventure-e1e09934424d428d8e59e75c03568716) | [OUTPISTON](https://sketchfab.com/outpiston) | CC Attribution-NonCommercial-ShareAlike | "bmw r1300gs" #1 |
| dukati | [2021 Ducati Panigale V4 SP](https://sketchfab.com/3d-models/2021-ducati-panigale-v4-sp-8c0632e4c54249758114490390f0b73f) | [Carlito](https://sketchfab.com/brainlesszombie5) | CC Attribution | "2024 ducati panigale v4" #1 |
| teslo-modelo3 | [Tesla 2018 Model 3](https://sketchfab.com/3d-models/tesla-2018-model-3-5ef9b845aaf44203b6d04e2c677e444f) | [Ameer Studio](https://sketchfab.com/uchiha.321abc) | CC Attribution | "tesla model 3" #1 (replaced a broken first pick) |
| oudi-a4 | [2005 Audi A4 3.2 FSI quattro](https://sketchfab.com/3d-models/2005-audi-a4-32-fsi-quattro-fd2e6813f8224d58b104dfbfc1ab3173) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "audi a4" #1 (replaced a broken first pick) |
| beemer-3 | [[FREE] BMW M3 E30](https://sketchfab.com/3d-models/free-bmw-m3-e30-ac3c7013434e403e8faff87948caf422) | [Martin Trafas](https://sketchfab.com/TinoD2) | CC Attribution | "bmw 3 series" #1 (replaced a broken first pick) |
| mersedez-c | [2008 Mercedes-Benz C63 AMG](https://sketchfab.com/3d-models/2008-mercedes-benz-c63-amg-8f541d1d07b545799a20217c555a3948) | [Ddiaz Design](https://sketchfab.com/ddiaz-design) | CC Attribution-NonCommercial-ShareAlike | "mercedes c class" #6 (replaced a broken first pick) |
| modelo-y | [2021 Tesla Model Y](https://sketchfab.com/3d-models/2021-tesla-model-y-59e2ead369984b1a85c800ff6cf6789d) | [tonielpro520](https://sketchfab.com/tonielpro520) | CC Attribution | "tesla model y" #6 (replaced a broken first pick) |
<!-- sketchfab-vehicles:end -->

Skipped (low quality, the game uses its own built-in car shape for these):
- kio-ev6: tried 3 models: open doors/broken parts, then untextured and broken wheels; uses the built-in shape
- volvu-xc90: tried 2 models: untextured clay, then broken spiky parts; other results are a photoscan, Lego or parts; uses the built-in shape
- First picks that were replaced by better models: teslo-modelo3, oudi-a4, beemer-3, mersedez-c, modelo-y (patterned roof,
  camouflage wrap, dented doors, broken pieces, untextured with open doors).

<!-- sketchfab-city:start -->
## Buildings and trees (Sketchfab)
Some houses, townhouses, shops and apartments, the pines and the bushes come from Sketchfab (downloadable,
first usable results per search term), modified for the game (`scripts/build-city-sf.mjs`).
Office towers downtown, the other buildings, roads, street lights and small props are built-in / CC0.
The street and park trees are 4 maples from [Maple trees pack (lowpoly, game ready, LODs)](https://sketchfab.com/3d-models/maple-trees-pack-lowpoly-game-ready-lods-b5d2833c258f4054a01ee2b4ef85adf0)
by [lolipop_1707](https://sketchfab.com/lolipop_1707), CC Attribution, split and scaled for the game (`scripts/build-trees.mjs`).

| Category | Model | Author | License | Search (rank) |
|---|---|---|---|---|
| house | [Stylized Amsterdam House](https://sketchfab.com/3d-models/stylized-amsterdam-house-c523ef1f9e55415caff7e4349a04d53d) | [ChrisCLP](https://sketchfab.com/ChrisCLP) | CC Attribution | "dutch house" #4 |
| townhouse | [Amsterdam Canal House by Jungle Jim](https://sketchfab.com/3d-models/amsterdam-canal-house-by-jungle-jim-153c5531d1e34f5f822b3447b661079d) | [Jungle Jim](https://sketchfab.com/jungle_jim) | CC Attribution | "amsterdam canal house" #1 |
| shop | [Brick Shop Building | Lowpoly](https://sketchfab.com/3d-models/brick-shop-building-lowpoly-548d4a0e62b54efcab4483fb6d0c3611) | [Frid.blend](https://sketchfab.com/Fridqeir) | CC Attribution | "shop building" #1 |
| apartment | [Futuristic Building](https://sketchfab.com/3d-models/futuristic-building-e73f9bb9981d469c8a8ccdc1f168faad) | [3DHaupt](https://sketchfab.com/dennish2010) | CC Attribution-NonCommercial | "apartment building" #1 |
| pine | [Pine tree](https://sketchfab.com/3d-models/pine-tree-e52769d653cd4e52a4acff3041961e65) | [Andriy Shekh](https://sketchfab.com/sheh5262) | CC Attribution | "pine tree" #1 |
| pine | [Pine Tree](https://sketchfab.com/3d-models/pine-tree-d45218a3fab349e5b1de040f29e7b6f9) | [evolveduk](https://sketchfab.com/evolveduk) | CC Attribution | "pine tree" #2 |
| bush | [Real Bush](https://sketchfab.com/3d-models/real-bush-62618c3260b142cfb7ef499d75a8d21a) | [Marbles studio](https://sketchfab.com/marblesstudio) | CC Attribution | "bush" #1 |
| bush | [Stylized Bush](https://sketchfab.com/3d-models/stylized-bush-9d9ce79d3ae040619e96d5b22c7de1a6) | [Daniel](https://sketchfab.com/danielpetrov) | CC Attribution | "bush" #2 |

Skipped results (and why):
- "Dutch Canals House Amsterdam #1" ("dutch house" #3): same model as sf_townhouse_3
- "Old Petrol Station Shop" ("shop building" #2): graffiti wall, run-down look
- "Abandoned | Building | Shop | Old | House" ("shop building" #4): abandoned shack
- "Modular Apartment Building" ("apartment building" #3): loose modular row, 180 m long
- "Skyscraper" ("skyscraper" #2): a whole scene with a tiny tower
- "Trees of Paris" ("tree" #2): no 3D faces (point cloud / empty)
- "Patch of Heaven - The White Tree" ("tree" #3): stylized fantasy scene, not a city tree
- "Pokemon Sudowoodo - Tree" ("tree" #4): a cartoon character (Pokemon), not a tree
- "Merry Christmas 2019" ("tree" #7): no 3D faces
- "Dangerous Beauty - Diorama" ("tree" #8): a diorama scene
- "Rembrandt's Birthplace - Leiden - FREE DOWNLOAD" ("dutch house" #2): walled compound with 17 separate parts (too many draw calls)
- "Dutch Canals House Amsterdam #4" ("amsterdam canal house" #4): 24 separate parts (too many draw calls)
- "Little Shop" ("shop building" #7): no textures (plain white)
- "Fish shop building" ("shop building" #8): a white statue, not a shop
- "Toon Tree 02" ("tree" #5): a 96 m row of tiny figures
- "Drevo" ("tree" #6): a tree log, not a tree
- "Trees" ("tree" #9): white dead trees
- "[FREE] London Skyscraper" ("skyscraper" #1): 55k triangles after simplifying; procedural towers are used downtown
- "Cyberpunk skyscraper" ("skyscraper" #3): dark cyberpunk spire; procedural towers are used downtown
- "Dutch Canals House Amsterdam #1" ("amsterdam canal house" #3): hundreds of separate parts: 9k triangles even far away (too heavy for 126 copies)
- "Maple tree" ("tree" #1): leaves are thin cards that vanish when simplified; too heavy for 3,500 street trees
- "Tree" ("low poly tree" #3): bare winter tree
- "Tree" ("low poly tree" #4): bare winter tree
- "Dutch House" ("dutch house" #1): blurry washed-out textures, rough shape
- "Amsterdam Canal House" ("amsterdam canal house" #2): crumbly photo-scan with a damaged roof (run-down look)
- "Apartment building and shop" ("shop building" #3): flat striped block, low detail
- "Isometric low-poly shop building" ("shop building" #6): crude flat boxes, low quality
- "Old Apartment Building" ("apartment building" #4): stretched noisy brick texture, run-down look
- "Apartment Building - 3D Model" ("apartment building" #5): unfinished: missing walls and window panes
- "Giant Low Poly Tree" ("low poly tree" #5): huge dark canopy and thick crooked trunk, blocks the view over the road
- "Low Poly Tree" ("low poly tree" #7): stands on a big lime-green grass dome that looks odd on sidewalks
<!-- sketchfab-city:end -->

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
