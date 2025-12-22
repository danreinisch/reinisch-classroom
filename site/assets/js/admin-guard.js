/**
 * Admin Access Guard
 * Phase 302C: Enhanced to check rc_auth role and block student access
 * Blocks student accounts from accessing admin areas
 * Redirects students to home page
 * Redirects unauthenticated users to admin-login with return parameter
 */

(function() {
  'use strict';
  
  const LOG_PREFIX = '[admin-guard]';
  
  /**
   * Check rc_auth localStorage for role
   * Phase 302C: Primary auth check using rc_auth
   */
  function checkAuth() {
    try {
      // Phase 302C: Check localStorage rc_auth first (primary auth storage)
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
    
    // Phase 302C: Fallback to sessionStorage/localStorage for legacy compatibility
    // Check legacy storage locations in order of preference
    const legacyChecks = [
      { key: 'rc_user_role', storage: sessionStorage, label: 'sessionStorage' },
      { key: 'rc_user_role', storage: localStorage, label: 'localStorage' }
    ];
    
    for (const { key, storage, label } of legacyChecks) {
      const legacyRole = storage.getItem(key);
      if (legacyRole) {
        console.log(LOG_PREFIX, `Using legacy ${label} role:`, legacyRole);
        return { role: legacyRole, expired: false };
      }
    }
    
    return { role: null, expired: false };
  }
  
  // Phase 302C: Perform auth check
  const authResult = checkAuth();
  
  // Phase 302C: Block students from admin areas
  if (authResult.role === 'student') {
    console.warn(LOG_PREFIX, 'Student role detected, redirecting to home');
    window.location.replace('/');
    return;
  }
  
  // Phase 302C: For admin pages (not admin-login), require authentication
  const isAdminPage = window.location.pathname.startsWith('/admin/') || 
                      window.location.pathname === '/admin';
  
  if (isAdminPage && !authResult.role) {
    // Phase 302C: Unauthenticated user trying to access admin - redirect to login with return URL
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    console.log(LOG_PREFIX, 'Unauthenticated access to admin, redirecting to admin-login');
    window.location.replace('/admin-login/?return=' + returnUrl);
    return;
  }
  
  console.log(LOG_PREFIX, 'Access check passed');
})();
