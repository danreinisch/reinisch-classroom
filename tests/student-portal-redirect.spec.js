import { test, expect } from '@playwright/test';

/**
 * Student Portal Redirect Test
 * 
 * PR 265: Session-only student authentication
 * 
 * Validates that:
 * 1. Direct access to /student/ without auth shows LOGIN UI (not redirected)
 * 2. Auto-login deep links with valid parameters work
 * 3. Active sessionStorage session allows direct access
 * 4. No login form flash occurs during valid auto-login
 * 5. Invalid deep links (auto=1 without code) redirect to hub
 */

// Test constants
const STUDENT_PORTAL_PATH = '/site/student/';
const HUB_PATH = '/site/hub/';

// Helper to build student portal URL with parameters
function buildStudentPortalURL(params = {}) {
  const url = new URL(STUDENT_PORTAL_PATH, 'http://localhost');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, value);
    }
  });
  return url.pathname + url.search;
}

test.describe('Student Portal Redirect', () => {
  test('should NOT redirect when accessing /student/ without auth (PR 265)', async ({ page }) => {
    // PR 265: Direct access to /student/ should show login UI, not redirect
    await page.goto(STUDENT_PORTAL_PATH);
    
    // Should NOT redirect to hub - should stay on student portal
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on the student portal page
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/hub/');
    
    // Login view should be visible
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible({ timeout: 5000 });
  });

  test('should allow auto-login with valid deep link parameters', async ({ page }) => {
    // Mock student data endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S001', name: 'Test Student', active: true }
        ])
      });
    });
    
    // Mock assignment instances endpoint
    await page.route('**/.netlify/functions/assignment-instances*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Mock goals endpoint
    await page.route('**/.netlify/functions/goals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Navigate to student portal with valid auto-login parameters
    await page.goto(buildStudentPortalURL({ auto: '1', code: 'S001', name: 'TestStudent' }));
    
    // Should NOT redirect to hub
    await page.waitForLoadState('networkidle');
    
    // Should stay on student portal
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/hub/');
    
    // Dashboard should be visible (eventually)
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
  });

  test('should redirect when auto=1 but code is missing', async ({ page }) => {
    // Navigate with auto=1 but no code parameter
    await page.goto(buildStudentPortalURL({ auto: '1' }));
    
    // Should redirect to hub
    await page.waitForURL(`**${HUB_PATH}`, { timeout: 3000 });
    
    // Verify we're on the hub page
    expect(page.url()).toContain('/hub/');
  });

  test('should redirect when auto=1 but code is empty', async ({ page }) => {
    // Navigate with auto=1 and empty code parameter
    await page.goto(buildStudentPortalURL({ auto: '1', code: '' }));
    
    // Should redirect to hub
    await page.waitForURL(`**${HUB_PATH}`, { timeout: 3000 });
    
    // Verify we're on the hub page
    expect(page.url()).toContain('/hub/');
  });

  test('should redirect when auto=1 but code is whitespace', async ({ page }) => {
    // Navigate with auto=1 and whitespace-only code parameter
    await page.goto(buildStudentPortalURL({ auto: '1', code: '   ' }));
    
    // Should redirect to hub
    await page.waitForURL(`**${HUB_PATH}`, { timeout: 3000 });
    
    // Verify we're on the hub page
    expect(page.url()).toContain('/hub/');
  });

  test('should NOT redirect when code without auto=1 (PR 265)', async ({ page }) => {
    // PR 265: Without auto=1, should show login UI
    await page.goto(buildStudentPortalURL({ code: 'S001' }));
    
    // Should NOT redirect - show login UI
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on student portal
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/hub/');
    
    // Login view should be visible
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible({ timeout: 5000 });
  });

  test('should allow access with active sessionStorage session (PR 265)', async ({ context, page }) => {
    // PR 265: Set up active session in sessionStorage
    await context.addInitScript(() => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', 'S001');
    });
    
    // Mock student data endpoints
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
    
    // Mock assignment instances endpoint
    await page.route('**/.netlify/functions/assignment-instances*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Mock goals endpoint
    await page.route('**/.netlify/functions/goals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Navigate to student portal without auto-login parameters
    await page.goto(STUDENT_PORTAL_PATH);
    
    // Should NOT redirect to hub (session is active)
    await page.waitForLoadState('networkidle');
    
    // Should stay on student portal
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/hub/');
    
    // Dashboard should be visible
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
  });

  test('should show login UI with expired localStorage auth (PR 265)', async ({ context, page }) => {
    // PR 265: Expired auth in localStorage should not affect behavior
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Navigate to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    
    // Should NOT redirect to hub - show login UI
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on student portal
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/hub/');
    
    // Login view should be visible
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible({ timeout: 5000 });
  });

  test('should not show login form during valid auto-login', async ({ page }) => {
    // Track if login view ever becomes visible
    let loginViewWasVisible = false;
    
    // Mock student data endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S001', name: 'Test Student', active: true }
        ])
      });
    });
    
    // Mock assignment instances endpoint
    await page.route('**/.netlify/functions/assignment-instances*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Mock goals endpoint
    await page.route('**/.netlify/functions/goals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Set up visibility watcher before navigation
    page.on('load', async () => {
      const loginView = page.locator('#loginView');
      const isVisible = await loginView.isVisible().catch(() => false);
      if (isVisible) {
        loginViewWasVisible = true;
      }
    });
    
    // Navigate with valid auto-login
    await page.goto(buildStudentPortalURL({ auto: '1', code: 'S001', name: 'TestStudent' }));
    await page.waitForLoadState('networkidle');
    
    // Check one more time after load
    const loginView = page.locator('#loginView');
    const isVisibleNow = await loginView.isVisible().catch(() => false);
    if (isVisibleNow) {
      loginViewWasVisible = true;
    }
    
    // Login view should never have been visible
    expect(loginViewWasVisible).toBe(false);
    
    // Dashboard should be visible
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
  });

  test('should set redirect flag before navigating to hub', async ({ page }) => {
    // Intercept the redirect to check flag
    let redirectFlagSet = false;
    
    await page.addInitScript(() => {
      // Override window.location.replace to check flag
      const originalReplace = window.location.replace;
      window.location.replace = function(url) {
        if (window.__redirectingToHub === true) {
          window.__redirectFlagWasSet = true;
        }
        originalReplace.call(this, url);
      };
    });
    
    // Navigate to student portal without auth
    await page.goto(STUDENT_PORTAL_PATH);
    
    // Wait for redirect
    await page.waitForURL(`**${HUB_PATH}`, { timeout: 3000 });
    
    // Check if flag was set (we set a marker in the init script)
    redirectFlagSet = await page.evaluate(() => window.__redirectFlagWasSet === true);
    
    // Flag should have been set before redirect
    expect(redirectFlagSet).toBe(true);
  });
});
