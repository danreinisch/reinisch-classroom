import { test, expect } from '@playwright/test';

const ORIGIN = 'http://localhost:8888';
const teacherMarker = 'body:has(.tc-sidebar[aria-label="Teacher navigation"])';
const students = [
  { id: 'synthetic-a', code: 'SYN-A', name: 'Synthetic learner A', active: true, class_id: 'LA1' },
  { id: 'synthetic-b', code: 'SYN-B', name: 'Synthetic learner B', active: true, class_id: 'LA1' },
];

async function isolate(page, { status = 200, collapsed = true, populated = false } = {}) {
  // Every context starts empty. Nothing here uses a production session or cookie.
  await page.addInitScript(({ collapsed, populated, students }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rc_tc_sidebar', collapsed ? 'collapsed' : 'expanded');
    localStorage.setItem('rc_public_sidebar', collapsed ? 'collapsed' : 'expanded');
    if (populated) {
      localStorage.setItem('rc_unified_students', JSON.stringify(students));
      localStorage.setItem('rc_unified_classes', JSON.stringify([{ id: 'LA1', code: 'LA1', name: 'Language Arts 1 SC' }]));
    }
  }, { collapsed, populated, students });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) {
      if (url.pathname.endsWith('/teacher-session')) return route.fulfill({ status, json: status === 200 ? { ok: true, session: { code: 'teacher_local', role: 'teacher' } } : { ok: false, error: 'Synthetic denied state' } });
      if (url.pathname.endsWith('/browser-supabase-config')) return route.fulfill({ status: 503, json: { ok: false } });
      if (url.pathname.endsWith('/teacher-ungraded-count')) return route.fulfill({ json: { count: 0 } });
      if (url.pathname.endsWith('/teacher-roster-context')) return route.fulfill({ json: { ok: true, students: populated ? students : [], goals: [], classes: [] } });
      if (url.pathname.endsWith('/teacher-logout')) return route.fulfill({ json: { ok: true } });
      return route.fulfill({ json: { ok: true, students: [], goals: [], classes: [], assignments: [], instances: [], submissions: [], entries: [], rows: [], events: [], items: [], plans: [], templates: [] } });
    }
    if (url.pathname.startsWith('/assets/data/') && url.pathname.endsWith('.json')) return route.fulfill({ json: {} });
    return route.continue();
  });
}

async function screenshot(page, testInfo, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath(name + '.png'), fullPage: true });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    await screenshot(page, testInfo, 'failure');
    console.log('Synthetic layout diagnostics', await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 2).slice(0, 15).map(e => ({ tag: e.tagName, id: e.id, class: String(e.className) }))));
  }
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'chromebook', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`Overview ${viewport.name}: real shell, synthetic data and readable surfaces`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await isolate(page, { populated: true, collapsed: viewport.width < 769 });
    await page.goto('/teacher/');
    await expect(page.locator(teacherMarker)).toHaveCount(1);
    await expect(page.locator('#kpiStudents')).toHaveText('2');
    await expect(page.locator('#ovChecklistCard')).toBeVisible();
    await expect(page.locator('#ovFeedCard')).toBeVisible();
    await expect(page.locator('.tc-topbar')).toHaveCSS('background-color', 'rgb(5, 37, 31)');
    await expect(page.locator('.rc-card').first()).toHaveCSS('background-color', 'rgba(5, 48, 40, 0.96)');
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await screenshot(page, testInfo, `overview-${viewport.name}`);
  });
}

test('sidebar preference is restored while session is pending; native links and history remain intact', async ({ page }, testInfo) => {
  await isolate(page, { collapsed: true });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/.netlify/functions/teacher-session', async route => {
    await pending;
    await route.fulfill({ json: { ok: true, session: { role: 'teacher' } } });
  });
  await page.goto('/teacher/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(/tc-collapsed/);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await screenshot(page, testInfo, 'session-pending');
  release();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.locator('#tcSidebarToggle').click();
  await expect(page.locator('#tcSidebarToggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.tc-nav a[href="/teacher/reporting/"]').click();
  await expect(page).toHaveURL(/\/teacher\/reporting\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/teacher\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/teacher\/reporting\/$/);
});

test('401 still redirects to login and preserves the return URL', async ({ page }, testInfo) => {
  await isolate(page, { status: 401 });
  await page.goto('/teacher/work/?synthetic=1#example');
  await expect(page).toHaveURL(/\/teacher\/login\/\?next=/);
  expect(decodeURIComponent(page.url())).toContain('/teacher/work/?synthetic=1#example');
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('.tc-nav a[href="/teacher/gradebook/"]')).toHaveCount(0);
  await screenshot(page, testInfo, 'teacher-signed-out');
});

test('500 session behavior remains unchanged and errors are not obscured by a presentation gate', async ({ page }, testInfo) => {
  await isolate(page, { status: 500 });
  await page.goto('/teacher/');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expect(page.locator('body')).toBeVisible();
  await screenshot(page, testInfo, 'teacher-session-error');
});

test('reduced motion, keyboard focus, light perimeter and print retain functional surfaces', async ({ page }, testInfo) => {
  await isolate(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/teacher/');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expect(page.locator('.tc-sidebar')).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Tab');
  expect(await page.locator(':focus-visible').count()).toBeGreaterThan(0);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(231, 241, 235)');
  await screenshot(page, testInfo, 'teacher-light-focus');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.tc-shell')).toHaveCSS('background-image', 'none');
});

for (const route of ['work', 'students', 'gradebook', 'review', 'reporting', 'ai-builder', 'observations', 'calendar', 'schedule', 'substitute', 'library', 'archive', 'admin', 'settings', 'share', 'district-export', 'close-year', 'students/spreadsheet']) {
  test(`inventory surface ${route}: native shell remains available`, async ({ page }, testInfo) => {
    await isolate(page);
    await page.goto(`/teacher/${route}/`);
    await expect(page.locator(teacherMarker)).toHaveCount(1);
    await expect(page.locator('.tc-main')).toBeVisible();
    await expect(page.locator('.tc-topbar')).toHaveCSS('background-color', 'rgb(5, 37, 31)');
    await screenshot(page, testInfo, route.replaceAll('/', '-'));
  });
}
