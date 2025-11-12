/**
 * Student Portal Auto-Login Bootstrap
 * Implements early 24-hour remember-me authentication check
 * Part of Guardrails Stage 3B - externalized from inline script
 */

(function() {
  'use strict';
  
  console.log('[auto-login] Starting early bypass check');
  
  try {
    // Read rc_auth from localStorage
    const authStr = localStorage.getItem('rc_auth');
    if (!authStr) {
      console.log('[auto-login] No rc_auth found');
      return;
    }
    
    let auth;
    try {
      auth = JSON.parse(authStr);
    } catch (e) {
      console.warn('[auto-login] Invalid rc_auth JSON, clearing');
      localStorage.removeItem('rc_auth');
      sessionStorage.removeItem('rc_user_code');
      sessionStorage.removeItem('rc_user_role');
      return;
    }
    
    // Validate structure and role
    if (!auth || auth.role !== 'student' || !auth.code) {
      console.log('[auto-login] Auth is not for student or missing code');
      return;
    }
    
    // Validate expiry
    const now = Date.now();
    if (!auth.expiresAt || typeof auth.expiresAt !== 'number') {
      console.warn('[auto-login] Missing or invalid expiresAt, clearing');
      localStorage.removeItem('rc_auth');
      return;
    }
    
    if (now > auth.expiresAt) {
      console.log('[auto-login] Auth expired, clearing');
      localStorage.removeItem('rc_auth');
      sessionStorage.removeItem('rc_user_code');
      sessionStorage.removeItem('rc_user_role');
      return;
    }
    
    // Validate URL parameters if ?auto=1 is present
    const urlParams = new URLSearchParams(window.location.search);
    const auto = urlParams.get('auto');
    const urlCode = urlParams.get('code');
    
    if (auto === '1') {
      // URL has auto=1, verify code is present and matches
      if (!urlCode) {
        console.warn('[auto-login] URL has auto=1 but no code, clearing session');
        localStorage.removeItem('rc_auth');
        sessionStorage.removeItem('rc_user_code');
        sessionStorage.removeItem('rc_user_role');
        return;
      }
      
      if (urlCode !== auth.code) {
        console.warn('[auto-login] URL code mismatch, clearing session');
        localStorage.removeItem('rc_auth');
        sessionStorage.removeItem('rc_user_code');
        sessionStorage.removeItem('rc_user_role');
        return;
      }
    }
    
    // All validations passed - hydrate session and set bypass flag
    console.log('[auto-login] Validation passed, bypassing login for student:', auth.code);
    
    sessionStorage.setItem('rc_user_code', auth.code);
    sessionStorage.setItem('rc_user_role', 'student');
    
    // Set global flag to prevent main init from overriding
    window.__autoLoginOk = true;
    
    // Hide login container immediately to avoid flicker
    // Note: Using !important is acceptable here because:
    // 1. This is a temporary style that gets removed after dashboard loads
    // 2. We need to override any existing inline styles
    // 3. The style is isolated to this specific use case
    const style = document.createElement('style');
    style.id = 'auto-login-style';
    style.textContent = '#loginView { display: none !important; }';
    document.head.appendChild(style);
    
    console.log('[auto-login] Success: Bypassing login form, dashboard will load');
    
  } catch (err) {
    console.error('[auto-login] Unexpected error:', err);
    // On any error, let normal login flow handle it
  }
})();
