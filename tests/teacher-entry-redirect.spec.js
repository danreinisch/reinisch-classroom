import { test, expect } from "@playwright/test";

/**
 * Teacher Entry Redirect Test
 *
 * Validates that visiting /hub/?entry=teacher immediately redirects to /teacher/.
 * Also validates that next=/teacher/... parameter works correctly.
 */

test.describe("Teacher Entry Redirect", () => {
  test("should redirect directly to /teacher/ with entry=teacher parameter", async ({ page }) => {
    // Mock teacher-session endpoint (no session) - will redirect to login
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "No active session",
        }),
      });
    });

    // Navigate to hub with entry=teacher parameter
    await page.goto("/hub/?entry=teacher");

    // Should immediately redirect to /teacher/ then to /teacher/login/
    await page.waitForURL(/\/teacher\/login\//, { timeout: 5000 });

    // Verify we're on the login page with next parameter
    expect(page.url()).toContain("/teacher/login/");
    expect(page.url()).toContain("next=%2Fteacher%2F");
  });

  test("should redirect to next path when next=/teacher/... is provided", async ({ page }) => {
    // Mock teacher-session endpoint (no session) - will redirect to login
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "No active session",
        }),
      });
    });

    // Navigate to hub with next parameter pointing to /teacher/students
    await page.goto("/hub/?entry=teacher&next=/teacher/students");

    // Should immediately redirect to /teacher/students then to /teacher/login/
    await page.waitForURL(/\/teacher\/login\//, { timeout: 5000 });

    // Verify we're on the login page with next parameter for students page
    expect(page.url()).toContain("/teacher/login/");
    expect(page.url()).toContain("next=%2Fteacher%2Fstudents");
  });

  test("should navigate to /teacher/ when clicking gate button", async ({ page }) => {
    // Mock teacher-session endpoint (no session) - will redirect to login
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "No active session",
        }),
      });
    });

    // Navigate to hub WITHOUT entry=teacher parameter
    await page.goto("/hub/");
    await page.waitForLoadState("networkidle");

    // Click the teacher gate button (now a link)
    const gateTeacherBtn = page.locator("#gateTeacherBtn");
    await gateTeacherBtn.click({ timeout: 5000 });

    // Should navigate to /teacher/ then redirect to /teacher/login/
    await page.waitForURL(/\/teacher\/login\//, { timeout: 5000 });

    // Verify we're on the login page
    expect(page.url()).toContain("/teacher/login/");
  });

  test("should not create redirect loop if already on /teacher/ path", async ({ page }) => {
    // This test verifies the guard logic
    // If somehow we're already on /teacher/ path, we should not redirect again
    
    // Mock teacher-session endpoint (valid session)
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          role: "teacher",
          code: "test-teacher",
          name: "test-teacher",
        }),
      });
    });

    // Set up auth in localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem('rc_auth', JSON.stringify({
        role: 'teacher',
        code: 'test-teacher',
        name: 'test-teacher',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      }));
    });

    // Navigate directly to /teacher/ (simulating already being there)
    await page.goto("/teacher/");
    await page.waitForLoadState("networkidle");

    // Wait a bit to ensure no redirect occurs
    await page.waitForTimeout(1000);

    // Verify we're still on /teacher/ (no redirect loop)
    expect(page.url()).toContain("/teacher/");
  });
});
