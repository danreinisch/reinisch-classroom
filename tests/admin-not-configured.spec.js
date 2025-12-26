import { test, expect } from '@playwright/test';

/**
 * Admin Access Test (Updated for PR 335)
 * 
 * PR 335: Admin login removed - now uses Teacher Center SSO
 * This test validates that /admin-login redirects and admin requires Teacher Center auth
 */

// Test constants
const HUB_PATH = '/site/hub/';

test.describe('Admin Access - PR 335 (Teacher Center SSO)', () => {
  test('should redirect /admin-login to /admin/', async ({ page }) => {
    // PR 335: /admin-login is now a legacy redirect
    await page.goto('/site/admin-login/');
    await page.waitForLoadState('networkidle');
    
    // Should redirect away from admin-login
    // May end up at /admin/ or /hub/ depending on authentication
    await page.waitForFunction(() => {
      return !window.location.pathname.includes('admin-login');
    }, { timeout: 5000 }).catch(() => {
      // If redirect doesn't happen in local env, that's acceptable
    });
    
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/admin-login');
  });
  
  test('should allow access to admin-not-configured page (legacy)', async ({ page }) => {
    // The admin-not-configured page still exists for documentation purposes
    await page.goto('/site/admin-not-configured/');
    await page.waitForLoadState('networkidle');
    
    // Should stay on admin-not-configured (informational page)
    expect(page.url()).toContain('/admin-not-configured');
  });
});
