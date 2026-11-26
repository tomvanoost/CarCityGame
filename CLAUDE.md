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
- `docs/ROADMAP.md` goal + next steps, `docs/PROGRESS.md` done / state / known problems / blocked hosts,
  `docs/PLAN.md` overview and history, `docs/FIREBASE_SETUP.md`

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

## Each run (scheduled task): one step
1. **Sync:** `git fetch origin`, check out `claude/hourly-upgrades`, pull, then merge `origin/claude/stoic-shannon-4k32uu`.
   Stop and report if the merge has conflicts you cannot resolve safely.
2. **Pick:** the first unchecked step in `docs/ROADMAP.md`. Do only that step, small and polished.
3. **Build it** following every requirement above.
4. **Verify:** `npm ci`; `npm run build` must pass; copy `public/config.example.js` to `public/config.js` if it
   is missing (never commit it); make sure `npm run dev` runs; `npm run smoke` must pass. Look at the smoke
   screenshots, and take extra screenshots that show the change up close in the game (park the car / point
   the camera with `window.carcityDebug`). Fix anything that looks wrong; check FPS-relevant numbers
   (draw calls, triangles) did not grow much.
5. **Done:** move the step from `docs/ROADMAP.md` to the top of "Done" in `docs/PROGRESS.md` with a one-line
   note; update "Current state", "Known problems" and "Blocked hosts" there if anything changed. Commit.
6. **Push:** `claude/hourly-upgrades`, then fast-forward the deploy branch:
   `git push origin claude/hourly-upgrades:claude/stoic-shannon-4k32uu`. If that is rejected because the deploy
   branch has new commits: fetch, merge them, verify again, push both. Never force-push, never push other
   branches, never open or merge pull requests.
   **Deploy:** the push to the deploy branch starts `.github/workflows/fly-deploy.yml` (flyctl deploy to fly.io).
   After ~5 minutes check with the Fly MCP (`list_machines` / `list_machine_versions`, app `carcitygame`) that the
   machine runs a new image version; mention the result (or a failed deploy) in the report.
7. **Can't finish?** Don't push broken code: revert, add a short note under the step in `docs/ROADMAP.md`
   (what blocked it), commit and push that note as in step 6. If the roadmap has no unchecked step, do nothing.
8. **Report:** send a short push notification (in English): the step you did, test results (build, smoke),
   the next step, and any blocked hosts.

## Git
- Commit messages: a short title line, then what changed and why.
- Never commit `public/config.js`, `.env`, `assets-src/`, `smoke-screenshots/`.
