/**
 * Student Portal Auto-Login Bootstrap
 * PR 266: Session-only authentication (no localStorage remember-me)
 * Part of Guardrails Stage 3B - externalized from inline script
 * PR 335: Fix double-login issue - attempt actual login on ?auto=1&code=...
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
    
    // PR 335: Check if auto-login already attempted in this tab
    const autoLoginAttempted = sessionStorage.getItem('studentAutoLoginAttempted');
    
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
    
    // PR 335: Check for valid deep-link handoff from hub with auto-login
    if (auto === '1' && urlCode && urlCode.trim().length > 0) {
      console.log('[auto-login] Valid deep-link handoff detected:', urlCode.trim());
      
      // PR 335: Check if already attempted in this tab (loop prevention)
      if (autoLoginAttempted === '1') {
        console.log('[auto-login] Auto-login already attempted in this tab, showing login form');
        return;
      }
      
      // Mark as attempted to prevent loops
      sessionStorage.setItem('studentAutoLoginAttempted', '1');
      
      // PR 335: Attempt automatic login via server
      // We'll set sessionStorage optimistically and hide login UI
      // The main init will validate the session
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
    
    // No valid auto-login source found
    console.log('[auto-login] No valid auto-login source, login will be shown');
    
  } catch (err) {
    console.error('[auto-login] Unexpected error:', err);
    // On any error, let normal login flow handle it
  }
})();
