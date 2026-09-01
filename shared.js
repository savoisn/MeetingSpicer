// Shared config + identity helpers for the Random Picker add-on.

// Fill this in with your Workspace Add-on's Cloud project number
// (same one already used in your manifest.json).
export const CLOUD_PROJECT_NUMBER = '815597487049';

// Fill this in from the Firebase console: Project settings > General >
// Your apps > Web app > SDK setup and configuration > Config.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDWSxQJO0G84q_kwtU149MnfW4V6PYOrWk",
  authDomain: "meeting-spicer.firebaseapp.com",
  projectId: "meeting-spicer",
  storageBucket: "meeting-spicer.firebasestorage.app",
  messagingSenderId: "929819207020",
  appId: "1:929819207020:web:f119c945357228d409bf49",
  measurementId: "G-0KHTG3T6N2"

};

export const ROSTER_TTL_MS = 40_000;
export const HEARTBEAT_INTERVAL_MS = 15_000;

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

export function getOrCreateClientId() {
  let id = readStorage(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    writeStorage(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getStoredName() {
  return readStorage(NAME_KEY);
}

export function storeName(name) {
  writeStorage(NAME_KEY, name);
}
