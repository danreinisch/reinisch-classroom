import { test, expect } from '@playwright/test';

async function prepare(page, width = 1366, height = 768) {
  await page.setViewportSize({ width, height });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rc_student_sidebar', 'collapsed');
  });

  await page.route('**/*', route => {
    const url = new URL(route.request().url());

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

    if (
      url.pathname.startsWith('/assets/data/') &&
      url.pathname.endsWith('.json')
    ) {
      return route.fulfill({
        contentType: 'application/json',
        body: '{}',
      });
    }

    return route.continue();
  });

  await page.goto('/student/');

  await page.waitForFunction(() =>
    document.body.classList.contains('rc-student-canyonpath')
  );
}

test('Student login keeps the eight-item navigation rail visible', async ({ page }) => {
  await prepare(page);

  await expect(page.locator('#loginView')).toBeVisible();

  const sidebar = page.locator('.tc-sidebar');
  const links = sidebar.locator('.tc-nav a[data-tab]');

  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveCSS('width', '64px');
  await expect(links).toHaveCount(8);

  for (let i = 0; i < 8; i += 1) {
    await expect(links.nth(i)).toBeVisible();
  }

  await expect(links.first()).toHaveCSS('pointer-events', 'none');

  await page.locator('#tcSidebarToggle').click();

  await expect(page.locator('html')).not.toHaveClass(/tc-collapsed/);
  await expect(sidebar).toHaveCSS('width', '260px');

  await expect(sidebar.locator('.tc-label')).toHaveText([
    'Dashboard',
    'Assignments',
    'Library',
    'Resources',
    'Activities',
    'Grades',
    'Goals',
    'Settings',
  ]);
});

test('Authenticated dashboard keeps Student navigation visible and interactive', async ({ page }) => {
  await prepare(page);

  await page.evaluate(() => {
    document.querySelector('#loginView')?.classList.add('hidden');
    document.querySelector('#studentDashboardView')?.classList.remove('hidden');
  });

  await expect(page.locator('#studentDashboardView')).toBeVisible();

  const sidebar = page.locator('.tc-sidebar');
  const links = sidebar.locator('.tc-nav a[data-tab]');

  await expect(sidebar).toBeVisible();
  await expect(links).toHaveCount(8);

  for (let i = 0; i < 8; i += 1) {
    await expect(links.nth(i)).toBeVisible();
    await expect(links.nth(i)).toHaveCSS('pointer-events', 'auto');
  }

  await expect(links.first()).toHaveClass(/active/);
});

test('Student mobile login retains collapsed off-canvas navigation', async ({ page }) => {
  await prepare(page, 390, 844);

  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/tc-collapsed/);

  const rail = await page.locator('.tc-sidebar').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return {
      right: rect.right,
      width: rect.width,
      transform: getComputedStyle(el).transform,
    };
  });

  expect(rail.width).toBeGreaterThan(200);
  expect(rail.right).toBeLessThanOrEqual(1);
  expect(rail.transform).not.toBe('none');
});


test('Student compact desktop keeps the sidebar physically on canvas', async ({ page }) => {
  await prepare(page, 720, 844);

  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/tc-collapsed/);

  const sidebar = page.locator('.tc-sidebar');

  await expect.poll(
    () => sidebar.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      return (
        rect.left >= -1 &&
        rect.right > 60 &&
        rect.width >= 63 &&
        style.transform === 'none' &&
        style.position === 'sticky'
      );
    }),
    {
      message: 'collapsed compact-desktop Student rail should settle fully on canvas',
      timeout: 2000,
    }
  ).toBe(true);

  await page.evaluate(() => {
    document.querySelector('#loginView')?.classList.add('hidden');
    document.querySelector('#studentDashboardView')?.classList.remove('hidden');
  });

  await expect(page.locator('#studentDashboardView')).toBeVisible();

  await expect.poll(
    () => sidebar.evaluate(el => {
      const rect = el.getBoundingClientRect();

      return (
        rect.left >= -1 &&
        rect.right > 60 &&
        rect.width >= 63 &&
        getComputedStyle(el).transform === 'none'
      );
    }),
    {
      message: 'authenticated compact-desktop Student rail should remain fully on canvas',
      timeout: 2000,
    }
  ).toBe(true);

  await page.locator('#tcSidebarToggle').click();

  await expect(page.locator('html')).not.toHaveClass(/tc-collapsed/);
  await expect(sidebar).toHaveCSS('width', '260px');

  await expect.poll(
    async () => {
      const expanded = await sidebar.boundingBox();

      return Boolean(
        expanded &&
        expanded.x >= -1 &&
        expanded.width >= 259
      );
    },
    {
      message: 'expanded compact-desktop Student sidebar should settle on canvas at full width',
      timeout: 2000,
    }
  ).toBe(true);
});
