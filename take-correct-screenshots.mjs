import { chromium } from 'playwright';

(async () => {
  console.log('Starting browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const page = await context.newPage();
  
  try {
    // Screenshot 1: Student Portal Login View with Escape Hatch
    console.log('1. Navigating to student portal login...');
    await page.goto('http://localhost:3000/student/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Wait for the redirect check to complete and login view to be visible
    await page.waitForSelector('#loginView', { timeout: 5000 }).catch(() => console.log('Login view not immediately visible'));
    await page.waitForTimeout(1000);
    
    // Take full page screenshot to show the escape hatch at bottom of login form
    await page.screenshot({ 
      path: 'pr261-screenshot-1-student-login-escape-hatch.png', 
      fullPage: true 
    });
    console.log('✓ Screenshot 1 saved: pr261-screenshot-1-student-login-escape-hatch.png');
    
    // Screenshot 2: Student Portal with valid auth showing top bar escape hatch
    console.log('2. Setting up valid student auth and navigating to portal...');
    await context.addInitScript(() => {
      const auth = {
        role: 'student',
        code: 'S001',
        name: 'Test Student',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('rc_auth', JSON.stringify(auth));
    });
    
    // Mock the student roster endpoint
    await page.route('**/.netlify/functions/student-roster*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [{ code: 'S001', name: 'Test Student', active: true }]
        })
      });
    });
    
    await page.route('**/.netlify/functions/assignment-instances*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    await page.route('**/.netlify/functions/goals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Wait for top bar to be visible
    await page.waitForSelector('#portalTopBar', { timeout: 5000 }).catch(() => console.log('Top bar not visible'));
    
    await page.screenshot({ 
      path: 'pr261-screenshot-2-topbar-hub-link.png', 
      fullPage: false 
    });
    console.log('✓ Screenshot 2 saved: pr261-screenshot-2-topbar-hub-link.png');
    
    // Screenshot 3: Hub with teacher=1 parameter in URL
    console.log('3. Navigating to hub with teacher=1 parameter...');
    await page.goto('http://localhost:3000/hub/?teacher=1', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: 'pr261-screenshot-3-hub-teacher-override.png', 
      fullPage: false 
    });
    console.log('✓ Screenshot 3 saved: pr261-screenshot-3-hub-teacher-override.png');
    
  } catch (error) {
    console.error('Error taking screenshots:', error);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
