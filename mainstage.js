import { CLOUD_PROJECT_NUMBER } from './shared.js';
import { subscribeWinner } from './firestore.js';

let lastAppliedTs = 0;

function showWinner(winner) {
  if (!winner || winner.ts <= lastAppliedTs) return;
  lastAppliedTs = winner.ts;
  document.getElementById('winnerDisplay').innerText = winner.name;
}

async function init() {
  try {
    const addon = window.meet.addon;
    const session = await addon.createAddonSession({ cloudProjectNumber: CLOUD_PROJECT_NUMBER });
    const mainStageClient = await session.createMainStageClient();
    const meetingInfo = await mainStageClient.getMeetingInfo();

    // Live updates for every pick, including ones made after this loaded.
    subscribeWinner(meetingInfo.meetingCode, showWinner);

    // Fast initial paint for whoever just joined via the activity prompt,
    // ahead of the Firestore round-trip above.
    const startingState = await mainStageClient.getActivityStartingState();
    if (startingState && startingState.additionalData) {
      const parsed = JSON.parse(startingState.additionalData);
      if (parsed.winner) showWinner(parsed.winner);
    }
  } catch (err) {
    console.error('Main stage SDK initialization failed:', err);
    document.getElementById('winnerDisplay').innerText = 'Setup failed';
  }
}

window.addEventListener('load', init);
