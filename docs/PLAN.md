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
3. ⬜ **Game menu:** 3D avatar top-left, Vehicle shop, Clothes shop, owned-car selector, Play
4. ⬜ **City:** roads, buildings, trees, lighting/shadows; instancing, LOD, culling
5. ⬜ **Driving & walking:** starter car "Golfo 2025", get in/out, keyboard + tablet controls
   (steering wheel, gas/brake; joystick when walking, Roblox-style)
6. ⬜ **People:** pedestrians walk around and step aside; the car always stops before touching anyone
7. ⬜ **Money & places:** deliveries, taxi, daily bonus, gas station (refuel), your house & apartment
8. ⬜ **Shops:** vehicle shop (unique cars & motorbikes) and clothes shop, saved to Firebase

## Rules we always follow
- No violence: no weapons, no damage, no crashing into people (the car brakes automatically)
- Very easy to use: as few screens and buttons as possible
- Fast on tablets: watch the FPS counter, keep draw calls low
