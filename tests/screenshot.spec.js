import { test } from '@playwright/test';

test('take hub screenshot', async ({ page }) => {
  await page.goto('/hub/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  await page.screenshot({ 
    path: '/tmp/hub-layout.png',
    fullPage: false
  });
  
  console.log('Screenshot saved to /tmp/hub-layout.png');
});
