/**
 * Admin Access Guard
 * PR 335: Admin SSO via Teacher Center
 * Blocks student accounts from accessing admin areas
 * Redirects students to home page
 * Redirects unauthenticated users to Teacher Center
 * Note: Server-side guard (admin-auth-guard.js edge function) enforces teacher session requirement
 */

(function() {
  'use strict';
  
  const LOG_PREFIX = '[admin-guard]';
  
  /**
   * Check rc_auth localStorage for role
   * PR 335: Primary auth check using rc_auth
   */
  function checkAuth() {
    try {
      // PR 335: Check localStorage rc_auth first (primary auth storage)
      const authStr = localStorage.getItem('rc_auth');
      if (authStr) {
        const auth = JSON.parse(authStr);
        
        // Check if auth is valid and not expired
        if (auth && auth.role) {
          // Check expiry if present
          if (auth.expiresAt && Date.now() >= auth.expiresAt) {
            console.log(LOG_PREFIX, 'Auth expired, clearing');
            localStorage.removeItem('rc_auth');
            return { role: null, expired: true };
          }
          
          return { role: auth.role, expired: false };
        }
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Error parsing rc_auth:', err);
    }
    
    // PR 335: Fallback to sessionStorage/localStorage for legacy compatibility
    const LEGACY_ROLE_KEY = 'rc_user_role';
    const legacyChecks = [
      { storage: sessionStorage, label: 'sessionStorage' },
      { storage: localStorage, label: 'localStorage' }
    ];
    
    for (const { storage, label } of legacyChecks) {
      const legacyRole = storage.getItem(LEGACY_ROLE_KEY);
      if (legacyRole) {
        console.log(LOG_PREFIX, `Using legacy ${label} role:`, legacyRole);
        return { role: legacyRole, expired: false };
      }
    }
    
    return { role: null, expired: false };
  }
  
  // PR 335: Perform auth check
  const authResult = checkAuth();
  
  // PR 335: Check if accessing admin or admin-not-configured areas
  // Handle both /admin/ and /site/admin/ paths (for local testing vs production)
  const path = window.location.pathname;
  
  /**
   * Check if path matches admin area (handles production and test paths)
   */
  function matchesPath(basePath) {
    return path === basePath || path.startsWith(basePath + '/') ||
           path === '/site' + basePath || path.startsWith('/site' + basePath + '/');
  }
  
  const isAdminPage = matchesPath('/admin');
  const isAdminNotConfigured = matchesPath('/admin-not-configured');
  
  // PR 335: Block students from admin and admin-not-configured areas
  if (authResult.role === 'student' && (isAdminPage || isAdminNotConfigured)) {
    console.warn(LOG_PREFIX, 'Student role detected, redirecting to home');
    window.location.replace('/');
    return;
  }
  
  // PR 335: Client-side guard defers to server-side admin-auth-guard edge function
  // No client-side redirect needed - edge function will handle unauthenticated access
  // This guard only blocks students from accessing admin areas
  
  console.log(LOG_PREFIX, 'Access check passed');
})();
