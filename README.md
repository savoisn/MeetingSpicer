# Random Picker — testing protocol

Static site for a Google Meet add-on: any participant can pick a random
person from everyone who currently has the add-on open, and the pick is
shown to all of them (side panel) and broadcast to the main stage.

Files:
- `shared.js` — identity/state helpers shared by both pages.
- `index.html` / `sidepanel.js` — side panel (name entry, roster, pick).
- `mainstage.html` / `mainstage.js` — main stage display.
- `test/` — local mock harness (see below). Not part of the deployed add-on.

## 1. Local testing (no Meet, no deploy)

The add-on can't run standalone — it needs `window.meet.addon`, which only
exists inside a real Meet call. `test/mock-meet-sdk.js` stands in for it:
same method shapes, but participant sync happens over `BroadcastChannel`
between browser tabs on your machine instead of over Meet.

**Serve the files over HTTP** (not `file://` — `BroadcastChannel` and the
relative script paths need a real origin):

```bash
python3 -m http.server 8099
```

**Simulate participants:**

1. Open `http://localhost:8099/test/index.html` in a **new browser tab**
   (File → New Tab, or `Cmd/Ctrl+T` — not a tab opened programmatically by
   the page itself).
2. Enter a name, click Continue. You should see "1 person here" and your
   name in the roster.
3. Repeat step 1–2 in one or more additional tabs with different names.
   Each tab's roster should grow to include the others within ~15s (the
   heartbeat interval — a tab that joined seconds ago may not appear
   everywhere instantly, that's expected, see "Known limitations" below).
4. Click "Pick a random person" in any tab:
   - The winner banner should appear immediately in every open side-panel
     tab (synced live).
   - A new tab opens automatically showing `test/mainstage.html` with the
     winner's name — this simulates Meet promoting the add-on to the main
     stage for whoever clicks "join activity".
5. Click "Pick a random person" again. The already-open main-stage tab
   should update to the new winner without reloading or reopening.
6. Click "Not you? Change name" in a tab to confirm the name prompt
   re-appears and updates the roster under the same identity.

**What to watch in the console:** each tab logs `[mock sdk] ...` lines for
every SDK call it makes (`createAddonSession`, `startActivity`,
`createCoDoingClient`) — useful for confirming a click actually triggered
the call you expected.

### Why separate *tabs*, specifically

`shared.js` persists your name/id in `localStorage`, which is shared by all
tabs of the same browser origin (correct for the real add-on — one person,
one browser). For local testing, `test/mock-meet-sdk.js` aliases
`localStorage` to `sessionStorage`, which is per-tab, so each tab you open
by hand acts as a distinct participant. A tab opened *by the page itself*
(e.g. the main-stage tab from `startActivity`) inherits the opener's
session storage, so don't use those to simulate a second participant —
always open a fresh tab yourself.

### Known limitations of the mock harness

- **Roster sync latency is real, not simulated**: a participant who joined
  in the last ~15s may not show up in another tab's roster yet — this
  matches production behavior (`CoDoingClient` has no "give me the current
  state" query; new information only arrives via the next broadcast).
- **No "join activity" prompt**: real Meet shows other participants a
  banner they must click before their client loads the add-on.
  `startActivity()` here just opens `mainstage.html` directly in a new tab.
- **No real identity/roster from Meet**: the mock (like the real SDK) has
  no way to know who's actually in the call — "present" always means
  "has this add-on open," never "connected to the meeting."

## 2. Testing inside a real Meet call

1. Set `CLOUD_PROJECT_NUMBER` in `shared.js` to your Workspace add-on's
   Cloud project number (same one in your manifest).
2. Deploy `index.html`, `mainstage.html`, `shared.js`, `sidepanel.js`,
   `mainstage.js` to the static host referenced by your manifest's
   `sidePanelUrl` / `addOnOrigins`. Do **not** deploy `test/`.
3. Start a Meet call, open the add-on from the Activities panel on two or
   more devices/accounts (or two browser profiles joined to the same call).
4. Repeat the same click-through as the local protocol above (join, watch
   roster grow, pick, confirm main stage opens for others, pick again).
5. **Verify the one unconfirmed API detail**: open devtools on any
   participant and check that `CoDoingClient.broadcastStateUpdate` accepts
   what `shared.js`'s `encodeState()` sends (a raw `Uint8Array`), against
   the [reference page](https://developers.google.com/workspace/meet/add-ons/reference/websdk/live_sharing_sdk.codoingclient.broadcaststateupdate).
   If it expects a wrapper object instead, `encodeState`/`decodeState` in
   `shared.js` are the only two functions that need adjusting.
6. Confirm participants who close and reopen the side panel keep their
   name (stored in real `localStorage` this time) but drop off the roster
   after ~40s of being closed (`ROSTER_TTL_MS` in `shared.js`).

## Tuning

Both constants live in `shared.js`:
- `HEARTBEAT_INTERVAL_MS` (default 15s) — how often each open panel
  re-announces itself.
- `ROSTER_TTL_MS` (default 40s) — how long a participant is shown as
  "present" after their last heartbeat.

Keep `ROSTER_TTL_MS` comfortably above `HEARTBEAT_INTERVAL_MS` (roughly
2-3x) so one missed broadcast doesn't make someone flicker out of the list.
