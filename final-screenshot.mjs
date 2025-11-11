import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ 
    viewport: { width: 1800, height: 1400 }
  });
  const page = await context.newPage();
  
  await page.goto('http://localhost:8889/site/hub/');
  await page.waitForLoadState('networkidle');
  
  // Enable Student Manager feature
  await page.evaluate(() => {
    localStorage.setItem('rc_unified_featureFlags', JSON.stringify({ studentManager: true }));
  });
  
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Close sign-in modal if present
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) {}
  
  // Click Data area
  const dataBtn = await page.locator('.iconrail button[data-area="data"]').first();
  await dataBtn.click();
  await page.waitForTimeout(500);
  
  // Click Student Manager nav
  const smNav = await page.locator('.nav a:has-text("Student Manager")').first();
  await smNav.click();
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ 
    path: '/tmp/student-manager-ui.png',
    fullPage: false
  });
  
  console.log('✅ Screenshot saved to /tmp/student-manager-ui.png');
  
  await browser.close();
})();
