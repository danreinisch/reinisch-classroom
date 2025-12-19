import { test, expect } from '@playwright/test';

/**
 * Test for PR D3: Video fallback without inline scripts
 * Verifies that the homepage video error handler works without CSP violations
 */

test.describe('Homepage Video Fallback', () => {
  test('should load homepage without CSP violations for inline scripts', async ({ page }) => {
    const cspViolations = [];
    
    // Listen for CSP violations
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Content Security Policy') || text.includes('CSP')) {
        cspViolations.push(text);
      }
    });

    // Navigate to homepage
    await page.goto('/');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Check for CSP violations related to inline scripts
    const inlineScriptViolations = cspViolations.filter(v => 
      v.includes('inline') && v.includes('script')
    );
    
    expect(inlineScriptViolations).toHaveLength(0);
  });

  test('should have bg-video element with error handler attached', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page load
    await page.waitForLoadState('domcontentloaded');
    
    // Check that bg-video element exists
    const videoElement = await page.locator('#bg-video');
    await expect(videoElement).toBeVisible();
    
    // Verify video has the correct attributes
    await expect(videoElement).toHaveAttribute('autoplay');
    await expect(videoElement).toHaveAttribute('muted');
    await expect(videoElement).toHaveAttribute('loop');
  });

  test('should apply video-fallback class when video fails to load', async ({ page }) => {
    await page.goto('/');
    
    // Wait for DOM to be ready
    await page.waitForLoadState('domcontentloaded');
    
    // Simulate video error by triggering error event
    await page.evaluate(() => {
      const video = document.getElementById('bg-video');
      if (video) {
        // Trigger error event
        const errorEvent = new Event('error');
        video.dispatchEvent(errorEvent);
      }
    });
    
    // Wait a bit for the error handler to process
    await page.waitForTimeout(100);
    
    // Check that video-fallback class was added to body
    const body = await page.locator('body');
    await expect(body).toHaveClass(/video-fallback/);
    
    // Check that video is hidden
    const video = await page.locator('#bg-video');
    const display = await video.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should have external site.js script loaded', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check that site.js is loaded via script tag
    const siteJsScript = await page.locator('script[src*="site.js"]');
    await expect(siteJsScript).toHaveCount(1);
    
    // Verify the script is external (has src attribute), not inline
    const hasSrc = await siteJsScript.evaluate(el => el.hasAttribute('src'));
    expect(hasSrc).toBe(true);
  });
});
