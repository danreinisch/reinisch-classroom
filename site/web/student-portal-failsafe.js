/**
 * Student Portal Failsafe Timer
 * Ensures login view is visible if authentication fails to complete
 * Part of Guardrails Stage 3B - externalized from inline script
 */

(function() {
  'use strict';
  
  // A) Failsafe visibility timer: Force #loginView visible if window.authReady not set within 3s
  // This runs BEFORE any async work to prevent top-level errors from leaving page blank
  
  const urlParams = new URLSearchParams(window.location.search);
  const DEBUG_MODE = urlParams.get('debug') === '1';
  const FAILSAFE_DELAY_MS = DEBUG_MODE ? 0 : 3000; // No delay in debug mode
  
  if (DEBUG_MODE) {
    console.log('[HOTFIX][failsafe] Debug mode enabled - failsafe timer bypassed');
  }
  
  setTimeout(() => {
    // Skip failsafe if redirect is happening
    if (window.__redirectingToHub === true) {
      if (DEBUG_MODE) {
        console.log('[HOTFIX][failsafe] Skipping - redirect to hub in progress');
      }
      return;
    }
    
    // Skip failsafe if deep-link auto-login is in progress
    if (window.__deepLinkAutoLogin === true) {
      if (DEBUG_MODE) {
        console.log('[HOTFIX][failsafe] Skipping - deep-link auto-login in progress');
      }
      return;
    }
    
    // Only fire if window.authReady is not set
    if (!window.authReady) {
      const loginView = document.getElementById('loginView');
      const dashboardView = document.getElementById('studentDashboardView');
      const teacherView = document.getElementById('teacherCenterView');
      
      // Check if any view is visible
      const isLoginVisible = loginView && !loginView.classList.contains('hidden');
      const isDashboardVisible = dashboardView && !dashboardView.classList.contains('hidden');
      const isTeacherVisible = teacherView && !teacherView.classList.contains('hidden');
      
      if (!isLoginVisible && !isDashboardVisible && !isTeacherVisible) {
        console.warn('[HOTFIX][failsafe] TRIGGERED - No view visible after ' + FAILSAFE_DELAY_MS + 'ms, forcing login view');
        
        if (DEBUG_MODE) {
          console.log('[HOTFIX][failsafe] Current state:', {
            authReady: window.authReady,
            loginHidden: loginView?.classList.contains('hidden'),
            dashboardHidden: dashboardView?.classList.contains('hidden'),
            teacherHidden: teacherView?.classList.contains('hidden')
          });
        }
        
        // Force show login view defensively
        if (loginView) {
          loginView.classList.remove('hidden');
          console.log('[HOTFIX][failsafe] Login view forced visible');
        }
        
        // Hide other views
        if (dashboardView) dashboardView.classList.add('hidden');
        if (teacherView) teacherView.classList.add('hidden');
      } else if (DEBUG_MODE) {
        console.log('[HOTFIX][failsafe] Check passed - a view is visible or authReady is set');
      }
    } else if (DEBUG_MODE) {
      console.log('[HOTFIX][failsafe] Check passed - authReady is true');
    }
  }, FAILSAFE_DELAY_MS);
})();
