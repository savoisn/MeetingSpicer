# Random Picker — testing protocol

Static site for a Google Meet add-on: any participant can pick a random
person from everyone who currently has the add-on open, and the pick is
shown to all of them (side panel) and broadcast to the main stage.

Files:
- `shared.js` — config placeholders + identity helpers, shared by both pages.
- `firestore.js` — presence/winner sync (see "Why Firestore" below).
- `index.html` / `sidepanel.js` — side panel (name entry, roster, pick).
- `mainstage.html` / `mainstage.js` — main stage display.
- `firestore.rules` — paste into the Firebase console; Firestore denies
  everything by default.
- `test/` — local mock harness (see below). Not part of the deployed add-on.

## Why Firestore, not Co-Doing

The Meet Add-ons SDK's own live-sync mechanism (`createCoDoingClient`,
part of the separate "Live Sharing SDK") turned out to require Early Access
Program enrollment, and that program appears closed to new signups — it
fails at runtime with "Could not connect to co channel... This method
might require EAP enrollment," which is not something you can fix in code.
So presence and the winner are synced through Firestore instead: a document
per meeting (keyed by `meetingCode` from `MeetAddonClient.getMeetingInfo()`,
which **is** part of the core, non-gated SDK), with a `participants`
subcollection so each side panel can update only its own entry. No server
code to write or host — just the Firestore client SDK talking directly to
your Firebase project, and the security rules below scoping access.

## 0. One-time setup

### 0.1 Create (or reuse) a Firebase project

1. Go to https://console.firebase.google.com and sign in with the Google
   account that should own this project.
2. Click **Add project** (or **Create a project**, on an empty account).
3. Name it anything (e.g. `meeting-spicer`) → **Continue**.
4. Google Analytics prompt: not needed for this app — toggle it off →
   **Create project** → wait for provisioning → **Continue** into the
   project dashboard.
   - You can reuse an existing Firebase/GCP project instead — the same
     Google Cloud project your Workspace Add-on already uses is fine,
     Firestore doesn't need a dedicated project. If you do that, skip
     straight to 0.2.

### 0.2 Enable Firestore

1. In the left sidebar, under **Build**, click **Firestore Database**.
2. Click **Create database**.
3. Location: pick whatever region is closest to your users (this can't be
   changed later without recreating the database — for a small internal
   tool it rarely matters).
4. Security rules starting mode: either option is fine here since you'll
   overwrite the rules in step 0.4 immediately — pick **Start in test
   mode** if you want a quick sanity check with default-open rules first.
