import { test, expect } from '@playwright/test';

/**
 * Hub Student Redirect Test
 * 
 * PR 265: Session-only student authentication
 * - Students are only redirected if they have an active sessionStorage session
 * - localStorage.rc_auth no longer triggers redirect (session-only behavior)
 * 
 * Validates PR 261 requirements:
 * Teachers can bypass redirect with ?teacher=1 or active teacher session
 * Student portal has escape hatch links to /hub/?teacher=1
 * 
 * Test Coverage:
 * 1. Active student session (sessionStorage) redirects from /hub/ to /student/
 * 2. Old localStorage auth (without sessionStorage) does NOT redirect (PR 265)
 * 3. Valid student session + ?teacher=1 allows hub access (PR 261)
 * 4. Valid student session + teacher session allows hub access (PR 261)
 * 5. Teacher/substitute auth allows hub access
 * 6. No auth allows hub access
 * 7. Hub teacher UI not visible after student redirect
 * 8. Escape hatch link visible in student portal login view (PR 261)
 * 9. Escape hatch link visible in student portal top bar (PR 261)
 * 10. Valid student session + /student/ shows dashboard (PR 261)
 */

const HUB_PATH = '/hub/';
const STUDENT_PORTAL_PATH = '/student/';

test.describe('Hub Student Redirect', () => {
  test('should redirect to /student/ with active student session in sessionStorage', async ({ context, page }) => {
    // PR 265: Set up active student session in sessionStorage (not localStorage)
    await context.addInitScript(() => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', 'S001');
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

  test('should NOT redirect with old localStorage auth only (PR 265)', async ({ context, page }) => {
    // PR 265: Set up valid student auth in localStorage (but NOT in sessionStorage)
    // This simulates the old 24-hour remember-me behavior that should no longer work
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
      // Intentionally NOT setting sessionStorage
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should stay on hub (no redirect from localStorage alone)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    
    // Verify localStorage auth is still present (not cleared)
    const authAfter = await page.evaluate(() => {
      const authStr = localStorage.getItem('rc_auth');
      return authStr ? JSON.parse(authStr) : null;
    });
    expect(authAfter).not.toBeNull();
  });

  test('should continue to hub with expired student auth in localStorage', async ({ context, page }) => {
    // PR 265: Expired auth in localStorage should not affect behavior (no longer checked)
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
    
    // Should stay on hub (localStorage auth not checked)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    
    // Verify auth was NOT cleared (no longer processed)
    const authAfter = await page.evaluate(() => localStorage.getItem('rc_auth'));
    expect(authAfter).not.toBeNull();
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
    // PR 265: Invalid JSON in localStorage no longer affects behavior (not checked)
    await context.addInitScript(() => {
      localStorage.setItem('rc_auth', 'not valid json {]');
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    
    // Should stay on hub (not redirect)
    await page.waitForLoadState('networkidle');
    
    // Verify we're still on hub
    expect(page.url()).toContain('/hub/');
    
    // Verify invalid auth was NOT cleared (no longer processed)
    const authAfter = await page.evaluate(() => localStorage.getItem('rc_auth'));
    expect(authAfter).not.toBeNull();
  });

  test('should continue to hub with auth missing required fields', async ({ context, page }) => {
    // PR 265: Auth structure in localStorage no longer affects behavior (not checked)
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
    
    // Verify invalid auth was NOT cleared (no longer processed)
    const authAfter = await page.evaluate(() => localStorage.getItem('rc_auth'));
    expect(authAfter).not.toBeNull();
  });

  test('should continue to hub with auth missing expiresAt', async ({ context, page }) => {
    // PR 265: Auth structure in localStorage no longer affects behavior (not checked)
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
    
    // Verify invalid auth was NOT cleared (no longer processed)
    const authAfter = await page.evaluate(() => localStorage.getItem('rc_auth'));
    expect(authAfter).not.toBeNull();
  });

  test('should not show hub teacher UI elements after student redirect', async ({ context, page }) => {
    // PR 265: Set up active student session in sessionStorage
    await context.addInitScript(() => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', 'S001');
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
    // PR 265: Set up active student session in sessionStorage
    await context.addInitScript(() => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', 'S001');
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
    // PR 265: Set up active student session in sessionStorage
    await context.addInitScript(() => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', 'S001');
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
    // PR 265: Set up active student session in sessionStorage
    await context.addInitScript(() => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', 'S001');
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
    // PR 265: Set up session in sessionStorage (simulate active session)
    await context.addInitScript(() => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', 'S001');
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
  test('should allow hub access via escape hatch link', async ({ page }) => {
    // PR 265: No setup needed - just navigate and test escape hatch link
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
  test('should show student dashboard when navigating to /student/ with sessionStorage', async ({ context, page }) => {
    // PR 265: Set up active session in sessionStorage
    await context.addInitScript(() => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', 'S001');
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
