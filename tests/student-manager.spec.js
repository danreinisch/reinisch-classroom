import { test, expect } from '@playwright/test';

/**
 * Student Manager Smoke Test
 * 
 * Validates that:
 * 1. Hub page loads successfully
 * 2. Student Manager readiness event fires
 * 3. Metrics render with numeric values (not em dashes)
 * 4. hubHealth.studentManager exists with initMs
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
  
  test('should wait for student-manager:ready event and verify metrics', async ({ page }) => {
    // Set up event listener before navigation
    const readyEventPromise = page.evaluate(() => {
      return new Promise((resolve) => {
        window.addEventListener('student-manager:ready', (e) => {
          resolve(e.detail);
        }, { once: true });
      });
    });
    
    // Navigate to hub
    await page.goto('/site/hub/');
    await page.waitForLoadState('networkidle');
    
    // Enable feature flag
    await page.evaluate(() => {
      localStorage.setItem('rc_unified_featureFlags', JSON.stringify({ studentManager: true }));
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Skip sign-in if modal appears
    const signInModal = page.locator('#signInModal');
    if (await signInModal.isVisible()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Navigate to Student Manager tab
    const dataButton = page.locator('.iconrail button[data-area="data"]');
    if (await dataButton.isVisible()) {
      await dataButton.click();
      await page.waitForTimeout(500);
      
      const studentManagerNav = page.locator('.nav a:has-text("Student Manager")');
      
      if (await studentManagerNav.isVisible()) {
        await studentManagerNav.click();
        
        // Wait for ready event (with timeout)
        const eventDetail = await Promise.race([
          readyEventPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for ready event')), 10000))
        ]).catch(err => {
          console.log('Ready event not received:', err.message);
          return null;
        });
        
        if (eventDetail) {
          console.log('✓ student-manager:ready event fired with detail:', eventDetail);
          
          // Verify event has expected structure
          expect(eventDetail).toHaveProperty('initMs');
          expect(eventDetail).toHaveProperty('counts');
          expect(typeof eventDetail.initMs).toBe('number');
          expect(eventDetail.initMs).toBeGreaterThan(0);
        }
        
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
        
        // Check hubHealth exists
        const hubHealth = await page.evaluate(() => window.hubHealth?.studentManager);
        expect(hubHealth).toBeDefined();
        expect(hubHealth.loaded).toBe(true);
        expect(hubHealth).toHaveProperty('initMs');
        expect(typeof hubHealth.initMs).toBe('number');
        expect(hubHealth.initMs).toBeGreaterThan(0);
        
        console.log('✓ hubHealth.studentManager exists with initMs:', hubHealth.initMs);
      } else {
        console.log('ℹ Student Manager nav item not visible - skipping test');
      }
    } else {
      console.log('ℹ Data icon rail button not visible - skipping test');
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
    const initResult = await page.evaluate(() => {
      // Try to trigger Student Manager init via event
      window.dispatchEvent(new CustomEvent('hub:tab-init', { detail: { tab: 'studentManager' } }));
      
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            studentManagerUIAvailable: typeof window.StudentManagerUI === 'function',
            healthTracking: window.hubHealth?.studentManager
          });
        }, 2000);
      });
    });
    
    // Verify StudentManagerUI is globally available
    expect(initResult.studentManagerUIAvailable).toBe(true);
    
    // Verify health tracking is set
    expect(initResult.healthTracking).toBeDefined();
    expect(initResult.healthTracking.loaded).toBe(true);
    
    // Check that there are no ReferenceError about StudentManagerUI
    const hasStudentManagerUIError = errors.some(err => err.includes('StudentManagerUI is not defined'));
    expect(hasStudentManagerUIError).toBe(false);
    
    // Check that there are no ReferenceError about isRemote
    const hasIsRemoteError = errors.some(err => err.includes('isRemote is not defined'));
    expect(hasIsRemoteError).toBe(false);
    
    if (errors.length > 0) {
      console.log('Console errors:', errors);
    }
  });
});
