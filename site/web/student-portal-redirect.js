/**
 * Student Portal Entry Redirect
 * Redirects direct /student/ access to the hub unless valid auto-login parameters are present
 * Part of PR: Remove/disable direct Student Portal code+password login UI
 */

(function() {
  'use strict';
  
  // Constants
  const HUB_PATH = '/hub/';
  
  console.log('[student-portal-redirect] Checking access method');
  
  try {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const auto = urlParams.get('auto');
    const code = urlParams.get('code');
    
    // Check if this is a valid auto-login deep link
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
    if (auto === '1' && (!code || code.trim().length === 0)) {
      console.log('[student-portal-redirect] Invalid auto-login detected (missing or empty code), redirecting to hub');
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
      
      // Perform redirect immediately
      window.location.replace(HUB_PATH);
      return;
    }
    
    // Check if user has valid remembered auth
    try {
      const authStr = localStorage.getItem('rc_auth');
      if (authStr) {
        const auth = JSON.parse(authStr);
        const now = Date.now();
        
        // Check if auth is valid, not expired, and for a student
        if (auth && 
            auth.role === 'student' && 
            auth.code && 
            auth.expiresAt && 
            typeof auth.expiresAt === 'number' && 
            now < auth.expiresAt) {
          console.log('[student-portal-redirect] Valid remembered auth found, proceeding to portal');
          return;
        }
      }
    } catch (e) {
      console.warn('[student-portal-redirect] Failed to check remembered auth:', e);
    }
    
    // No valid auth method - show redirect message and redirect to hub
    console.log('[student-portal-redirect] No valid auto-login or remembered auth, redirecting to hub');
    
    // Set flag to prevent failsafe from showing login view during redirect
    window.__redirectingToHub = true;
    
    // Inject redirect message and hide login view immediately (before DOM loads)
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
    
    // Perform redirect immediately
    window.location.replace(HUB_PATH);
    
  } catch (err) {
    console.error('[student-portal-redirect] Unexpected error:', err);
    // On error, fail safely by redirecting to hub
    window.location.replace(HUB_PATH);
  }
})();
