import { test, expect } from '@playwright/test';

async function isolatedPublic(page, { saved = 'expanded' } = {}) {
  const errors = [];
  const writes = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url());
  });
  await page.route('**/*', (route) => {
    const request = route.request();
    return new URL(request.url()).origin === 'http://localhost:8888' && ['GET', 'HEAD'].includes(request.method())
      ? route.continue() : route.abort();
  });
  await page.route('**/.netlify/functions/**', (route) => route.fulfill({ status: 401, json: { ok: false } }));
  await page.route('**/web/data-adapter.js*', (route) => route.fulfill({ contentType: 'application/javascript', body: 'export async function isRemote() { return false; } export const db = { getAppConfig: async () => null };' }));
  await page.route('**/assets/data/home-config.json*', (route) => route.fulfill({ json: { countdowns: [] } }));
  await page.route('**/assets/data/site-state.json*', (route) => route.fulfill({ json: { categories: {} } }));
  // These are isolated test contexts, not the user's browser/session. Seed once
  // so normal sidebar persistence can be exercised across real document loads.
  await page.addInitScript((preference) => {
    if (!sessionStorage.getItem('public-navigation-test-seeded')) {
      localStorage.clear();
      sessionStorage.clear();
      if (preference !== null) localStorage.setItem('rc_public_sidebar', preference);
      sessionStorage.setItem('public-navigation-test-seeded', 'true');
    }
    window.__publicNavigationReveal = null;
    window.addEventListener('pagereveal', (event) => {
      window.__publicNavigationReveal = Boolean(event.viewTransition);
    });
    window.__publicNavigationFrames = [];
    function sample() {
      if (document.querySelector('.tc-sidebar')) {
        window.__publicNavigationFrames.push(document.documentElement.classList.contains('tc-collapsed'));
      }
      if (window.__publicNavigationFrames.length < 12) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, saved);
  return { errors, writes };
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) {
    await page.screenshot({ path: info.outputPath('navigation-failure.png'), fullPage: true });
  }
});

for (const view of [
  { name: 'desktop-default', width: 1440, saved: null, collapsed: true },
  { name: 'desktop-expanded', width: 1440, saved: 'expanded', collapsed: false },
  { name: 'tablet-default', width: 960, saved: null, collapsed: true },
  { name: 'mobile-saved-open', width: 390, saved: 'expanded', collapsed: true },
]) {
  test(`navigation ${view.name}: correct home choices and no first-frame sidebar jump`, async ({ page }, info) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    const result = await isolatedPublic(page, { saved: view.saved });
    await page.goto('/');
    await expect(page.locator('.home-pathway strong')).toHaveText(['Language Arts', 'Transitional Skills', 'Student Portal']);
    await expect(page.locator('.home-pathway').nth(2)).toHaveAttribute('href', '/student/');
    await expect(page.locator('.home-pathway').nth(2)).toHaveAccessibleName('Open Student Portal');
    await expect(page.locator('.home-teacher-cta')).toHaveAttribute('href', '/teacher/');
    await expect.poll(() => page.evaluate(() => window.__publicNavigationFrames.length)).toBeGreaterThanOrEqual(8);
    expect(await page.evaluate(() => window.__publicNavigationFrames)).toEqual(expect.arrayContaining([view.collapsed]));
    expect(await page.evaluate(() => [...new Set(window.__publicNavigationFrames)])).toEqual([view.collapsed]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.locator('link[data-public-navigation]')).toHaveCount(1);
    await expect(page.locator('link[data-canyon-scene-preload]')).toHaveCount(1);
    await expect(page.locator('.home-landscape img')).toHaveJSProperty('complete', true);
    expect(result.errors).toEqual([]);
    expect(result.writes).toEqual([]);
    await page.screenshot({ path: info.outputPath(`navigation-${view.name}.png`), fullPage: true });
  });
}

