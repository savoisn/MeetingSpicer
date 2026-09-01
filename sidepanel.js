let session;
let sidePanelClient;
let coDoingClient;
let clientId;
let myName;
let localState = emptyState();
let heartbeatTimer;

function setStatus(text) {
  document.getElementById('status').innerText = text;
}

function render() {
  const now = Date.now();
  const fresh = pruneRoster(localState.roster, now);
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
  if (localState.winner) {
    winnerEl.style.display = 'block';
    winnerEl.innerText = `🎉 ${localState.winner.name}`;
  } else {
    winnerEl.style.display = 'none';
  }
}

function broadcast() {
  coDoingClient.broadcastStateUpdate(encodeState(localState));
}

function touchSelfInRoster() {
  localState.roster[clientId] = { name: myName, lastSeen: Date.now() };
}

function handleIncomingState(state) {
  if (!state) return;
  localState = mergeState(localState, state);
  render();
}

function joinRoster() {
  touchSelfInRoster();
  localState.roster = pruneRoster(localState.roster, Date.now());
  broadcast();
  render();
  setStatus('Ready to pick!');

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    touchSelfInRoster();
    localState.roster = pruneRoster(localState.roster, Date.now());
    broadcast();
    render();
  }, HEARTBEAT_INTERVAL_MS);
}

async function pick() {
  const now = Date.now();
  const fresh = pruneRoster(localState.roster, now);
  const ids = Object.keys(fresh);
  if (ids.length === 0) {
    setStatus('No one here yet.');
    return;
  }

  const winnerId = ids[Math.floor(Math.random() * ids.length)];
  const winnerName = fresh[winnerId].name;
  localState.winner = { name: winnerName, ts: now };
  broadcast();
  render();
  setStatus(`Picked: ${winnerName}`);

  try {
    const mainStageUrl = new URL('mainstage.html', window.location.href).toString();
    await sidePanelClient.startActivity({
      mainStageUrl,
      additionalData: JSON.stringify({ winner: localState.winner }),
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
    session = await addon.createAddonSession({ cloudProjectNumber: CLOUD_PROJECT_NUMBER });
    sidePanelClient = await session.createSidePanelClient();
    coDoingClient = await session.createCoDoingClient({
      activityTitle: 'Random Picker',
      onCoDoingStateChanged: (state) => handleIncomingState(decodeState(state)),
    });
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
