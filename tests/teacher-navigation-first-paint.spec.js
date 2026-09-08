import { test, expect } from '@playwright/test';
import process from 'node:process';
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const baseline = process.env.TC_NAV_BASELINE === '1';
const routes = baseline ? ['', 'observations'] : ['', 'work', 'ai-builder', 'library', 'review', 'gradebook', 'students', 'observations', 'calendar', 'schedule', 'substitute', 'archive', 'admin', 'reporting', 'district-export', 'share', 'settings', 'close-year', 'students/spreadsheet'];

async function isolate(page, { state = 'collapsed', session = 200, denyStorage = false, role = 'teacher' } = {}) {
  await page.addInitScript(({ state, denyStorage }) => {
    if (!sessionStorage.getItem('tc_nav_synthetic_seeded')) {
      localStorage.clear(); sessionStorage.clear();
      sessionStorage.setItem('tc_nav_synthetic_seeded', '1');
      if (state !== null) localStorage.setItem('rc_tc_sidebar', state);
      // Deliberately disagree: Teacher geometry must not inherit public state.
      localStorage.setItem('rc_public_sidebar', state === 'expanded' ? 'collapsed' : 'expanded');
    }
    if (denyStorage) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Synthetic denied storage', 'SecurityError'); } });
  }, { state, denyStorage });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:8888') return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) {
      if (url.pathname.endsWith('/teacher-session')) return route.fulfill({ status: session, json: session === 200 ? { ok: true, role, raw_role: role, session: { code: 'synthetic-teacher', role } } : { ok: false, error: 'Synthetic unavailable session' } });
      if (url.pathname.endsWith('/browser-supabase-config')) return route.fulfill({ status: 503, json: { ok: false } });
      if (url.pathname.endsWith('/teacher-refresh')) return route.fulfill({ json: { ok: true, role, session: { role } } });
      return route.fulfill({ json: { ok: true, count: 0, students: [], goals: [], classes: [], assignments: [], instances: [], submissions: [], entries: [], rows: [], events: [], items: [], plans: [], templates: [] } });
    }
    if (url.pathname.startsWith('/assets/data/') && url.pathname.endsWith('.json')) return route.fulfill({ json: {} });
    return route.continue();
  });
}
async function shot(page, info, name) {
  // These tests deliberately hold parser-blocking JS before load. Playwright's
  // normal screenshot waits for document.fonts.ready, which cannot settle yet.
  // Capture the real Chromium compositor frame; never remove or hide a gate.
  const cdp = await page.context().newCDPSession(page);
  try {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(info.outputPath(name + '.png'), Buffer.from(data, 'base64'));
  } finally { await cdp.detach(); }
}
async function geometry(page) {
  return page.evaluate(() => {
    const sidebar = document.querySelector('.tc-sidebar');
    const main = document.querySelector('.tc-main');
    return { collapsed: document.documentElement.classList.contains('tc-collapsed'), sidebar: sidebar.getBoundingClientRect().width, mainLeft: main.getBoundingClientRect().left, canvas: getComputedStyle(document.documentElement).backgroundColor };
  });
}
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) await shot(page, info, 'failure');
});

for (const route of routes) {
  test(`slow shell ${route || 'overview'}: sidebar is stable at first paint`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await isolate(page, { role: route === 'admin' ? 'admin' : 'teacher' });
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/web/teacher-shell.js*', async route => {
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    });
    try {
      const target = `/teacher/${route ? route + '/' : ''}`;
      await page.goto(target, { waitUntil: 'commit' });
      await expect(page.locator('.tc-main')).toBeVisible();
      // DOM visibility alone can precede render-blocking CSS. Measure the
      // styled frame, while the shell script is still withheld on both builds.
      await expect(page.locator('.tc-shell')).toHaveCSS('display', 'flex');
      const before = await geometry(page);
      await shot(page, info, 'before-shell-runtime');
      expect(before.collapsed).toBe(!baseline);
      if (!baseline) {
        expect(before.sidebar).toBe(64);
        expect(before.canvas).toBe('rgb(3, 23, 20)');
        await expect(page.locator('link[data-teacher-scene-preload]')).toHaveAttribute('href', '/assets/bg/rc-annotated-canyon.svg?v=20260908-annotated1');
      }
      release();
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      await expect(page).toHaveURL('http://localhost:8888' + target);
      await expect(page.locator('.tc-sidebar')).toHaveCSS('width', '64px');
      const after = await geometry(page);
      console.log(JSON.stringify({ source: baseline ? 'main-diagnostic' : 'candidate', route, before, after }));
      if (!baseline) expect(after.mainLeft).toBe(before.mainLeft);
      else expect(before.sidebar - after.sidebar).toBe(196);
      await shot(page, info, 'after-shell-runtime');
    } finally { release(); }
  });
}

