import { test, expect } from '@playwright/test';

/**
 * Student Login Authentication Test
 * 
 * Validates that:
 * 1. Student login from Hub uses server-side authentication
 * 2. Successful login redirects to student portal
 * 3. Failed login shows appropriate error message
 * 4. Student roster endpoint is called to populate dropdown
 */

test.describe('Student Login Authentication', () => {
  test('should successfully login with valid credentials from Hub', async ({ page }) => {
    // Mock student-roster endpoint
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
    
    // Mock student-login endpoint - successful login
    await page.route('**/.netlify/functions/student-login', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      
      if (postData.code === 'S001' && postData.password === 'testpass123') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            code: 'S001',
            name: 'S001'
          })
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'Invalid credentials'
          })
        });
      }
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
    
    // Select student code
    const studentSelect = page.locator('#studentCodeSelect');
    await expect(studentSelect).toBeVisible();
    await studentSelect.selectOption('S001');
    
    // Enter password
    const passwordField = page.locator('#studentPassword');
    await expect(passwordField).toBeVisible();
    await passwordField.fill('testpass123');
    
    // Click login button
    const loginButton = page.locator('#studentSignInGo');
    await expect(loginButton).toBeVisible();
    
    // Expect navigation to student portal
    const navigationPromise = page.waitForURL('**/student/**', { timeout: 5000 });
    await loginButton.click();
    
    // Wait for navigation
    await navigationPromise;
    
    // Verify we're on the student portal page
    expect(page.url()).toContain('/student/');
  });

  test('should show error message with invalid credentials from Hub', async ({ page }) => {
    // Mock student-roster endpoint
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [
            { code: 'S001', active: true }
          ],
          source: 'mock'
        })
      });
    });
    
    // Mock student-login endpoint - failed login
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'Invalid credentials'
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
    
    // Select student code
    const studentSelect = page.locator('#studentCodeSelect');
    await expect(studentSelect).toBeVisible();
    await studentSelect.selectOption('S001');
    
    // Enter wrong password
    const passwordField = page.locator('#studentPassword');
    await expect(passwordField).toBeVisible();
    await passwordField.fill('wrongpassword');
    
    // Click login button
    const loginButton = page.locator('#studentSignInGo');
    await expect(loginButton).toBeVisible();
    await loginButton.click();
    
    // Wait for error message to appear and verify it's visible
    const msgField = page.locator('#studentSignInMsg');
    await expect(msgField).toBeVisible();
    const msgText = await msgField.textContent();
    expect(msgText).toContain('Invalid');
    
    // Verify we're still on hub page
    expect(page.url()).toContain('/hub/');
  });

  test('should successfully login from Student Portal directly', async ({ page }) => {
    // Mock student-login endpoint - successful login
    await page.route('**/.netlify/functions/student-login', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      
      if (postData.code === 'S001' && postData.password === 'testpass123') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            code: 'S001',
            name: 'S001'
          })
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'Invalid credentials'
          })
        });
      }
    });
    
    // Mock data-adapter endpoints for student data
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S001', name: 'S001', active: true }
        ])
      });
    });
    
    // Navigate to student portal
    await page.goto('/site/student/');
    await page.waitForLoadState('networkidle');
    
    // Wait for login form to be visible
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible();
    
    // Enter student code
    const codeField = page.locator('#loginCode');
    await expect(codeField).toBeVisible();
    await codeField.fill('S001');
    
    // Enter password
    const passwordField = page.locator('#loginPassword');
    await expect(passwordField).toBeVisible();
    await passwordField.fill('testpass123');
    
    // Click login button
    const loginButton = page.locator('#btnStudentLogin');
    await expect(loginButton).toBeVisible();
    await loginButton.click();
    
    // Wait for dashboard to appear
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 5000 });
    
    // Verify login view is hidden
    await expect(loginView).toBeHidden();
  });

  test('should successfully login with lowercase student code', async ({ page }) => {
    // Mock student-login endpoint - accepts both lowercase and uppercase codes
    // Simulating server-side normalization behavior
    await page.route('**/.netlify/functions/student-login', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      
      // Normalize the code to uppercase on the server (simulating the actual function behavior)
      const normalizedCode = postData.code ? postData.code.trim().toUpperCase() : '';
      
      if (normalizedCode === 'S002' && postData.password === 'S002') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            code: 'S002',  // Server returns normalized uppercase code
            name: 'S002'
          })
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'Invalid credentials'
          })
        });
      }
    });
    
    // Mock data-adapter endpoints for student data
    await page.route('**/.netlify/functions/students*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { code: 'S002', name: 'S002', active: true }
        ])
      });
    });
    
    // Navigate to student portal
    await page.goto('/site/student/');
    await page.waitForLoadState('networkidle');
    
    // Wait for login form to be visible
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible();
    
    // Enter student code in LOWERCASE
    const codeField = page.locator('#loginCode');
    await expect(codeField).toBeVisible();
    await codeField.fill('s002');  // lowercase input
    
    // Enter password (uppercase as standardized)
    const passwordField = page.locator('#loginPassword');
    await expect(passwordField).toBeVisible();
    await passwordField.fill('S002');
    
    // Click login button
    const loginButton = page.locator('#btnStudentLogin');
    await expect(loginButton).toBeVisible();
    await loginButton.click();
    
    // Wait for dashboard to appear - this verifies lowercase code worked
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 5000 });
    
    // Verify login view is hidden
    await expect(loginView).toBeHidden();
  });

  test('should show error message on Student Portal with invalid credentials', async ({ page }) => {
    // Mock student-login endpoint - failed login
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'Invalid student code or password'
        })
      });
    });
    
    // Navigate to student portal
    await page.goto('/site/student/');
    await page.waitForLoadState('networkidle');
    
    // Wait for login form to be visible
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible();
    
    // Enter student code
    const codeField = page.locator('#loginCode');
    await expect(codeField).toBeVisible();
    await codeField.fill('S001');
    
    // Enter wrong password
    const passwordField = page.locator('#loginPassword');
    await expect(passwordField).toBeVisible();
    await passwordField.fill('wrongpassword');
    
    // Click login button
    const loginButton = page.locator('#btnStudentLogin');
    await expect(loginButton).toBeVisible();
    await loginButton.click();
    
    // Wait for error message to appear and verify it's visible
    const errorDiv = page.locator('#loginError');
    await expect(errorDiv).toBeVisible({ timeout: 3000 });
    const errorText = await errorDiv.textContent();
    expect(errorText).toContain('Invalid student code or password');
    
    // Verify we're still on login view
    await expect(loginView).toBeVisible();
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeHidden();
  });
});
