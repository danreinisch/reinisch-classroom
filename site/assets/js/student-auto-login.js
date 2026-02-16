(function () {
  'use strict';

  try {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    
    // PR 335: Check if auto-login already attempted in this tab (loop prevention)
    const autoLoginAttempted = sessionStorage.getItem('studentAutoLoginAttempted');
    
    const auto = urlParams.get('auto');
    const urlCode = urlParams.get('code');

    // Check for valid deep-link handoff from hub
    if (auto === '1' && urlCode && urlCode.trim().length > 0) {
      console.log('[auto-login] Valid deep-link detected:', urlCode.trim());
      
      // PR 335: Check if already attempted in this tab (loop prevention)
      if (autoLoginAttempted === '1') {
        console.log('[auto-login] Auto-login already attempted in this tab, showing login form');
        return;
      }
      
      // Mark as attempted to prevent loops
      sessionStorage.setItem('studentAutoLoginAttempted', '1');

      // Set session storage for main init to pick up
      sessionStorage.setItem('rc_user_code', urlCode.trim());
      sessionStorage.setItem('rc_user_role', 'student');

      console.log('[auto-login] Session set, dashboard will load');
    }
  } catch (err) {
    console.error('[auto-login] Error:', err);
  }
})();
