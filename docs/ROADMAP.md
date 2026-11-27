# Roadmap

Where the game is going, and the next steps in order. Each scheduled run does **the first unchecked
step** only (see "Each run" in `CLAUDE.md`), then moves it to `docs/PROGRESS.md`.
Every step must respect the requirements in `CLAUDE.md` (no violence, simple UI, fast on tablets, NL/EN).

## Goal
A friendly, non-violent open-world city for kids aged ~6–12: drive and walk around a small, lively city,
earn money with simple jobs, buy cars and clothes, collect stickers. Looks good, runs smoothly on
tablets, Dutch first with English. Overview and history: `docs/PLAN.md`.

## Next steps

The runs take turns (the user's request, 27 Nov): **a new feature, then a performance upgrade, then a
graphics upgrade**, and so on. Keep that rotation when adding steps.
- **Features**: small, kid-friendly, simple big-button UI, NL + EN, keyboard + tablet + controllers;
  in-game money only (the game stays free: no real money, no ads).
- **Performance**: measure before and after (draw calls, triangles, shader programs from
  `window.carcityDebug.game.renderer.info` at the same spots: city spawn, park, lake beach, lake town,
  desert, A2) and write the numbers in `docs/PROGRESS.md`. Nothing may look worse.
  Baseline 27 Nov (Kwaliteit, incl. shadow pass): city spawn 381 calls / 2.38 M triangles / 113 programs,
  park 382 / 1.88 M, lake beach 312 / 1.43 M, lake town 269 / 1.15 M, desert 195 / 0.84 M, A2 342 / 1.14 M.
- **Graphics**: stylized and light, no heavy post-processing; must keep the FPS. (The realistic trees
  glitched once and were reverted: compare screenshots before/after and revert anything that looks off.)

- [ ] **Draw-call diet** (performance): list the draw calls per object at the city spawn; merge the many
  small separate place meshes (stands, shop buildings, signs, boat, dune stand...) into shared
  vertex-color materials, and hide things far away (> ~400 m) that are still drawn. Target: city spawn
  under 280 draw calls.
- [ ] **Prettier lake water** (graphics): sun glitter on the waves, a soft light band along the shore,
  gentle moving ripples, sky color in the water at sunset; one shader, no extra draw calls.
- [ ] **Skate park in the city park** (feature): ramps and a half-pipe; walk onto them for a skateboard
  ride with a little jump and stars, no falling.
- [ ] **Triangle diet** (performance): find the biggest triangle sources at the spawn (buildings, trees,
  cars, shadow pass); add LODs / lower-detail far versions, let only big things cast shadows, tighten
  the shadow camera. Target: city spawn under 1.4 M triangles.
- [ ] **Sky with clouds and stars** (graphics): soft drifting clouds by day, stars and a moon at night,
  warmer sunrise / sunset colors following the clock; cheap (sky dome shader).
- [ ] **Rain showers and rainbows** (feature): now and then a short light rain (puddles on the road,
  wipers on the traffic cars) followed by a rainbow over the city; only on the Kwaliteit setting.
- [ ] **Fewer shader programs** (performance): 113 programs at the spawn: share identical materials,
  warm up shaders during loading (`renderer.compileAsync`) so there's no stutter the first time
  something comes into view. Target: under 70 programs.
- [ ] **Road and sidewalk details** (graphics): asphalt patches and cracks, manhole covers, curb stones,
  slightly worn lane paint, in the road shader (no extra draw calls).

(Add new ideas here, in order, for the next runs.)
