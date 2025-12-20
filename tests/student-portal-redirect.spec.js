import { test, expect } from '@playwright/test';

/**
 * Student Portal Redirect Test
 * 
 * Validates that:
 * 1. Direct access to /student/ without auth redirects to /hub/
 * 2. Auto-login deep links with valid parameters work
 * 3. Remembered authentication allows direct access
 * 4. No login form flash occurs during valid auto-login
 */

test.describe('Student Portal Redirect', () => {
  test('should redirect to hub when accessing /student/ without auth', async ({ page }) => {
    // Navigate to student portal directly without auth
    await page.goto('/site/student/');
    
    // Should automatically redirect to hub
    await page.waitForURL('**/hub/**', { timeout: 3000 });
    
    // Verify we're on the hub page
    expect(page.url()).toContain('/hub/');
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
    await page.goto('/site/student/?auto=1&code=S001&name=TestStudent');
    
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
    await page.goto('/site/student/?auto=1');
    
    // Should redirect to hub
    await page.waitForURL('**/hub/**', { timeout: 3000 });
    
    // Verify we're on the hub page
    expect(page.url()).toContain('/hub/');
  });

  test('should redirect when code is present but auto is missing', async ({ page }) => {
    // Navigate with code but no auto=1 parameter
    await page.goto('/site/student/?code=S001');
    
    // Should redirect to hub
    await page.waitForURL('**/hub/**', { timeout: 3000 });
    
    // Verify we're on the hub page
    expect(page.url()).toContain('/hub/');
  });

  test('should allow access with valid remembered authentication', async ({ context, page }) => {
    // Set up remembered auth in localStorage before navigation
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
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
    await page.goto('/site/student/');
    
    // Should NOT redirect to hub (remembered auth is valid)
    await page.waitForLoadState('networkidle');
    
    // Should stay on student portal
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/hub/');
    
    // Dashboard should be visible
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
  });

  test('should redirect with expired remembered authentication', async ({ context, page }) => {
    // Set up EXPIRED auth in localStorage
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Navigate to student portal
    await page.goto('/site/student/');
    
    // Should redirect to hub (auth expired)
    await page.waitForURL('**/hub/**', { timeout: 3000 });
    
    // Verify we're on the hub page
    expect(page.url()).toContain('/hub/');
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
    await page.goto('/site/student/?auto=1&code=S001&name=TestStudent');
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
    await page.goto('/site/student/');
    
    // Wait for redirect
    await page.waitForURL('**/hub/**', { timeout: 3000 });
    
    // Check if flag was set (we set a marker in the init script)
    redirectFlagSet = await page.evaluate(() => window.__redirectFlagWasSet === true);
    
    // Flag should have been set before redirect
    expect(redirectFlagSet).toBe(true);
  });
});
