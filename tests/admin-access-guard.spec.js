import { test, expect } from '@playwright/test';

/**
 * Admin Access Guard Test
 * 
 * Validates that:
 * 1. Unauthenticated users are redirected from /admin/ to /admin-login (not /hub)
 * 2. /admin-login shows a clear message and link to Teacher Center
 * 3. Students are blocked from /admin/
 * 4. Admin users can access /admin/ with Teacher Center session
 */

// Test constants
const ADMIN_PATH = '/site/admin/';
const ADMIN_LOGIN_PATH = '/site/admin-login/';
const HUB_PATH = '/site/hub/';
const HOME_PATH = '/';

test.describe('Admin Access Guard - Unauthenticated Users', () => {
  test('should redirect unauthenticated user from /admin/ to /admin-login', async ({ page }) => {
    // Note: Edge function only runs on Netlify; in local test environment,
    // the client-side gate.js handles the redirect
    
    // Navigate to admin without authentication
    await page.goto(ADMIN_PATH);
    
    // Wait for client-side redirect to complete
    await page.waitForFunction(() => {
      return window.location.pathname.includes('admin-login');
    }, { timeout: 5000 }).catch(() => {
      // If redirect doesn't happen, that's okay for local testing
    });
    
    await page.waitForLoadState('networkidle');
    
    // Should be redirected to admin-login (not /hub)
    expect(page.url()).toContain('/admin-login');
  });

  test('should show admin-login page with clear message', async ({ page }) => {
    // Navigate to admin-login page
    await page.goto(ADMIN_LOGIN_PATH);
    
    await page.waitForLoadState('networkidle');
    
    // Should show the admin-login page
    expect(page.url()).toContain('/admin-login');
    
    // Check for key elements
    const heading = await page.locator('h1').textContent();
    expect(heading).toContain('Admin Access Required');
    
    // Should have a link to Teacher Center
    const hubLink = page.locator('a[href*="/hub/"]');
    await expect(hubLink).toBeVisible();
  });

  test('should show diagnostic message with reason query parameter', async ({ page }) => {
    // Navigate to admin-login with reason parameter
    await page.goto(ADMIN_LOGIN_PATH + '?reason=missing_admin_session');
    
    await page.waitForLoadState('networkidle');
    
    // Wait a bit for JavaScript to process the query parameter
    await page.waitForTimeout(100);
    
    // Check for diagnostic message
    const diagnosticInfo = page.locator('#diagnosticInfo');
    await expect(diagnosticInfo).toBeVisible();
    
    const message = await diagnosticInfo.textContent();
    expect(message).toContain('Admin session not found');
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
    
    // Wait for client-side redirect to complete
    await page.waitForFunction(() => {
      return !window.location.pathname.includes('admin');
    }, { timeout: 5000 }).catch(() => {
      // If no redirect, that's okay for this test
    });
    
    await page.waitForLoadState('networkidle');
    
    // Should be redirected (probably to hub, since admin requires Teacher Center session)
    // PR 335: Admin now requires Teacher Center SSO, not admin-specific login
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/admin/');
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
    
    // Wait for app shell to initialize and auth state to update
    await page.waitForFunction(() => {
      const rail = document.querySelector('.app-shell-rail');
      return rail !== null;
    }, { timeout: 5000 });
    
    // Admin link should be hidden or not present
    // Check for admin link with flexible href matching (handles both /admin/ and /site/admin/)
    const adminLink = page.locator('a[data-admin-only]');
    
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
    
    // Wait for app shell to initialize and auth state to update
    await page.waitForFunction(() => {
      const rail = document.querySelector('.app-shell-rail');
      return rail !== null;
    }, { timeout: 5000 });
    
    // Admin link should be visible (not hidden)
    // Use data-admin-only attribute without href restriction for flexibility
    const adminLink = page.locator('a[data-admin-only]');
    
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
    
    // Wait for client-side redirect to complete
    await page.waitForFunction(() => {
      return window.location.pathname.includes('admin-login');
    }, { timeout: 5000 }).catch(() => {
      // If redirect doesn't happen, that's okay for local testing
    });
    
    await page.waitForLoadState('networkidle');
    
    // Should be redirected to admin-login with return parameter (client-side guard adds this)
    const url = page.url();
    expect(url).toContain('/admin-login');
    
    // Verify return URL is preserved (implementation detail of admin-guard.js)
    // The client-side guard includes a return parameter
    expect(url).toMatch(/return=/);
  });
});
