# 🚗 CarCityGame

A friendly open-world city game for kids. **No violence**: drive, explore, earn
money with deliveries and taxi rides, and buy cars and clothes.
Built with **TypeScript + Three.js**, hosted on **fly.io**, saved in **Firebase**.

- 📋 Plan & progress: [docs/PLAN.md](docs/PLAN.md)
- 🔥 Firebase setup: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)
- 🎨 Credits & model sources: [CREDITS.md](CREDITS.md)

## Run locally
```bash
npm install
cp public/config.example.js public/config.js   # leave empty for demo mode
npm run dev
```
Then open http://localhost:5173.

## Controls
| | Keyboard | Tablet mode (auto on touch screens, toggle with the tablet button) |
|---|---|---|
| Drive | W A S D / arrows (S = brake, hold to reverse), Space = handbrake | Steering wheel + green gas / red brake pedal |
| Walk | W A S D / arrows, Shift = run, Space = jump | Joystick (left half of the screen), jump button |
| Get in / out | E | Big orange/green button |
| Look around | Drag with the mouse | Drag on the screen |

## Deploy to fly.io
1. Install the CLI: <https://fly.io/docs/flyctl/install/>, then run `fly auth login`.
2. Change `app = "carcitygame"` in `fly.toml` to a unique name.
3. First time: `fly launch --no-deploy --copy-config`
4. Set your Firebase values (see the Firebase guide, step 5b): `fly secrets set FIREBASE_API_KEY=...`
5. `fly deploy`

The app scales to zero when nobody is playing, so it costs (almost) nothing.
