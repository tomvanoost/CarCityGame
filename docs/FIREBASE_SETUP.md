# Firebase setup (about 10 minutes)

CarCityGame uses **Firebase Authentication** (username + password) and the
**Realtime Database** (money, cars, clothes, avatar). Until you finish this,
the game runs in **demo mode** and saves progress only in the browser.

## 1. Create a project
1. Go to <https://console.firebase.google.com> and click **Create a project**.
2. Name it e.g. `carcitygame`. Google Analytics is not needed; switch it off.

## 2. Turn on login (Authentication)
1. In the left menu: **Build → Authentication → Get started**.
2. Under **Sign-in method**, choose **Email/Password**, switch **Enable** on and click **Save**.
   (Don't enable "Email link".)

> Players never see an e-mail address. The game turns the username `tom` into
> the hidden login `tom@players.carcitygame.app`. Passwords are stored safely
> (hashed) by Firebase Auth and **never** in the database.

## 3. Create the Realtime Database
1. **Build → Realtime Database → Create database**.
2. Location: **Belgium (europe-west1)** is closest to the Netherlands.
3. Choose **Start in locked mode** and click **Enable**.
4. Open the **Rules** tab, replace everything with the contents of
   [`database.rules.json`](../database.rules.json) from this repo, and click **Publish**.
   These rules let each player read and write **only their own** data.

## 4. Register the web app and copy the config
1. Click the gear icon ⚙️ → **Project settings** → under *Your apps*, click the **`</>`** (Web) icon.
2. Nickname: `carcitygame-web`. You don't need Firebase Hosting (we use fly.io). Click **Register app**.
3. You'll see a `firebaseConfig` object. You need these five values:
   `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`.
   (If `databaseURL` is missing, copy it from the top of the Realtime Database page,
   e.g. `https://carcitygame-default-rtdb.europe-west1.firebasedatabase.app`.)

> These web keys are **not secret**. Every website that uses Firebase sends them
> to the browser. Your data is protected by the rules from step 3.

## 5a. Use it locally
```bash
cp public/config.example.js public/config.js
```
Fill in the five values in `public/config.js`, then run `npm run dev`. The
"Demo mode" note on the login screen disappears once it works.

## 5b. Use it on fly.io
```bash
fly secrets set \
  FIREBASE_API_KEY="AIza..." \
  FIREBASE_AUTH_DOMAIN="carcitygame.firebaseapp.com" \
  FIREBASE_DATABASE_URL="https://carcitygame-default-rtdb.europe-west1.firebasedatabase.app" \
  FIREBASE_PROJECT_ID="carcitygame" \
  FIREBASE_APP_ID="1:1234567890:web:abcdef"
```
The container writes these into `/config.js` at startup, so you don't need to rebuild.

## 6. Allow your fly.io domain
**Authentication → Settings → Authorized domains → Add domain**, then add
`<your-app>.fly.dev` (and your own domain, if you have one). `localhost` is already listed.

## What gets stored
```
users/
  <uid>/
    username: "tom"
    gender: "boy" | "girl"
    money: 1000
    ownedVehicles: ["golfo-2025"]
    selectedVehicle: "golfo-2025"
    ownedClothes: ["casual-blue"]
    equipped: { outfit: "casual-blue" }
    lastDailyBonus: 0
    createdAt: 1764000000000
    fuel: 1            # 0..1
    ownsApartment: false
    spawn: "home"      # or "apartment"
    km: 0
    vehicleColors: { "golfo-2025": "#2f6fd0" }
    tutorialDone: true     # first-time tips were shown
    stickers: ["honk", "firstDelivery"]
    deliveries: 3          # finished jobs (for stickers)
    taxiRides: 1
```

## Good to know
- **Forgotten password:** usernames have no real e-mail, so a reset e-mail can't be sent.
  As the admin, open **Authentication → Users**, delete the user, and let them register again.
- The free **Spark plan** is easily enough for this game.
