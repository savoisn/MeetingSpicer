// Shared helpers for the Meet Random Picker add-on (side panel + main stage).

// Fill this in with your Workspace Add-on's Cloud project number
// (same one already used in your manifest.json).
const CLOUD_PROJECT_NUMBER = 'REPLACE_WITH_YOUR_CLOUD_PROJECT_NUMBER';

const ROSTER_TTL_MS = 40_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

const CLIENT_ID_KEY = 'meetSpicer.clientId';
const NAME_KEY = 'meetSpicer.name';

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // Storage unavailable (sandboxed iframe / private mode) - degrade silently.
  }
}

function getOrCreateClientId() {
  let id = readStorage(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    writeStorage(CLIENT_ID_KEY, id);
  }
  return id;
}

function getStoredName() {
  return readStorage(NAME_KEY);
}

function storeName(name) {
  writeStorage(NAME_KEY, name);
}

function emptyState() {
  return { roster: {}, winner: null };
}

// CoDoingClient's exact wire shape (raw Uint8Array vs a {state: Uint8Array}
// wrapper) isn't confirmed from the reference docs - decodeState tolerates
// both, so a mismatch here is a one-line fix once verified against the SDK.
function encodeState(obj) {
  return new TextEncoder().encode(JSON.stringify(obj));
}

function decodeState(coDoingState) {
  // ArrayBuffer.isView, not instanceof Uint8Array: the state can cross a
  // realm boundary (iframe/postMessage) where instanceof against the local
  // Uint8Array constructor would wrongly fail even for a genuine byte array.
  const bytes = ArrayBuffer.isView(coDoingState) ? coDoingState : coDoingState && coDoingState.state;
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    console.error('Failed to decode CoDoing state', err);
    return null;
  }
}

// Union merge: for each participant/winner, keep whichever side has the
// newer timestamp. Needed because broadcastStateUpdate is last-write-wins
// across racing senders, and late joiners get nothing until the next
// broadcast (there is no "give me the current state" query call).
function mergeState(a, b) {
  a = a || emptyState();
  b = b || emptyState();
  const roster = { ...a.roster };
  for (const [id, entry] of Object.entries(b.roster || {})) {
    if (!roster[id] || entry.lastSeen > roster[id].lastSeen) {
      roster[id] = entry;
    }
  }
  let winner = a.winner || null;
  if (b.winner && (!winner || b.winner.ts > winner.ts)) {
    winner = b.winner;
  }
  return { roster, winner };
}

function pruneRoster(roster, now) {
  const fresh = {};
  for (const [id, entry] of Object.entries(roster || {})) {
    if (now - entry.lastSeen <= ROSTER_TTL_MS) {
      fresh[id] = entry;
    }
  }
  return fresh;
}
