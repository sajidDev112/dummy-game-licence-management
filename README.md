# OpEzee Puzzle — demo product

A sliding-tile puzzle that is only playable behind a valid Opezee licence. It
exists to show how a real product integrates with the licence system, and it
uses nothing but the three public endpoints — no Firebase, no admin token.

```
sign in  ->  activate (once)  ->  play  ->  re-checked continuously
```

---

## Running it

The licence API must be reachable at `http://192.168.0.186:5173/api` first.

```bash
cd example-game
npm install
npm run dev
```

Opens on <http://localhost:5174> — the licence dashboard keeps 5173.

## Desktop app (Electron)

```bash
npm run electron:dev     # Vite dev server inside an Electron window
npm run electron:start   # build, then run the built files in Electron
npm run electron:build   # build the Windows installer
```

`electron:build` writes `release-build/OpEzee Puzzle Setup <version>.exe`, a
normal installer that lets you choose the install folder and adds desktop and
Start-menu shortcuts. `.env` values are baked in at build time, so set
`VITE_LICENSE_API` to the real server before building.

### Machine number

Every PC gets a random **16-digit machine number** the first time the app runs
after installing. It is sent as `machine_number` with every
`licenses/verify` and `licenses/sync` call, next to `licenseKey` and
`productName`.

It **never changes** on that PC, whether you reinstall, update or uninstall
and reinstall. It is kept outside the install folder, in two places, and
either one restores the other:

- `%APPDATA%\OpEzee\machine.json`
- `HKCU\Software\OpEzee\MachineNumber` (registry)

To give a PC a new number, delete both and restart the app.

### The licence must belong to the signed-in user

`clients/login` also sends `machine_number`. `licenses/verify` and
`licenses/sync` send the signed-in user too:

```json
{ "licenseKey": "...", "productName": "...", "machine_number": "...", "username": "...", "clientId": "..." }
```

The server should refuse a key that does not belong to that user. The product
also checks the reply itself and refuses the key when:

| Check | Message |
| ----- | ------- |
| Key is not in the licences login returned, or the licence names another client | This license key is not assigned to your account |
| Licence is for another product | This key is for another product |
| Licence is bound to another `machine_number` / `machineNumber` | This license key is already activated on another machine |

Each check runs only when the server sends the field it needs. Remembered keys
are stored per user, so one user's key is never tried for another on the same
PC.

The number appears on the activation and blocked screens and in the in-game
header (click it to copy), and under **Help → Copy machine number / About**.
In a plain browser (`npm run dev`) it falls back to a number kept in
`localStorage`.

### Other desktop features

- Only one copy runs at a time; opening it again focuses the existing window.
- Window size, position and maximised state are remembered.
- Licence calls go through the main process, so the `file://` page is not
  blocked by CORS.
- External links open in the default browser.
- Menu: restart game, full screen, zoom, about (with version and machine
  number).

## Configure

`.env`:

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `VITE_LICENSE_API` | `http://192.168.0.186:5173/api` | Where the licence API lives. |
| `VITE_PRODUCT_NAME` | `demo` | **Must match a product in the dashboard exactly.** A licence issued for another product is refused. |
| `VITE_SYNC_SECONDS` | `60` | How often the running game re-checks the licence. |

`VITE_PRODUCT_NAME` ships as `demo` so it runs against a licence that
already exists. To give the game its own product: create **OpEzee Puzzle** on
the Products page, issue a licence for it, and set this to match.

The name shown in the UI is separate — it is `APP_NAME` in
`src/services/licenseApi.js` and stays "OpEzee Puzzle" whichever product the
licence belongs to.

---

## The flow

### 1. Sign in — every time

`POST /api/clients/login` with the client user ID and password created on the
dashboard's **Clients** page.

The session is kept in `sessionStorage`, so it **survives a page refresh** but
ends when the tab or browser is closed — opening the product still requires
signing in. **Sign out** clears it immediately.

Refreshing mid-game returns straight to the board after the licence is
re-checked, rather than back to the login screen.

### 2. Activate — once per device

`POST /api/licenses/verify` with the key and the product name.

Once a key verifies it is saved in `localStorage`, so this screen is not shown
again on this device. It is still **re-verified on every sign-in** rather than
trusted blindly — a key that has since expired, been deactivated or deleted
sends the player to the matching screen instead of into the game.

### 3. Play

The puzzle: 3×3, 4×4 or 5×5, with move count, timer and a best score per size
in `localStorage`. Click a tile beside the gap or use the arrow keys.

### 4. Continuous re-checking

The licence is re-checked with `POST /api/licenses/sync` **both while playing
and while blocked**, so a licence reactivated or renewed in the dashboard lets
the player back in on its own. It runs:

- every `VITE_SYNC_SECONDS` seconds, and
- whenever the window regains focus.

So deactivating or expiring a licence in the dashboard locks the player out
**mid-game**, within a minute, without them restarting anything. The **Re-check**
button in the header forces it immediately.

Production guidance is an hourly sync; 60 seconds here keeps the demo
demonstrable.

---

## What the player sees when a licence is not usable

| Situation | Screen |
| --------- | ------ |
| Expiry date passed | **License expired** — red, with the dates |
| Deactivated from the dashboard | **License deactivated** |
| Start date still in the future | **License not active yet** |
| Key not found, or issued for another product | Back to the activation screen with the reason |

Each blocked screen offers **Check again**, **Use a different key** and
**Sign out**.

### Try it

1. Sign in, activate, start playing.
2. In the dashboard, click the licence's status chip and confirm **Deactivate**.
3. Within a minute — or immediately if you click **Re-check** — the game is
   replaced by the deactivated screen.
4. Reactivate it in the dashboard and wait — the game returns to the board by
   itself on the next check. **Check again** skips the wait.

---

## How it is put together

```
src/
├── services/licenseApi.js    The three endpoint calls; maps every response to
│                             one state: valid / expired / deactivated /
│                             pending / invalid / wrong-product
├── hooks/useLicenseGate.js   The gate: which screen to show, and the re-check
│                             timer and focus listener
├── components/
│   ├── Screens.jsx           Login, activation, and the blocked screens
│   └── Puzzle.jsx            The game itself — no licence logic at all
└── App.jsx                   Picks a screen from the gate's stage
```

The puzzle knows nothing about licensing, and the licence code knows nothing
about the puzzle. Swapping the game for a real product means replacing
`Puzzle.jsx` and leaving everything else alone.

## Notes for a real product

- Treat `valid === true` as the only pass condition — never infer it from the
  HTTP status.
- A failed re-check does **not** lock a player out: a dropped connection leaves
  the last known state in place and shows an "Offline" badge, and the next tick
  retries. Only a definite answer from the server blocks play.
- These checks run in the browser, so a determined user can bypass them. For
  anything valuable, verify on your own server and gate the content there — the
  same endpoints work equally well from a backend.
