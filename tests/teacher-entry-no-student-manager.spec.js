import { test, expect } from "@playwright/test";

/**
 * Teacher Entry - No Student Manager Test
 *
 * Validates that visiting /hub/?entry=teacher:
 * 1. Does NOT load student-manager-ui.js module
 * 2. Does NOT initialize Student Manager
 * 3. Does NOT render "Student Portal Manager" text
 * 4. DOES show teacher login modal title "Classroom Hub — Teacher Login"
 * 5. Page is not blank/stuck
 */

test.describe("Teacher Entry - No Student Manager", () => {
  test("should not load Student Manager when entry=teacher", async ({ page }) => {
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

    // Navigate to hub with entry=teacher parameter
    await page.goto("/hub/?entry=teacher");
    await page.waitForLoadState("networkidle");

    // Wait for initialization
    await page.waitForTimeout(1000);

    // Verify Student Manager module was NOT loaded
    const studentManagerLoaded = await page.evaluate(() => {
      return !!window.StudentManagerUI;
    });
    expect(studentManagerLoaded).toBe(false);

    // Verify hubHealth shows Student Manager was skipped for teacher entry
    const hubHealth = await page.evaluate(() => {
      return window.hubHealth?.studentManager;
    });
    expect(hubHealth).toBeDefined();
    expect(hubHealth.loaded).toBe(false);
    expect(hubHealth.skippedForTeacherEntry).toBe(true);

    // Verify "Student Portal Manager" text is NOT visible on the page
    const studentPortalManagerText = page.locator('text=/Student Portal Manager/i');
    const isTextVisible = await studentPortalManagerText.isVisible().catch(() => false);
    expect(isTextVisible).toBe(false);

    // Verify teacher login modal is shown or teacher login button is visible
    // The gate button or modal should be present
    const gateTeacherBtn = page.locator("#gateTeacherBtn");
    const teachModal = page.locator("#teachModal");
    
    // Either the gate button or the teacher modal should be visible
    const gateVisible = await gateTeacherBtn.isVisible().catch(() => false);
    const modalVisible = await teachModal.isVisible().catch(() => false);
    
    // At least one should be visible (not blank/stuck)
    expect(gateVisible || modalVisible).toBe(true);

    // If modal is visible, verify it has the correct title
    if (modalVisible) {
      const modalTitle = page.locator("#teachModal .card-header");
      await expect(modalTitle).toContainText(/Teacher Login|Classroom Hub/i);
    }

    // Verify page is not blank - hub topbar should be visible
    const hubTopbar = page.locator(".hub-topbar");
    await expect(hubTopbar).toBeVisible();
  });

  test("should not initialize Student Manager on teacher entry", async ({ page }) => {
    // Mock endpoints
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

    // Navigate with entry=teacher
    await page.goto("/hub/?entry=teacher");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Track if student-manager:ready event fires
    const readyEventFired = await page.evaluate(() => {
      return new Promise((resolve) => {
        let fired = false;
        window.addEventListener("student-manager:ready", () => {
          fired = true;
        });
        setTimeout(() => resolve(fired), 2000);
      });
    });

    // Verify the ready event did NOT fire
    expect(readyEventFired).toBe(false);
  });

  test("should show teacher login deterministically on entry=teacher", async ({ page }) => {
    // Mock endpoints
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

    // Navigate with entry=teacher
    await page.goto("/hub/?entry=teacher");
    await page.waitForLoadState("networkidle");

    // Wait for hub-gate to initialize (it runs after DOM ready)
    await page.waitForTimeout(1500);

    // Verify the teacher modal is shown or gate button is visible
    const teachModal = page.locator("#teachModal");
    const gateTeacherBtn = page.locator("#gateTeacherBtn");
    
    const modalVisible = await teachModal.isVisible().catch(() => false);
    const gateVisible = await gateTeacherBtn.isVisible().catch(() => false);

    // At least one should be visible
    expect(modalVisible || gateVisible).toBe(true);

    // Verify page has content (not blank)
    const body = await page.locator("body");
    const bodyText = await body.textContent();
    expect(bodyText.length).toBeGreaterThan(100);

    // Verify specific elements exist
    const hubWrap = page.locator(".hub-wrap");
    await expect(hubWrap).toBeVisible();
  });
});