test('navigation delayed CSS: first content paint waits for the public theme', async ({ page }) => {
  await isolatedPublic(page);
  await page.route('**/assets/css/public-canyonpath.css*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.goto('/classroom-resources/');
  await expect(page.locator('link[data-public-canyonpath]')).toHaveAttribute('blocking', 'render');
  await expect(page.locator('link[data-public-navigation]')).toHaveAttribute('blocking', 'render');
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('first-contentful-paint').length)).toBe(1);
  const timing = await page.evaluate(() => ({
    paint: performance.getEntriesByName('first-contentful-paint')[0].startTime,
    stylesheet: performance.getEntriesByType('resource').find((r) => r.name.includes('/public-canyonpath.css')).responseEnd,
    sceneStart: performance.getEntriesByType('resource').find((r) => r.name.includes('/rc-annotated-canyon.svg')).startTime,
    ready: performance.getEntriesByType('navigation')[0].domContentLoadedEventStart,
  }));
  expect(timing.stylesheet).toBeGreaterThan(0);
  expect(timing.paint).toBeGreaterThanOrEqual(timing.stylesheet);
  expect(timing.sceneStart).toBeLessThanOrEqual(timing.ready);
  await expect(page.locator('.resource-card').first()).toHaveCSS('background-color', 'rgba(5, 48, 40, 0.95)');
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`navigation ${reducedMotion}: real link loads and back/forward keep working`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion });
    const result = await isolatedPublic(page);
    await page.goto('/');
    await page.evaluate(() => { window.__previousDocumentMarker = true; });
    await page.locator('.tc-nav a[data-href="/classroom-resources/"]').click();
    await expect(page).toHaveURL(/\/classroom-resources\/$/);
    await expect(page.getByRole('heading', { name: 'Classroom Resources', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__previousDocumentMarker)).toBeUndefined();
    // Chromium used by this suite supports cross-document view transitions.
    // The event distinguishes an actual native transition from CSS-only claims.
    await expect.poll(() => page.evaluate(() => window.__publicNavigationReveal)).toBe(reducedMotion === 'no-preference');
    await page.goBack();
    await expect(page).toHaveURL('http://localhost:8888/');
    await expect(page.locator('.home-pathway').nth(2)).toHaveAttribute('href', '/student/');
    await page.goForward();
    await expect(page).toHaveURL(/\/classroom-resources\/$/);
    await page.locator('.tc-nav a[data-href="/language-arts/"]').click();
    await expect(page.getByRole('heading', { name: 'Language Arts', exact: true })).toBeVisible();
    await page.locator('.tc-nav a[data-href="/"]').click();
    await page.locator('.home-pathway[href="/life-skills/"]').click();
    await expect(page).toHaveURL(/\/life-skills\/$/);
    await expect(page.locator('html')).toHaveClass(/rc-public-navigation/);
    expect(result.errors).toEqual([]);
    expect(result.writes).toEqual([]);
  });
}

test('navigation sidebar choice persists across documents and keyboard links remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await isolatedPublic(page);
  await page.goto('/');
  await page.locator('#tcSidebarToggle').click();
  await expect(page.locator('html')).toHaveClass(/tc-collapsed/);
  await page.locator('.home-pathway[href="/language-arts/"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/language-arts\/$/);
  await expect(page.locator('html')).toHaveClass(/tc-collapsed/);
  await expect(page.locator('#tcSidebarToggle')).toHaveAttribute('aria-expanded', 'false');
});

test('navigation failed enhancement or scenery never leaves content hidden or links blocked', async ({ page }) => {
  const result = await isolatedPublic(page);
  await page.route('**/assets/css/public-navigation.css*', (route) => route.abort());
  await page.route('**/assets/bg/rc-annotated-canyon.svg*', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.home-pathway').nth(2)).toBeVisible();
  await page.locator('.home-pathway[href="/language-arts/"]').click();
  await expect(page).toHaveURL(/\/language-arts\/$/);
  await expect(page.getByRole('heading', { name: 'Language Arts', exact: true })).toBeVisible();
  expect(result.errors).toEqual([]);
  expect(result.writes).toEqual([]);
});

test('navigation polish stays outside Teacher Center, Student Portal, and viewer', async ({ page }) => {
  await isolatedPublic(page);
  for (const path of ['/teacher/', '/student/', '/viewer/']) {
    await page.goto(path);
    await expect(page.locator('html')).not.toHaveClass(/rc-public-navigation/);
    await expect(page.locator('link[data-public-navigation], link[data-canyon-scene-preload]')).toHaveCount(0);
  }
});
