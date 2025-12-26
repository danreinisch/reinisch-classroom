(function () {
  'use strict';

  try {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const reason = urlParams.get('reason');
    
    // PR fix-student-watchdog-login: Skip auto-login if we came from watchdog redirect
    if (reason === 'portal_resume_failed') {
      console.log('[auto-login] Skipping: portal resume failed (showing login form)');
      return;
    }
    
    // PR fix-student-watchdog-login: Check if resume recently failed (loop prevention)
    try {
      const resumeFailedAt = sessionStorage.getItem('portal_resume_failed_at');
      if (resumeFailedAt) {
        const failedTime = parseInt(resumeFailedAt, 10);
        const elapsed = Date.now() - failedTime;
        if (elapsed < 60000) { // Within last 60 seconds
          console.log(`[auto-login] Skipping: resume failed ${Math.round(elapsed/1000)}s ago (loop prevention)`);
          return;
        } else {
          // Expired, clear the flag
          sessionStorage.removeItem('portal_resume_failed_at');
        }
      }
    } catch (err) {
      console.error('[auto-login] Failed to check resume failure flag:', err);
    }
    
    const auto = urlParams.get('auto');
    const urlCode = urlParams.get('code');

    // Check for valid deep-link handoff from hub
    if (auto === '1' && urlCode && urlCode.trim().length > 0) {
      console.log('[auto-login] Valid deep-link detected:', urlCode.trim());

      // Set session storage for main init to pick up
      sessionStorage.setItem('rc_user_code', urlCode.trim());
      sessionStorage.setItem('rc_user_role', 'student');

      console.log('[auto-login] Session set, dashboard will load');
    }
  } catch (err) {
    console.error('[auto-login] Error:', err);
  }
})();
