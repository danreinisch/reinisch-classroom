/**
 * Student Portal Entry Redirect
 * PR 265: Allow /student/ to be a stable entrypoint with login UI
 * 
 * Redirects to hub only for invalid deep link attempts.
 * Allows direct access to /student/ for login UI (no localStorage check).
 * Part of PR: Session-only student authentication
 */

(function() {
  'use strict';
  
  // Constants
  const HUB_PATH = '/hub/';
  
  console.log('[student-portal-redirect] Checking access method');
  
  // Helper function to inject redirect message styles and element
  function showRedirectMessage() {
    window.__redirectingToHub = true;
    
    // Inject redirect message and hide login view immediately
    const style = document.createElement('style');
    style.textContent = `
      body { margin: 0; padding: 0; }
      #loginView { display: none !important; }
      #redirectMessage {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Inter, Helvetica, Arial;
        font-size: 18px;
        font-weight: 600;
        color: #e6edf3;
        text-align: center;
        background: linear-gradient(180deg, #0b1220, #0c1322);
        width: 100vw;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
    `;
    document.head.appendChild(style);
    
    // Create redirect message element
    const redirectDiv = document.createElement('div');
    redirectDiv.id = 'redirectMessage';
    redirectDiv.textContent = 'Redirecting to Hub…';
    
    // Add it as soon as DOM is available
    if (document.body) {
      document.body.appendChild(redirectDiv);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(redirectDiv);
      });
    }
  }
  
  try {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const auto = urlParams.get('auto');
    const code = urlParams.get('code');
    
    // Check if this is a valid auto-login deep link
    // Note: This validation logic is intentionally duplicated in the edge function
    // (student-entry-redirect.js) for defense in depth - edge function handles
    // server-side, this handles client-side fallback
    const hasValidAutoLogin = auto === '1' && code && code.trim().length > 0;
    
    if (hasValidAutoLogin) {
      // Valid auto-login parameters present - hide login view and allow access
      console.log('[student-portal-redirect] Valid auto-login detected, hiding login view');
      
      // Hide login view immediately to prevent flash
      const style = document.createElement('style');
      style.id = 'deep-link-hide-login';
      style.textContent = '#loginView { display: none !important; }';
      document.head.appendChild(style);
      
      // Set flag to indicate deep-link auto-login is in progress
      window.__deepLinkAutoLogin = true;
      
      return;
    }
    
    // Check if auto=1 is present but code is missing or empty (invalid deep link)
    // This is the inverse of hasValidAutoLogin check - validates same constraint
    if (auto === '1' && (!code || code.trim().length === 0)) {
      console.log('[student-portal-redirect] Invalid auto-login detected (missing or empty code), redirecting to hub');
      showRedirectMessage();
      window.location.replace(HUB_PATH);
      return;
    }
    
    // PR 265: Check sessionStorage for active session (same-tab continuity)
    try {
      const userRole = sessionStorage.getItem('rc_user_role');
      const userCode = sessionStorage.getItem('rc_user_code');
      
      if (userRole === 'student' && userCode) {
        console.log('[student-portal-redirect] Active session found, proceeding to portal');
        return;
      }
    } catch (e) {
      console.warn('[student-portal-redirect] Failed to check sessionStorage:', e);
    }
    
    // PR 265: No valid auth method - allow direct access to show login UI
    // This is the key change: we no longer redirect to hub when there's no auth
    console.log('[student-portal-redirect] No active session or deep link, showing login UI');
    
  } catch (err) {
    console.error('[student-portal-redirect] Unexpected error:', err);
    // On error, fail safely by showing login UI (no redirect)
  }
})();
