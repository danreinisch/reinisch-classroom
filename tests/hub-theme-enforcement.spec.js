import { test, expect } from '@playwright/test';

/**
 * Hub Theme Enforcement Test
 * 
 * Validates that Emerald is the only theme ever shown on Hub
 * 
 * Test Coverage:
 * 1. localStorage is set to 'emerald' on Hub load
 * 2. body does NOT have 'glass-bold' class
 * 3. Emerald CSS is loaded with cache-busting
 * 4. Theme toggle button is hidden
 * 5. Existing users with 'glass-bold' stored are migrated to 'emerald'
 */

const HUB_PATH = '/hub/';

test.describe('Hub Theme Enforcement', () => {
  test('should enforce Emerald theme for new users', async ({ page }) => {
    // Clear localStorage to simulate new user
    await page.goto(HUB_PATH);
    await page.evaluate(() => localStorage.clear());
    
    // Navigate to Hub
    await page.goto(HUB_PATH);
    
    // Wait for theme to be applied by checking localStorage
    await page.waitForFunction(() => localStorage.getItem('rc_glass_theme') === 'emerald');
    
    // Verify localStorage is set to 'emerald'
    const theme = await page.evaluate(() => localStorage.getItem('rc_glass_theme'));
    expect(theme).toBe('emerald');
    
    // Verify body does NOT have 'glass-bold' class
    const hasGlassBold = await page.evaluate(() => document.body.classList.contains('glass-bold'));
    expect(hasGlassBold).toBe(false);
  });
  
  test('should migrate existing users from glass-bold to emerald', async ({ page }) => {
    // Set localStorage to 'glass-bold' to simulate existing user
    await page.goto(HUB_PATH);
    await page.evaluate(() => {
      localStorage.setItem('rc_glass_theme', 'glass-bold');
    });
    
    // Navigate to Hub (this should force migration to emerald)
    await page.goto(HUB_PATH);
    
    // Wait for theme migration by checking localStorage
    await page.waitForFunction(() => localStorage.getItem('rc_glass_theme') === 'emerald');
    
    // Verify localStorage is now 'emerald'
    const theme = await page.evaluate(() => localStorage.getItem('rc_glass_theme'));
    expect(theme).toBe('emerald');
    
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
  
  test('should hide Glass: Bold toggle button', async ({ page }) => {
    await page.goto(HUB_PATH);
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Check that the theme toggle button exists but is hidden
    const toggleButton = page.locator('#btnThemeToggle');
    await expect(toggleButton).toBeAttached();
    
    // Verify button is not visible
    await expect(toggleButton).not.toBeVisible();
  });
  
  test('should maintain emerald theme after page reload', async ({ page }) => {
    // First visit
    await page.goto(HUB_PATH);
    await page.waitForFunction(() => localStorage.getItem('rc_glass_theme') === 'emerald');
    
    // Verify initial state
    let theme = await page.evaluate(() => localStorage.getItem('rc_glass_theme'));
    expect(theme).toBe('emerald');
    
    // Reload page
    await page.reload();
    await page.waitForFunction(() => localStorage.getItem('rc_glass_theme') === 'emerald');
    
    // Verify theme persists
    theme = await page.evaluate(() => localStorage.getItem('rc_glass_theme'));
    expect(theme).toBe('emerald');
    
    // Verify no glass-bold class
    const hasGlassBold = await page.evaluate(() => document.body.classList.contains('glass-bold'));
    expect(hasGlassBold).toBe(false);
  });
  
  test('should prevent manual glass-bold class injection', async ({ page }) => {
    await page.goto(HUB_PATH);
    await page.waitForFunction(() => localStorage.getItem('rc_glass_theme') === 'emerald');
    
    // Try to manually add glass-bold class
    await page.evaluate(() => {
      document.body.classList.add('glass-bold');
      localStorage.setItem('rc_glass_theme', 'glass-bold');
    });
    
    // Reload page
    await page.reload();
    await page.waitForFunction(() => localStorage.getItem('rc_glass_theme') === 'emerald');
    
    // Verify theme is forced back to emerald
    const theme = await page.evaluate(() => localStorage.getItem('rc_glass_theme'));
    expect(theme).toBe('emerald');
    
    // Verify glass-bold class is removed
    const hasGlassBold = await page.evaluate(() => document.body.classList.contains('glass-bold'));
    expect(hasGlassBold).toBe(false);
  });
});
