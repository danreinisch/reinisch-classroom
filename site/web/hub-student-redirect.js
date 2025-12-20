/**
 * Hub Student Redirect
 * 
 * PR 265: Session-only student authentication - DISABLED auto-redirect
 * - No longer redirects based on localStorage.rc_auth (24-hour persistence removed)
 * - No longer redirects based on sessionStorage (students can access /hub/)
 * - Default behavior: /hub/ does not auto-redirect students
 * 
 * Part of PR 261: Add teacher override + robust routing guardrails
 * 
 * Requirements:
 * - Allow all users (students, teachers, etc.) to access /hub/ normally
 * - No automatic redirects to /student/ portal
 */

(function() {
  'use strict';
  
  console.log('[hub-student-redirect] PR 265: Auto-redirect disabled, allowing hub access');
  
  // PR 265: All redirect logic removed - students can access /hub/ directly
  // Deep link handoff from hub → student still works via URL params
})();
