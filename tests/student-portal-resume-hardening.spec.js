import { test, expect } from '@playwright/test';

/**
 * Student Portal Resume Hardening Tests (PR 263)
 * 
 * Tests for:
 * 1. bfcache restore detection and reload
 * 2. Boot watchdog visibility-based redirect
 * 3. No redirect loops
 */

const STUDENT_PORTAL_PATH = '/site/student/';
const HUB_PATH = '/site/hub/';

// Helper to set up valid student auth
async function setupStudentAuth(context) {
  await context.addInitScript(() => {
    const auth = {
      role: 'student',
      code: 'S001',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
    };
    localStorage.setItem('rc_auth', JSON.stringify(auth));
  });
}

// Helper to mock student API endpoints
async function mockStudentAPIs(page) {
  await page.route('**/.netlify/functions/students*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { code: 'S001', name: 'Test Student', active: true }
      ])
    });
  });
  
  await page.route('**/.netlify/functions/student-roster*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        students: [
          { code: 'S001', name: 'Test Student', active: true }
        ]
      })
    });
  });
  
  await page.route('**/.netlify/functions/assignment-instances*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });
  
  await page.route('**/.netlify/functions/student-assignments*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, instances: [] })
    });
  });
  
  await page.route('**/.netlify/functions/student-goals*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, goals: [] })
    });
  });
  
  await page.route('**/.netlify/functions/student-goal-progress*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, entries: [] })
    });
  });
}

test.describe('Student Portal Resume Hardening - bfcache', () => {
  test('should have pageshow event listener that checks persisted flag', async ({ page, context }) => {
    await setupStudentAuth(context);
    await mockStudentAPIs(page);
    
    // Add tracking for reload calls
    let reloadCallCount = 0;
    await page.exposeFunction('trackReload', () => {
      reloadCallCount++;
    });
    
    await page.addInitScript(() => {
      // Intercept window.location.reload before the script loads
      const originalReload = window.location.reload.bind(window.location);
      window.location.reload = function() {
        window.trackReload && window.trackReload();
        console.log('[test] Reload intercepted, not actually reloading');
        // Don't call original to prevent actual reload
      };
    });
    
    // Navigate to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    await page.waitForLoadState('load');
    
    // Trigger a persisted pageshow event (simulating bfcache restore)
    await page.evaluate(() => {
      const event = new PageTransitionEvent('pageshow', { persisted: true });
      window.dispatchEvent(event);
    });
    
    // Wait for event handler to execute
    await page.waitForTimeout(500);
    
    // Check if reload was called
    expect(reloadCallCount).toBeGreaterThan(0);
  });
  
  test('should not reload when non-persisted pageshow event is triggered', async ({ page, context }) => {
    await setupStudentAuth(context);
    await mockStudentAPIs(page);
    
    // Add tracking for reload calls
    let reloadCallCount = 0;
    await page.exposeFunction('trackReload', () => {
      reloadCallCount++;
    });
    
    await page.addInitScript(() => {
      const originalReload = window.location.reload.bind(window.location);
      window.location.reload = function() {
        window.trackReload && window.trackReload();
      };
    });
    
    // Navigate to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    await page.waitForLoadState('load');
    
    // Trigger a non-persisted pageshow event (normal page load)
    await page.evaluate(() => {
      const event = new PageTransitionEvent('pageshow', { persisted: false });
      window.dispatchEvent(event);
    });
    
    await page.waitForTimeout(500);
    
    // Check if reload was NOT called
    expect(reloadCallCount).toBe(0);
  });
});

