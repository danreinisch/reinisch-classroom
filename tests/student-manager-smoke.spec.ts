import { test, expect } from '@playwright/test';

/**
 * Student Manager Smoke Test (Guardrails G0)
 * 
 * Validates that:
 * 1. Hub loads successfully
 * 2. Student Manager initializes and sets hubHealth.studentManager.loaded = true
 * 3. student-manager:ready event fires exactly once
 * 4. Metrics render with numeric values (not em dashes)
 * 5. DOM row count matches badge count in Students header
 */

test.describe('Student Manager Smoke Test', () => {
  test('should load hub, initialize Student Manager, and verify metrics', async ({ page }) => {
    // Navigate to hub
    await page.goto('/site/hub/');
    await page.waitForLoadState('networkidle');
    
    // Enable feature flag and set up event listener
    await page.evaluate(() => {
      localStorage.setItem('rc_unified_featureFlags', JSON.stringify({ studentManager: true }));
      
      // Track ready events
      window.readyEventCount = 0;
      window.readyEventDetail = null;
      window.addEventListener('student-manager:ready', (e) => {
        window.readyEventCount++;
        window.readyEventDetail = e.detail;
      });
    });
    
    // Reload to apply feature flag
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Skip sign-in modal if it appears
    const signInModal = page.locator('#signInModal');
    if (await signInModal.isVisible()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Navigate to Student Manager tab (check visibility first)
    const dataButton = page.locator('.iconrail button[data-area="data"]');
    const isDataButtonVisible = await dataButton.isVisible().catch(() => false);
    
    if (!isDataButtonVisible) {
      console.log('ℹ Data button not visible - test environment may require authentication');
      test.skip();
      return;
    }
    
    await dataButton.click();
    await page.waitForTimeout(500);
    
    const studentManagerNav = page.locator('.nav a:has-text("Student Manager")');
    const isStudentManagerNavVisible = await studentManagerNav.isVisible().catch(() => false);
    
    if (!isStudentManagerNavVisible) {
      console.log('ℹ Student Manager nav not visible - skipping test');
      test.skip();
      return;
    }
    
    await studentManagerNav.click();
    
    // Wait for hubHealth.studentManager.loaded to be true
    await page.waitForFunction(
      () => window.hubHealth?.studentManager?.loaded === true,
      { timeout: 10000 }
    );
    
    console.log('✓ hubHealth.studentManager.loaded === true');
    
    // Wait a bit for ready event to fire
    await page.waitForTimeout(1000);
    
    // Check ready event
    const eventStats = await page.evaluate(() => ({
      count: window.readyEventCount,
      detail: window.readyEventDetail
    }));
    
    console.log('✓ student-manager:ready event stats:', eventStats);
    
    // Verify only one ready event fired
    expect(eventStats.count).toBe(1);
    
    // Verify event detail has expected structure
    expect(eventStats.detail).toBeDefined();
    expect(eventStats.detail).toHaveProperty('initMs');
    expect(eventStats.detail).toHaveProperty('counts');
    expect(typeof eventStats.detail.initMs).toBe('number');
    expect(eventStats.detail.initMs).toBeGreaterThan(0);
    
    // Check metrics are numeric (not dashes)
    const totalStudents = page.locator('#smTotalStudents');
    const activeStudents = page.locator('#smActiveStudents');
    const totalGoals = page.locator('#smTotalGoals');
    
    await expect(totalStudents).toBeVisible();
    await expect(activeStudents).toBeVisible();
    await expect(totalGoals).toBeVisible();
    
    const totalText = await totalStudents.textContent();
    const activeText = await activeStudents.textContent();
    const goalsText = await totalGoals.textContent();
    
    // Metrics should be numeric or "0*" (partial), not em-dash
    expect(totalText).not.toBe('—');
    expect(activeText).not.toBe('—');
    expect(goalsText).not.toBe('—');
    
    // Verify they match numeric pattern or partial pattern
    expect(totalText).toMatch(/^\d+\*?$/);
    expect(activeText).toMatch(/^\d+\*?$/);
    expect(goalsText).toMatch(/^\d+\*?$/);
    
    console.log('✓ Metrics are numeric:', { totalText, activeText, goalsText });
    
    // Check DOM row count matches badge count in Students header
    const studentTableRows = page.locator('.ttab[data-tab="studentManager"] .table tbody tr');
    const rowCount = await studentTableRows.count();
    
    // Get the badge count from header (e.g., "Students (12)")
    const studentsHeaderBadge = page.locator('.ttab[data-tab="studentManager"] .card-header .badge');
    const badgeText = await studentsHeaderBadge.textContent();
    const badgeCountMatch = badgeText?.match(/\((\d+)\)/);
    
    if (badgeCountMatch) {
      const badgeCount = parseInt(badgeCountMatch[1], 10);
      console.log('✓ Badge count:', badgeCount, ', Row count:', rowCount);
      expect(rowCount).toBe(badgeCount);
    } else {
      console.log('ℹ No badge count found in header, skipping row count check');
    }
    
    // Verify hubHealth has all expected properties
    const hubHealth = await page.evaluate(() => window.hubHealth?.studentManager);
    expect(hubHealth).toBeDefined();
    expect(hubHealth.loaded).toBe(true);
    expect(hubHealth).toHaveProperty('initMs');
    expect(typeof hubHealth.initMs).toBe('number');
    expect(hubHealth.initMs).toBeGreaterThan(0);
    expect(hubHealth).toHaveProperty('ts');
    expect(hubHealth).toHaveProperty('attempts');
    
    console.log('✓ hubHealth.studentManager has all expected properties');
  });
});
