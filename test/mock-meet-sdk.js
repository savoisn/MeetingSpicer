// Stand-in for https://www.gstatic.com/meetjs/addons/1.1.0/meet.addons.js
// so index.html / mainstage.html can run in a plain browser tab.
//
// This only fakes the Meet chrome (session/client creation, meeting info,
// starting an activity). Presence/winner sync goes through the real
// Firestore project configured in shared.js - so FIREBASE_CONFIG must be
// filled in for local testing to actually sync across tabs.
//
// All tabs share one mock "meeting" by default. Pass ?meetingCode=xyz to
// simulate a second, separate meeting in another set of tabs.
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

  const meetingCode = new URLSearchParams(window.location.search).get('meetingCode')
    || 'mock-aaa-bbbb-ccc';

  function client() {
    return {
      getMeetingInfo: () => {
        console.log('[mock sdk] getMeetingInfo ->', meetingCode);
        return Promise.resolve({ meetingId: 'mock-meeting-id', meetingCode });
      },
      startActivity: (req) => {
        console.log('[mock sdk] startActivity', req);
        const url = new URL(req.mainStageUrl, window.location.href);
        if (req.additionalData) url.searchParams.set('mockActivityData', req.additionalData);
        url.searchParams.set('meetingCode', meetingCode);
        window.open(url.toString(), '_blank');
        return Promise.resolve();
      },
      getActivityStartingState: () => {
        const data = new URLSearchParams(window.location.search).get('mockActivityData');
        return Promise.resolve(data ? { additionalData: data } : null);
      },
    };
  }

  function createAddonSession(opts) {
    console.log('[mock sdk] createAddonSession', opts);
    return Promise.resolve({
      createSidePanelClient: () => Promise.resolve(client()),
      createMainStageClient: () => Promise.resolve(client()),
    });
  }

  window.meet = { addon: { createAddonSession } };
})();
