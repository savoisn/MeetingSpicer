// Stand-in for https://www.gstatic.com/meetjs/addons/1.1.0/meet.addons.js
// so index.html / mainstage.html can run in a plain browser tab.
//
// Open multiple tabs on test/index.html and test/mainstage.html (served over
// http://, not file://) - they sync live via BroadcastChannel, simulating
// CoDoing across "participants". startActivity() opens mainstage.html in a
// new tab instead of prompting Meet's real "join activity" banner.
(function () {
  // shared.js persists identity/name in localStorage, which is shared across
  // all tabs of the same origin - fine for a real browser (one person), but
  // it would make every test tab you open look like the same participant.
  // Alias it to sessionStorage, which is genuinely per-tab, so each tab you
  // open by hand acts as a distinct participant.
  try {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { return window.sessionStorage; },
    });
  } catch (err) {
    console.warn('[mock sdk] could not alias localStorage to sessionStorage - ' +
      'every tab in this browser will share the same identity. Use separate ' +
      'browser profiles/windows instead.', err);
  }

  const bc = new BroadcastChannel('meet-addon-mock');
  const instanceId = crypto.randomUUID();
  const coDoingListeners = new Set();

  bc.onmessage = (event) => {
    const msg = event.data;
    if (!msg || msg.from === instanceId || msg.type !== 'coDoingState') return;
    coDoingListeners.forEach((cb) => cb(msg.bytes));
  };

  function createAddonSession(opts) {
    console.log('[mock sdk] createAddonSession', opts);
    return Promise.resolve({
      createSidePanelClient: () => Promise.resolve({
        startActivity: (req) => {
          console.log('[mock sdk] startActivity', req);
          const url = new URL(req.mainStageUrl, window.location.href);
          if (req.additionalData) url.searchParams.set('mockActivityData', req.additionalData);
          window.open(url.toString(), '_blank');
          return Promise.resolve();
        },
      }),

      createMainStageClient: () => Promise.resolve({
        getActivityStartingState: () => {
          const data = new URLSearchParams(window.location.search).get('mockActivityData');
          return Promise.resolve(data ? { additionalData: data } : null);
        },
      }),

      createCoDoingClient: (delegate) => {
        console.log('[mock sdk] createCoDoingClient', delegate.activityTitle);
        coDoingListeners.add((bytes) => delegate.onCoDoingStateChanged(bytes));
        return Promise.resolve({
          broadcastStateUpdate: (bytes) => {
            bc.postMessage({ type: 'coDoingState', from: instanceId, bytes });
          },
        });
      },
    });
  }

  window.meet = { addon: { createAddonSession } };
})();
