import { test, expect } from '@playwright/test';

async function localOnly(page) {
  const writes = [];
  const errors = [];

  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) {
      writes.push(request.url());
    }
  });

  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin !== 'http://localhost:8888') {
      return route.abort();
    }

    if (url.pathname.startsWith('/.netlify/functions/')) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false }),
      });
    }

    if (url.pathname.startsWith('/assets/data/') && url.pathname.endsWith('.json')) {
      return route.fulfill({
        contentType: 'application/json',
        body: '{}',
      });
    }

    return route.continue();
  });

  return { writes, errors };
}

test('Home approved scene spans the full main canvas without right bias', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rc_public_sidebar', 'expanded');
  });

  const result = await localOnly(page);
  await page.goto('/');

  const landscape = page.locator('.home-landscape');
  const image = landscape.locator('img');

  await expect(image).toHaveJSProperty('complete', true);

  const geometry = await page.evaluate(() => {
    const landscape = document.querySelector('.home-landscape');
    const image = landscape?.querySelector('img');
    if (!landscape || !image) return null;

    const outer = landscape.getBoundingClientRect();
    const inner = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    const veil = getComputedStyle(landscape, '::after');

    return {
      outerLeft: outer.left,
      outerRight: outer.right,
      innerLeft: inner.left,
      innerRight: inner.right,
      objectPosition: style.objectPosition,
      maxWidth: style.maxWidth,
      marginLeft: style.marginLeft,
      veil: veil.backgroundImage,
    };
  });

  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry.innerLeft - geometry.outerLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.innerRight - geometry.outerRight)).toBeLessThanOrEqual(1);
  expect(geometry.objectPosition).toBe('50% 100%');
  expect(geometry.maxWidth).toBe('none');
  expect(geometry.marginLeft).toBe('0px');
  expect(geometry.veil).toContain('rgba(3, 23, 20, 0.28)');

  expect(result.writes).toEqual([]);
  expect(result.errors).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('home-full-scene.png'),
    fullPage: true,
  });
});

test('Student desktop login keeps its navigation rail visible and expandable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rc_student_sidebar', 'collapsed');
  });

  const result = await localOnly(page);
  await page.goto('/student/');

  await page.waitForFunction(() =>
    document.body.classList.contains('rc-student-canyonpath')
  );

  await expect(page.locator('#loginView')).toBeVisible();

  const sidebar = page.locator('.tc-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveCSS('width', '64px');
  await expect(sidebar).toHaveCSS('transform', 'none');

  await page.locator('#tcSidebarToggle').click();

  await expect(page.locator('html')).not.toHaveClass(/tc-collapsed/);
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveCSS('width', '260px');
  await expect(page.locator('#loginView')).toBeVisible();

  expect(result.writes).toEqual([]);
  expect(result.errors).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('student-login-sidebar-desktop.png'),
    fullPage: true,
  });
});

test('Student mobile login keeps the existing off-canvas collapsed behavior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rc_student_sidebar', 'collapsed');
  });

  const result = await localOnly(page);
  await page.goto('/student/');

  await page.waitForFunction(() =>
    document.body.classList.contains('rc-student-canyonpath')
  );

  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/tc-collapsed/);

  const mobileSidebar = await page.locator('.tc-sidebar').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      transform: getComputedStyle(el).transform,
    };
  });

  expect(mobileSidebar.width).toBeGreaterThan(200);
  expect(mobileSidebar.right).toBeLessThanOrEqual(1);
  expect(mobileSidebar.transform).not.toBe('none');

  expect(result.writes).toEqual([]);
  expect(result.errors).toEqual([]);
});
