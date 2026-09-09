import { test, expect } from '@playwright/test';

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    await page.screenshot({ path: testInfo.outputPath('home-failure.png'), fullPage: true });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .map((el) => ({ element: el.tagName, id: el.id, className: String(el.className), right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width }))
      .filter((item) => item.right > innerWidth + 1));
    console.log('Homepage overflow diagnostics:', JSON.stringify(overflow));
  }
});

const mockConfig = {
  languageArts: { unit: 'MOCK CLASS ANNOUNCEMENT', currentWeek: 1, currentTitle: 'Mock reading', nextWeek: 2, nextTitle: 'Mock next lesson' },
  lifeSkills: { currentTitle: 'MOCK CLASS ANNOUNCEMENT', nextTitle: 'Mock next skill' },
  ticker: { dateFormat: 'none', timeFormat: 'none', speed: 90, items: [{ category: 'none', text: 'MOCK TICKER ANNOUNCEMENT' }] },
  countdowns: [{ label: 'Mock classroom checkpoint', date: '2099-09-20', type: 'milestone' }],
};
const mockState = { categories: { mockBook: { titles: ['Mock lesson A', 'Mock lesson B'] }, life: { titles: ['Mock skill'] }, toolkit: { titles: ['Mock toolkit'] } } };

async function openHome(page, { teacher = false, failure = false, empty = false, collapsed = false, imageFailure = false, homeOverride = null } = {}) {
  const errors = [];
  const writes = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url());
  });
  await page.addInitScript(({ isCollapsed, override }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rc_public_sidebar', isCollapsed ? 'collapsed' : 'expanded');
    if (override) localStorage.setItem('rc_home_config', JSON.stringify(override));
  }, { isCollapsed: collapsed, override: homeOverride });
  // Block every external origin. These screenshots contain only mock config;
  // no credentials, real sessions, or remote student/teacher data are used.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === 'http://localhost:8888' ? route.continue() : route.abort();
  });
  await page.route('**/web/data-adapter.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'export async function isRemote() { return false; } export const db = { getAppConfig: async () => null };',
  }));
  await page.route('**/.netlify/functions/**', (route) => {
    const isStandards = new URL(route.request().url()).pathname.endsWith('/teacher-dese-rollups');
    return route.fulfill({ status: teacher && isStandards ? 200 : 401, json: teacher && isStandards ? {
      ok: true, rows: [{ dese_code: 'MOCK.ELA.1', percent_correct: 30 }, { dese_code: 'MOCK.ELA.2', percent_correct: 50 }],
    } : { ok: false } });
  });
  await page.route('**/assets/data/home-config.json*', (route) => failure ? route.abort() : route.fulfill({ json: empty ? { countdowns: [] } : mockConfig }));
  await page.route('**/assets/data/site-state.json*', (route) => route.fulfill({ json: mockState }));
  if (imageFailure) await page.route('**/assets/bg/rc-annotated-canyon-approved.webp*', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.home-student-cta')).toBeVisible();
  await expect(page.locator('#daily-quote')).not.toHaveText('Loading…');
  if (!failure) await expect(page.locator('#home-stats')).toContainText('4 total presentations');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#classClock .tc-clock-time')).toBeVisible();
  return { errors, writes };
}

for (const view of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'chromebook', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844, collapsed: true },
  { name: 'wide', width: 2560, height: 1440 },
]) {
  test(`homepage ${view.name}: readable scenery, scenic ticker, and retained links`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    const result = await openHome(page, { collapsed: !!view.collapsed });
    await expect(page.locator('.home-scenic-ticker')).toHaveCount(1);
    await expect(page.locator('.ticker-track')).toHaveCount(1);
    await expect(page.locator('.ticker-content')).toHaveCount(2);
    await expect(page.locator('.ticker-content').first()).toContainText('MOCK TICKER ANNOUNCEMENT');
    await expect(page.locator('.ticker-track')).toHaveCSS('animation-name', 'home-scenic-ticker-scroll');
    await expect(page.locator('.ticker-track')).toHaveCSS('animation-duration', '90s');
    await expect(page.locator('.home-scenic-ticker')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('#focus-la, #focus-life')).toHaveCount(0);
    await expect(page.getByText('MOCK CLASS ANNOUNCEMENT')).toHaveCount(0);
    await expect(page.locator('.home-pathway')).toHaveCount(3);
    await expect(page.locator('.home-student-cta')).toHaveAttribute('href', '/student/');
    await expect(page.locator('.home-teacher-cta')).toHaveAttribute('href', '/teacher/');
    await expect(page.locator('.countdown-card')).toContainText('Mock classroom checkpoint');
    await expect(page.locator('#focus-standards')).toBeHidden();
    const image = page.locator('.home-landscape img');
    await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth === 1672 && el.naturalHeight === 941)).toBe(true);
    await expect(image).toHaveAttribute('src', /\/assets\/bg\/rc-annotated-canyon-approved\.webp\?v=20260908-annotated4/);
    await expect(image).toHaveCSS('filter', 'none');
    await expect(page.locator('.tc-main')).toHaveCSS('backdrop-filter', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const selector of ['.home-student-cta', '.home-teacher-cta', '.home-pathway']) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(result.errors).toEqual([]);
    expect(result.writes).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`home-${view.name}.png`), fullPage: true });
  });
}

