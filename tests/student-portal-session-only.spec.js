import { test, expect } from '@playwright/test';

/**
 * Student Portal Session-Only Authentication Tests
 * PR 266: Disable localStorage auto-login bootstrap + eliminate student login flash
 * 
 * Validates that:
 * 1. No auto-login from localStorage (session-only auth)
 * 2. Students must login again after closing tab/browser
 * 3. /student/ shows login reliably without flash
 * 4. Legacy localStorage.rc_auth is cleaned up
 * 5. Valid deep link /student/?auto=1&code=... still works
 * 6. sessionStorage sessions work for same-tab reload
 */

test.describe('Student Portal Session-Only Authentication (PR 266)', () => {
  
  test('should show login when visiting /student/ in fresh context (no localStorage auto-login)', async ({ page }) => {
    // Mock endpoints to prevent actual API calls
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Navigate to student portal in a fresh context
    await page.goto('/site/student/');
    await page.waitForLoadState('networkidle');
    
    // Should NOT auto-login, should show login view
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible({ timeout: 5000 });
    
    // Dashboard should NOT be visible
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeHidden();
    
    // Verify console shows no auto-login
    const logs = [];
    page.on('console', msg => {
      if (msg.text().includes('[auto-login]')) {
        logs.push(msg.text());
      }
    });
    
    // Wait a bit for any console logs
    await page.waitForTimeout(1000);
    
    // Should see "No valid auto-login source" message
    const hasNoAutoLoginLog = logs.some(log => 
      log.includes('No valid auto-login source') || 
      log.includes('No session found')
    );
    expect(hasNoAutoLoginLog).toBe(true);
  });

  test('should clear and ignore legacy localStorage.rc_auth', async ({ context, page }) => {
    // Set up legacy localStorage.rc_auth (simulating old client)
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S010',
        name: 'Student 10',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // Valid for 24 hours
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
      localStorage.setItem('rc_auth_expires', String(auth.expiresAt));
    });
    
    // Mock endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S010', name: 'Student 10', active: true }
        ])
      });
    });
    
    // Navigate to student portal
    await page.goto('/site/student/');
    await page.waitForLoadState('networkidle');
    
    // Should show login (not auto-login from localStorage)
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible({ timeout: 5000 });
    
    // Dashboard should NOT be visible
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeHidden();
    
    // Verify localStorage.rc_auth was cleared
    const rcAuthCleared = await page.evaluate(() => {
      return localStorage.getItem('rc_auth') === null;
    });
    expect(rcAuthCleared).toBe(true);
    
    // Verify legacy rc_auth_expires was cleared
    const rcAuthExpiresCleared = await page.evaluate(() => {
      return localStorage.getItem('rc_auth_expires') === null;
    });
    expect(rcAuthExpiresCleared).toBe(true);
  });

  test('should succeed with valid deep link /student/?auto=1&code=...', async ({ page }) => {
    // Mock endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S010', name: 'Student 10', active: true }
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
            { code: 'S010', name: 'Student 10', active: true }
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
    
    await page.route('**/.netlify/functions/goals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Navigate with valid deep link
    await page.goto('/site/student/?auto=1&code=S010&name=Student10');
    await page.waitForLoadState('networkidle');
    
    // Should show dashboard (auto-login succeeded)
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
    
    // Login view should be hidden
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeHidden();
  });

  test('should NOT flash login UI during valid auto-login', async ({ page }) => {
    // Track login view visibility
    let loginViewWasVisible = false;
    
    // Mock endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S010', name: 'Student 10', active: true }
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
            { code: 'S010', name: 'Student 10', active: true }
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
    
    await page.route('**/.netlify/functions/goals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Set up visibility watcher
    page.on('load', async () => {
      const loginView = page.locator('#loginView');
      const isVisible = await loginView.isVisible().catch(() => false);
      if (isVisible) {
        loginViewWasVisible = true;
      }
    });
    
    // Navigate with valid auto-login
    await page.goto('/site/student/?auto=1&code=S010&name=Student10');
    await page.waitForLoadState('networkidle');
    
    // Check again after load
    const loginView = page.locator('#loginView');
    const isVisibleNow = await loginView.isVisible().catch(() => false);
    if (isVisibleNow) {
      loginViewWasVisible = true;
    }
    
    // Login view should NEVER have been visible
    expect(loginViewWasVisible).toBe(false);
    
    // Dashboard should be visible
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
  });

  test('should allow same-tab reload with sessionStorage', async ({ context, page }) => {
    // Set up active sessionStorage (simulating logged-in session)
    await context.addInitScript(() => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', 'S010');
    });
    
    // Mock endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S010', name: 'Student 10', active: true }
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
            { code: 'S010', name: 'Student 10', active: true }
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
    
    await page.route('**/.netlify/functions/goals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Navigate to student portal
    await page.goto('/site/student/');
    await page.waitForLoadState('networkidle');
    
    // Should show dashboard (session restored)
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
    
    // Login view should be hidden
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeHidden();
  });

  test('should show login deterministically after logout', async ({ page }) => {
    // Mock endpoints
    await page.route('**/.netlify/functions/student-login', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      
      if (postData.code === 'S010' && postData.password === 'S010') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            code: 'S010',
            name: 'Student 10'
          })
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'Invalid credentials'
          })
        });
      }
    });
    
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S010', name: 'Student 10', active: true }
        ])
      });
    });
    
    await page.route('**/.netlify/functions/assignment-instances*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    await page.route('**/.netlify/functions/goals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Navigate to student portal
    await page.goto('/site/student/');
    await page.waitForLoadState('networkidle');
    
    // Login
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible({ timeout: 5000 });
    
    const codeField = page.locator('#loginCode');
    await codeField.fill('S010');
    
    const passwordField = page.locator('#loginPassword');
    await passwordField.fill('S010');
    
    const loginButton = page.locator('#btnStudentLogin');
    await loginButton.click();
    
    // Wait for dashboard
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
    
    // Now logout
    const logoutButton = page.locator('#portalLogoutBtn');
    await logoutButton.click();
    
    // Should redirect to root
    await page.waitForURL('/', { timeout: 5000 });
    
    // Now navigate back to student portal
    await page.goto('/site/student/');
    await page.waitForLoadState('networkidle');
    
    // Should show login again (no auto-login)
    await expect(loginView).toBeVisible({ timeout: 5000 });
    await expect(dashboardView).toBeHidden();
    
    // Verify sessionStorage was cleared
    const sessionCleared = await page.evaluate(() => {
      return sessionStorage.getItem('rc_user_code') === null &&
             sessionStorage.getItem('rc_user_role') === null;
    });
    expect(sessionCleared).toBe(true);
  });

  test('should not auto-login with deep link missing code', async ({ page }) => {
    // Navigate with auto=1 but no code
    await page.goto('/site/student/?auto=1');
    await page.waitForLoadState('networkidle');
    
    // Should NOT auto-login - sessionStorage should not be set
    const sessionNotSet = await page.evaluate(() => {
      return sessionStorage.getItem('rc_user_code') === null;
    });
    expect(sessionNotSet).toBe(true);
    
    // Should show login view
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible({ timeout: 5000 });
  });

  test('should not auto-login with deep link with empty code', async ({ page }) => {
    // Navigate with auto=1 and empty code
    await page.goto('/site/student/?auto=1&code=');
    await page.waitForLoadState('networkidle');
    
    // Should NOT auto-login - sessionStorage should not be set
    const sessionNotSet = await page.evaluate(() => {
      return sessionStorage.getItem('rc_user_code') === null;
    });
    expect(sessionNotSet).toBe(true);
    
    // Should show login view
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible({ timeout: 5000 });
  });

  test('should not auto-login with deep link with whitespace-only code', async ({ page }) => {
    // Navigate with auto=1 and whitespace-only code
    await page.goto('/site/student/?auto=1&code=%20%20%20');
    await page.waitForLoadState('networkidle');
    
    // Should NOT auto-login - sessionStorage should not be set
    const sessionNotSet = await page.evaluate(() => {
      return sessionStorage.getItem('rc_user_code') === null;
    });
    expect(sessionNotSet).toBe(true);
    
    // Should show login view
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible({ timeout: 5000 });
  });

  test('should cleanup __autoLoginOk flag after successful login', async ({ page }) => {
    // Mock endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S010', name: 'Student 10', active: true }
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
            { code: 'S010', name: 'Student 10', active: true }
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
    
    await page.route('**/.netlify/functions/goals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Navigate with valid deep link
    await page.goto('/site/student/?auto=1&code=S010&name=Student10');
    await page.waitForLoadState('networkidle');
    
    // Wait for dashboard
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
    
    // Verify the auto-login style was removed
    const styleRemoved = await page.evaluate(() => {
      const style = document.getElementById('auto-login-style');
      return style === null;
    });
    expect(styleRemoved).toBe(true);
  });
});
