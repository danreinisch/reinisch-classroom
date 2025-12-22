/**
 * Admin Access Guard
 * Blocks student accounts from accessing admin areas
 * Redirects students to home page
 */

(function() {
  'use strict';
  
  // Check session storage for role
  const role = sessionStorage.getItem('rc_user_role');
  
  // If user is logged in as student, redirect to home
  if (role === 'student') {
    console.warn('[admin-guard] Student role detected, redirecting to home');
    window.location.replace('/');
    return;
  }
  
  // Also check localStorage for legacy role storage (cleanup)
  const legacyRole = localStorage.getItem('rc_user_role');
  if (legacyRole === 'student') {
    console.warn('[admin-guard] Legacy student role detected, redirecting to home');
    window.location.replace('/');
    return;
  }
  
  console.log('[admin-guard] Access check passed');
})();
