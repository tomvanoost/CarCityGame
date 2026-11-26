# Progress

What is finished, the current state and known problems. The newest finished step goes on top of
"Done". The plan and next steps are in `docs/ROADMAP.md`.

## Current state
- Playable: login/register (Firebase accounts, live database updates; demo mode without Firebase),
  menu with avatar, sticker book and graphics setting (Mooi/Snel), vehicle and clothes shops, the city
  with driving, walking, traffic, pedestrians, jobs, fuel, car wash, house with your other cars parked in the yard, apartment with a 3D living room, ducks and birds in the park, optional evening light.
- Deployed by the user from branch `claude/stoic-shannon-4k32uu` on fly.io (`fly.toml` holds the Firebase
  web config). Runs push to `claude/hourly-upgrades` and fast-forward `claude/stoic-shannon-4k32uu`.
- Vehicles: 32 Sketchfab models (wheels cut out and spinning); kio-ev6 and volvu-xc90 use the built-in shape.
  City: CC0 buildings mixed with a few good Sketchfab buildings, CC0 street trees, Sketchfab pines/bushes.

## Known problems
- kio-ev6 and volvu-xc90 still use the simple built-in car shape (all Sketchfab results tried were broken).
- Parked cars in the home yard show the factory color, not the paint you picked (their light models have
  the colors baked in); the car you drive does show your paint.
- The vespo scooter looks old and rusty.
- In the headless test browser the game runs at ~1–3 FPS (software rendering): CSS popups and animations
  barely play there; use `animations: 'disabled'` screenshots or check them in the menu.

## Blocked hosts / environment limits
- `media.sketchfab.com` (Sketchfab preview images) is blocked by the network proxy; model downloads
  (`sketchfab-prod-media.s3.amazonaws.com`) and the API work. Judge models by rendering them (`/?sflab=…`).
- `carcitygame.fly.dev` cannot be reached from the cloud environment (connection fails): the live site
  can't be checked from here.
- The Fly MCP cannot build or deploy images (only manage machines/secrets); deploys run through the GitHub
  Action `.github/workflows/fly-deploy.yml`, which needs the repo secret `FLY_API_TOKEN`.
- No Docker daemon in the cloud environment (nginx config was checked with a locally installed nginx).
- Raw Sketchfab downloads (`assets-src/`) are not in the repo; processed models are fixed in place with
  `scripts/flip-vehicles.mjs` and `scripts/vehicle-wheels.mjs`.

## Done
- [x] **Real top speeds + player fixes**: every vehicle has its real top speed (km/h, in the shop; Chiron 380, Jesko 480, Fiat 500e 150...), driving uses it (air-drag curve, sub-stepped collisions, people-check looks far enough ahead to always stop calmly); drivers sit lower/smaller in low sports cars so the head stays under the roof; navigation distance and the blue map route now follow you (the route kept a live reference to the car position) and switch to a shorter way after a U-turn; far map icons sit inside the ring, smaller; paved parking spots under your parked cars at home.
- [x] **Nicer downtown towers**: window frames with a center divider, sill shadows and darker floor bands, framed lobby glass, an entrance double door with a canopy on every podium side, and a different rooftop per tower (helipad on the tallest, water tank, roof garden or cooling units); shader + merged roof mesh, no extra draw calls.
- [x] **Better replacement cars**: 5 of the 7 broken cars got good Sketchfab models after close-up checks (teslo-modelo3, oudi-a4, beemer-3 M3 E30, mersedez-c C63, modelo-y); kio-ev6 and volvu-xc90 keep the built-in shape (no usable model among the results).
- [x] **Apartment view**: going inside your apartment shows a cozy 3D living room at the top of the panel (sofa, rug, table, lamp, open bookshelf, window, plant, picture, TV) with your avatar; tap to cheer, gentle camera sway, follows outfit changes; one merged mesh (`game/apartmentRoom.ts`).
- [x] **Evening light**: 🌙/☀️ button in the game (remembered per device): peach sunset sky, low warm sun, softer light, re-baked reflections; glowing street lamps with light pools, headlights with a beam on every car; all fake light (2 draw calls for lamps, 1 per car), nothing extra by day (`world/evening.ts`).
- [x] **Garage at home**: your other cars (up to 4) stand nose-to-street in the front yard (spots skip bushes/trees/walls); walk up and "🔑 Neem deze" swaps cars, parked cars keep their spot and are solid (`play/garage.ts`, light traffic models).
- [x] **Car wash**: drive-through tunnel at the gas station (walls/roof/sign in the city mesh); stop inside, "🫧 Wassen €10", 4.5 s of spinning rollers and bubbles, then the paint shines for 60 s; sticker "Blinkend schoon" (`play/carWash.ts`, +2 draw calls near the station).
- [x] **Ducks and birds**: two duck families (mom + yellow ducklings in a row) paddle around the pond, little birds hop/peck on the park grass and flutter away when you come close, a flock circles over the park trees. Own low-poly shapes, 5 instanced draw calls, only near the park (`play/wildlife.ts`). Birds sit on the grass instead of tree tops (the game camera never looks up into the crowns).
- [x] **Quality setting**: ⚙️ in the menu with two big buttons "Mooi" / "Snel" (saved per device; automatic until chosen); Snel = 1x pixels, 512 px shadows, 12 people, 5 cars, shorter view (`world/quality.ts`, `ui/qualityPicker.ts`).
- [x] **Stickers / achievements**: 11 stickers (first ride, honk, delivery, taxi, 10 jobs, 10/50 km, new car, clothes, apartment, €10.000) in `profile.stickers`; sticker book from the menu, spinning popup + ching when earned (`game/stickers.ts`, `ui/stickers.ts`).
- [x] **First-time tutorial**: 4 speech bubbles (drive, get out, jobs, gas) on the first play, game paused, keyboard or tablet texts, Skip button; `profile.tutorialDone` keeps it to once (`ui/tutorial.ts`).
- [x] **Horn button**: 📯 button while driving (bottom-left, above the pedals in tablet mode) and H key; people on the sidewalk nearby stop and wave (Victory).
- [x] **Sounds**: WebAudio-synthesized engine hum (follows speed + gas), toot-toot horn (H key for now), coin
      "ching", door clunk; speaker button in the HUD to mute, remembered on the device (`play/sounds.ts`).
- [x] **Traffic with drivers**: AI cars on the right-hand lane, smooth turns, take turns at crossings,
      always stop for people, the player and each other (`src/game/play/traffic.ts`).
- [x] **Minimap + big map + navigation**: rotating minimap, tap for the big map, tap to pick a destination,
      flowing arrows on the road; jobs navigate automatically (`roads.ts`, `navigation.ts`, `ui/cityMap.ts`).
- [x] **Better people and buildings**: eye glints + smiles (skinned to the head), material tuning; reflective
      windows, wall texture, roof tiles, cleaner window detail; towers with podium, setback, crown and fins.
- [x] **Better-looking vehicles**: panel seams, door handles, arch trim, window trim, interiors, new wheels
      with calipers, rounded mirrors, exhaust tips, contact shadows; distinct supercars; sleek motorbike panels.
- [x] **Grounded city**: soft shading near the ground for buildings and trees.
- [x] Steps 1–8 of the original plan (see `docs/PLAN.md`).
