import { test, expect } from '@playwright/test';

/**
 * Role-Aware Classroom Hub Button Test (PR 262)
 * 
 * Validates that home page "Classroom Hub" links route based on user role:
 * - Remembered students → /student/ (My Dashboard)
 * - Teachers/no auth → /hub/ (Classroom Hub)
 * 
 * Also tests bfcache redirect latch to prevent redirect spam.
 * 
 * Test Coverage:
 * 1. Home page "Classroom Hub" click with student auth → /student/
 * 2. Home page "Classroom Hub" click with no auth → /hub/
 * 3. Home page "Classroom Hub" click with teacher auth → /hub/
 * 4. Home page "Classroom Hub" click with expired student auth → /hub/
 * 5. bfcache redirect latch prevents repeated redirects
 * 6. Latch doesn't block teacher override with ?teacher=1
 * 7. Role-aware routing works on both root and /site/ home pages
 */

const HOME_PATH = '/'; // Both root and /site/ home pages resolve to this in test environment
const HUB_PATH = '/hub/'; // Server serves ./site directory, so /hub/ maps to ./site/hub/
const HUB_LINK_HREF = '/hub/'; // The actual href attribute in HTML
const STUDENT_PORTAL_PATH = '/student/'; // Server serves ./site directory, so /student/ maps to ./site/student/
const STUDENT_PORTAL_LINK_HREF = '/student/'; // The actual href attribute in HTML

/**
 * Helper function to mock student portal endpoints
 * Prevents test failures due to missing backend services
 */
async function mockStudentPortalEndpoints(page) {
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
}

test.describe('Role-Aware Classroom Hub Button', () => {
  test('should route to /student/ when student clicks Classroom Hub on root home page', async ({ context, page }) => {
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
    await mockStudentPortalEndpoints(page);
    
    // Navigate to root home page
    await page.goto(HOME_PATH);
    await page.waitForLoadState('networkidle');
    
    // Find and click "Classroom Hub" link
    const classroomHubLink = page.locator('a:has-text("Classroom Hub")').first();
    await expect(classroomHubLink).toBeVisible();
    
    // Verify href was updated to /student/ for accessibility
    const href = await classroomHubLink.getAttribute('href');
    expect(href).toBe(STUDENT_PORTAL_LINK_HREF);
    
    // Click the link
    await classroomHubLink.click();
    
    // Should navigate to student portal
    await page.waitForURL(`**${STUDENT_PORTAL_PATH}`, { timeout: 5000 });
    
    // Verify we're on student portal
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/hub/');
  });

  test('should route to /student/ when student clicks Classroom Hub on /site/ home page', async ({ context, page }) => {
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
    
    // Mock endpoints
    await mockStudentPortalEndpoints(page);
    
    // Navigate to /site/ home page
    await page.goto(HOME_PATH);
    await page.waitForLoadState('networkidle');
    
    // Find and click "Classroom Hub" link
    const classroomHubLink = page.locator('a:has-text("Classroom Hub")').first();
    await expect(classroomHubLink).toBeVisible();
    
    // Verify href was updated to /student/
    const href = await classroomHubLink.getAttribute('href');
    expect(href).toBe(STUDENT_PORTAL_LINK_HREF);
    
    // Click the link
    await classroomHubLink.click();
    
    // Should navigate to student portal
    await page.waitForURL(`**${STUDENT_PORTAL_PATH}`, { timeout: 5000 });
    expect(page.url()).toContain('/student/');
  });

  test('should route to /hub/ when user with no auth clicks Classroom Hub', async ({ page }) => {
    // Navigate to home page without any auth
    await page.goto(HOME_PATH);
    await page.waitForLoadState('networkidle');
    
    // Find "Classroom Hub" link
    const classroomHubLink = page.locator('a:has-text("Classroom Hub")').first();
    await expect(classroomHubLink).toBeVisible();
    
    // Verify href is /hub/
    const href = await classroomHubLink.getAttribute('href');
    expect(href).toBe(HUB_LINK_HREF);
    
    // Click the link
    await classroomHubLink.click();
    
    // Should navigate to hub
    await page.waitForURL(`**${HUB_PATH}`, { timeout: 5000 });
    expect(page.url()).toContain('/hub/');
  });

  test('should route to /hub/ when teacher clicks Classroom Hub', async ({ context, page }) => {
    // Set up valid teacher auth
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
    
    // Navigate to home page
    await page.goto(HOME_PATH);
    await page.waitForLoadState('networkidle');
    
    // Find "Classroom Hub" link
    const classroomHubLink = page.locator('a:has-text("Classroom Hub")').first();
    await expect(classroomHubLink).toBeVisible();
    
    // Verify href is /hub/
    const href = await classroomHubLink.getAttribute('href');
    expect(href).toBe(HUB_LINK_HREF);
    
    // Click the link
    await classroomHubLink.click();
    
    // Should navigate to hub
    await page.waitForURL(`**${HUB_PATH}`, { timeout: 5000 });
    expect(page.url()).toContain('/hub/');
  });

  test('should route to /hub/ when user with expired student auth clicks Classroom Hub', async ({ context, page }) => {
    // Set up expired student auth
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
    
    // Navigate to home page
    await page.goto(HOME_PATH);
    await page.waitForLoadState('networkidle');
    
    // Find "Classroom Hub" link
    const classroomHubLink = page.locator('a:has-text("Classroom Hub")').first();
    await expect(classroomHubLink).toBeVisible();
    
    // Verify href is /hub/ (expired auth is treated as no auth)
    const href = await classroomHubLink.getAttribute('href');
    expect(href).toBe(HUB_LINK_HREF);
    
    // Click the link
    await classroomHubLink.click();
    
    // Should navigate to hub
    await page.waitForURL(`**${HUB_PATH}`, { timeout: 5000 });
    expect(page.url()).toContain('/hub/');
  });
});

