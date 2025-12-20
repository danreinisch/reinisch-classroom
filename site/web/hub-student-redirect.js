/**
 * Hub Student Redirect
 * 
 * PR 265: Session-only student authentication
 * - No longer redirects based on localStorage.rc_auth (24-hour persistence removed)
 * - Only redirects if there's an active student session in sessionStorage
 * - Default behavior: /hub/ does not auto-redirect students who logged in earlier
 * 
 * Part of PR E: Students should never see teacher hub UI
 * Part of PR 261: Add teacher override + robust routing guardrails
 * 
 * Requirements:
 * - Check sessionStorage for active student session (optional redirect)
 * - If no active session: continue to hub normally
 * - If teacher/substitute session: continue to hub normally
 * 
 * Bypass conditions (PR 261):
 * - If ?teacher=1 query parameter is present, skip redirect entirely
 * - If sessionStorage.rc_user_role === 'teacher', skip redirect (teacher session active)
 */

(function() {
  'use strict';
  
  const STUDENT_PORTAL_PATH = '/student/';
  const REDIRECT_LATCH_KEY = '__hubStudentRedirected';
  
  console.log('[hub-student-redirect] Checking for active student session');
  
  // PR 261 A: Check for teacher override query parameter
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('teacher') === '1') {
      console.log('[hub-student-redirect] Teacher override detected (?teacher=1), skipping redirect');
      return;
    }
  } catch (err) {
    console.warn('[hub-student-redirect] Failed to parse URL parameters:', err);
    // Continue with normal logic on error
  }
  
  // PR 261 B: Check for active teacher session
  try {
    const userRole = sessionStorage.getItem('rc_user_role');
    if (userRole === 'teacher') {
      console.log('[hub-student-redirect] Active teacher session detected, skipping redirect');
      return;
    }
  } catch (err) {
    console.warn('[hub-student-redirect] Failed to check sessionStorage:', err);
    // Continue with normal logic on error
  }
  
  // PR 262: Check bfcache redirect latch (only applies to student redirects)
  try {
    if (sessionStorage.getItem(REDIRECT_LATCH_KEY) === '1') {
      console.log('[hub-student-redirect] Redirect latch detected, skipping redirect (already redirected this session)');
      return;
    }
  } catch (err) {
    console.warn('[hub-student-redirect] Failed to check redirect latch:', err);
    // Continue with normal logic on error
  }
  
  // PR 265: Session-only authentication - check sessionStorage instead of localStorage
  try {
    // Check for active student session in sessionStorage
    const userRole = sessionStorage.getItem('rc_user_role');
    const userCode = sessionStorage.getItem('rc_user_code');
    
    // No active student session - continue to hub normally
    if (userRole !== 'student' || !userCode) {
      console.log('[hub-student-redirect] No active student session, continuing to hub');
      return;
    }
    
    // Active student session found - redirect to student portal
    console.log('[hub-student-redirect] Active student session found, redirecting to student portal');
    
    // PR 262: Set redirect latch to prevent bfcache redirect spam
    try {
      sessionStorage.setItem(REDIRECT_LATCH_KEY, '1');
    } catch (err) {
      console.warn('[hub-student-redirect] Failed to set redirect latch:', err);
    }
    
    // Set global flag to indicate redirect in progress
    window.__redirectingToStudentPortal = true;
    
    // Redirect to student portal (use replace to avoid back-button loop)
    window.location.replace(STUDENT_PORTAL_PATH);
    
  } catch (err) {
    console.error('[hub-student-redirect] Unexpected error during redirect check:', err);
    // On error, fail safely by continuing to hub (don't block teacher access)
  }
})();
