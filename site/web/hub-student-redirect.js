/**
 * Hub Student Redirect
 * 
 * Redirects remembered students from /hub/ to /student/ portal
 * 
 * Part of PR E: Students should never see teacher hub UI
 * 
 * Requirements:
 * - Check localStorage.rc_auth for valid student auth
 * - Validate JSON structure, role === 'student', and expiry
 * - If valid student auth: redirect to /student/ using location.replace()
 * - If invalid/expired: clear rc_auth and continue to hub
 * - If no auth or teacher/substitute: continue to hub normally
 */

(function() {
  'use strict';
  
  const STUDENT_PORTAL_PATH = '/student/';
  const AUTH_KEY = 'rc_auth';
  
  console.log('[hub-student-redirect] Checking for remembered student auth');
  
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
    if (auth.expiresAt && typeof auth.expiresAt === 'number') {
      const now = Date.now();
      if (now > auth.expiresAt) {
        console.log('[hub-student-redirect] Auth token expired, clearing and continuing to hub');
        localStorage.removeItem(AUTH_KEY);
        return;
      }
    } else {
      // No expiry or invalid expiry - treat as expired for safety
      console.warn('[hub-student-redirect] Auth missing or invalid expiresAt, clearing and continuing to hub');
      localStorage.removeItem(AUTH_KEY);
      return;
    }
    
    // Check if role is student
    if (auth.role === 'student') {
      console.log('[hub-student-redirect] Valid student auth found, redirecting to student portal');
      
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
