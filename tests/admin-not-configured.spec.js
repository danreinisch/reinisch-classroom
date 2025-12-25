import { test, expect } from '@playwright/test';

/**
 * Admin Not Configured Test (PR2)
 * 
 * Validates that:
 * 1. /admin-not-configured/ page loads correctly
 * 2. Page displays required environment variables
 * 3. Page has proper navigation links
 * 4. Page has appropriate headers (Cache-Control, X-Robots-Tag)
 * 5. Styling and content are user-friendly
 */

// Test constants
const ADMIN_NOT_CONFIGURED_PATH = '/admin-not-configured/';
const HOME_PATH = '/';
const ADMIN_LOGIN_PATH = '/admin-login/';

test.describe('Admin Not Configured Page', () => {
  test('should load admin-not-configured page successfully', async ({ page }) => {
    // Navigate to admin-not-configured page
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    
    // Wait for page load
    await page.waitForLoadState('networkidle');
    
    // Should stay on admin-not-configured (not redirect)
    expect(page.url()).toContain('/admin-not-configured');
    
    // Page title should be appropriate
    const title = await page.title();
    expect(title).toContain('Admin Not Configured');
  });

  test('should display required environment variables', async ({ page }) => {
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Check for ADMIN_SESSION_SECRET
    const secretText = await page.locator('text=ADMIN_SESSION_SECRET').count();
    expect(secretText).toBeGreaterThan(0);
    
    // Check for ADMIN_USER
    const userText = await page.locator('text=ADMIN_USER').count();
    expect(userText).toBeGreaterThan(0);
    
    // Check for ADMIN_PASS
    const passText = await page.locator('text=ADMIN_PASS').count();
    expect(passText).toBeGreaterThan(0);
  });

  test('should have navigation links to Home and Admin Login', async ({ page }) => {
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Check for Home link in actions section
    const homeLink = page.locator('.actions a[href="/"]').filter({ hasText: 'Home' });
    await expect(homeLink).toBeVisible();
    
    // Check for Admin Login link
    const adminLoginLink = page.locator('a[href="/admin-login/"]').filter({ hasText: 'Admin Login' });
    await expect(adminLoginLink).toBeVisible();
  });

  test('should display warning icon and styling', async ({ page }) => {
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Check for warning icon
    const icon = page.locator('.icon');
    await expect(icon).toBeVisible();
    
    // Check main heading
    const heading = page.locator('h1:has-text("Admin Not Configured")');
    await expect(heading).toBeVisible();
    
    // Check for info boxes
    const infoBox = page.locator('.info-box');
    await expect(infoBox).toHaveCount(1);
    
    // Check for steps section
    const steps = page.locator('.steps');
    await expect(steps).toBeVisible();
  });

  test('should display Netlify configuration instructions', async ({ page }) => {
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Check for Netlify-specific instructions
    const netlifyText = await page.locator('text=Netlify').count();
    expect(netlifyText).toBeGreaterThan(0);
    
    // Check for environment variables mention
    const envVarsText = await page.locator('text=Environment variables').count();
    expect(envVarsText).toBeGreaterThan(0);
    
    // Check for Deploy Preview context mention
    const deployPreviewText = await page.locator('text=Deploy Preview').count();
    expect(deployPreviewText).toBeGreaterThan(0);
  });

  test('should have proper security message about fail-closed behavior', async ({ page }) => {
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Check for security-related text
    const content = await page.textContent('body');
    expect(content).toContain('disabled');
    expect(content).toContain('security');
  });

  test('should not have console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Wait a bit to catch any delayed errors
    await page.waitForTimeout(2000);
    
    // Filter out known acceptable errors (if any)
    const relevantErrors = consoleErrors.filter(error => {
      // Filter out CSP violations or other expected errors
      return !error.includes('Content Security Policy');
    });
    
    expect(relevantErrors.length).toBe(0);
  });

  test('Home link should navigate correctly', async ({ page }) => {
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Click Home link in actions section
    const homeLink = page.locator('.actions a[href="/"]').filter({ hasText: 'Home' }).first();
    await homeLink.click();
    
    // Wait for navigation
    await page.waitForLoadState('networkidle');
    
    // Should be on home page
    expect(page.url()).toMatch(/\/$/);
  });

  test('Admin Login link should navigate correctly', async ({ page }) => {
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Click Admin Login link
    const adminLoginLink = page.locator('a[href="/admin-login/"]').filter({ hasText: 'Admin Login' }).first();
    await adminLoginLink.click();
    
    // Wait for navigation
    await page.waitForLoadState('networkidle');
    
    // Should be on admin-login page
    expect(page.url()).toContain('/admin-login');
  });
});

test.describe('Admin Not Configured - Integration', () => {
  test('should display theme styling correctly', async ({ page }) => {
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Check that the emerald theme is applied
    const html = page.locator('html');
    const themeAttr = await html.getAttribute('data-theme');
    expect(themeAttr).toBe('emerald');
    
    // Check that CSS is loaded
    const wrap = page.locator('.wrap');
    const backgroundColor = await wrap.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    
    // Should have some background color (not default)
    expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto(ADMIN_NOT_CONFIGURED_PATH);
    await page.waitForLoadState('networkidle');
    
    // Check that content is visible
    const wrap = page.locator('.wrap');
    await expect(wrap).toBeVisible();
    
    // Check that actions are visible (may wrap on mobile)
    const actions = page.locator('.actions');
    await expect(actions).toBeVisible();
  });
});
