# Sketchfab setup (about 5 minutes)

CarCityGame can use free 3D models from [Sketchfab](https://sketchfab.com).
To download them, Claude needs a **Sketchfab API token**. A token is like a
password for programs, so it must **never** be pasted into the chat.

## 1. Create a free Sketchfab account
1. Go to <https://sketchfab.com/signup>.
2. Sign up with an e-mail address (or Google). The free plan is enough.
3. Confirm your e-mail address via the mail Sketchfab sends you.

> This should be a parent's/adult's account: Sketchfab requires users to be 18+
> (or have permission from a parent).

## 2. Find your API token
1. Log in, then open **Settings → Password & API**:
   <https://sketchfab.com/settings/password>
2. Scroll down to **API Token**.
3. Click the **copy** icon next to the long code. (Do not share it anywhere else.)

## 3. Send the token to Claude — safely
In the Claude chat a **secure form** appears (a card titled something like
*"Network secret"* for `api.sketchfab.com`).

1. Paste the token into that form (not into the chat).
2. Leave the header/prefix as filled in: `Authorization` with prefix `Token`.
3. Click **Save**.

What happens: the token is stored encrypted on the **CarCityGame** cloud
environment. Claude never sees the token itself; the network proxy adds it to
requests to `api.sketchfab.com` only. The hourly upgrade task uses the same
environment, so it can use Sketchfab too.

### If the form doesn't appear
Open the environment settings yourself: in the Claude Code session, click the
environment name (**CarCityGame**) in the title bar → **Edit** → **Network
secrets** → add:

| Field  | Value                   |
|--------|-------------------------|
| Host   | `api.sketchfab.com`     |
| Header | `Authorization`         |
| Value  | `Token <your token>`    |

## 4. What Claude does with it
- Only models marked **Downloadable** with a **CC0** or **CC-BY** license are used
  (no "Editorial" or "No AI" licenses). Every CC-BY model gets the creator's name
  in [`CREDITS.md`](../CREDITS.md).
- Real brand names and logos are removed (look-alike names only).
- Models are optimized for tablets: simplified, textures compressed, only a few
  "showpiece" models (heavy models would make the game slow).

## 5. Stop or change access
On the same settings page (<https://sketchfab.com/settings/password>) you can
**regenerate** the token. The old one stops working immediately; send the new one
the same way (step 3). You can also delete the secret in the environment settings.
