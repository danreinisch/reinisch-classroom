import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Capture console logs
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('student-manager') || text.includes('Load Attempts') || text.includes('hubHealth')) {
      console.log('[PAGE]', text);
    }
  });
  
  await page.goto('http://localhost:8889/site/hub/');
  await page.waitForLoadState('networkidle');
  
  // Check module loading
  const hubHealth = await page.evaluate(() => window.hubHealth?.studentManager);
  
  console.log('\n=== Dual-Path Loading Results ===');
  console.log('Module Loaded:', hubHealth?.loaded || false);
  console.log('Attempts Made:', hubHealth?.attempts?.length || 0);
  
  if (hubHealth?.attempts) {
    hubHealth.attempts.forEach((attempt, i) => {
      console.log(`\nAttempt ${i + 1}:`);
      console.log('  Path:', attempt.path);
      console.log('  Success:', attempt.ok ? '✅ YES' : '❌ NO');
      console.log('  HTTP Status:', attempt.status || 'N/A');
      console.log('  Content-Type:', attempt.contentType || 'N/A');
      if (attempt.error) console.log('  Error:', attempt.error);
    });
  }
  
  await browser.close();
})();
