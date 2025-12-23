/**
 * PR 315: Student Portal Login End-to-End Test
 * Validates the complete login flow with dashboard view
 */

import { test, expect } from '@playwright/test';

test.describe('PR 315: Student Portal Login End-to-End', () => {
  
  test('should show login form on initial visit', async ({ page }) => {
    // Navigate to student portal
    await page.goto('/student/');
    await page.waitForLoadState('networkidle');
    
    // Should show login view
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible();
    
    // Should NOT show dashboard view
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeHidden();
    
    // Should have login form elements
    await expect(page.locator('#studentCodeSelect')).toBeVisible();
    await expect(page.locator('#studentPassword')).toBeVisible();
    await expect(page.locator('#btnLogin')).toBeVisible();
  });
  
  test('should handle auto-login with query parameters', async ({ page }) => {
    // Mock student login endpoint
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          code: 'S005',
          name: 'S005'
        })
      });
    });
    
    // Mock student roster endpoint
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [{ code: 'S005', name: 'S005', active: true }]
        })
      });
    });
    
    // Navigate with auto-login parameters
    await page.goto('/student/?auto=1&code=S005');
    await page.waitForLoadState('networkidle');
    
    // Wait a bit for scripts to execute
    await page.waitForTimeout(500);
    
    // Should hide login view
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeHidden();
    
    // Should show dashboard view
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible();
    
    // Should display student code
    const studentCodeDisplay = page.locator('#studentCodeDisplay');
    await expect(studentCodeDisplay).toContainText('S005');
    
    // Should have logout button
    await expect(page.locator('#btnLogout')).toBeVisible();
  });
  
  test('should transition to dashboard after successful login', async ({ page }) => {
    // Mock student roster endpoint
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [{ code: 'S005', name: 'S005', active: true }]
        })
      });
    });
    
    // Mock student login endpoint
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          code: 'S005',
          name: 'S005'
        })
      });
    });
    
    // Navigate to student portal
    await page.goto('/student/');
    await page.waitForLoadState('networkidle');
    
    // Wait for roster to load
    await page.waitForTimeout(1000);
    
    // Fill in login form
    await page.selectOption('#studentCodeSelect', 'S005');
    await page.fill('#studentPassword', 'test123');
    
    // Click login button
    await page.click('#btnLogin');
    
    // Should redirect to auto-login URL (wait for navigation)
    await page.waitForURL(/\/student\/\?auto=1&code=S005/);
    
    // Wait for dashboard to appear
    await page.waitForTimeout(500);
    
    // Should show dashboard view
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible();
    
    // Should hide login view
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeHidden();
  });
  
  test('should clear session on logout', async ({ page }) => {
    // Set up session storage before navigation
    await page.addInitScript(() => {
      sessionStorage.setItem('rc_user_code', 'S005');
      sessionStorage.setItem('rc_user_role', 'student');
    });
    
    // Navigate to student portal
    await page.goto('/student/?auto=1&code=S005');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    // Should show dashboard
    await expect(page.locator('#studentDashboardView')).toBeVisible();
    
    // Click logout button
    await page.click('#btnLogout');
    
    // Should redirect to login page (removes query params)
    await page.waitForURL('/student/');
    
    // Should show login view
    await expect(page.locator('#loginView')).toBeVisible();
    
    // Verify session storage was cleared
    const sessionCode = await page.evaluate(() => sessionStorage.getItem('rc_user_code'));
    expect(sessionCode).toBeNull();
  });
  
  test('should not call teacher/admin/sub endpoints', async ({ page }) => {
    const teacherCalls = [];
    const adminCalls = [];
    const subCalls = [];
    
    // Track all network requests
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('teacher-') || url.includes('/teacher/')) {
        teacherCalls.push(url);
      }
      if (url.includes('admin-') || url.includes('/admin/')) {
        adminCalls.push(url);
      }
      if (url.includes('substitute-') || url.includes('/sub/')) {
        subCalls.push(url);
      }
    });
    
    // Navigate with auto-login
    await page.goto('/student/?auto=1&code=S005');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Verify no teacher/admin/sub calls were made
    expect(teacherCalls).toHaveLength(0);
    expect(adminCalls).toHaveLength(0);
    expect(subCalls).toHaveLength(0);
    
    console.log('[test] Verified: Zero teacher/admin/sub endpoint calls');
  });
});
