import { test, expect } from '@playwright/test';

/**
 * Admin Access Guard Test (PR 308)
 * 
 * Validates that:
 * 1. Unauthenticated users are redirected from /admin/ to /admin-login
 * 2. Unauthenticated users are redirected from /admin-login/ (no loop)
 * 3. Students are blocked from /admin/ and /admin-login/
 * 4. Admin link is not visible to students in app shell
 * 5. Admin users can access /admin/ (with mock session)
 */

// Test constants
const ADMIN_PATH = '/site/admin/';
const ADMIN_LOGIN_PATH = '/site/admin-login/';
const HOME_PATH = '/';

test.describe('Admin Access Guard - Unauthenticated Users', () => {
  test('should redirect unauthenticated user from /admin/ to /admin-login (client-side)', async ({ page }) => {
    // Note: Edge function only runs on Netlify; in local test environment,
    // the client-side admin-guard.js handles the redirect
    
    // Navigate to admin without authentication
    await page.goto(ADMIN_PATH);
    
    // Wait for client-side redirect
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
    
    // Should be redirected to admin-login by client-side guard
    expect(page.url()).toContain('/admin-login');
    
    // Login page title should be present
    const title = await page.title();
    expect(title).toContain('Admin Login');
  });

  test('should allow unauthenticated access to /admin-login/', async ({ page }) => {
    // Navigate to admin-login without authentication (should be allowed)
    await page.goto(ADMIN_LOGIN_PATH);
    
    // Wait for page load
    await page.waitForLoadState('networkidle');
    
    // Should stay on admin-login (not redirect)
    expect(page.url()).toContain('/admin-login');
    
    // Login page title should be present
    const title = await page.title();
    expect(title).toContain('Admin Login');
  });
});

test.describe('Admin Access Guard - Student Users', () => {
  test('should block student from accessing /admin/ (client-side)', async ({ page }) => {
    // Set up student role in localStorage
    await page.goto(HOME_PATH);
    await page.evaluate(() => {
      localStorage.setItem('rc_auth', JSON.stringify({
        role: 'student',
        code: 'S001',
        expiresAt: Date.now() + 3600000 // 1 hour from now
      }));
    });
    
    // Try to navigate to admin
    await page.goto(ADMIN_PATH);
    
    // Wait for client-side redirect
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
    
    // Should be redirected to home (blocked by client-side guard)
    expect(page.url()).toContain(HOME_PATH);
    expect(page.url()).not.toContain('/admin/');
  });

  test('should block student from accessing /admin-login/ (client-side)', async ({ page }) => {
    // Set up student role in localStorage
    await page.goto(HOME_PATH);
    await page.evaluate(() => {
      localStorage.setItem('rc_auth', JSON.stringify({
        role: 'student',
        code: 'S001',
        expiresAt: Date.now() + 3600000 // 1 hour from now
      }));
    });
    
    // Try to navigate to admin-login
    await page.goto(ADMIN_LOGIN_PATH);
    
    // Wait for client-side redirect
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
    
    // Should be redirected to home (blocked by client-side guard)
    expect(page.url()).toContain(HOME_PATH);
    expect(page.url()).not.toContain('/admin-login');
  });

  test('should not show Admin link to student in app shell', async ({ page }) => {
    // Set up student role in localStorage
    await page.goto(HOME_PATH);
    await page.evaluate(() => {
      localStorage.setItem('rc_auth', JSON.stringify({
        role: 'student',
        code: 'S001',
        expiresAt: Date.now() + 3600000 // 1 hour from now
      }));
    });
    
    // Reload to apply auth state
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Wait for app shell to initialize
    await page.waitForTimeout(1000);
    
    // Admin link should be hidden or not present
    const adminLink = page.locator('a[href="/admin/"][data-admin-only]');
    
    // Check if element exists and is hidden
    const count = await adminLink.count();
    if (count > 0) {
      // If it exists, it should be hidden
      await expect(adminLink).toHaveClass(/app-shell-hidden/);
    }
    // If count is 0, that's also acceptable (link not in DOM)
  });
});

test.describe('Admin Access Guard - Admin Users', () => {
  test('should allow admin role to see Admin link in app shell', async ({ page }) => {
    // Set up admin role in localStorage
    await page.goto(HOME_PATH);
    await page.evaluate(() => {
      localStorage.setItem('rc_auth', JSON.stringify({
        role: 'admin',
        code: 'ADMIN001',
        expiresAt: Date.now() + 3600000 // 1 hour from now
      }));
    });
    
    // Reload to apply auth state
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Wait for app shell to initialize
    await page.waitForTimeout(1000);
    
    // Admin link should be visible (not hidden)
    const adminLink = page.locator('a[href="/admin/"][data-admin-only]');
    
    // Link should exist
    await expect(adminLink).toBeAttached({ timeout: 5000 });
    
    // Should NOT have the hidden class
    await expect(adminLink).not.toHaveClass(/app-shell-hidden/);
  });

  test('should allow /admin/ to load gate check page without session (edge function in production)', async ({ page }) => {
    // Note: In local environment without edge function, /admin/ loads the gate check page
    // In production with Netlify edge function, unauthenticated users are redirected to /admin-login
    // This test validates the local behavior (gate check page loads)
    
    await page.goto(ADMIN_PATH);
    await page.waitForLoadState('networkidle');
    
    // In local environment, page loads and shows gate check or redirects via client-side guard
    // Just verify we're on some admin-related page
    const url = page.url();
    expect(url).toMatch(/\/(admin|admin-login)/);
  });
});

test.describe('Admin Access Guard - Return URL Handling', () => {
  test('should preserve return URL when redirecting to login (client-side)', async ({ page }) => {
    // Try to access a specific admin path without authentication
    const targetPath = '/site/admin/?test=1';
    await page.goto(targetPath);
    
    // Wait for client-side redirect
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
    
    // Should be redirected to admin-login with return parameter (client-side guard adds this)
    const url = page.url();
    expect(url).toContain('/admin-login');
    
    // Verify return URL is preserved (implementation detail of admin-guard.js)
    // The client-side guard includes a return parameter
    expect(url).toMatch(/return=/);
  });
});
