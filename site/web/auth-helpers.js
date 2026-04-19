// Shared helpers for Teacher Center auth lifecycle.
// Exposes window.tcAuth = { handleAuthenticatedFetch, scheduleJwtRefresh, refreshNow }
// Load this script BEFORE tc-work.js.

(function () {
  'use strict';

  var _sessionExpiredFired = false;
  var _lastRefreshAt = Date.now();
  var REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Internal: fire the session-expired UX once per page lifetime.
   * Dispatches a custom event so tc-work.js can surface a toast via setMsg,
   * then redirects to /teacher/login/ after 4 seconds.
   */
  function _onSessionExpired() {
    if (_sessionExpiredFired) return;
    _sessionExpiredFired = true;

    window.dispatchEvent(new CustomEvent('tc:session-expired'));

    setTimeout(function () {
      var next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = '/teacher/login/?next=' + next;
    }, 4000);
  }

  /**
   * Wraps fetch(). On a 401 response triggers the session-expired UX.
   * Returns Promise<{ response, sessionExpired: boolean }>.
   * Never throws — callers should check sessionExpired before continuing.
   */
  function handleAuthenticatedFetch(input, init) {
    return fetch(input, init).then(function (response) {
      if (response.status === 401) {
        _onSessionExpired();
        return { response: response, sessionExpired: true };
      }
      return { response: response, sessionExpired: false };
    }).catch(function (err) {
      // Network error — propagate as a rejected promise so callers can handle it
      return Promise.reject(err);
    });
  }

  /**
   * POST to teacher-refresh silently. Updates _lastRefreshAt on success.
   * Non-OK responses (including 401) are ignored — handleAuthenticatedFetch
   * handles the UX for real API calls.
   */
  function refreshNow() {
    return fetch('/.netlify/functions/teacher-refresh', {
      method: 'POST',
      credentials: 'same-origin',
    }).then(function (r) {
      if (r.ok) {
        _lastRefreshAt = Date.now();
      }
    }).catch(function () {
      // Silently ignore network errors
    });
  }

  /**
   * On startup: fire one refresh attempt.
   * On visibilitychange: refresh if the tab has been away > 30 min.
   */
  function scheduleJwtRefresh() {
    refreshNow();

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        if (Date.now() - _lastRefreshAt > REFRESH_INTERVAL_MS) {
          refreshNow();
        }
      }
    });
  }

  // Kick off refresh scheduling immediately on script load
  scheduleJwtRefresh();

  window.tcAuth = {
    handleAuthenticatedFetch: handleAuthenticatedFetch,
    scheduleJwtRefresh: scheduleJwtRefresh,
    refreshNow: refreshNow,
  };
})();
