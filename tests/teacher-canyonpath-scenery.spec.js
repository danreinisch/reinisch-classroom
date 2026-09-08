import { test, expect } from '@playwright/test';

const ORIGIN = 'http://localhost:8888';
const SCENE = '/assets/bg/rc-annotated-canyon-approved.webp?v=20260908-annotated4';

async function isolate(page, { imageFailure = false, denied = false } = {}) {
  await page.clock.install({ time: new Date('2026-09-08T09:00:00-05:00') });
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rc_tc_sidebar', 'collapsed');
    localStorage.setItem('rc_unified_students', JSON.stringify([
      { id: 'synthetic-a', code: 'SYN-A', name: 'Synthetic learner A', active: true, class_id: 'LA1' },
      { id: 'synthetic-b', code: 'SYN-B', name: 'Synthetic learner B', active: true, class_id: 'LA1' },
    ]));
    localStorage.setItem('rc_unified_classes', JSON.stringify([{ id: 'LA1', code: 'LA1', name: 'Language Arts 1 SC' }]));
  });
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    // A fresh context, local static code, and synthetic responses only.
    if (url.origin !== ORIGIN || request.method() !== 'GET') return route.abort();
    if (imageFailure && url.pathname === '/assets/bg/rc-annotated-canyon-approved.webp') return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) {
      if (url.pathname.endsWith('/teacher-session')) return route.fulfill({ status: denied ? 401 : 200, json: denied ? { ok: false } : { ok: true, session: { code: 'teacher_local', role: 'teacher' } } });
      if (url.pathname.endsWith('/browser-supabase-config')) return route.fulfill({ status: 503, json: { ok: false } });
      return route.fulfill({ json: { ok: true, count: 0, students: [], goals: [], classes: [], assignments: [], instances: [], submissions: [], entries: [], rows: [], events: [], items: [], plans: [], templates: [] } });
    }
    if (url.pathname.startsWith('/assets/data/') && url.pathname.endsWith('.json')) return route.fulfill({ json: {} });
    return route.continue();
  });
}

async function assertDecodedScene(page) {
  const dimensions = await page.evaluate(async src => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, SCENE);
  expect(dimensions).toEqual([1672, 941]);
  await expect(page.locator('.tc-shell')).toHaveCSS('background-image', /rc-annotated-canyon-approved\.webp/);
  // The fade must continue below its last color stop: a fixed-height gradient
  // exposes the larger image again at the bottom of a long or wide dashboard.
  await expect(page.locator('.tc-shell')).toHaveCSS('background-size', /^100% 100%, 100% 100%,/);
}

for (const size of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'chromebook', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`canyon scenery ${size.name}: decoded artwork is exposed above dense cards`, async ({ page }, testInfo) => {
    await isolate(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/teacher/');
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await assertDecodedScene(page);
    // The previous 82%-opaque page-sized scrim hid an otherwise loaded image.
    await expect(page.locator('.tc-main')).toHaveCSS('background-color', 'rgba(3, 29, 24, 0.24)');
    await expect(page.locator('.tc-main > div').first()).toHaveCSS('min-height', '150px');
    await expect(page.locator('.tc-main > div').first()).toHaveCSS('align-items', 'flex-end');
    await expect(page.locator('#ovKpis .rc-card').first()).toHaveCSS('background-color', 'rgba(5, 48, 40, 0.96)');
    await expect(page.locator('#ovChecklistCard')).toBeVisible();
    await expect(page.locator('#ovFeedCard')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`canyon-${size.name}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`canyon-${size.name}-viewport.png`) });
  });
}

test('canyon light mode and reduced motion retain readable work surfaces', async ({ page }, testInfo) => {
  await isolate(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/teacher/');
  await assertDecodedScene(page);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await expect(page.locator('.tc-sidebar')).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('#ovKpis .rc-card').first()).toHaveCSS('background-color', 'rgba(5, 48, 40, 0.96)');
  await page.screenshot({ path: testInfo.outputPath('canyon-light.png'), fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.tc-shell')).toHaveCSS('background-image', 'none');
});

test('an unavailable image never hides content or delays the existing signed-out redirect', async ({ page }, testInfo) => {
  await isolate(page, { imageFailure: true });
  await page.goto('/teacher/');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expect(page.locator('#ovKpis')).toBeVisible();
  await expect(page.locator('#ovChecklistCard')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('canyon-image-unavailable.png') });
  await page.route('**/.netlify/functions/teacher-session', route => route.fulfill({ status: 401, json: { ok: false } }));
  await page.goto('/teacher/');
  await expect(page).toHaveURL(/\/teacher\/login\/\?next=/);
  await expect(page.locator('#loginForm')).toBeVisible();
});

for (const route of ['work', 'gradebook', 'observations']) {
  test(`canyon ${route}: no scenic spacer is added to the dense workspace`, async ({ page }, testInfo) => {
    await isolate(page);
    await page.goto(`/teacher/${route}/`);
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await assertDecodedScene(page);
    await expect(page.locator('.tc-main')).toBeVisible();
    await expect(page.locator('#ovKpis')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`canyon-${route}.png`) });
  });
}
