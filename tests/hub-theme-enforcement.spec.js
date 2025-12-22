import { test, expect } from '@playwright/test';

/**
 * Hub Theme Enforcement Test
 * 
 * Validates that Emerald is the only theme ever shown on Hub
 * 
 * Test Coverage:
 * 1. body does NOT have 'glass-bold' class
 * 2. Emerald CSS is loaded with cache-busting
 * 3. Theme toggle button does not exist
 * 4. Legacy glass theme localStorage key is removed
 */

const HUB_PATH = '/hub/';

test.describe('Hub Theme Enforcement', () => {
  test('should enforce Emerald theme (no glass-bold)', async ({ page }) => {
    // Navigate to Hub
    await page.goto(HUB_PATH);
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Verify body does NOT have 'glass-bold' class
    const hasGlassBold = await page.evaluate(() => document.body.classList.contains('glass-bold'));
    expect(hasGlassBold).toBe(false);
  });
  
  test('should clean up legacy glass theme localStorage', async ({ page }) => {
    // Set localStorage to 'glass-bold' to simulate existing user
    await page.goto(HUB_PATH);
    await page.evaluate(() => {
      localStorage.setItem('rc_glass_theme', 'glass-bold');
    });
    
    // Navigate to Hub (this should clean up the legacy key)
    await page.goto(HUB_PATH);
    await page.waitForLoadState('domcontentloaded');
    
    // Give theme boot script time to execute
    await page.waitForTimeout(500);
    
    // Verify localStorage key is removed
    const theme = await page.evaluate(() => localStorage.getItem('rc_glass_theme'));
    expect(theme).toBe(null);
    
    // Verify body does NOT have 'glass-bold' class
    const hasGlassBold = await page.evaluate(() => document.body.classList.contains('glass-bold'));
    expect(hasGlassBold).toBe(false);
  });
  
  test('should load Emerald CSS with cache-busting v=emerald-5', async ({ page }) => {
    await page.goto(HUB_PATH);
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check that Emerald CSS files are loaded with correct version
    const cssLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return links
        .filter(link => link.href.includes('emerald'))
        .map(link => link.href);
    });
    
    // Verify both Emerald CSS files are loaded
    expect(cssLinks.length).toBeGreaterThanOrEqual(2);
    
    // Verify cache-busting version is emerald-5
    const hasCorrectVersion = cssLinks.some(href => href.includes('v=emerald-5'));
    expect(hasCorrectVersion).toBe(true);
  });
  
  test('should not have theme toggle button', async ({ page }) => {
    await page.goto(HUB_PATH);
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Verify the theme toggle button does not exist
    const toggleButton = page.locator('#btnThemeToggle');
    await expect(toggleButton).not.toBeAttached();
  });
  
  test('should maintain emerald theme after page reload', async ({ page }) => {
    // First visit
    await page.goto(HUB_PATH);
    await page.waitForLoadState('domcontentloaded');
    
    // Verify no glass-bold class
    let hasGlassBold = await page.evaluate(() => document.body.classList.contains('glass-bold'));
    expect(hasGlassBold).toBe(false);
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // Verify no glass-bold class persists
    hasGlassBold = await page.evaluate(() => document.body.classList.contains('glass-bold'));
    expect(hasGlassBold).toBe(false);
  });
  
  test('should prevent manual glass-bold class injection', async ({ page }) => {
    await page.goto(HUB_PATH);
    await page.waitForLoadState('domcontentloaded');
    
    // Try to manually add glass-bold class
    await page.evaluate(() => {
      document.body.classList.add('glass-bold');
      localStorage.setItem('rc_glass_theme', 'glass-bold');
    });
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    // Verify glass-bold class is removed
    const hasGlassBold = await page.evaluate(() => document.body.classList.contains('glass-bold'));
    expect(hasGlassBold).toBe(false);
    
    // Verify legacy localStorage key is removed
    const theme = await page.evaluate(() => localStorage.getItem('rc_glass_theme'));
    expect(theme).toBe(null);
  });
});
