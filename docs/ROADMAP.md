# Roadmap

Where the game is going, and the next steps in order. Each scheduled run does **the first unchecked
step** only (see "Each run" in `CLAUDE.md`), then moves it to `docs/PROGRESS.md`.
Every step must respect the requirements in `CLAUDE.md` (no violence, simple UI, fast on tablets, NL/EN).

## Goal
A friendly, non-violent open-world city for kids aged ~6–12: drive and walk around a small, lively city,
earn money with simple jobs, buy cars and clothes, collect stickers. Looks good, runs smoothly on
tablets, Dutch first with English. Overview and history: `docs/PLAN.md`.

## Next steps

More realistic nature, one small step per run (the user's request). Keep draw calls low (one
InstancedMesh / shader per feature, distance fade, off on Snel), check FPS-relevant numbers, and take
close-up screenshots before and after.
Asset sources: dl.polyhaven.org, api.polyhaven.com and ambientcg.com are blocked from the container;
api.sketchfab.com works (CC0 / CC-BY models and their textures, see `scripts/sketchfab-download.mjs`),
or generate textures procedurally (canvas / shader noise) at load time.

- [ ] **Grass texture on the ground**: a grass texture (procedural, or CC0 from a Sketchfab download), tiled and
  blended with the existing noise in `createTerrainMaterial`) for lawns, park and countryside, with
  distance blending so the tiling never shows; same for the dirt / gravel edges.
- [ ] **Grass blades near the camera**: one InstancedMesh of small grass tufts (cross-quads, alpha-tested
  texture drawn on a canvas) scattered on lawns and park grass around the player only, swaying in a vertex-shader wind,
  fading out at ~40 m; none on roads and sidewalks; off on the Snel setting.
- [ ] **Flowers and clover in the grass**: a few colored flower / clover patches in the same instancing
  system (parks, front gardens, roadsides), so lawns aren't one flat green.
- [ ] **Better trees**: realistic CC0 / CC-BY trees from Sketchfab with leaf textures instead of
  the low-poly blobs, with a light far version (billboard or low-poly) and gentle leaf sway in the wind.
- [ ] **Bushes and hedges**: realistic hedges along front gardens and bushes in the park (instanced, CC-BY / CC0
  Sketchfab or procedural textures), replacing the plain bush models.
- [ ] **Ground details**: soft color variation, worn paths across the park grass, and small stones /
  leaves near trees (decal-style in the terrain shader, no extra draw calls).
- [ ] **Water**: a more realistic pond (subtle waves, reflections of the sky, reeds and lily pads around the
  edge).

(Add new ideas here, in order, for the next runs.)
