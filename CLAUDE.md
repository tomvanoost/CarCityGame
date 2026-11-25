# CarCityGame — instructions for Claude

A friendly open-world city game for **kids**: drive, walk, earn money with jobs, buy cars and clothes.
TypeScript + Three.js + Vite, hosted on fly.io, accounts in Firebase (demo mode without Firebase).

## Requirements that ALWAYS apply
- **No violence.** No weapons, fighting, damage, crashes into people, or scary content. Cars always
  stop before pedestrians (`Vehicle.yieldToPeople`). Never re-add the removed fighting animations.
- **Very easy to use, simple UI.** Few screens, big buttons, no busy menus. Kids aged ~6–12.
- **Fast on tablets.** Keep draw calls low (BatchedMesh / InstancedMesh / merged meshes), use LOD,
  watch the FPS counter. New 3D content must be optimized (see `scripts/build-models.mjs`).
- **Beautiful but light graphics.** Stylized-realistic, PBR materials, shadows, sky and fog.
- **Dutch first, English second.** Every UI text goes through `src/i18n.ts` (both `nl` and `en`).
- **Tablet mode** (steering wheel, pedals, joystick) must keep working for every feature.
- **Vehicles** are Sketchfab models of the real cars; in the UI they keep look-alike names.
- **Assets:** CC0, or Sketchfab models with CC-BY / CC-BY-SA / CC-BY-NC / CC-BY-NC-SA (never ND, Standard
  or Editorial). Every non-CC0 asset is credited in `CREDITS.md`. NC models mean the game must stay free
  (no ads, no paid items). Sketchfab models must be optimized for tablets (see `scripts/build-vehicles.mjs`).
- The Sketchfab token is injected by the environment's network proxy (`api.sketchfab.com`); Node scripts
  need `NODE_USE_ENV_PROXY=1`. Never write the token into files.
- Player progress is saved through `src/services/session.ts` (`updateProfile`); never store passwords.

## Project map
- `src/ui/` screens (login, register, menu, game HUD, shops) — plain DOM via `h()` in `dom.ts`
- `src/game/city/` city layout (seeded), models, materials (shader road markings, tower windows)
- `src/game/play/` game loop (`game.ts`), vehicle physics, player, pedestrians, jobs, markers
- `src/game/vehicles/` car shape generator, car/bike builders, catalog
- `src/game/avatar/` avatar + clothes catalog
- `docs/PLAN.md` overview, `docs/BACKLOG.md` upgrade ideas, `docs/FIREBASE_SETUP.md`

## How to check your work
```bash
npm ci                      # once
npm run build               # typecheck + production build: must pass
npm run dev &               # dev server on http://localhost:5173
npm run smoke               # browser smoke test (register, shops, city, drive, walk); must pass
```
- The smoke test saves screenshots in `smoke-screenshots/` — look at them.
- Dev tools: `/?carlab=all` (all vehicles), `/?carlab=<id>`, and `window.carcityDebug` in the game (dev only).
- The headless browser uses software rendering: low FPS there is normal and not a bug.

## Git
- Commit messages: a short title line, then what changed and why.
- Never commit `public/config.js`, `.env`, `assets-src/`, `smoke-screenshots/`.