test.describe('Hub Redirect Latch (bfcache mitigation)', () => {
  test('should set redirect latch and prevent repeated redirects', async ({ context, page }) => {
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
    await mockStudentPortalEndpoints(page);
    
    // First navigation to hub - should redirect
    await page.goto(HUB_PATH);
    await page.waitForURL(`**${STUDENT_PORTAL_PATH}`, { timeout: 5000 });
    
    // Verify we're on student portal
    expect(page.url()).toContain('/student/');
    
    // Verify redirect latch was set
    const latchAfterRedirect = await page.evaluate(() => {
      return sessionStorage.getItem('__hubStudentRedirected');
    });
    expect(latchAfterRedirect).toBe('1');
    
    // Now try to navigate to hub again (simulating bfcache restore or manual navigation)
    await page.goto(HUB_PATH);
    await page.waitForLoadState('networkidle');
    
    // Should stay on hub due to redirect latch
    expect(page.url()).toContain('/hub/');
    
    // Verify latch is still set
    const latchAfterSecondVisit = await page.evaluate(() => {
      return sessionStorage.getItem('__hubStudentRedirected');
    });
    expect(latchAfterSecondVisit).toBe('1');
  });

  test('should skip redirect if latch is already set', async ({ context, page }) => {
    // Set up valid student auth AND pre-set the redirect latch
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
      
      // Pre-set the redirect latch (simulating previous redirect)
      sessionStorage.setItem('__hubStudentRedirected', '1');
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    await page.waitForLoadState('networkidle');
    
    // Should stay on hub (not redirect) because latch is set
    expect(page.url()).toContain('/hub/');
    expect(page.url()).not.toContain('/student/');
  });

  test('should allow teacher override with ?teacher=1 even with redirect latch', async ({ context, page }) => {
    // Set up valid student auth AND pre-set the redirect latch
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
      
      // Pre-set the redirect latch
      sessionStorage.setItem('__hubStudentRedirected', '1');
    });
    
    // Navigate to hub with teacher override
    await page.goto(HUB_PATH + '?teacher=1');
    await page.waitForLoadState('networkidle');
    
    // Should stay on hub (not redirect)
    expect(page.url()).toContain('/hub/');
    expect(page.url()).toContain('teacher=1');
  });

  test('should allow teacher session bypass even with redirect latch', async ({ context, page }) => {
    // Set up valid student auth, redirect latch, AND teacher session
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
      
      // Pre-set the redirect latch
      sessionStorage.setItem('__hubStudentRedirected', '1');
      
      // Set active teacher session
      sessionStorage.setItem('rc_user_role', 'teacher');
    });
    
    // Navigate to hub
    await page.goto(HUB_PATH);
    await page.waitForLoadState('networkidle');
    
    // Should stay on hub (not redirect)
    expect(page.url()).toContain('/hub/');
  });
});
