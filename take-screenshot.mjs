import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1700, height: 1200 }
  });
  const page = await context.newPage();
  
  console.log('Navigating to hub...');
  await page.goto('http://localhost:8889/site/hub/');
  await page.waitForLoadState('networkidle');
  
  // Enable feature flag
  await page.evaluate(() => {
    localStorage.setItem('rc_unified_featureFlags', JSON.stringify({ studentManager: true }));
  });
  
  await page.reload();
  await page.waitForLoadState('networkidle');
  
  // Try to close sign-in modal if it appears
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (e) {
    // Ignore
  }
  
  // Navigate to Student Manager
  console.log('Navigating to Student Manager tab...');
  const dataButton = page.locator('.iconrail button[data-area="data"]');
  if (await dataButton.isVisible()) {
    await dataButton.click();
    await page.waitForTimeout(500);
    
    const studentManagerNav = page.locator('.nav a:has-text("Student Manager")');
    if (await studentManagerNav.isVisible()) {
      await studentManagerNav.click();
      await page.waitForTimeout(2000);
      
      // Get hubHealth diagnostics
      const hubHealth = await page.evaluate(() => window.hubHealth?.studentManager);
      console.log('\n=== Student Manager Health ===');
      console.log('Loaded:', hubHealth?.loaded);
      console.log('Init Time:', hubHealth?.initMs, 'ms');
      console.log('Attempts:', hubHealth?.attempts?.length);
      
      if (hubHealth?.attempts) {
        console.log('\n=== Load Attempts ===');
        hubHealth.attempts.forEach((attempt, i) => {
          console.log(`Attempt ${i + 1}:`);
          console.log('  Path:', attempt.path);
          console.log('  Success:', attempt.ok ? '✅' : '❌');
          console.log('  Status:', attempt.status || 'N/A');
          console.log('  Content-Type:', attempt.contentType || 'N/A');
          if (attempt.error) console.log('  Error:', attempt.error);
        });
      }
      
      // Take screenshot
      console.log('\nTaking screenshot...');
      await page.screenshot({ 
        path: '/tmp/student-manager-loaded.png',
        fullPage: false
      });
      console.log('Screenshot saved to /tmp/student-manager-loaded.png');
    }
  }
  
  await browser.close();
})();
