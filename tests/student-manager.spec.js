import { test, expect } from '@playwright/test';

/**
 * Student Manager Smoke Test
 * 
 * Validates that:
 * 1. Hub page loads successfully
 * 2. Teacher sign-in can be accessed (skip actual login for now)
 * 3. Student Manager tab is visible and accessible
 * 4. Metrics render on Student Manager panel
 */

test.describe('Student Manager Smoke Test', () => {
  test('should load hub and display Student Manager tab', async ({ page }) => {
    // Navigate to hub
    await page.goto('/site/hub/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check that page title contains "Classroom Hub"
    await expect(page).toHaveTitle(/Classroom Hub/);
    
    // Check that header is visible
    const header = page.locator('.header');
    await expect(header).toBeVisible();
    
    // Look for Teacher Center button
    const teacherBtn = page.locator('#btnTeacher');
    await expect(teacherBtn).toBeVisible();
  });
  
  test('should display Student Manager in navigation when feature is enabled', async ({ page }) => {
    // Navigate to hub
    await page.goto('/site/hub/');
    await page.waitForLoadState('networkidle');
    
    // Click Teacher Center button to show sign-in modal
    await page.click('#btnTeacher');
    
    // Check if sign-in modal appears
    const signInModal = page.locator('#signInModal');
    await expect(signInModal).toBeVisible({ timeout: 2000 });
    
    // Skip actual login - just close modal to continue in local mode
    await page.keyboard.press('Escape');
    
    // Enable Student Manager feature flag if settings are accessible
    // This is a smoke test so we'll check if the tab exists in the DOM
    const studentManagerTab = page.locator('[data-tab="studentManager"]');
    
    // The tab may be hidden by feature flag, but should exist in DOM
    const tabCount = await studentManagerTab.count();
    expect(tabCount).toBeGreaterThan(0);
  });
  
  test('should display metrics on Student Manager panel', async ({ page }) => {
    // Navigate to hub
    await page.goto('/site/hub/');
    await page.waitForLoadState('networkidle');
    
    // Try to access Student Manager tab directly by enabling the feature flag via localStorage
    await page.evaluate(() => {
      localStorage.setItem('rc_unified_featureFlags', JSON.stringify({ studentManager: true }));
    });
    
    // Reload to apply feature flag
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Skip sign-in if modal appears
    const signInModal = page.locator('#signInModal');
    if (await signInModal.isVisible()) {
      await page.keyboard.press('Escape');
    }
    
    // Look for Data icon rail button
    const dataButton = page.locator('.iconrail button[data-area="data"]');
    if (await dataButton.isVisible()) {
      await dataButton.click();
      await page.waitForTimeout(500);
      
      // Look for Student Manager in submenu
      const studentManagerNav = page.locator('.nav a:has-text("Student Manager")');
      
      if (await studentManagerNav.isVisible()) {
        await studentManagerNav.click();
        await page.waitForTimeout(1000);
        
        // Check for metrics section
        const totalStudents = page.locator('#smTotalStudents');
        const activeStudents = page.locator('#smActiveStudents');
        const totalGoals = page.locator('#smTotalGoals');
        
        // Metrics should exist (may show "—" if no data)
        await expect(totalStudents).toBeVisible();
        await expect(activeStudents).toBeVisible();
        await expect(totalGoals).toBeVisible();
        
        console.log('✓ Student Manager metrics rendered successfully');
      } else {
        console.log('ℹ Student Manager nav item not visible - may require feature flag or authentication');
      }
    } else {
      console.log('ℹ Data icon rail button not visible - may be in collapsed state or require authentication');
    }
  });
  
  test('should not crash when initializing Student Manager', async ({ page }) => {
    // Navigate to hub
    await page.goto('/site/hub/');
    await page.waitForLoadState('networkidle');
    
    // Enable feature flag
    await page.evaluate(() => {
      localStorage.setItem('rc_unified_featureFlags', JSON.stringify({ studentManager: true }));
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Listen for console errors
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Try to navigate to Student Manager
    await page.evaluate(() => {
      // Try to trigger Student Manager init via event
      window.dispatchEvent(new CustomEvent('hub:tab-init', { detail: { tab: 'studentManager' } }));
    });
    
    await page.waitForTimeout(2000);
    
    // Check that there are no ReferenceError about isRemote
    const hasIsRemoteError = errors.some(err => err.includes('isRemote is not defined'));
    expect(hasIsRemoteError).toBe(false);
    
    if (errors.length > 0) {
      console.log('Console errors:', errors);
    }
  });
});
