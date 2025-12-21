import { test } from '@playwright/test';

test('take hub screenshot after teacher login simulation', async ({ page }) => {
  await page.goto('/hub/');
  await page.waitForLoadState('networkidle');
  
  // Simulate teacher view by setting up session and showing the view
  await page.evaluate(() => {
    // Show the teacher view directly
    const viewTeacher = document.getElementById('view-teacher');
    if (viewTeacher) {
      viewTeacher.style.display = 'grid';
      
      // Trigger first rail button click to populate menu
      const firstRailBtn = document.querySelector('.hub-rail button');
      if (firstRailBtn) {
        firstRailBtn.click();
      }
    }
  });
  
  await page.waitForTimeout(1000);
  
  await page.screenshot({ 
    path: '/tmp/hub-layout-teacher.png',
    fullPage: false
  });
  
  console.log('Screenshot saved to /tmp/hub-layout-teacher.png');
});
