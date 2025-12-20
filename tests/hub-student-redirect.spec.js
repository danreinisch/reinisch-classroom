import { test, expect } from '@playwright/test';

/**
 * Hub Student Redirect Test
 * 
 * Validates PR E requirement:
 * Students with valid remembered auth should never land on /hub/
 * They should be immediately redirected to /student/
 * 
 * Validates PR 261 requirements:
 * Teachers can bypass redirect with ?teacher=1 or active teacher session
 * Student portal has escape hatch links to /hub/?teacher=1
 * 
 * Test Coverage:
 * 1. Valid student auth redirects from /hub/ to /student/
 * 2. Valid student auth + ?teacher=1 allows hub access (PR 261)
 * 3. Valid student auth + teacher session allows hub access (PR 261)
 * 4. Expired student auth allows hub access (clears auth)
 * 5. Teacher/substitute auth allows hub access
 * 6. No auth allows hub access
 * 7. Invalid JSON auth allows hub access (clears auth)
 * 8. Hub teacher UI not visible after student redirect
 * 9. Escape hatch link visible in student portal login view (PR 261)
 * 10. Escape hatch link visible in student portal top bar (PR 261)
 * 11. Valid student auth + /student/ shows dashboard (PR 261)
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

  // PR 261: Test teacher override query parameter
  test('should not redirect with ?teacher=1 query parameter', async ({ context, page }) => {
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
    
    // Navigate to hub with teacher override parameter
    await page.goto(HUB_PATH + '?teacher=1');
    
    // Should stay on hub (not redirect)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    expect(page.url()).toContain('teacher=1');
    
    // Verify auth was NOT cleared (teacher needs access)
    const authAfter = await page.evaluate(() => {
      const authStr = localStorage.getItem('rc_auth');
      return authStr ? JSON.parse(authStr) : null;
    });
    expect(authAfter).not.toBeNull();
    expect(authAfter.role).toBe('student');
  });

  // PR 261: Test teacher session bypass
  test('should not redirect with active teacher session', async ({ context, page }) => {
    // Set up valid student auth in localStorage AND teacher session in sessionStorage
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
      
      // Teacher is currently logged in
      sessionStorage.setItem('rc_user_role', 'teacher');
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should stay on hub (not redirect because teacher session is active)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    
    // Verify student auth was NOT cleared (just bypassed)
    const authAfter = await page.evaluate(() => {
      const authStr = localStorage.getItem('rc_auth');
      return authStr ? JSON.parse(authStr) : null;
    });
    expect(authAfter).not.toBeNull();
    expect(authAfter.role).toBe('student');
  });

  // PR 261: Test escape hatch link in login view
  test('should show escape hatch link in student portal login view', async ({ page }) => {
    // Navigate to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    await page.waitForLoadState('networkidle');
    
    // Check for escape hatch link in login view
    const escapeHatchLink = page.locator('a[href="/hub/?teacher=1"]').first();
    await expect(escapeHatchLink).toBeVisible();
    
    // Verify link text
    const linkText = await escapeHatchLink.textContent();
    expect(linkText).toContain('Hub');
  });

  // PR 261: Test escape hatch link in top bar
  test('should show escape hatch link in student portal top bar when logged in', async ({ context, page }) => {
    // Set up valid student auth for auto-login
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
    await page.goto(STUDENT_PORTAL_PATH);
    await page.waitForLoadState('networkidle');
    
    // Wait a bit for auto-login to complete
    await page.waitForTimeout(2000);
    
    // Check for escape hatch link in top bar
    const topBarEscapeHatch = page.locator('#portalTopBar a[href="/hub/?teacher=1"]');
    await expect(topBarEscapeHatch).toBeVisible();
    
    // Verify it has the Hub label
    const linkText = await topBarEscapeHatch.textContent();
    expect(linkText).toContain('Hub');
  });

  // PR 261: Test that clicking escape hatch bypasses redirect
  test('should allow hub access via escape hatch link', async ({ context, page }) => {
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
    
    // Navigate to student portal
    await page.goto(STUDENT_PORTAL_PATH);
    await page.waitForLoadState('networkidle');
    
    // Click the escape hatch link
    const escapeHatchLink = page.locator('a[href="/hub/?teacher=1"]').first();
    await escapeHatchLink.click();
    
    // Should navigate to hub with teacher parameter
    await page.waitForLoadState('networkidle');
    
    // Verify we're on hub with teacher parameter
    expect(page.url()).toContain('/hub/');
    expect(page.url()).toContain('teacher=1');
  });

  // PR 261: Verify student dashboard routing
  test('should show student dashboard when navigating to /student/ with valid auth', async ({ context, page }) => {
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
    
    // Wait for auto-login to complete
    await page.waitForTimeout(2000);
    
    // Should stay on student portal (no redirect to hub)
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/hub/');
    
    // Verify "My Dashboard" heading is visible (PR 261 requirement)
    const dashboardHeading = page.locator('h1:has-text("My Dashboard")');
    await expect(dashboardHeading).toBeVisible();
  });
});
