# Upgrade backlog

The hourly upgrade task picks the **first unchecked item**, implements it completely (small and
polished beats big and half-done), checks it, and ticks it off here with a one-line note.
Every item must respect the requirements in `CLAUDE.md` (no violence, simple UI, fast on tablets, NL/EN).

## Next up
- [ ] **Sounds**: soft engine hum that follows speed, friendly horn, coin "ching" for money, door sound.
      WebAudio synthesized (no files needed). A small speaker button in the HUD to mute (remembered).
- [ ] **Horn button**: tap to honk; nearby pedestrians wave (Victory animation) instead of being scared.
- [ ] **Mini-map**: small round map top-right showing roads, you, the job target and the places (house,
      apartment, gas station). Drawn once to a canvas, only the dots move (cheap).
- [ ] **First-time tutorial**: 3–4 friendly speech bubbles on the very first play (drive, get out, jobs,
      gas station). Stored in the profile so it shows only once.
- [ ] **Traffic**: a few AI cars that drive on the right side of the road, stop at crossings and for
      people, and never hit the player (they wait). Reuse `Vehicle` + simple road-following.
- [ ] **Stickers / achievements**: first delivery, first taxi, 10 km driven, first car bought, ...
      Shown as a sticker book in the menu; a small celebration popup when earned.
- [ ] **Quality setting**: a small gear in the menu with "Mooi" / "Snel" (graphics quality) that changes
      pixel ratio, shadows and people count.
- [ ] **Ducks in the park pond** and birds in trees (CC0 animals), very cheap animation.
- [ ] **Car wash** at the gas station: drive through, bubbles, the car gets a shine (for fun, small price).
- [ ] **Garage at home**: owned cars parked in the driveway / street next to your house.
- [ ] **Day / evening light**: optional soft evening light with street lights and car headlights on.
- [ ] **Apartment view**: a cozy simple 3D room when you go inside your apartment.

## Done
- [x] **Better-looking vehicles**: panel seams, door handles, arch trim, window trim, interiors, new wheels
      with calipers, rounded mirrors, exhaust tips, contact shadows; distinct supercars; sleek motorbike panels.
- [x] **Grounded city**: soft shading near the ground for buildings and trees.
- [x] Steps 1–8 of the original plan (see `docs/PLAN.md`).
