/**
 * Hub Student Redirect
 * 
 * Redirects remembered students from /hub/ to /student/ portal
 * 
 * Part of PR E: Students should never see teacher hub UI
 * Part of PR 261: Add teacher override + robust routing guardrails
 * 
 * Requirements:
 * - Check localStorage.rc_auth for valid student auth
 * - Validate JSON structure, role === 'student', and expiry
 * - If valid student auth: redirect to /student/ using location.replace()
 * - If invalid/expired: clear rc_auth and continue to hub
 * - If no auth or teacher/substitute: continue to hub normally
 * 
 * Bypass conditions (PR 261):
 * - If ?teacher=1 query parameter is present, skip redirect entirely
 * - If sessionStorage.rc_user_role === 'teacher', skip redirect (teacher session active)
 */

(function() {
  'use strict';
  
  const STUDENT_PORTAL_PATH = '/student/';
  const AUTH_KEY = 'rc_auth';
  const REDIRECT_LATCH_KEY = '__hubStudentRedirected';
  
  console.log('[hub-student-redirect] Checking for remembered student auth');
  
  // PR 262: Check bfcache redirect latch
  try {
    if (sessionStorage.getItem(REDIRECT_LATCH_KEY) === '1') {
      console.log('[hub-student-redirect] Redirect latch detected, skipping redirect (already redirected this session)');
      return;
    }
  } catch (err) {
    console.warn('[hub-student-redirect] Failed to check redirect latch:', err);
    // Continue with normal logic on error
  }
  
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
  
  try {
    // Check localStorage for auth token
    const authStr = localStorage.getItem(AUTH_KEY);
    
    // No auth token - continue to hub normally
    if (!authStr) {
      console.log('[hub-student-redirect] No auth token found, continuing to hub');
      return;
    }
    
    // Parse auth token
    let auth;
    try {
      auth = JSON.parse(authStr);
    } catch (parseErr) {
      console.warn('[hub-student-redirect] Invalid JSON in auth token, clearing and continuing to hub:', parseErr);
      localStorage.removeItem(AUTH_KEY);
      return;
    }
    
    // Validate auth structure
    if (!auth || typeof auth !== 'object') {
      console.warn('[hub-student-redirect] Invalid auth structure, clearing and continuing to hub');
      localStorage.removeItem(AUTH_KEY);
      return;
    }
    
    // Check if auth has required fields
    if (!auth.role || !auth.code) {
      console.warn('[hub-student-redirect] Auth missing required fields (role, code), clearing and continuing to hub');
      localStorage.removeItem(AUTH_KEY);
      return;
    }
    
    // Check if auth is expired
    if (!auth.expiresAt) {
      console.warn('[hub-student-redirect] Auth missing expiresAt field, clearing and continuing to hub');
      localStorage.removeItem(AUTH_KEY);
      return;
    }
    
    if (typeof auth.expiresAt !== 'number') {
      console.warn('[hub-student-redirect] Auth expiresAt is not a number (type: ' + typeof auth.expiresAt + '), clearing and continuing to hub');
      localStorage.removeItem(AUTH_KEY);
      return;
    }
    
    const now = Date.now();
    if (now > auth.expiresAt) {
      console.log('[hub-student-redirect] Auth token expired, clearing and continuing to hub');
      localStorage.removeItem(AUTH_KEY);
      return;
    }
    
    // Check if role is student
    if (auth.role === 'student') {
      console.log('[hub-student-redirect] Valid student auth found, redirecting to student portal');
      
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
      return;
    }
    
    // Role is teacher, substitute, or other - continue to hub normally
    console.log('[hub-student-redirect] Non-student role (' + auth.role + '), continuing to hub');
    
  } catch (err) {
    console.error('[hub-student-redirect] Unexpected error during redirect check:', err);
    // On error, fail safely by continuing to hub (don't block teacher access)
  }
})();
