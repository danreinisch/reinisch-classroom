import { test, expect } from '@playwright/test';

async function openPublic(page, path, mobile = false) {
  const writes = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  await page.addInitScript((collapsed) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rc_public_sidebar', collapsed ? 'collapsed' : 'expanded');
  }, mobile);
  // All content is local/public or synthetic. No real session, remote data,
  // credentials, or state-changing HTTP request is allowed in this test.
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    return url.origin === 'http://localhost:8888' && ['GET', 'HEAD'].includes(request.method())
      ? route.continue() : route.abort();
  });
  await page.route('**/.netlify/functions/**', (route) => route.fulfill({ status: 401, json: { ok: false } }));
  await page.route('**/web/data-adapter.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'export async function isRemote() { return false; } export const db = { getAppConfig: async () => null };',
  }));
  await page.goto(path);
  await expect(page.locator('body')).toBeVisible();
  return { writes, errors };
}

const pages = [
  { path: '/classroom-resources/', name: 'resources', card: '.resource-card' },
  { path: '/language-arts/', name: 'language', card: '.book-card' },
  { path: '/life-skills/', name: 'transitional', card: '.grid .card' },
  { path: '/toolkits/', name: 'toolkits', card: '.toolkit-card' },
  { path: '/language-arts/toolkit/', name: 'ela-toolkit', card: '.rc-card' },
  { path: '/math-toolkit/', name: 'math-toolkit', card: '.book-card' },
];

for (const entry of pages) {
  for (const view of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    test(`public ${entry.name} ${view.name}: consistent reading surfaces and intact entry links`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: view.width, height: view.height });
      const result = await openPublic(page, entry.path, view.name === 'mobile');
      await expect(page.locator('html')).toHaveClass(/rc-public-canyonpath/);
      await expect(page.locator('link[data-public-canyonpath]')).toHaveCount(1);
      await expect(page.locator('.cp-public-landscape')).toHaveCount(1);
      const image = page.locator('.cp-public-landscape img');
      await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth === 2400)).toBe(true);
      await expect(image).toHaveAttribute('alt', '');
      await expect(image).toHaveCSS('filter', 'none');
      await expect(page.locator('.tc-main')).toHaveCSS('backdrop-filter', 'none');
      const card = page.locator(entry.card).first();
      await expect(card).toBeVisible();
      await expect(card).toHaveCSS('background-color', 'rgba(5, 48, 40, 0.95)');
      expect(await card.getAttribute('href')).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(result.writes).toEqual([]);
      expect(result.errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`public-${entry.name}-${view.name}.png`), fullPage: true });
    });
  }
}

test('public resources retain keyboard focus, light-mode contrast, and reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await openPublic(page, '/classroom-resources/', true);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await expect(page.locator('.cp-public-landscape')).toBeHidden();
  const card = page.locator('.resource-card').first();
  await card.focus();
  await expect(card).toHaveCSS('outline-width', '3px');
  await expect(card).toHaveCSS('outline-color', 'rgb(11, 111, 92)');
  await expect(card).toHaveCSS('transition-duration', '0s');
  await expect(card).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.98)');
  await expect(card).toHaveAttribute('data-viewer-src', '/classroom-resources/classroom-playbook/');
  expect(result.writes).toEqual([]);
  expect(result.errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('public-resources-light-mobile.png'), fullPage: true });
});

test('public theme does not enter the homepage, Teacher Center, or Student Portal', async ({ page }) => {
  for (const path of ['/', '/teacher/', '/student/']) {
    await openPublic(page, path);
    await expect(page.locator('html')).not.toHaveClass(/rc-public-canyonpath/);
    await expect(page.locator('link[data-public-canyonpath]')).toHaveCount(0);
    await expect(page.locator('.cp-public-landscape')).toHaveCount(0);
    await page.unrouteAll({ behavior: 'wait' });
  }
});
