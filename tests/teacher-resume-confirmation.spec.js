import { test, expect } from "@playwright/test";

/**
 * Teacher Session Resume Confirmation Test (PR 267)
 *
 * Validates that:
 * 1. Hub does NOT auto-enter teacher center when prior session exists
 * 2. Resume confirmation banner appears instead
 * 3. "Resume" button enters teacher center
 * 4. "Stay signed out" clears all session state and stays in hub
 * 5. clearAllAuthState clears all relevant storage keys
 */

test.describe("Teacher Session Resume Confirmation (PR 267)", () => {
  test("should NOT auto-enter teacher center on hub load with prior session", async ({ page }) => {
    // Intercept teacher-session with valid session
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

    // Wait a moment for any initialization
    await page.waitForTimeout(1000);

    // Verify teacher view is NOT shown automatically
    const teacherView = await page.locator("#view-teacher");
    const isVisible = await teacherView.isVisible();
    expect(isVisible).toBe(false);

    // Verify hub content is shown (not entered teacher center)
    const hubContent = await page.locator(".header");
    await expect(hubContent).toBeVisible();
  });

  test("should show resume confirmation banner when prior session detected", async ({ page }) => {
    // Intercept teacher-session with valid session
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

    // Wait for banner to appear
    await page.waitForTimeout(1000);

    // Verify resume banner is visible
    const banner = await page.locator("#teacherResumeBanner");
    await expect(banner).toBeVisible();

    // Verify banner text
    await expect(banner).toContainText("Resume Teacher Session?");
    await expect(banner).toContainText("prior teacher session was detected");

    // Verify buttons exist
    const resumeBtn = await page.locator("#btnResumeTeacher");
    await expect(resumeBtn).toBeVisible();
    await expect(resumeBtn).toHaveText("Resume");

    const stayOutBtn = await page.locator("#btnStaySignedOut");
    await expect(stayOutBtn).toBeVisible();
    await expect(stayOutBtn).toHaveText("Stay signed out");
  });

  test("should enter teacher center when Resume button is clicked", async ({ page }) => {
    // Intercept teacher-session with valid session
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

    // Wait for banner
    await page.waitForTimeout(1000);

    // Close sign-in modal if it appears
    const signInModal = await page.locator("#signInModal");
    if (await signInModal.isVisible()) {
      await page.click('button:has-text("Cancel")').catch(() => {});
      await page.waitForTimeout(500);
    }

    // Verify banner is visible
    const banner = await page.locator("#teacherResumeBanner");
    await expect(banner).toBeVisible();

    // Click Resume button
    await page.click("#btnResumeTeacher");

    // Wait for transition
    await page.waitForTimeout(500);

    // Verify banner is hidden
    await expect(banner).not.toBeVisible();

    // Verify teacher view is shown
    const teacherView = await page.locator("#view-teacher");
    await expect(teacherView).toBeVisible();

    // Verify user chip shows "Teacher"
    const userChip = await page.locator("#currentUserChip");
    await expect(userChip).toHaveText("Teacher");
  });

  test('should clear all state and stay in hub when "Stay signed out" is clicked', async ({
    page,
  }) => {
    // Intercept teacher-session with valid session
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

    // Set some session/local storage keys to verify they get cleared
    await page.goto("/hub/");
    await page.evaluate(() => {
      sessionStorage.setItem("rc_user_role", "teacher");
      sessionStorage.setItem("rc_user_code", "TEST123");
      sessionStorage.setItem("__hubStudentRedirected", "true");
      localStorage.setItem("rc_auth_expires", "12345678");
    });

    // Wait for banner
    await page.waitForTimeout(1000);

    // Close sign-in modal if it appears
    const signInModal = await page.locator("#signInModal");
    if (await signInModal.isVisible()) {
      await page.click('button:has-text("Cancel")').catch(() => {});
      await page.waitForTimeout(500);
    }

    // Verify banner is visible
    const banner = await page.locator("#teacherResumeBanner");
    await expect(banner).toBeVisible();

    // Click Stay signed out button
    await page.click("#btnStaySignedOut");

    // Wait for state clearing
    await page.waitForTimeout(500);

    // Verify banner is hidden
    await expect(banner).not.toBeVisible();

    // Verify teacher view is NOT shown
    const teacherView = await page.locator("#view-teacher");
    const isVisible = await teacherView.isVisible();
    expect(isVisible).toBe(false);

    // Verify all storage keys are cleared
    const storageState = await page.evaluate(() => {
      return {
        session: {
          rc_user_role: sessionStorage.getItem("rc_user_role"),
          rc_user_code: sessionStorage.getItem("rc_user_code"),
          __hubStudentRedirected: sessionStorage.getItem("__hubStudentRedirected"),
        },
        local: {
          rc_auth: localStorage.getItem("rc_auth"),
          rc_auth_expires: localStorage.getItem("rc_auth_expires"),
        },
      };
    });

    expect(storageState.session.rc_user_role).toBeNull();
    expect(storageState.session.rc_user_code).toBeNull();
    expect(storageState.session.__hubStudentRedirected).toBeNull();
    expect(storageState.local.rc_auth).toBeNull();
    expect(storageState.local.rc_auth_expires).toBeNull();
  });

  test("should not show banner when no prior session exists", async ({ page }) => {
    // Intercept teacher-session with 401 (no session)
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

    // Wait a moment
    await page.waitForTimeout(1000);

    // Verify banner is NOT visible
    const banner = await page.locator("#teacherResumeBanner");
    await expect(banner).not.toBeVisible();

    // Verify teacher view is NOT shown
    const teacherView = await page.locator("#view-teacher");
    const isVisible = await teacherView.isVisible();
    expect(isVisible).toBe(false);
  });

  test('should show banner again if "Teacher Center" button is clicked with pending session', async ({
    page,
  }) => {
    // Intercept teacher-session with valid session
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

    // Wait for banner
    await page.waitForTimeout(1000);

    // Close sign-in modal if it appears
    const signInModal = await page.locator("#signInModal");
    if (await signInModal.isVisible()) {
      await page.click('button:has-text("Cancel")').catch(() => {});
    }

    // Verify banner is visible
    const banner = await page.locator("#teacherResumeBanner");
    await expect(banner).toBeVisible();

    // Hide banner manually (simulate dismissing it somehow)
    await page.evaluate(() => {
      document.getElementById("teacherResumeBanner").style.display = "none";
    });

    // Verify banner is hidden
    await expect(banner).not.toBeVisible();

    // Click Teacher Center button
    await page.click("#btnTeacher");

    // Wait a moment
    await page.waitForTimeout(500);

    // Verify banner is shown again
    await expect(banner).toBeVisible();
  });
});
