import { test, expect } from "@playwright/test";

/**
 * Teacher Center Authentication Redirect Test
 *
 * Validates that:
 * 1. Unauthenticated users are redirected to /teacher/login/ when accessing /teacher/* pages
 * 2. Redirect includes 'next' parameter to return to original page after login
 * 3. Network errors don't trigger redirects
 * 4. Authenticated users can access teacher pages without redirect
 */

test.describe("Teacher Center Authentication Redirect", () => {
  test("should redirect to /teacher/login/ when accessing /teacher/ without authentication", async ({ page }) => {
    // Mock teacher-session endpoint to return 401
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "Unauthorized",
        }),
      });
    });

    // Navigate to teacher center
    await page.goto("/teacher/");

    // Wait for redirect to login page
    await page.waitForURL(/\/teacher\/login\//, { timeout: 5000 });

    // Verify redirect occurred with correct query parameters
    expect(page.url()).toContain("/teacher/login/");
    expect(page.url()).toContain("next=%2Fteacher%2F"); // URL encoded /teacher/
  });

  test("should redirect to /teacher/login/ when accessing /teacher/work/ without authentication", async ({ page }) => {
    // Mock teacher-session endpoint to return 401
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "Unauthorized",
        }),
      });
    });

    // Navigate to teacher work page
    await page.goto("/teacher/work/");

    // Wait for redirect to login page
    await page.waitForURL(/\/teacher\/login\//, { timeout: 5000 });

    // Verify redirect occurred with correct query parameters
    expect(page.url()).toContain("/teacher/login/");
    expect(page.url()).toContain("next=%2Fteacher%2Fwork%2F"); // URL encoded /teacher/work/
  });

  test("should NOT redirect on network errors (non-401 status)", async ({ page }) => {
    const consoleLogs = [];

    // Capture console messages
    page.on("console", (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Mock teacher-session endpoint to return 500 (server error)
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Internal Server Error",
        }),
      });
    });

    // Navigate to teacher center
    await page.goto("/teacher/");
    await page.waitForLoadState("networkidle");

    // Verify we're still on /teacher/ (no redirect on non-401 errors)
    expect(page.url()).toContain("/teacher/");

    // Verify warning was logged
    const warnings = consoleLogs.filter(
      (log) => log.type === "warning" && log.text.includes("Session check returned")
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("should NOT redirect when network fetch fails (catch block)", async ({ page }) => {
    const consoleLogs = [];

    // Capture console messages
    page.on("console", (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Mock teacher-session endpoint to fail with network error
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.abort("failed");
    });

    // Navigate to teacher center
    await page.goto("/teacher/");
    await page.waitForLoadState("networkidle");

    // Verify we're still on /teacher/ (no redirect on network errors)
    expect(page.url()).toContain("/teacher/");

    // Verify warning was logged
    const warnings = consoleLogs.filter(
      (log) =>
        log.type === "warning" &&
        log.text.includes("Session check failed")
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("should allow authenticated users to access teacher pages", async ({ page }) => {
    // Mock teacher-session endpoint to return 200 (valid session)
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          role: "teacher",
          username: "test-teacher",
        }),
      });
    });

    // Navigate to teacher center
    await page.goto("/teacher/work/");
    await page.waitForLoadState("networkidle");

    // Wait a bit
    await page.waitForTimeout(500);

    // Verify we're still on /teacher/work/ (no redirect for authenticated users)
    expect(page.url()).toContain("/teacher/work/");
  });
});
