import { test, expect } from '@playwright/test';

/**
 * Student Roster Dropdown Test
 * 
 * Validates that:
 * 1. Student code dropdown populates when student-roster function returns data
 * 2. Error message shows when roster unavailable
 * 3. 401 from teacher-session doesn't block dropdown population
 */

test.describe('Student Roster Dropdown', () => {
  test('should populate student dropdown with mock roster data', async ({ page }) => {
    // Intercept the student-roster function call and return mock data
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [
            { code: 'S001', active: true },
            { code: 'S002', active: true },
            { code: 'S003', active: true }
          ],
          source: 'mock'
        })
      });
    });
    
    // Navigate to hub
    await page.goto('/site/hub/');
    await page.waitForLoadState('networkidle');
    
    // Skip sign-in modal if it appears by pressing Escape
    const signInModal = page.locator('#signInModal');
    if (await signInModal.isVisible()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Open sign-in modal by clicking header sign-in button
    const headerSignInButton = page.locator('.header .btn:has-text("Sign In")');
    if (await headerSignInButton.isVisible()) {
      await headerSignInButton.click();
      await page.waitForTimeout(300);
    }
    
    // Click Student button in sign-in modal
    const studentButton = page.locator('#signInStudent');
    await expect(studentButton).toBeVisible();
    await studentButton.click();
    
    // Wait for student modal to appear
    await page.waitForTimeout(500);
    
    // Verify student sign-in modal is visible
    const studentModal = page.locator('#studentSignInModal');
    await expect(studentModal).toHaveClass(/show/);
    
    // Verify dropdown has been populated
    const studentSelect = page.locator('#studentCodeSelect');
    await expect(studentSelect).toBeVisible();
    
    // Count options (should have placeholder + 3 students = 4 options)
    const options = await studentSelect.locator('option').all();
    expect(options.length).toBe(4);
    
    // Verify first option is placeholder
    const firstOption = await options[0].textContent();
    expect(firstOption).toContain('Select your code');
    
    // Verify student codes are in dropdown
    const secondOption = await options[1].getAttribute('value');
    expect(secondOption).toBe('S001');
    
    // Verify no error message
    const msgField = page.locator('#studentSignInMsg');
    const msgText = await msgField.textContent();
    expect(msgText).not.toContain('No roster available');
  });

  test('should show error message when roster unavailable', async ({ page }) => {
    // Intercept the student-roster function call and return error
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'Failed to fetch student roster',
          students: []
        })
      });
    });
    
    // Navigate to hub
    await page.goto('/site/hub/');
    await page.waitForLoadState('networkidle');
    
    // Skip sign-in modal if it appears
    const signInModal = page.locator('#signInModal');
    if (await signInModal.isVisible()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Open sign-in modal
    const headerSignInButton = page.locator('.header .btn:has-text("Sign In")');
    if (await headerSignInButton.isVisible()) {
      await headerSignInButton.click();
      await page.waitForTimeout(300);
    }
    
    // Click Student button
    const studentButton = page.locator('#signInStudent');
    if (await studentButton.isVisible()) {
      await studentButton.click();
      await page.waitForTimeout(500);
      
      // Verify error message is shown
      const msgField = page.locator('#studentSignInMsg');
      const msgText = await msgField.textContent();
      expect(msgText).toContain('No roster available');
    }
  });

  test('should populate dropdown even when teacher-session returns 401', async ({ page }) => {
    // Intercept teacher-session to return 401
    await page.route('**/.netlify/functions/teacher-session', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'Unauthorized'
        })
      });
    });
    
    // Intercept student-roster to return success
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [
            { code: 'S001', active: true },
            { code: 'S002', active: true }
          ],
          source: 'mock'
        })
      });
    });
    
    // Navigate to hub
    await page.goto('/site/hub/');
    await page.waitForLoadState('networkidle');
    
    // Skip sign-in modal if it appears
    const signInModal = page.locator('#signInModal');
    if (await signInModal.isVisible()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Open sign-in modal
    const headerSignInButton = page.locator('.header .btn:has-text("Sign In")');
    if (await headerSignInButton.isVisible()) {
      await headerSignInButton.click();
      await page.waitForTimeout(300);
    }
    
    // Click Student button
    const studentButton = page.locator('#signInStudent');
    if (await studentButton.isVisible()) {
      await studentButton.click();
      await page.waitForTimeout(500);
      
      // Verify student modal is visible
      const studentModal = page.locator('#studentSignInModal');
      await expect(studentModal).toHaveClass(/show/);
      
      // Verify dropdown has been populated despite 401 from teacher-session
      const studentSelect = page.locator('#studentCodeSelect');
      const options = await studentSelect.locator('option').all();
      expect(options.length).toBe(3); // placeholder + 2 students
      
      // Verify no error message
      const msgField = page.locator('#studentSignInMsg');
      const msgText = await msgField.textContent();
      expect(msgText).not.toContain('No roster available');
    }
  });
});
