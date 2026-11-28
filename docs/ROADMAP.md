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

- [ ] **Paper plane contest** (feature): at the library you get a paper plane; throw it from the top of
  the park hill / a bridge and see how far it glides (best distance saved, a sticker for 50 m); NL + EN.
- [ ] **Lighter traffic cars** (performance): measure the traffic cars (draw calls, triangles, update time) at
  the six spots; draw far traffic cars with an even lighter model or skip their wheels' spin; nothing may look worse.

- [ ] **Softer shadows and a touch of ambient occlusion** (graphics): slightly softer sun shadow edges and
  darker corners where walls meet the ground (baked into the ground shader, no post-processing).

(Add new ideas here, in order, for the next runs.)
