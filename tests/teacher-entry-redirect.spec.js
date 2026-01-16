import { test, expect } from "@playwright/test";

/**
 * Teacher Entry Redirect Test
 *
 * Validates that visiting /hub/?entry=teacher redirects to /teacher/ after successful login.
 * Also validates that next=/teacher/... parameter works correctly.
 */

test.describe("Teacher Entry Redirect", () => {
  test("should redirect to /teacher/ after successful login with entry=teacher", async ({ page }) => {
    // Mock teacher-session endpoint (no session)
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

    // Mock teacher-login endpoint (successful login)
    await page.route("**/.netlify/functions/teacher-login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          username: "test-teacher",
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

    // Navigate to hub with entry=teacher parameter
    await page.goto("/hub/?entry=teacher");
    await page.waitForLoadState("networkidle");

    // Wait for teacher modal to be visible
    const teachModal = page.locator("#teachModal");
    await expect(teachModal).toBeVisible({ timeout: 5000 });

    // Fill in credentials
    await page.fill("#teachUser", "test-teacher");
    await page.fill("#teachPass", "test-password");

    // Click login button
    await page.click("#teachGo");

    // Wait for redirect to /teacher/
    await page.waitForURL("/teacher/", { timeout: 5000 });

    // Verify we're on the teacher page
    expect(page.url()).toContain("/teacher/");
  });

  test("should redirect to next path when next=/teacher/... is provided", async ({ page }) => {
    // Mock teacher-session endpoint (no session)
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

    // Mock teacher-login endpoint (successful login)
    await page.route("**/.netlify/functions/teacher-login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          username: "test-teacher",
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

    // Navigate to hub with next parameter
    await page.goto("/hub/?next=/teacher/students");
    await page.waitForLoadState("networkidle");

    // Wait for teacher modal to be visible
    const teachModal = page.locator("#teachModal");
    await expect(teachModal).toBeVisible({ timeout: 5000 });

    // Fill in credentials
    await page.fill("#teachUser", "test-teacher");
    await page.fill("#teachPass", "test-password");

    // Click login button
    await page.click("#teachGo");

    // Wait for redirect to /teacher/students
    await page.waitForURL("/teacher/students", { timeout: 5000 });

    // Verify we're on the correct teacher sub-page
    expect(page.url()).toContain("/teacher/students");
  });

  test("should not redirect when entry=teacher is not present", async ({ page }) => {
    // Mock teacher-session endpoint (no session)
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

    // Mock teacher-login endpoint (successful login)
    await page.route("**/.netlify/functions/teacher-login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          username: "test-teacher",
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

    // Navigate to hub WITHOUT entry=teacher parameter
    await page.goto("/hub/");
    await page.waitForLoadState("networkidle");

    // Click the teacher gate button
    const gateTeacherBtn = page.locator("#gateTeacherBtn");
    await gateTeacherBtn.click({ timeout: 5000 });

    // Wait for teacher modal to be visible
    const teachModal = page.locator("#teachModal");
    await expect(teachModal).toBeVisible({ timeout: 5000 });

    // Fill in credentials
    await page.fill("#teachUser", "test-teacher");
    await page.fill("#teachPass", "test-password");

    // Click login button
    await page.click("#teachGo");

    // Wait for page to settle
    await page.waitForTimeout(1000);

    // Verify we're still on /hub/ (no redirect)
    expect(page.url()).toContain("/hub/");
    expect(page.url()).not.toContain("/teacher/");

    // Verify teacher view is shown
    const teacherView = page.locator("#view-teacher");
    await expect(teacherView).toBeVisible({ timeout: 5000 });
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
