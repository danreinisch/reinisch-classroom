import { test, expect } from "@playwright/test";

/**
 * Teacher Admin Role Normalization Test
 *
 * Validates that:
 * 1. Hub accepts both "teacher" and "admin" roles from teacher-session
 * 2. Admin users can access teacher view
 * 3. Role normalization logging works correctly
 */

// Helper function to dismiss sign-in modal if visible
async function dismissSignInModal(page) {
  const signInModal = await page.locator("#signInModal");
  if (await signInModal.isVisible()) {
    await page.click('button:has-text("Cancel")').catch(() => {});
  }
}

test.describe("Teacher Admin Role Normalization", () => {
  test("should accept admin role from teacher-session and show teacher view", async ({
    page,
  }) => {
    const consoleLogs = [];

    // Capture console messages
    page.on("console", (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Intercept teacher-session calls with admin role
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          role: "teacher", // Normalized from admin
          raw_role: "admin",
          username: "testadmin",
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

    // Click Teacher button to trigger session check
    await page.click("#btnTeacher");

    // Wait for session restoration
    await page.waitForTimeout(1500);

    // Verify resume banner is shown (session detected)
    const resumeBanner = await page.locator("#teacherResumeBanner");
    await expect(resumeBanner).toBeVisible();

    // Click resume button
    await page.click("#btnResumeTeacher");

    // Wait for teacher view to appear
    await page.waitForTimeout(500);

    // Verify teacher view is shown
    const teacherView = await page.locator("#view-teacher");
    await expect(teacherView).toBeVisible();

    // Verify user chip shows "Teacher"
    const userChip = await page.locator("#currentUserChip");
    await expect(userChip).toHaveText("Teacher");

    // Verify session check logging includes role info
    const sessionLogs = consoleLogs.filter(
      (log) =>
        log.text.includes("Session check result") ||
        log.text.includes("Prior session detected")
    );
    expect(sessionLogs.length).toBeGreaterThan(0);
  });

  test("should accept teacher role from teacher-session and show teacher view", async ({
    page,
  }) => {
    // Intercept teacher-session calls with teacher role
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

    // Click Teacher button to trigger session check
    await page.click("#btnTeacher");

    // Wait for session restoration
    await page.waitForTimeout(1500);

    // Verify resume banner is shown (session detected)
    const resumeBanner = await page.locator("#teacherResumeBanner");
    await expect(resumeBanner).toBeVisible();

    // Click resume button
    await page.click("#btnResumeTeacher");

    // Wait for teacher view to appear
    await page.waitForTimeout(500);

    // Verify teacher view is shown
    const teacherView = await page.locator("#view-teacher");
    await expect(teacherView).toBeVisible();

    // Verify user chip shows "Teacher"
    const userChip = await page.locator("#currentUserChip");
    await expect(userChip).toHaveText("Teacher");
  });

  test("should show diagnostic logs when teacher view is shown", async ({
    page,
  }) => {
    const consoleLogs = [];

    // Capture console messages
    page.on("console", (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Intercept teacher-session calls
    await page.route("**/.netlify/functions/teacher-session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          role: "teacher",
          raw_role: "admin",
          username: "testadmin",
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

    // Wait for session check
    await page.waitForTimeout(1000);

    // Click resume button if banner appears
    const resumeBanner = await page.locator("#teacherResumeBanner");
    if (await resumeBanner.isVisible()) {
      await page.click("#btnResumeTeacher");
      await page.waitForTimeout(500);
    }

    // Verify showTeacher diagnostic log is present
    const showTeacherLogs = consoleLogs.filter(
      (log) =>
        log.text.includes("showTeacher() called") ||
        log.text.includes("Teacher view display set")
    );
    expect(showTeacherLogs.length).toBeGreaterThan(0);

    // Verify session check result log is present
    const sessionLogs = consoleLogs.filter((log) =>
      log.text.includes("Session check result")
    );
    expect(sessionLogs.length).toBeGreaterThan(0);
  });
});
