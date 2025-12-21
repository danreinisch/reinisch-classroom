import { test, expect } from '@playwright/test';

test.describe('Hub Layout Transformation Smoke Tests', () => {
  test('should have new hub-* shell structure', async ({ page }) => {
    await page.goto('/hub/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Verify new shell elements exist
    const hubWrap = await page.locator('.hub-wrap');
    await expect(hubWrap).toBeVisible();
    
    const hubShell = await page.locator('.hub-shell');
    await expect(hubShell).toBeVisible();
    
    const hubTopbar = await page.locator('.hub-topbar');
    await expect(hubTopbar).toBeVisible();
    
    // Verify grid structure exists (may be hidden initially)
    const hubGrid = await page.locator('.hub-grid');
    expect(await hubGrid.count()).toBe(1);
  });

  test('should enforce Emerald theme', async ({ page }) => {
    await page.goto('/hub/');
    await page.waitForLoadState('networkidle');
    
    // Check localStorage for emerald theme
    const theme = await page.evaluate(() => localStorage.getItem('rc_glass_theme'));
    expect(theme).toBe('emerald');
    
    // Verify no glass-bold class on body
    const hasGlassBold = await page.evaluate(() => 
      document.body.classList.contains('glass-bold')
    );
    expect(hasGlassBold).toBe(false);
    
    // Verify emerald data-theme attribute
    const dataTheme = await page.getAttribute('html', 'data-theme');
    expect(dataTheme).toBe('emerald');
  });

  test('should have hub-rail with buttons', async ({ page }) => {
    await page.goto('/hub/');
    await page.waitForLoadState('networkidle');
    
    // Verify hub-rail exists
    const hubRail = await page.locator('.hub-rail');
    expect(await hubRail.count()).toBe(1);
    
    // Verify rail has hub-rail-item buttons
    const railItems = await page.locator('.hub-rail-item');
    expect(await railItems.count()).toBeGreaterThan(0);
  });

  test('should have hub-menu navigation', async ({ page }) => {
    await page.goto('/hub/');
    await page.waitForLoadState('networkidle');
    
    // Verify hub-menu exists
    const hubMenu = await page.locator('.hub-menu');
    expect(await hubMenu.count()).toBe(1);
    
    // Verify menu has header
    const menuHeader = await page.locator('.hub-menu-header');
    expect(await menuHeader.count()).toBe(1);
  });

  test('should have hub-main content area', async ({ page }) => {
    await page.goto('/hub/');
    await page.waitForLoadState('networkidle');
    
    // Verify hub-main exists
    const hubMain = await page.locator('.hub-main');
    expect(await hubMain.count()).toBe(1);
  });

  test('should have hub-right panel', async ({ page }) => {
    await page.goto('/hub/');
    await page.waitForLoadState('networkidle');
    
    // Verify hub-right exists
    const hubRight = await page.locator('.hub-right');
    expect(await hubRight.count()).toBe(1);
  });

  test('should preserve existing element IDs', async ({ page }) => {
    await page.goto('/hub/');
    await page.waitForLoadState('networkidle');
    
    // Verify critical IDs are preserved
    const criticalIds = [
      'view-teacher',
      'submenuTitle',
      'submenu',
      'navPrev',
      'navNext',
      'navExit',
      'btnTeacher',
      'btnStudent',
      'currentUserChip',
      'datetimeDisplay'
    ];
    
    for (const id of criticalIds) {
      const element = await page.locator(`#${id}`);
      expect(await element.count()).toBe(1);
    }
  });

  test('should use rc-* component classes', async ({ page }) => {
    await page.goto('/hub/');
    await page.waitForLoadState('networkidle');
    
    // Verify rc-glass is used
    const rcGlass = await page.locator('.rc-glass');
    expect(await rcGlass.count()).toBeGreaterThan(0);
    
    // Verify rc-card is used  
    const rcCard = await page.locator('.rc-card');
    expect(await rcCard.count()).toBeGreaterThan(0);
  });

  test('should load Emerald CSS files', async ({ page }) => {
    await page.goto('/hub/');
    
    // Check that Emerald CSS files are loaded
    const dashboardCss = await page.locator('link[href*="rc-emerald-dashboard-theme.css"]');
    await expect(dashboardCss).toHaveCount(1);
    
    const bridgeCss = await page.locator('link[href*="rc-emerald-bridge.css"]');
    await expect(bridgeCss).toHaveCount(1);
  });

  test('should have rectangular controls (non-pill)', async ({ page }) => {
    await page.goto('/hub/');
    await page.waitForLoadState('networkidle');
    
    // Check button border-radius (should be 10px or less, not pill-shaped)
    const btnBorderRadius = await page.evaluate(() => {
      const btn = document.querySelector('.btn');
      if (!btn) return null;
      const styles = window.getComputedStyle(btn);
      return parseFloat(styles.borderRadius);
    });
    
    // Verify it's not pill-shaped (pill would be ~21px for 42px height)
    expect(btnBorderRadius).toBeLessThan(15);
  });
});
