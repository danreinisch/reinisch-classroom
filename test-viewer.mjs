import playwright from '@playwright/test';
const { chromium } = playwright;

async function testViewer() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // Navigate to viewer with a test presentation
    const presentationPath = '/life-skills/presentations/presentation-08/Unit1_Workplace_Communication_Full_Presentation.html';
    const viewerUrl = `http://localhost:8080/viewer/?src=${encodeURIComponent(presentationPath)}`;
    
    console.log('Navigating to:', viewerUrl);
    await page.goto(viewerUrl, { waitUntil: 'networkidle' });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Take screenshot with sidebar expanded (default state)
    console.log('Taking screenshot with sidebar expanded...');
    await page.screenshot({ 
      path: '/tmp/viewer-sidebar-expanded.png',
      fullPage: false
    });
    
    // Check if sidebar exists
    const sidebar = await page.locator('.app-shell-rail').count();
    console.log('Sidebar found:', sidebar > 0);
    
    // Check if toggle button exists
    const toggleBtn = await page.locator('#sidebarToggleBtn').count();
    console.log('Toggle button found:', toggleBtn > 0);
    
    if (toggleBtn > 0) {
      // Click toggle to collapse sidebar
      console.log('Clicking sidebar toggle...');
      await page.click('#sidebarToggleBtn');
      await page.waitForTimeout(500);
      
      // Take screenshot with sidebar collapsed
      console.log('Taking screenshot with sidebar collapsed...');
      await page.screenshot({ 
        path: '/tmp/viewer-sidebar-collapsed.png',
        fullPage: false
      });
      
      // Check localStorage
      const sidebarState = await page.evaluate(() => {
        return localStorage.getItem('viewer-sidebar-collapsed');
      });
      console.log('Sidebar state in localStorage:', sidebarState);
      
      // Test persistence - reload page
      console.log('Reloading page to test persistence...');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      
      // Check if sidebar is still collapsed
      const bodyClass = await page.evaluate(() => {
        return document.body.classList.contains('viewer-sidebar-collapsed');
      });
      console.log('Sidebar still collapsed after reload:', bodyClass);
      
      // Take screenshot after reload
      await page.screenshot({ 
        path: '/tmp/viewer-sidebar-collapsed-after-reload.png',
        fullPage: false
      });
      
      // Toggle back to expanded
      await page.click('#sidebarToggleBtn');
      await page.waitForTimeout(500);
      await page.screenshot({ 
        path: '/tmp/viewer-sidebar-expanded-after-toggle.png',
        fullPage: false
      });
    }
    
    // Check console for CSP errors
    const consoleMessages = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('CSP') || text.includes('Content Security Policy')) {
        consoleMessages.push(text);
      }
    });
    
    // Wait a bit more to catch any delayed errors
    await page.waitForTimeout(2000);
    
    if (consoleMessages.length > 0) {
      console.log('CSP-related console messages:');
      consoleMessages.forEach(msg => console.log('  -', msg));
    } else {
      console.log('No CSP errors detected!');
    }
    
    console.log('\nTest complete! Screenshots saved to /tmp/');
    console.log('- viewer-sidebar-expanded.png');
    console.log('- viewer-sidebar-collapsed.png');
    console.log('- viewer-sidebar-collapsed-after-reload.png');
    console.log('- viewer-sidebar-expanded-after-toggle.png');
    
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await browser.close();
  }
}

testViewer();
