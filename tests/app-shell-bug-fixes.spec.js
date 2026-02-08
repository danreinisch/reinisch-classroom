import { test, expect } from '@playwright/test';

test.describe('App Shell Bug Fixes', () => {
  test('Bug 1: detectPresentationContext should detect ?viewer=1 parameter', async ({ page }) => {
    // Navigate to homepage with viewer=1 parameter
    const testPresentationUrl = '/presentations/a-door-into-time/presentation-04/index.html';
    await page.goto(`/?viewer=1&section=language-arts&unit=test-unit&presentation=test-presentation&src=${encodeURIComponent(testPresentationUrl)}`);
    await page.waitForLoadState('networkidle');

    // Wait for body element to be available
    await page.waitForSelector('body');

    // Check if app-shell-icon-only class is added to body (on desktop)
    const body = page.locator('body');
    const hasIconOnlyClass = await body.evaluate((el) => {
      return el.classList.contains('app-shell-icon-only');
    });
    
    const hasPresentationActiveClass = await body.evaluate((el) => {
      return el.classList.contains('rc-presentation-active');
    });

    // Verify presentation context was detected
    expect(hasPresentationActiveClass).toBe(true);
    
    // On desktop (viewport > 768px), icon-only class should be added immediately
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width > 768) {
      expect(hasIconOnlyClass).toBe(true);
    }
  });

  test('Bug 2: detectRoleSession should not probe session on homepage', async ({ page }) => {
    // Set up request interception to catch session endpoint calls
    const sessionRequests = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('teacher-session') || 
          url.includes('admin-session') || 
          url.includes('substitute-session')) {
        sessionRequests.push(url);
      }
    });

    // Navigate to homepage (public page)
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for app shell to potentially initialize and check auth
    await page.waitForSelector('body');

    // Verify no session endpoint was called
    expect(sessionRequests.length).toBe(0);
  });

  test('Bug 2: detectRoleSession should not probe session on viewer page', async ({ page }) => {
    // Set up request interception to catch session endpoint calls
    const sessionRequests = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('teacher-session') || 
          url.includes('admin-session') || 
          url.includes('substitute-session')) {
        sessionRequests.push(url);
      }
    });

    // Navigate to viewer page (public page)
    const testPresentationUrl = '/presentations/a-door-into-time/presentation-04/index.html';
    await page.goto(`/viewer/?src=${encodeURIComponent(testPresentationUrl)}`);
    await page.waitForLoadState('networkidle');

    // Wait for app shell to potentially initialize and check auth
    await page.waitForSelector('body');

    // Verify no session endpoint was called
    expect(sessionRequests.length).toBe(0);
  });

  test('Bug 3: normalizeLessonsData should not fire HEAD requests on inline viewer', async ({ page }) => {
    // Set up request interception to catch HEAD requests
    const headRequests = [];
    page.on('request', (request) => {
      if (request.method() === 'HEAD') {
        headRequests.push(request.url());
      }
    });

    // Navigate to homepage with inline viewer
    const testPresentationUrl = '/presentations/a-door-into-time/presentation-04/index.html';
    await page.goto(`/?viewer=1&src=${encodeURIComponent(testPresentationUrl)}`);
    await page.waitForLoadState('networkidle');

    // Wait for lessons data to potentially load
    await page.waitForSelector('body');

    // Try to open lessons navigator if available
    const lessonsButton = page.locator('[data-shell-nav="lessons"]');
    if (await lessonsButton.count() > 0 && await lessonsButton.isVisible()) {
      await lessonsButton.click();
      // Wait for lessons navigator to open
      await page.waitForSelector('.lessons-navigator.open', { timeout: 2000 }).catch(() => {});
    }

    // Verify no HEAD requests were made to presentation URLs
    const presentationHeadRequests = headRequests.filter(url => 
      url.includes('/presentations/') || url.includes('/life-skills/')
    );
    
    // Should have no HEAD requests for presentations when using inline viewer
    expect(presentationHeadRequests.length).toBe(0);
  });

  test('Bug 3: normalizeLessonsData should not fire HEAD requests on viewer page', async ({ page }) => {
    // Set up request interception to catch HEAD requests
    const headRequests = [];
    page.on('request', (request) => {
      if (request.method() === 'HEAD') {
        headRequests.push(request.url());
      }
    });

    // Navigate to viewer page
    const testPresentationUrl = '/presentations/a-door-into-time/presentation-04/index.html';
    await page.goto(`/viewer/?src=${encodeURIComponent(testPresentationUrl)}`);
    await page.waitForLoadState('networkidle');

    // Wait for body and app shell to initialize
    await page.waitForSelector('body');

    // Try to open lessons navigator if available
    const sidebarToggle = page.locator('#sidebarToggleBtn');
    if (await sidebarToggle.count() > 0 && await sidebarToggle.isVisible()) {
      await sidebarToggle.click();
      // Wait for sidebar to open
      await page.waitForSelector('.app-shell-rail.open', { timeout: 1000 }).catch(() => {});

      const lessonsButton = page.locator('[data-shell-nav="lessons"]');
      if (await lessonsButton.count() > 0 && await lessonsButton.isVisible()) {
        await lessonsButton.click();
        // Wait for lessons navigator to open
        await page.waitForSelector('.lessons-navigator.open', { timeout: 2000 }).catch(() => {});
      }
    }

    // Verify no HEAD requests were made to presentation URLs
    const presentationHeadRequests = headRequests.filter(url => 
      url.includes('/presentations/') || url.includes('/life-skills/')
    );
    
    // Should have no HEAD requests for presentations on viewer page
    expect(presentationHeadRequests.length).toBe(0);
  });
});
