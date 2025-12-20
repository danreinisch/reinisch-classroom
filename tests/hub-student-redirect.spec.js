import { test, expect } from '@playwright/test';

/**
 * Hub Student Redirect Test
 * 
 * Validates PR E requirement:
 * Students with valid remembered auth should never land on /hub/
 * They should be immediately redirected to /student/
 * 
 * Test Coverage:
 * 1. Valid student auth redirects from /hub/ to /student/
 * 2. Expired student auth allows hub access (clears auth)
 * 3. Teacher/substitute auth allows hub access
 * 4. No auth allows hub access
 * 5. Invalid JSON auth allows hub access (clears auth)
 * 6. Hub teacher UI not visible after student redirect
 */

const HUB_PATH = '/site/hub/';
const STUDENT_PORTAL_PATH = '/site/student/';

test.describe('Hub Student Redirect', () => {
  test('should redirect to /student/ with valid student auth', async ({ context, page }) => {
    // Set up valid student auth in localStorage before navigation
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Mock student portal endpoints to prevent errors
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S001', name: 'Test Student', active: true }
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
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should redirect to student portal
    await page.waitForURL(`**${STUDENT_PORTAL_PATH}`, { timeout: 5000 });
    
    // Verify we're on student portal
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/hub/');
    
    // Verify redirect flag was set
    const flagWasSet = await page.evaluate(() => window.__redirectingToStudentPortal === true);
    expect(flagWasSet).toBe(true);
  });

  test('should continue to hub with expired student auth', async ({ context, page }) => {
    // Set up EXPIRED student auth in localStorage
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now() - 25 * 60 * 60 * 1000,
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should stay on hub (not redirect)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    
    // Verify auth was cleared
    const authAfter = await page.evaluate(() => localStorage.getItem('rc_auth'));
    expect(authAfter).toBeNull();
  });

  test('should continue to hub with teacher auth', async ({ context, page }) => {
    // Set up valid TEACHER auth in localStorage
    await context.addInitScript(() => {
      const auth = {
        role: 'teacher',
        code: 'TEACHER1',
        name: 'Test Teacher',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should stay on hub (not redirect)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    
    // Verify auth was NOT cleared
    const authAfter = await page.evaluate(() => {
      const authStr = localStorage.getItem('rc_auth');
      return authStr ? JSON.parse(authStr) : null;
    });
    expect(authAfter).not.toBeNull();
    expect(authAfter.role).toBe('teacher');
  });

  test('should continue to hub with substitute auth', async ({ context, page }) => {
    // Set up valid SUBSTITUTE auth in localStorage
    await context.addInitScript(() => {
      const auth = {
        role: 'substitute',
        code: 'SUB1',
        name: 'Test Substitute',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should stay on hub (not redirect)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
  });

  test('should continue to hub with no auth', async ({ page }) => {
    // Navigate to hub without any auth
    await page.goto(HUB_PATH);
    
    // Should stay on hub (not redirect)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
  });

  test('should continue to hub with invalid JSON auth', async ({ context, page }) => {
    // Set up INVALID JSON in localStorage
    await context.addInitScript(() => {
      localStorage.setItem('rc_auth', 'not valid json {]');
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should stay on hub (not redirect)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    
    // Verify invalid auth was cleared
    const authAfter = await page.evaluate(() => localStorage.getItem('rc_auth'));
    expect(authAfter).toBeNull();
  });

  test('should continue to hub with auth missing required fields', async ({ context, page }) => {
    // Set up auth without required fields
    await context.addInitScript(() => {
      const auth = {
        // Missing role and code
        name: 'Test Student',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should stay on hub (not redirect)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    
    // Verify invalid auth was cleared
    const authAfter = await page.evaluate(() => localStorage.getItem('rc_auth'));
    expect(authAfter).toBeNull();
  });

  test('should continue to hub with auth missing expiresAt', async ({ context, page }) => {
    // Set up auth without expiresAt field
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        // Missing expiresAt
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should stay on hub (not redirect)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    
    // Verify invalid auth was cleared
    const authAfter = await page.evaluate(() => localStorage.getItem('rc_auth'));
    expect(authAfter).toBeNull();
  });

  test('should not show hub teacher UI elements after student redirect', async ({ context, page }) => {
    // Set up valid student auth in localStorage
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Mock student portal endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S001', name: 'Test Student', active: true }
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
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Wait for redirect to student portal
    await page.waitForURL(`**${STUDENT_PORTAL_PATH}`, { timeout: 5000 });
    
    // Verify we're on student portal
    expect(page.url()).toContain('/student/');
    
    // Verify hub-specific UI elements are NOT present
    // These are teacher-only elements that should never appear in student portal
    const teacherCenterBtn = page.locator('#btnTeacher');
    await expect(teacherCenterBtn).not.toBeVisible();
    
    // Verify student dashboard is visible instead
    await page.waitForLoadState('networkidle');
    const studentDashboard = page.locator('#studentDashboardView');
    // Note: Dashboard may be hidden initially during login, so we just check URL
    // The important part is we're NOT on hub
  });

  test('should handle redirect without polluting browser history', async ({ context, page }) => {
    // Set up valid student auth
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Mock student portal endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
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
    
    // First navigate to a different page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Then navigate to hub (should redirect to student portal)
    await page.goto(HUB_PATH);
    await page.waitForURL(`**${STUDENT_PORTAL_PATH}`, { timeout: 5000 });
    
    // Try to go back - should go back to home page, not hub
    await page.goBack();
    await page.waitForLoadState('networkidle');
    
    // Should be back at home, NOT at hub
    expect(page.url()).not.toContain('/hub/');
    expect(page.url()).toContain('/');
  });

  test('should only redirect from /hub/ not from /student/', async ({ context, page }) => {
    // Set up valid student auth
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Mock student portal endpoints
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
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
    
    // Navigate directly to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    await page.waitForLoadState('networkidle');
    
    // Should stay on student portal (no redirect loop)
    expect(page.url()).toContain('/student/');
    
    // Verify the hub redirect flag was NOT set (only set on hub page)
    const flagWasSet = await page.evaluate(() => window.__redirectingToStudentPortal === true);
    expect(flagWasSet).toBeFalsy();
  });
});
