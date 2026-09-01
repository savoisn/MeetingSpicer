import {
  CLOUD_PROJECT_NUMBER, ROSTER_TTL_MS, HEARTBEAT_INTERVAL_MS,
  getOrCreateClientId, getStoredName, storeName,
} from './shared.js';
import {
  announcePresence, leavePresence, subscribeParticipants, subscribeWinner, setWinner,
} from './firestore.js';

let sidePanelClient;
let clientId;
let myName;
let meetingCode;
let participants = {};
let currentWinner = null;
let heartbeatTimer;

function setStatus(text) {
  document.getElementById('status').innerText = text;
}

function freshParticipants() {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(participants).filter(([, p]) => now - p.lastSeen <= ROSTER_TTL_MS)
  );
}

function render() {
  const fresh = freshParticipants();
  const rosterEl = document.getElementById('roster');
  rosterEl.innerHTML = '';

  const entries = Object.entries(fresh).sort((a, b) => a[1].name.localeCompare(b[1].name));
  document.getElementById('rosterLabel').innerText =
    entries.length === 1 ? '1 person here' : `${entries.length} people here`;

  for (const [id, entry] of entries) {
    const li = document.createElement('li');
    li.textContent = entry.name + (id === clientId ? ' (you)' : '');
    if (id === clientId) li.classList.add('you');
    rosterEl.appendChild(li);
  }

  document.getElementById('pickButton').disabled = entries.length === 0;

  const winnerEl = document.getElementById('winner');
  if (currentWinner) {
    winnerEl.style.display = 'block';
    winnerEl.innerText = `🎉 ${currentWinner.name}`;
  } else {
    winnerEl.style.display = 'none';
  }
}

function announce() {
  announcePresence(meetingCode, clientId, myName).catch((err) => {
    console.error('Failed to announce presence:', err);
  });
}

function joinRoster() {
  subscribeParticipants(meetingCode, (data) => {
    participants = data;
    render();
  });
  subscribeWinner(meetingCode, (winner) => {
    currentWinner = winner;
    render();
  });

  announce();
  setStatus('Ready to pick!');

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(announce, HEARTBEAT_INTERVAL_MS);

  window.addEventListener('beforeunload', () => leavePresence(meetingCode, clientId));
}

async function pick() {
  const fresh = freshParticipants();
  const ids = Object.keys(fresh);
  if (ids.length === 0) {
    setStatus('No one here yet.');
    return;
  }

  const winnerId = ids[Math.floor(Math.random() * ids.length)];
  const winner = { name: fresh[winnerId].name, ts: Date.now() };

  try {
    await setWinner(meetingCode, winner);
    setStatus(`Picked: ${winner.name}`);
  } catch (err) {
    console.error('Failed to record winner:', err);
    setStatus('Pick failed - could not reach Firestore.');
    return;
  }

  try {
    const mainStageUrl = new URL('mainstage.html', window.location.href).toString();
    await sidePanelClient.startActivity({
      mainStageUrl,
      additionalData: JSON.stringify({ winner }),
    });
  } catch (err) {
    console.error('Failed to start main stage activity:', err);
    setStatus('Picked, but could not open the main stage.');
  }
}

function showNameGate(prefill) {
  document.getElementById('nameGate').style.display = 'block';
  document.getElementById('main').style.display = 'none';
  document.getElementById('nameInput').value = prefill || '';
  document.getElementById('nameInput').focus();
}

function showMain() {
  document.getElementById('nameGate').style.display = 'none';
  document.getElementById('main').style.display = 'block';
}

document.getElementById('nameSubmit').addEventListener('click', () => {
  const value = document.getElementById('nameInput').value.trim();
  if (!value) return;
  myName = value;
  storeName(myName);
  showMain();
  joinRoster();
});

document.getElementById('nameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('nameSubmit').click();
});

document.getElementById('pickButton').addEventListener('click', pick);

document.getElementById('changeName').addEventListener('click', () => {
  showNameGate(myName);
});

async function init() {
  clientId = getOrCreateClientId();

  try {
    const addon = window.meet.addon;
    const session = await addon.createAddonSession({ cloudProjectNumber: CLOUD_PROJECT_NUMBER });
    sidePanelClient = await session.createSidePanelClient();
    const meetingInfo = await sidePanelClient.getMeetingInfo();
    meetingCode = meetingInfo.meetingCode;
  } catch (err) {
    console.error('Meet SDK setup failed:', err);
    setStatus('SDK setup failed.');
    return;
  }

  const storedName = getStoredName();
  if (storedName) {
    myName = storedName;
    showMain();
    joinRoster();
  } else {
    showNameGate();
  }
}

window.addEventListener('load', init);