test.describe('Student Portal Resume Hardening - Boot Watchdog', () => {
  test('should have boot watchdog timer that checks dashboard visibility', async ({ page, context }) => {
    await setupStudentAuth(context);
    await mockStudentAPIs(page);
    
    // Track if watchdog fires by checking for redirect attempts
    let redirectAttempted = false;
    await page.exposeFunction('trackRedirect', (url) => {
      redirectAttempted = true;
      console.log('[test] Redirect attempted to:', url);
    });
    
    await page.addInitScript(() => {
      // Intercept location.replace to track redirect attempts
      const originalReplace = window.location.replace.bind(window.location);
      window.location.replace = function(url) {
        window.trackRedirect && window.trackRedirect(url);
        console.log('[test] Replace intercepted, not actually navigating');
        // Don't call original to prevent actual navigation
      };
    });
    
    // Inject script to hide dashboard to trigger watchdog
    await page.addInitScript(() => {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const dashboard = document.getElementById('studentDashboardView');
          if (dashboard) {
            dashboard.classList.add('hidden');
            dashboard.style.display = 'none';
            console.log('[test] Dashboard forced hidden to trigger watchdog');
          }
        }, 100);
      });
    });
    
    // Navigate with short watchdog timeout
    await page.goto(STUDENT_PORTAL_PATH + '?watchdog_ms=2000');
    await page.waitForLoadState('load');
    
    // Wait for watchdog to fire
    await page.waitForTimeout(3000);
    
    // Verify redirect was attempted
    expect(redirectAttempted).toBe(true);
  });
  
  test('should not fire watchdog when dashboard becomes visible', async ({ page, context }) => {
    await setupStudentAuth(context);
    await mockStudentAPIs(page);
    
    // Track redirect attempts
    let redirectAttempted = false;
    await page.exposeFunction('trackRedirect', () => {
      redirectAttempted = true;
    });
    
    await page.addInitScript(() => {
      const originalReplace = window.location.replace.bind(window.location);
      window.location.replace = function(url) {
        window.trackRedirect && window.trackRedirect();
      };
    });
    
    // Navigate with short watchdog timeout
    await page.goto(STUDENT_PORTAL_PATH + '?watchdog_ms=3000');
    await page.waitForLoadState('load');
    
    // Wait for dashboard to appear (but not past watchdog timeout)
    await page.waitForTimeout(1000);
    
    // Check if dashboard is visible (should be if login succeeded)
    const dashboardVisible = await page.evaluate(() => {
      const dashboard = document.getElementById('studentDashboardView');
      return dashboard && 
             !dashboard.classList.contains('hidden') &&
             dashboard.offsetParent !== null;
    });
    
    // Wait past watchdog timeout
    await page.waitForTimeout(3000);
    
    // If dashboard is visible, watchdog should not have fired
    if (dashboardVisible) {
      expect(redirectAttempted).toBe(false);
    }
  });
  
  test('should disable watchdog in debug mode by default', async ({ page, context }) => {
    await setupStudentAuth(context);
    await mockStudentAPIs(page);
    
    // Track redirect attempts
    let redirectAttempted = false;
    await page.exposeFunction('trackRedirect', () => {
      redirectAttempted = true;
    });
    
    await page.addInitScript(() => {
      const originalReplace = window.location.replace.bind(window.location);
      window.location.replace = function(url) {
        window.trackRedirect && window.trackRedirect();
      };
    });
    
    // Inject script to hide dashboard
    await page.addInitScript(() => {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const dashboard = document.getElementById('studentDashboardView');
          if (dashboard) {
            dashboard.classList.add('hidden');
            dashboard.style.display = 'none';
          }
        }, 100);
      });
    });
    
    // Navigate with debug mode (watchdog should be disabled)
    await page.goto(STUDENT_PORTAL_PATH + '?debug=1');
    await page.waitForLoadState('load');
    
    // Wait longer than default watchdog timeout
    await page.waitForTimeout(6000);
    
    // Should NOT have redirected (watchdog disabled in debug mode)
    expect(redirectAttempted).toBe(false);
  });
  
  test('should allow explicit watchdog timeout in debug mode', async ({ page, context }) => {
    await setupStudentAuth(context);
    await mockStudentAPIs(page);
    
    // Track redirect attempts
    let redirectAttempted = false;
    await page.exposeFunction('trackRedirect', () => {
      redirectAttempted = true;
    });
    
    await page.addInitScript(() => {
      const originalReplace = window.location.replace.bind(window.location);
      window.location.replace = function(url) {
        window.trackRedirect && window.trackRedirect();
      };
    });
    
    // Inject script to hide dashboard
    await page.addInitScript(() => {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const dashboard = document.getElementById('studentDashboardView');
          if (dashboard) {
            dashboard.classList.add('hidden');
            dashboard.style.display = 'none';
          }
        }, 100);
      });
    });
    
    // Navigate with debug mode but explicit watchdog timeout
    await page.goto(STUDENT_PORTAL_PATH + '?debug=1&watchdog_ms=2000');
    await page.waitForLoadState('load');
    
    // Wait for watchdog to fire
    await page.waitForTimeout(3000);
    
    // Should have redirected because explicit timeout was set
    expect(redirectAttempted).toBe(true);
  });
  
  test('should not fire watchdog if already redirecting to hub', async ({ page, context }) => {
    await setupStudentAuth(context);
    await mockStudentAPIs(page);
    
    // Track redirect attempts
    let redirectCallCount = 0;
    await page.exposeFunction('trackRedirect', () => {
      redirectCallCount++;
    });
    
    await page.addInitScript(() => {
      // Set redirect flag early
      window.__redirectingToHub = true;
      
      const originalReplace = window.location.replace.bind(window.location);
      window.location.replace = function(url) {
        window.trackRedirect && window.trackRedirect();
      };
    });
    
    // Navigate with short watchdog timeout
    await page.goto(STUDENT_PORTAL_PATH + '?watchdog_ms=2000');
    await page.waitForLoadState('load');
    
    // Wait past watchdog timeout
    await page.waitForTimeout(3000);
    
    // Watchdog should not have fired (flag was already set)
    expect(redirectCallCount).toBe(0);
  });
  
  test('should clear auth storage when watchdog fires', async ({ page, context }) => {
    await setupStudentAuth(context);
    await mockStudentAPIs(page);
    
    // Track redirect and auth state
    let authWasCleared = false;
    await page.exposeFunction('checkAuthCleared', () => {
      authWasCleared = true;
    });
    
    await page.addInitScript(() => {
      const originalReplace = window.location.replace.bind(window.location);
      window.location.replace = function(url) {
        // Check auth state when redirect is attempted
        const authCleared = localStorage.getItem('rc_auth') === null &&
                           sessionStorage.getItem('rc_user_code') === null &&
                           sessionStorage.getItem('rc_user_role') === null;
        if (authCleared) {
          window.checkAuthCleared && window.checkAuthCleared();
        }
      };
    });
    
    // Inject script to hide dashboard
    await page.addInitScript(() => {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const dashboard = document.getElementById('studentDashboardView');
          if (dashboard) {
            dashboard.classList.add('hidden');
            dashboard.style.display = 'none';
          }
        }, 100);
      });
    });
    
    // Navigate with short watchdog timeout
    await page.goto(STUDENT_PORTAL_PATH + '?watchdog_ms=2000');
    await page.waitForLoadState('load');
    
    // Wait for watchdog to fire
    await page.waitForTimeout(3000);
    
    // Verify auth was cleared before redirect
    expect(authWasCleared).toBe(true);
  });
  
  test('should set redirect flag before navigating', async ({ page, context }) => {
    await setupStudentAuth(context);
    await mockStudentAPIs(page);
    
    // Track redirect flag state
    let flagWasSet = false;
    await page.exposeFunction('checkFlag', () => {
      flagWasSet = true;
    });
    
    await page.addInitScript(() => {
      const originalReplace = window.location.replace.bind(window.location);
      window.location.replace = function(url) {
        // Check if flag was set before replace was called
        if (window.__redirectingToHub === true) {
          window.checkFlag && window.checkFlag();
        }
      };
    });
    
    // Inject script to hide dashboard
    await page.addInitScript(() => {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const dashboard = document.getElementById('studentDashboardView');
          if (dashboard) {
            dashboard.classList.add('hidden');
            dashboard.style.display = 'none';
          }
        }, 100);
      });
    });
    
    // Navigate with short watchdog timeout
    await page.goto(STUDENT_PORTAL_PATH + '?watchdog_ms=2000');
    await page.waitForLoadState('load');
    
    // Wait for watchdog to fire
    await page.waitForTimeout(3000);
    
    // Verify flag was set before redirect
    expect(flagWasSet).toBe(true);
  });
});
