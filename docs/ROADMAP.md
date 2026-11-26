# Roadmap

Where the game is going, and the next steps in order. Each scheduled run does **the first unchecked
step** only (see "Each run" in `CLAUDE.md`), then moves it to `docs/PROGRESS.md`.
Every step must respect the requirements in `CLAUDE.md` (no violence, simple UI, fast on tablets, NL/EN).

## Goal
A friendly, non-violent open-world city for kids aged ~6–12: drive and walk around a small, lively city,
earn money with simple jobs, buy cars and clothes, collect stickers. Looks good, runs smoothly on
tablets, Dutch first with English. Overview and history: `docs/PLAN.md`.

## Next steps

- [ ] **Multiplayer chat + emotes**: in a multiplayer server, a 💬 button opens a short chat (last ~20 messages in
  `mp/chat/{room}`, max 60 characters, 1 message per 2 s) plus quick emotes (👋 😀 👍 🎉 ❤️ 🚗) shown as a bubble
  above the player. Every message goes through `src/services/textFilter.ts` (rude words masked, no links, e-mail
  or phone numbers). A 🔇 mute per player, and a "Chat aan/uit" switch in ⚙️ Settings (off = only emotes).
  Add the chat rules to `database.rules.json` (only your own messages, length check).
- [ ] **Endless countryside**: around the city, endless land made in chunks (e.g. 256 m) that load/unload around
  the player: grass/fields/forest ground, gentle hills outside the city (extend `groundHeight`), country roads that
  continue the city's outer roads in a wide grid, trees and farms as instances. Keep draw calls low (one batched
  mesh per chunk), LOD, and the minimap/big map showing the land near you. Traffic may stay in the city.
- [ ] **Towns along the way**: every few km (seeded) a small town on the country-road grid: a few blocks of
  houses and shops reusing the city building models (BatchedMesh), sidewalks, street lights, a gas station now and
  then. Jobs can send you to a nearby town.

(Add new ideas here, in order, for the next runs.)
