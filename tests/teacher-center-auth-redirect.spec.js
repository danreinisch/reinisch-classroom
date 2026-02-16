import { test, expect } from "@playwright/test";

/**
 * Teacher Center Authentication Redirect Test
 *
 * Validates that:
 * 1. Unauthenticated users are redirected to /hub/ when accessing /teacher/* pages
 * 2. Redirect loop prevention works correctly (no redirect if already on /hub/)
 * 3. sessionStorage flag prevents repeated redirect attempts
 * 4. Network errors don't trigger redirects
 * 5. Query parameter ?reason=session_expired is added to redirect URL
 */

test.describe("Teacher Center Authentication Redirect", () => {
  test("should redirect to /hub/ when accessing /teacher/ without authentication", async ({ page }) => {
    let redirectHappened = false;

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

    // Capture navigation events
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        if (url.includes("/hub/") && url.includes("reason=session_expired")) {
          redirectHappened = true;
        }
      }
    });

    // Navigate to teacher center
    await page.goto("/teacher/");

    // Wait for redirect to happen
    await page.waitForURL("**/hub/**", { timeout: 5000 });

    // Verify redirect occurred with correct query parameter
    expect(page.url()).toContain("/hub/");
    expect(page.url()).toContain("reason=session_expired");
    expect(redirectHappened).toBe(true);
  });

  test("should redirect to /hub/ when accessing /teacher/work/ without authentication", async ({ page }) => {
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

    // Wait for redirect to happen
    await page.waitForURL("**/hub/**", { timeout: 5000 });

    // Verify redirect occurred
    expect(page.url()).toContain("/hub/");
    expect(page.url()).toContain("reason=session_expired");
  });

  test("should NOT redirect if teacher-shell.js is on /hub/ page (loop prevention)", async ({ page }) => {
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

    // Mock student-roster to prevent network errors
    await page.route("**/.netlify/functions/student-roster", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          students: [],
          source: "mock",
        }),
      });
    });

    // Start on /hub/ page
    await page.goto("/hub/");
    await page.waitForLoadState("networkidle");

    // Verify we're still on /hub/ (no redirect loop)
    expect(page.url()).toContain("/hub/");
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
      (log) => log.type === "warning" && log.text.includes("Non-401 status")
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
        log.text.includes("Session check failed") &&
        log.text.includes("continuing without redirect")
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("should prevent redirect loop using sessionStorage flag", async ({ page }) => {
    const consoleLogs = [];
    let redirectCount = 0;

    // Capture console messages
    page.on("console", (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

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

    // Track navigation events
    page.on("framenavigated", () => {
      redirectCount++;
    });

    // Pre-set the sessionStorage flag to simulate a previous redirect attempt
    await page.addInitScript(() => {
      sessionStorage.setItem("tc_auth_redirect_attempted", "true");
    });

    // Navigate to teacher center
    await page.goto("/teacher/");
    await page.waitForLoadState("networkidle");

    // Verify we're still on /teacher/ (no redirect due to sessionStorage flag)
    expect(page.url()).toContain("/teacher/");

    // Verify warning was logged about redirect already attempted
    const warnings = consoleLogs.filter(
      (log) =>
        log.type === "warning" &&
        log.text.includes("Redirect already attempted in this session")
    );
    expect(warnings.length).toBeGreaterThan(0);

    // Verify only one navigation happened (initial page load, no redirect)
    expect(redirectCount).toBe(1);
  });

  test("should clear sessionStorage flag on successful authentication", async ({ page }) => {
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

    // Pre-set the sessionStorage flag
    await page.addInitScript(() => {
      sessionStorage.setItem("tc_auth_redirect_attempted", "true");
    });

    // Navigate to teacher center
    await page.goto("/teacher/");
    await page.waitForLoadState("networkidle");

    // Wait for page to load
    await page.waitForTimeout(500);

    // Verify sessionStorage flag was cleared
    const flagCleared = await page.evaluate(() => {
      return sessionStorage.getItem("tc_auth_redirect_attempted") === null;
    });
    expect(flagCleared).toBe(true);
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