test('homepage scenic ticker honors the new teacher-managed Classroom Message config', async ({ page }) => {
  const result = await openHome(page, {
    homeOverride: {
      classroomMessage: {
        version: 1,
        enabled: true,
        speed: 120,
        override: 'TEACHER SETTINGS OVERRIDE',
        weekdays: {
          monday: 'MONDAY MESSAGE',
          tuesday: 'TUESDAY MESSAGE',
          wednesday: 'WEDNESDAY MESSAGE',
          thursday: 'THURSDAY MESSAGE',
          friday: 'FRIDAY MESSAGE',
        },
      },
    },
  });
  await expect(page.locator('.ticker-content').first()).toContainText('TEACHER SETTINGS OVERRIDE');
  await expect(page.locator('.ticker-content').first()).not.toContainText('MOCK TICKER ANNOUNCEMENT');
  await expect(page.locator('.ticker-track')).toHaveCSS('animation-duration', '120s');
  await expect(page.locator('.home-scenic-ticker')).toHaveAttribute('data-message-source', 'override');
  expect(result.errors).toEqual([]);
  expect(result.writes).toEqual([]);
});

test('homepage light mode, keyboard focus, reduced motion, and mobile sidebar', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await openHome(page, { collapsed: true });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await expect(page.locator('.home-landscape')).toBeHidden();
  await expect(page.locator('.ticker-track')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.ticker-content[aria-hidden="true"]')).toBeHidden();
  await page.keyboard.press('Tab');
  await page.locator('.home-student-cta').focus();
  await expect(page.locator('.home-student-cta')).toHaveCSS('outline-color', 'rgb(11, 111, 92)');
  await expect(page.locator('.home-student-cta')).toHaveCSS('outline-width', '3px');
  await expect(page.locator('.home-pathway').first()).toHaveCSS('transition-duration', '0s');
  await page.locator('#tcSidebarToggle').click();
  await expect(page.locator('html')).not.toHaveClass(/tc-collapsed/);
  await page.locator('#tcSidebarToggle').click();
  await expect(page.locator('html')).toHaveClass(/tc-collapsed/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(result.errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('home-light-mobile.png'), fullPage: true });
});

test('homepage preserves teacher-only standards rendering using synthetic rows', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const result = await openHome(page, { teacher: true });
  await expect(page.locator('#focus-standards')).toBeVisible();
  await expect(page.locator('#focus-standards')).toContainText('MOCK.ELA.1');
  await expect(page.locator('#focus-standards')).toContainText('30%');
  await expect(page.locator('#focus-standards .hd-standards-link')).toHaveAttribute('href', '/teacher/');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await expect(page.locator('#focus-standards')).toHaveCSS('background-color', 'rgb(5, 48, 40)');
  expect(result.errors).toEqual([]);
  expect(result.writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('home-light-standards-mock.png'), fullPage: true });
});

test('entry links remain usable when home config fails or contains no dates', async ({ page }) => {
  const failed = await openHome(page, { failure: true });
  await expect(page.locator('.home-student-cta')).toBeVisible();
  await expect(page.locator('.home-teacher-cta')).toBeVisible();
  await expect(page.locator('#home-focus-section')).toBeHidden();
  expect(failed.errors).toEqual([]);
  await page.unrouteAll({ behavior: 'wait' });
  const empty = await openHome(page, { empty: true });
  await expect(page.locator('#home-focus-section')).toBeHidden();
  await expect(page.locator('.home-pathway')).toHaveCount(3);
  expect(empty.errors).toEqual([]);
});

test('homepage presentation does not load on Student Portal or Teacher Center routes', async ({ request }) => {
  for (const route of ['/student/', '/teacher/']) {
    const response = await request.get(route);
    expect(response.ok()).toBe(true);
    const source = await response.text();
    expect(source).not.toContain('home-canyonpath.css');
    expect(source).not.toContain('home-scenic-ticker.css');
    expect(source).not.toContain('class="rc-home-canyonpath"');
  }
});


test('missing decorative scenery never blocks homepage entry links', async ({ page }) => {
  const result = await openHome(page, { imageFailure: true });
  await expect.poll(() => page.locator('.home-landscape img').evaluate((el) => el.complete && el.naturalWidth === 0)).toBe(true);
  await expect(page.locator('.home-student-cta')).toBeVisible();
  await expect(page.locator('.home-teacher-cta')).toBeVisible();
  await expect(page.locator('.home-pathway[href="/life-skills/"]')).toHaveAccessibleName('Open Transitional Skills');
  expect(result.errors).toEqual([]);
  expect(result.writes).toEqual([]);
});
