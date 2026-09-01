let localState = emptyState();

function showWinner(winner) {
  if (!winner) return;
  if (localState.winner && localState.winner.ts >= winner.ts) return;
  localState.winner = winner;
  document.getElementById('winnerDisplay').innerText = winner.name;
}

async function init() {
  try {
    const addon = window.meet.addon;
    const session = await addon.createAddonSession({ cloudProjectNumber: CLOUD_PROJECT_NUMBER });
    const mainStageClient = await session.createMainStageClient();

    // Live updates for subsequent picks, for anyone who already has this open.
    await session.createCoDoingClient({
      activityTitle: 'Random Picker',
      onCoDoingStateChanged: (state) => {
        const incoming = decodeState(state);
        if (incoming && incoming.winner) showWinner(incoming.winner);
      },
    });

    // Initial winner for whoever just joined via the activity prompt.
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
