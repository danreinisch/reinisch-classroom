import { test, expect } from "@playwright/test";

/**
 * Teacher Session Check Test
 *
 * Validates that:
 * 1. Teacher-session check is deferred until a teacher/admin action is taken
 * 2. 401 response is handled gracefully (logged at debug level, no error banner)
 * 3. Valid session shows resume banner when teacher action is taken
 * 4. Teacher login continues to work correctly
 */

// Helper function to dismiss sign-in modal if visible
async function dismissSignInModal(page) {
  const signInModal = await page.locator("#signInModal");
  if (await signInModal.isVisible()) {
    await page.click('button:has-text("Cancel")').catch(() => {});
  }
}

test.describe("Teacher Session Check", () => {
  test("should NOT call teacher-session on initial Hub load", async ({ page }) => {
    let teacherSessionCalled = false;

    // Intercept teacher-session calls
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      teacherSessionCalled = true;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "No active session",
        }),
      });
    });

    // Mock student-roster for sign-in modal
    await page.route("**/.netlify/functions/student-roster", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          students: [{ code: "S001", active: true }],
          source: "mock",
        }),
      });
    });

    // Navigate to hub
    await page.goto("/hub/");

    // Wait a moment to ensure no automatic call fired
    await page.waitForTimeout(1000);

    // Verify teacher-session was NOT called on page load
    expect(teacherSessionCalled).toBe(false);
  });

  test("should call teacher-session when Teacher button is clicked", async ({ page }) => {
    let teacherSessionCallCount = 0;

    // Intercept teacher-session calls
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      teacherSessionCallCount++;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "No active session",
        }),
      });
    });

    // Mock student-roster
    await page.route("**/.netlify/functions/student-roster", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          students: [{ code: "S001", active: true }],
          source: "mock",
        }),
      });
    });

    // Navigate to hub
    await page.goto("/hub/");

    // Close sign-in modal if it appears
    await dismissSignInModal(page);

    // Click Teacher button
    await page.click("#btnTeacher");

    // Wait a moment
    await page.waitForTimeout(500);

    // Verify session was called once after clicking Teacher
    expect(teacherSessionCallCount).toBe(1);
  });

  test("should handle 401 response gracefully and show login modal", async ({ page }) => {
    const consoleLogs = [];

    // Capture console messages
    page.on("console", (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Intercept teacher-session calls with 401
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

    // Mock student-roster
    await page.route("**/.netlify/functions/student-roster", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          students: [{ code: "S001", active: true }],
          source: "mock",
        }),
      });
    });

    // Navigate to hub
    await page.goto("/hub/");

    // Close sign-in modal if it appears
    const signInModal = await page.locator("#signInModal");
    if (await signInModal.isVisible()) {
      await page.click('button:has-text("Cancel")').catch(() => {});
    }

    // Click Teacher button
    await page.click("#btnTeacher");

    // Wait for modal to appear
    await page.waitForTimeout(1000);

    // Verify teacher login modal is shown
    const teachModal = await page.locator("#teachModal");
    await expect(teachModal).toBeVisible();

    // Verify no error banners appeared
    const errorBanner = await page.locator('[style*="rgba(239,68,68"]').count();
    expect(errorBanner).toBe(0);

    // Verify 401 was NOT logged as error (should be debug level)
    const errorLogs = consoleLogs.filter((log) => log.type === "error" && log.text.includes("Session check") && log.text.includes("401"));
    expect(errorLogs.length).toBe(0);
  });

  test("should show resume banner if valid cookie exists", async ({ page }) => {
    // Intercept teacher-session calls with valid session
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          role: "teacher",
          username: "testteacher",
        }),
      });
    });

    // Mock student-roster
    await page.route("**/.netlify/functions/student-roster", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          students: [{ code: "S001", active: true }],
          source: "mock",
        }),
      });
    });

    // Navigate to hub
    await page.goto("/hub/");

    // Close sign-in modal if it appears
    await dismissSignInModal(page);

    // Trigger teacher-session check
    await page.click("#btnTeacher");

    // Wait for session check
    await page.waitForTimeout(1000);

    // Verify resume banner is shown
    const resumeBanner = await page.locator("#teacherResumeBanner");
    await expect(resumeBanner).toBeVisible();

    // Click Resume button
    await page.click("#btnResumeTeacher");

    // Wait for teacher view
    await page.waitForTimeout(500);

    // Verify teacher view is shown
    const teacherView = await page.locator("#view-teacher");
    await expect(teacherView).toBeVisible();

    // Verify user chip shows "Teacher"
    const userChip = await page.locator("#currentUserChip");
    await expect(userChip).toHaveText("Teacher");
  });
});