if (!baseline) {
  for (const state of ['expanded', null]) {
    test(`saved Teacher preference ${state ?? 'absent'} wins before a pending session`, async ({ page }) => {
      await isolate(page, { state });
      let release;
      const held = new Promise(resolve => { release = resolve; });
      await page.route('**/.netlify/functions/teacher-session', async route => {
        await held;
        await route.fulfill({ json: { ok: true, session: { role: 'teacher' } } });
      });
      try {
        await page.goto('/teacher/observations/', { waitUntil: 'domcontentloaded' });
        expect((await geometry(page)).collapsed).toBe(state !== 'expanded');
        await expect(page.locator('body')).toBeVisible();
      } finally { release(); }
    });
  }
  test('denied storage retains the collapsed fallback without changing the gate', async ({ page }) => {
    await isolate(page, { denyStorage: true, session: 401 });
    await page.goto('/teacher/work/');
    await expect(page).toHaveURL(/\/teacher\/login\/\?next=/);
    await expect(page.locator('#loginForm')).toBeVisible();
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    test(`native links history and sidebar at ${viewport.width}px`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await isolate(page);
      await page.goto('/teacher/');
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      await page.locator('#tcSidebarToggle').click();
      await expect(page.locator('#tcSidebarToggle')).toHaveAttribute('aria-expanded', 'true');
      await page.locator('.tc-nav a[href="/teacher/reporting/"]').click();
      await expect(page).toHaveURL(/\/teacher\/reporting\/$/);
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      await expect(page.locator('#tcSidebarToggle')).toHaveAttribute('aria-expanded', 'true');
      await page.locator('#tcSidebarToggle').click();
      await page.goBack();
      await expect(page).toHaveURL(/\/teacher\/$/);
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      await expect(page.locator('#tcSidebarToggle')).toHaveAttribute('aria-expanded', 'false');
      await page.goForward();
      await expect(page).toHaveURL(/\/teacher\/reporting\/$/);
      await shot(page, info, 'native-navigation-' + viewport.width);
    });
  }

  test('real Reporting tabs keep one viewport width without touching tab handlers', async ({ page }, info) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await isolate(page);
    await page.goto('/teacher/reporting/');
    const widths = [];
    for (const tab of ['iep-quarterly', 'student-summary', 'class-performance', 'compliance-log', 'batch-reports', 'student-evidence']) {
      await page.locator(`.rp-tab[data-tab="${tab}"]`).click();
      await expect(page.locator(`.rp-tab-content[data-tab="${tab}"]`)).toBeVisible();
      await expect(page.locator('.rp-tab-content:visible')).toHaveCount(1);
      widths.push(await page.locator('.tc-main').evaluate(el => el.getBoundingClientRect().width));
    }
    expect(new Set(widths).size).toBe(1);
    await expect(page.locator('html')).toHaveCSS('scrollbar-gutter', 'stable');
    await shot(page, info, 'reporting-internal-tab');
  });

  test('pending canyon image never holds up authentication, sign-out or login', async ({ page }, info) => {
    await isolate(page);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/assets/bg/rc-annotated-canyon.svg*', async route => { await held; await route.abort(); });
    try {
      await page.goto('/teacher/', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      await expect(page.locator('body')).toBeVisible();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click({ noWaitAfter: true });
      await expect(page).toHaveURL(/\/teacher\/login\/$/);
      await expect(page.locator('#loginForm')).toBeVisible();
      await expect(page.locator('html')).not.toHaveClass(/rc-teacher-navigation/);
      await shot(page, info, 'login-with-slow-image');
    } finally { release(); }
  });

  test('401 keeps its exact return path and never crossfades protected content', async ({ page }) => {
    await isolate(page, { session: 401 });
    await page.goto('/teacher/work/?synthetic=1#draft');
    await expect(page).toHaveURL(/\/teacher\/login\/\?next=/);
    expect(decodeURIComponent(page.url())).toContain('/teacher/work/?synthetic=1#draft');
    await expect(page.locator('#loginForm')).toBeVisible();
    await expect(page.locator('link[data-teacher-navigation]')).toHaveCount(0);
  });

  test('light theme reduced motion focus and print remain usable', async ({ page }, info) => {
    await isolate(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/teacher/');
    await page.locator('#tcSidebarToggle').focus();
    await expect(page.locator('#tcSidebarToggle')).toBeFocused();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(231, 241, 235)');
    await expect(page.locator('.tc-sidebar')).toHaveCSS('transition-duration', '0s');
    await shot(page, info, 'light-focus');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('html')).toHaveCSS('scrollbar-gutter', 'auto');
  });

  for (const route of ['/', '/language-arts/', '/student/', '/teacher/login/', '/substitute/']) {
    test(`no Teacher presentation opt-in on ${route}`, async ({ page }) => {
      await isolate(page);
      await page.goto(route);
      await expect(page.locator('html')).not.toHaveClass(/rc-teacher-navigation/);
      await expect(page.locator('link[data-teacher-navigation]')).toHaveCount(0);
      await expect(page.locator('link[data-teacher-scene-preload]')).toHaveCount(0);
    });
  }
}
