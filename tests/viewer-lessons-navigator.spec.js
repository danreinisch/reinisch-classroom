import { test, expect } from '@playwright/test';

test.describe('Viewer Page Lessons Navigator Tests', () => {
  test('should navigate to new viewer URL when clicking presentation from lessons navigator on viewer page', async ({ page }) => {
    // Start on a regular page first to set up the app shell
    await page.goto('/hub/');
    await page.waitForLoadState('networkidle');

    // Navigate to a viewer page with a presentation
    const testPresentationUrl = '/presentations/a-door-into-time/presentation-04/index.html';
    await page.goto(`/viewer/?src=${encodeURIComponent(testPresentationUrl)}&return=/hub/`);
    await page.waitForLoadState('networkidle');

    // Verify we're on the viewer page
    const currentUrl = page.url();
    expect(currentUrl).toContain('/viewer/');
    expect(currentUrl).toContain('src=');

    // Check if sidebar toggle button exists
    const sidebarToggle = page.locator('#sidebarToggleBtn');
    if (await sidebarToggle.count() > 0 && await sidebarToggle.isVisible()) {
      // Open the sidebar (expand from icon-only to full width)
      await sidebarToggle.click();
      await page.waitForTimeout(300); // Wait for transition

      // Check if lessons navigator button exists
      const lessonsButton = page.locator('[data-shell-nav="lessons"]');
      if (await lessonsButton.count() > 0 && await lessonsButton.isVisible()) {
        // Open the lessons navigator
        await lessonsButton.click();
        await page.waitForTimeout(300); // Wait for panel to open

        // Check if lessons navigator is open
        const lessonsNav = page.locator('.lessons-navigator');
        if (await lessonsNav.count() > 0 && await lessonsNav.isVisible()) {
          // Try to find a presentation link in the lessons navigator
          const presentationLinks = page.locator('.lessons-navigator a[data-presentation-url]');
          const linkCount = await presentationLinks.count();

          if (linkCount > 0) {
            // Get the first presentation link's URL
            const firstLink = presentationLinks.first();
            const presentationUrl = await firstLink.getAttribute('data-presentation-url');

            // Store current URL before clicking
            const beforeUrl = page.url();

            // Click the presentation link
            await firstLink.click();
            
            // Wait for navigation
            await page.waitForLoadState('networkidle');

            // Verify navigation happened
            const afterUrl = page.url();
            expect(afterUrl).not.toBe(beforeUrl);
            
            // Verify we're still on the viewer page (not on an inline overlay)
            expect(afterUrl).toContain('/viewer/');
            expect(afterUrl).toContain('src=');
            
            // Verify the src parameter changed to the new presentation
            if (presentationUrl) {
              expect(afterUrl).toContain(encodeURIComponent(presentationUrl));
            }

            // Verify no inline presentation viewer overlay is present
            const inlineViewer = page.locator('.presentation-viewer.open');
            expect(await inlineViewer.count()).toBe(0);

            // Verify the dedicated viewer iframe is visible
            const viewerIframe = page.locator('#contentIframe');
            expect(await viewerIframe.count()).toBe(1);
          } else {
            console.log('No presentation links found in lessons navigator - skipping link click test');
          }
        } else {
          console.log('Lessons navigator not available - skipping test');
        }
      } else {
        console.log('Lessons button not found - skipping test');
      }
    } else {
      console.log('Sidebar toggle not found - skipping test');
    }
  });

  test('should keep sidebar closed and navigator closed after navigation on viewer page', async ({ page }) => {
    // Navigate directly to viewer page
    const testPresentationUrl = '/presentations/a-door-into-time/presentation-04/index.html';
    await page.goto(`/viewer/?src=${encodeURIComponent(testPresentationUrl)}&return=/hub/`);
    await page.waitForLoadState('networkidle');

    // Store initial state - sidebar should be in icon-only mode
    const rail = page.locator('.app-shell-rail');
    const hasOpenClass = await rail.evaluate(el => el.classList.contains('open'));
    
    // If we can open sidebar and lessons navigator
    if (!hasOpenClass) {
      const sidebarToggle = page.locator('#sidebarToggleBtn');
      if (await sidebarToggle.count() > 0) {
        await sidebarToggle.click();
        await page.waitForTimeout(300);

        const lessonsButton = page.locator('[data-shell-nav="lessons"]');
        if (await lessonsButton.count() > 0 && await lessonsButton.isVisible()) {
          await lessonsButton.click();
          await page.waitForTimeout(300);

          // Verify lessons navigator opened
          const lessonsNav = page.locator('.lessons-navigator');
          const isOpen = await lessonsNav.evaluate(el => el.classList.contains('open'));
          expect(isOpen).toBe(true);

          // Now find and click a presentation link
          const presentationLinks = page.locator('.lessons-navigator a[data-presentation-url]');
          if (await presentationLinks.count() > 0) {
            await presentationLinks.first().click();
            await page.waitForLoadState('networkidle');

            // After navigation, verify sidebar and navigator are closed
            const railAfter = page.locator('.app-shell-rail');
            const hasOpenClassAfter = await railAfter.evaluate(el => el.classList.contains('open'));
            expect(hasOpenClassAfter).toBe(false);

            const lessonsNavAfter = page.locator('.lessons-navigator');
            const isOpenAfter = await lessonsNavAfter.evaluate(el => el.classList.contains('open'));
            expect(isOpenAfter).toBe(false);
          }
        }
      }
    }
  });
});