5. Click **Create**/**Enable** and wait for it to provision.

### 0.3 Register a web app and get the config

1. In the project dashboard, click the **gear icon** next to "Project
   Overview" → **Project settings**.
2. Scroll to **Your apps** → click the **`</>`** (web) icon to add a web
   app.
3. Give it a nickname (e.g. `random-picker-web`) — Firebase Hosting
   checkbox can stay unchecked, this project doesn't use it.
4. Click **Register app**. Firebase shows a `firebaseConfig` object like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "meeting-spicer-xxxxx.firebaseapp.com",
     projectId: "meeting-spicer-xxxxx",
     storageBucket: "meeting-spicer-xxxxx.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef1234567890"
   };
   ```
5. Copy those six values into `FIREBASE_CONFIG` in `shared.js`, replacing
   the `'REPLACE_ME'` placeholders. Click **Continue to console** to
   finish (you don't need the SDK install/init snippets it shows next —
   `firestore.js` already handles that).
6. You can always get back to this config later from Project settings →
   General → scroll to Your apps → click the web app.

### 0.4 Publish the security rules

1. Firestore Database → **Rules** tab.
2. Replace the entire contents of the editor with everything in
   `firestore.rules`.
3. Click **Publish**.
4. Without this, every read/write from the app is denied by Firestore's
   default rules — the roster silently never loads and the console shows
   `FirebaseError: Missing or insufficient permissions`.

### 0.5 Cloud project number (unrelated to Firebase)

Confirm `CLOUD_PROJECT_NUMBER` in `shared.js` matches the one in your
manifest — this is the Workspace Add-on's own Cloud project, separate
from whatever Firebase project you just created above.

## 1. Local testing (no Meet, no deploy)

The add-on can't run standalone — it needs `window.meet.addon`, which only
exists inside a real Meet call. `test/mock-meet-sdk.js` fakes just the Meet
chrome (session/client creation, `getMeetingInfo`, `startActivity`).
Presence and the winner go through your **real** Firebase project, so step
0 above must be done first — this isn't simulated locally.

**Serve the files over HTTP** (not `file://` — relative script paths and
Firestore both need a real origin):

```bash
python3 -m http.server 8099
```

**Simulate participants:**

1. Open `http://localhost:8099/test/index.html` in a **new browser tab**
   (File → New Tab, or `Cmd/Ctrl+T` — not a tab opened programmatically by
   the page itself; see "Why separate tabs" below).
2. Enter a name, click Continue. You should see "1 person here" and your
   name in the roster.
3. Repeat step 1–2 in one or more additional tabs with different names.
   Each tab's roster should update within a second or two (Firestore's
   live listener, not a polling interval) — no 15s wait needed to see a
   new joiner, unlike the old Co-Doing design.
4. Click "Pick a random person" in any tab:
   - The winner banner should appear immediately in every open side-panel
     tab.
   - A new tab opens automatically showing `test/mainstage.html` with the
     winner's name — this simulates Meet promoting the add-on to the main
     stage for whoever clicks "join activity".
5. Click "Pick a random person" again. The already-open main-stage tab
   should update to the new winner without reloading or reopening.
6. Click "Not you? Change name" in a tab to confirm the name prompt
   re-appears and updates the roster under the same identity.

Check the Firebase console (Firestore Database → Data) alongside this —
you should see a `meetings/mock-aaa-bbbb-ccc` document appear with a
`participants` subcollection and a `winner` field as you click through.

**What to watch in the console:** each tab logs `[mock sdk] ...` lines for
every SDK call it makes — useful for confirming a click actually triggered
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

### Simulating a second, separate meeting

All mock tabs share one fake meeting (`mock-aaa-bbbb-ccc`) by default, so
their rosters merge. To test two calls in isolation at once, open a second
set of tabs with `?meetingCode=` in the URL, e.g.
`http://localhost:8099/test/index.html?meetingCode=mock-second-room`.

### Known limitations of the mock harness

- **No "join activity" prompt**: real Meet shows other participants a
  banner they must click before their client loads the add-on.
  `startActivity()` here just opens `mainstage.html` directly in a new tab.
- **No real identity/roster from Meet**: the mock (like the real SDK) has
  no way to know who's actually in the call — "present" always means
  "has this add-on open," never "connected to the meeting."

## 2. Testing inside a real Meet call

1. Confirm step 0 (Firebase project + rules + config) is done.
2. Deploy `index.html`, `mainstage.html`, `shared.js`, `firestore.js`,
   `sidepanel.js`, `mainstage.js` to the static host referenced by your
   manifest's `sidePanelUrl` / `addOnOrigins`. Do **not** deploy `test/`.
3. Start a Meet call, open the add-on from the Activities panel on two or
   more devices/accounts (or two browser profiles joined to the same call).
4. Repeat the same click-through as the local protocol above (join, watch
   roster grow, pick, confirm main stage opens for others, pick again).
5. **Verify the one unconfirmed API detail**: `sidePanelClient.getMeetingInfo()`
   / `mainStageClient.getMeetingInfo()` returning `{ meetingId, meetingCode }`
   is corroborated from Google's docs but I couldn't load the live reference
   page to confirm it verbatim (automated fetches are blocked). Check it
   once in devtools against the
   [reference page](https://developers.google.com/workspace/meet/add-ons/reference/websdk/addon_sdk.meetinginfo)
   — if the method lives somewhere other than the client object, that's a
   one-line fix in `sidepanel.js`/`mainstage.js`.
6. Confirm participants who close and reopen the side panel keep their
   name (stored in real `localStorage`) but drop off the roster after
   ~40s of being closed (`ROSTER_TTL_MS` in `shared.js`) — check the
   Firestore console to see stale `participants` docs linger (they're
   filtered client-side, not deleted server-side, until `beforeunload`
   fires or the doc is manually cleaned up).

## Tuning

Both constants live in `shared.js`:
- `HEARTBEAT_INTERVAL_MS` (default 15s) — how often each open panel
  re-announces itself.
- `ROSTER_TTL_MS` (default 40s) — how long a participant is shown as
  "present" after their last heartbeat.

Keep `ROSTER_TTL_MS` comfortably above `HEARTBEAT_INTERVAL_MS` (roughly
2-3x) so one missed heartbeat doesn't make someone flicker out of the list.

Stale `participants` documents (someone who closed the tab without
`beforeunload` firing, e.g. the browser crashed) are never deleted
automatically — they're just filtered out client-side once stale. If this
matters for your usage (e.g. a very long-running or high-traffic
deployment), consider a scheduled cleanup, but that would reintroduce a
backend, which this project deliberately avoids.
