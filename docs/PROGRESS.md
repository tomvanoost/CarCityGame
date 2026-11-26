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
- [x] **Multiplayer chat + emotes**: 💬 (or T) in a server: last 20 messages, max 60 characters, 1 per 2 s, 8 quick emotes; lines and emotes also pop up as a bubble above the sender for 5 s. Cleaned by the sender and again by every receiver (`textFilter.ts`: rude words masked, links / e-mail / phone numbers removed); tap a name to mute; ⚙️ Settings "Chat aan/uit" (off = emoji only). Firebase `mp/chat/{room}` with rules (own messages only, length checks) in `database.rules.json` (publish again).
- [x] **Multiplayer servers**: 🌐 "Samen spelen" in the menu: create a server or join one from the list (player counts, refreshes every 3 s). Players share name, outfit, car + color, position, speed, siren and turn signals ~6×/s (`src/services/multiplayer.ts`, throttled, Firebase child events; demo mode = browser tabs via BroadcastChannel); others are drawn with their car (light model), avatar and a name tag, smoothed + predicted (`src/game/play/remotePlayers.ts`), ghosts like everyone else. Server names go through `src/services/textFilter.ts`. Needs the new `mp` rules from `database.rules.json` published in the Firebase console.
- [x] **Short money amounts**: 1.6K, 2.3M, 1.2B, 4T, Qa... everywhere (`src/ui/money.ts`).
- [x] **Turn signals**: 1 / 2 on the keyboard, d-pad left / right on Xbox / PlayStation / Nintendo controllers (no longer steering), or the ◀ ▶ buttons next to the speed (tablet too). Orange lamps blink on the body corners with a tick-tock; same side again = off, and they switch off by themselves after a ~60° turn once the wheel is straight.
- [x] **Fire truck, ambulance, emergency outfits, max speed, driver height**: "Brandweerwagen" (Sketchfab "firetruck" by Niclas, Dutch BRANDWEER livery, € 120.000, 100 km/h) and "Sprinto Ambulance" (Sketchfab "HSE Irish Ambulance" by Alexandrovich, € 90.000, 150 km/h), both CC-BY, picked from 7 rendered candidates; siren per vehicle (police high/quick, ambulance, fire low/slow; lamps red+blue / red / blue) on a light bar found by raycast, drivers in the cab (`SEAT_Z`). Outfits Politie (peaked cap), Brandweer (red helmet + air tanks), Ambulance (yellow + medical backpack). 🏁 next to the home button sets your max speed (10 km/h up to the car's top speed, saved per device). Drivers sit with the head just under the real roof (highest of 4 close rays, so a windscreen hit doesn't push them down).
- [x] **Police car with siren**: "Beemer M6 Politie" (Sketchfab 2012 BMW M6 Patrol by Ddiaz Design, CC-BY-NC-SA, chosen from 3 rendered candidates; 60k tris) for € 100.000, top speed 250. R / 🚨 button / controller RB (wheel R2/L2) toggles a two-tone siren with flashing red/blue roof lights (fake light, 3 small meshes); traffic within 55 m pulls over ~2.1 m (wheels on the curb, clear of trees) and crawls so you can pass. H stays the horn. Not in traffic; parks at home in full detail (its light version loses the livery).
- [x] **Traffic off-road glitch + hold-to-honk**: recycled traffic cars kept the turn planned on their old road and drove across blocks (5% of samples in a stress test, now 0); `place()` clears it and the next turn must leave the crossing. The horn sounds while held (H, 📯, controller X/□, wheel buttons): a quick tap = short toot, holding repeats the honk, release stops it.
- [x] **Real car horn**: the horn plays the owner's recorded honk (`public/sounds/horn.mp3`, Dragon Studio / Pixabay, 13 KB mono); tapping again still cuts the old honk off; synthesized toot only until it has loaded.
- [x] **Bluetooth controllers that lack the standard layout**: triggers/d-pad read from axes (2/5, 6/7) when the browser gives no "standard" mapping (and Start no longer acts as gas there); stick/d-pad forward = gas, back = brake for every controller; Settings shows each controller's name with a live button test ("🔘 1 werkt!").
- [x] **Controllers, steering wheels and Settings**: Xbox / PlayStation / Nintendo controllers (standard Gamepad layout: triggers gas/brake, stick steer/walk, right stick look, Y/△ in/out, X/□ horn, A/✕ jump, B/○ run/close panel) and Logitech wheels with pedals (G29/G923 PS and G920/G923 Xbox pedal axes, pedal rest auto-detected so there's no ghost gas); ⚙️ Settings screen in the menu with ⚡ Snel (no shadows/antialias, 0.8 render scale, fewer people/cars, short view) and ✨ Kwaliteit (sharpest picture, 4096 shadows, far view, more life), plus the connected controllers and their buttons. Tested with simulated pads (no real hardware here).
- [x] **Hero outfits (original, Fortnite-like look)**: 8 new ⭐ outfits in the clothes shop (Skater, Racing driver, Pilot, Explorer, Superhero, Neon ninja, Robot suit, Astronaut): bold colors on the CC0 Quaternius models + extras made from simple shapes on the head/torso bone (cape, bubble helmet, jetpack, backpack, cap, antenna, goggles; `src/game/avatar/gear.ts`), one small mesh each, all animations work. The real Quaternius pack only adds soldiers/goblin/zombie (not used). Helmet bubble and antenna hide while driving; drivers now sit under the real roof above the seat (raycast), not under the car's total height.
- [x] **Pass through people, no wobbly wheels, electric sound, fresh models**: your car and you walk/drive right through people (no stopping, no bump; traffic still stops for people); only the rims roll (tire stays, so no tire/arch slivers swing out) around a center refined from the rim's own vertices; electric cars whine instead of "vroom"; model URLs get `?v=<content hash>` (vite plugin), so browsers never show an old cached model (the backwards white BMW in traffic was an old cached file).
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
