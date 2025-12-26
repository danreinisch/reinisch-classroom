/**
 * Student Portal Auto-Login Bootstrap
 * PR 266: Session-only authentication (no localStorage remember-me)
 * Part of Guardrails Stage 3B - externalized from inline script
 * PR fix-student-watchdog-login: Skip auto-login if resume recently failed (loop prevention)
 * 
 * Auto-login is allowed ONLY for:
 * 1) Same-tab session restore using sessionStorage (reload only)
 * 2) Valid hub handoff deep link: /student/?auto=1&code=...
 */

(function() {
  'use strict';
  
  console.log('[auto-login] Starting early bypass check (session-only mode)');
  
  try {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const reason = urlParams.get('reason');
    
    // PR fix-student-watchdog-login: Skip auto-login if we came from watchdog redirect
    if (reason === 'portal_resume_failed') {
      console.log('[auto-login] Skipping auto-login: portal resume failed (showing login form)');
      return;
    }
    
    // PR fix-student-watchdog-login: Check if resume recently failed (loop prevention)
    try {
      const resumeFailedAt = sessionStorage.getItem('portal_resume_failed_at');
      if (resumeFailedAt) {
        const failedTime = parseInt(resumeFailedAt, 10);
        const elapsed = Date.now() - failedTime;
        if (elapsed < 60000) { // Within last 60 seconds
          console.log(`[auto-login] Skipping auto-login: resume failed ${Math.round(elapsed/1000)}s ago (loop prevention)`);
          return;
        } else {
          // Expired, clear the flag
          sessionStorage.removeItem('portal_resume_failed_at');
        }
      }
    } catch (err) {
      console.error('[auto-login] Failed to check resume failure flag:', err);
    }
    
    // PR 266: Legacy cleanup - remove old localStorage auth keys
    // This ensures old clients don't persist auth across sessions
    if (localStorage.getItem('rc_auth')) {
      console.log('[auto-login] Removing legacy rc_auth from localStorage');
      localStorage.removeItem('rc_auth');
    }
    if (localStorage.getItem('rc_auth_expires')) {
      console.log('[auto-login] Removing legacy rc_auth_expires from localStorage');
      localStorage.removeItem('rc_auth_expires');
    }
    
    const auto = urlParams.get('auto');
    const urlCode = urlParams.get('code');
    
    // Check for valid deep-link handoff from hub
    if (auto === '1' && urlCode && urlCode.trim().length > 0) {
      console.log('[auto-login] Valid deep-link handoff detected:', urlCode.trim());
      
      // Set session storage for main init to pick up
      sessionStorage.setItem('rc_user_code', urlCode.trim());
      sessionStorage.setItem('rc_user_role', 'student');
      
      // Set global flag to prevent main init from showing login
      window.__autoLoginOk = true;
      
      // Hide login container immediately to avoid flicker
      const style = document.createElement('style');
      style.id = 'auto-login-style';
      style.textContent = '#loginView { display: none !important; }';
      document.head.appendChild(style);
      
      console.log('[auto-login] Deep-link bypass enabled, dashboard will load');
      return;
    }
    
    // Check for existing session in sessionStorage (same-tab reload)
    const sessionRole = sessionStorage.getItem('rc_user_role');
    const sessionCode = sessionStorage.getItem('rc_user_code');
    
    if (sessionRole === 'student' && sessionCode && sessionCode.trim().length > 0) {
      console.log('[auto-login] Active session found in sessionStorage:', sessionCode.trim());
      
      // Set global flag to prevent main init from showing login
      window.__autoLoginOk = true;
      
      // Hide login container immediately to avoid flicker
      const style = document.createElement('style');
      style.id = 'auto-login-style';
      style.textContent = '#loginView { display: none !important; }';
      document.head.appendChild(style);
      
      console.log('[auto-login] Session restore enabled, dashboard will load');
      return;
    }
    
    // No valid auto-login source found
    console.log('[auto-login] No valid auto-login source, login will be shown');
    
  } catch (err) {
    console.error('[auto-login] Unexpected error:', err);
    // On any error, let normal login flow handle it
  }
})();
