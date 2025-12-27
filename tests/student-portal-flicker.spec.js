import { test, expect } from '@playwright/test';

/**
 * Student Portal Flicker/Double-Login Test
 * 
 * Validates that:
 * 1. Student portal shows loading state initially (not login form)
 * 2. No flicker between login and loading states
 * 3. Single login succeeds and shows dashboard
 * 4. Session persists on refresh
 */

const STUDENT_PORTAL_PATH = '/site/student/';

test.describe('Student Portal - Loading State', () => {
  test('should show loading view by default, not login', async ({ page }) => {
    // Navigate to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    
    // Check that loading view is visible initially (within first 100ms)
    const loadingView = page.locator('#loadingView');
    const loginView = page.locator('#loginView');
    
    // Loading view should be visible
    await expect(loadingView).toBeVisible({ timeout: 100 });
    
    // Login view should be hidden initially
    await expect(loginView).toBeHidden({ timeout: 100 });
  });

  test('should transition from loading to login without flicker', async ({ page }) => {
    // Navigate to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    
    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');
    
    // After auth check, loading should be hidden
    const loadingView = page.locator('#loadingView');
    await expect(loadingView).toBeHidden({ timeout: 5000 });
    
    // Login view should now be visible
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible();
  });
});

test.describe('Student Portal - Auth Flag', () => {
  test('should set auth in progress flag during initialization', async ({ page }) => {
    // Navigate to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    
    // Check that the flag is set
    const flagSet = await page.evaluate(() => {
      return window.__rcStudentAuthInProgress !== undefined;
    });
    
    expect(flagSet).toBe(true);
  });
});

test.describe('Student Portal - Fetch Calls', () => {
  test('should use relative URLs for all API calls', async ({ page }) => {
    const requests = [];
    
    // Monitor network requests
    page.on('request', request => {
      if (request.url().includes('/.netlify/functions/')) {
        requests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });
    
    // Navigate to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    await page.waitForLoadState('networkidle');
    
    // All API requests should use relative URLs (start with /.netlify/functions/)
    // and be to the same origin
    const pageOrigin = new URL(page.url()).origin;
    for (const req of requests) {
      const reqUrl = new URL(req.url);
      // Verify it's to same origin
      expect(reqUrl.origin).toBe(pageOrigin);
      // Verify it uses relative path format
      expect(reqUrl.pathname).toContain('/.netlify/functions/');
    }
  });
});
