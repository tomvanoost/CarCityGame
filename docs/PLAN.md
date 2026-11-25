# CarCityGame: plan

A friendly, **non-violent** open-world city game for kids. TypeScript + Three.js,
hosted on fly.io, accounts in Firebase. Simple UI: big buttons, no busy menus,
FPS always visible.

## Choices made
| Topic | Choice |
|---|---|
| Graphics | Stylized-realistic: free CC0 models, PBR materials, soft shadows, sky, fog |
| Vehicle names | Look like the real cars, with different (look-alike) names |
| Vehicle range | Fewer vehicles, but every one unique (~30–50 cars + motorbikes) |
| Players | Single player first (NPC people + traffic); multiplayer maybe later |
| Language | Dutch by default, NL/EN switch |
| Login | Firebase Auth with only a username (hidden fake e-mail) + Realtime Database |
| City | Medium (~1×1 km): downtown, houses, apartments, park, gas station, shops |
| Earning money | Delivery jobs, taxi rides, daily bonus + money per km driven |

## Steps
1. ✅ **Base:** Vite + TS project, fly.io (Docker + nginx), Firebase guide, FPS counter
2. ✅ **Login / Register:** username, password, confirm, boy/girl; demo mode without Firebase
3. ✅ **Game menu:** 3D avatar top-left (animated, tap to cheer), car showroom (drag to turn), owned-car picker, shop & Play buttons
4. ✅ **City:** ~1×1 km grid city: downtown towers, townhouses, shops, apartments, houses with gardens, park with pond & fountain, gas station, forest ring + hills; sun, shadows, sky, fog. Play opens a city tour (drag/pinch)
5. ✅ **Driving & walking:** start in your selected car next to your house; get in/out (sit/stand animations);
   arcade car physics (no damage, gentle bumps); walk/run/jump; follow camera (drag to look, avoids buildings);
   keyboard + tablet mode (steering wheel, gas/brake pedals; joystick + jump when walking)
6. ✅ **People:** 22–36 pedestrians (adults & kids, 10 looks) walk around blocks, cross at zebra crossings,
   wait for cars and step aside; the car brakes by itself so it can never touch anyone ("Stop! Daar loopt iemand.")
7. ✅ **Money & places:** delivery & taxi jobs (markers in the city, yellow arrow, green goal, no timers), daily bonus
   (€500), €2 per 100 m, fuel tank + refueling (free top-up if you can't pay), house & apartment (€5.000) with a
   simple panel: switch car, change clothes, choose where to start; map pins for house/apartment/gas station
8. ✅ **Shops:** vehicle shop with 27 unique look-alike cars + 7 motorbikes (stats, 10 paint colors, buy with a
   confirm tap), clothes shop with 16 styles tried on live on your avatar; ride motorbikes in the city

## How the 3D content works
- **Avatar:** CC0 Quaternius characters, 12 outfits × boy/girl. Each outfit is a small .glb
  (about 280 KB); animations are shared per gender. The Clothes shop sells outfits and color styles
  (`src/game/avatar/clothes.ts`).
- **Vehicles:** built in code from a short shape description (side profile, roofline, width,
  lights, rims) in `src/game/vehicles/catalog.ts`. Lights, grille and trim are drawn by the paint
  shader, so each car is one draw call for the body. Design tool: run `npm run dev` and open
  `/?carlab=<vehicle-id>`.

## How the city works (performance)
- **Layout** (`src/game/city/layout.ts`) is generated from a fixed seed: everyone gets the same city.
  It also exports colliders and places (spawn, gas station, your house, your apartment) for later steps.
- **Few draw calls (~10 per frame):** all buildings are one `BatchedMesh`, all trees/props another;
  roads are ONE plane with markings drawn in the shader; towers are one `InstancedMesh` whose windows
  are drawn in the shader.
- **LOD:** every building/tree has a light far-away version; far trees are hidden. Models are
  simplified offline (`scripts/build-models.mjs`); all city models together are about 1 MB.
- **Shadows** only re-render when the camera moves; **dynamic resolution** lowers the pixel ratio when
  FPS drops below 45. Tablets get a lighter preset (`src/game/world/quality.ts`).
- **People** are recycled around the player and each is one merged skinned mesh (1 draw call); only nearby people animate and cast shadows.
- **Vehicles:** cars come from `makeShape()` presets (hatch, sedan, SUV, sports, van, jeep) in
  `src/game/vehicles/shapeGen.ts`; motorbikes from `bikeBuilder.ts`. Preview all: `/?carlab=all` and `/?carlab=all2`.
- Dev tools: `/?assetlab=<folder>&files=a.glb,b.glb` (needs models in `public/_lab/`), `/?carlab=<id>`.

## Rules we always follow
- No violence: no weapons, no damage, no crashing into people (the car brakes automatically)
- Very easy to use: as few screens and buttons as possible
- Fast on tablets: watch the FPS counter, keep draw calls low
