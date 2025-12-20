/**
 * Student Portal Entry Redirect
 * Redirects direct /student/ access to the hub unless valid auto-login parameters are present
 * Part of PR: Remove/disable direct Student Portal code+password login UI
 */

(function() {
  'use strict';
  
  console.log('[student-portal-redirect] Checking access method');
  
  try {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const auto = urlParams.get('auto');
    const code = urlParams.get('code');
    
    // Check if this is a valid auto-login deep link
    const hasValidAutoLogin = auto === '1' && code && code.trim().length > 0;
    
    if (hasValidAutoLogin) {
      // Valid auto-login parameters present - allow access
      console.log('[student-portal-redirect] Valid auto-login detected, proceeding to portal');
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
    
    // No valid auth method - redirect to hub
    console.log('[student-portal-redirect] No valid auto-login or remembered auth, redirecting to hub');
    
    // Set flag to prevent failsafe from showing login view during redirect
    window.__redirectingToHub = true;
    
    // Use replace() to prevent back button from returning to this page
    window.location.replace('/hub/');
    
  } catch (err) {
    console.error('[student-portal-redirect] Unexpected error:', err);
    // On error, fail safely by redirecting to hub
    window.location.replace('/hub/');
  }
})();
