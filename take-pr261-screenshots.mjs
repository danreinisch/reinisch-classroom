import { chromium } from 'playwright';

(async () => {
  console.log('Starting browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to student portal...');
    // Navigate to student portal to show escape hatch on login
    await page.goto('http://localhost:3000/student/', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    
    // Take screenshot of student portal login with escape hatch
    await page.screenshot({ 
      path: 'pr261-student-portal-escape-hatch.png', 
      fullPage: false 
    });
    console.log('✓ Screenshot saved: pr261-student-portal-escape-hatch.png');
    
    // Navigate to hub with teacher override
    console.log('Navigating to hub with teacher=1...');
    await page.goto('http://localhost:3000/hub/?teacher=1', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    
    // Take screenshot showing URL with teacher=1 parameter
    await page.screenshot({ 
      path: 'pr261-hub-teacher-override.png', 
      fullPage: false 
    });
    console.log('✓ Screenshot saved: pr261-hub-teacher-override.png');
    
  } catch (error) {
    console.error('Error taking screenshots:', error);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
