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
  
  // Phase 302C: Perform auth check
  const authResult = checkAuth();
  
  // PR 308: Check if accessing admin or admin-login areas
  // Handle both /admin/ and /site/admin/ paths (for local testing vs production)
  const path = window.location.pathname;
  const isAdminPage = path === '/admin' || path.startsWith('/admin/') ||
                      path === '/site/admin' || path.startsWith('/site/admin/');
  const isAdminLogin = path === '/admin-login' || path.startsWith('/admin-login/') ||
                       path === '/site/admin-login' || path.startsWith('/site/admin-login/');
  
  // PR 308: Block students from both admin and admin-login areas
  if (authResult.role === 'student' && (isAdminPage || isAdminLogin)) {
    console.warn(LOG_PREFIX, 'Student role detected, redirecting to home');
    window.location.replace('/');
    return;
  }
  
  // Phase 302C: For admin pages (not admin-login), require authentication
  if (isAdminPage && !authResult.role) {
    // Phase 302C: Unauthenticated user trying to access admin - redirect to login with return URL
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    console.log(LOG_PREFIX, 'Unauthenticated access to admin, redirecting to admin-login');
    // PR 308: Use /site/admin-login/ for test environment compatibility
    const loginPath = window.location.pathname.includes('/site/') ? '/site/admin-login/' : '/admin-login/';
    window.location.replace(loginPath + '?return=' + returnUrl);
    return;
  }
  
  console.log(LOG_PREFIX, 'Access check passed');
})();
