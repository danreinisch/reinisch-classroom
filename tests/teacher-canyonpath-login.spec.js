/* eslint-env node */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const LOGIN = '/teacher/login/';
const SCENE = '/assets/bg/rc-annotated-canyon.svg?v=20260908-annotated1';
const CSS = '/assets/css/teacher-canyonpath-login.css?v=20260908-annotated1';
const SYNTHETIC = { username: 'synthetic-teacher', password: 'not-a-real-password' };

// Fresh Playwright contexts; every function request is intercepted locally.
// Never read real sessions, create cookies, remove a gate, or contact live data.
async function isolate(page, loginHandler) {
  const posts = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:8888') return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) {
      if (url.pathname.endsWith('/teacher-login')) {
        posts.push(route.request());
        return loginHandler ? loginHandler(route) : route.fulfill({ status: 401, json: { ok: false, error: 'Synthetic sign-in denied. Please try again.' } });
      }
      if (url.pathname.endsWith('/teacher-session')) return route.fulfill({ json: { ok: true, session: { code: 'teacher_local', role: 'teacher' } } });
      if (url.pathname.endsWith('/browser-supabase-config')) return route.fulfill({ status: 503, json: { ok: false } });
      return route.fulfill({ json: { ok: true, count: 0, students: [], goals: [], classes: [], submissions: [], assignments: [], entries: [], events: [], items: [] } });
    }
    if (url.pathname.startsWith('/assets/data/') && url.pathname.endsWith('.json')) return route.fulfill({ json: {} });
    return route.continue();
  });
  return posts;
}
async function enterSyntheticLogin(page) {
  await page.getByLabel('Username', { exact: true }).fill(SYNTHETIC.username);
  await page.getByLabel('Password', { exact: true }).fill(SYNTHETIC.password);
}
async function capture(page, testInfo, label) {
  await page.screenshot({ path: testInfo.outputPath(label + '.png'), fullPage: true });
}
function luminance(rgb) {
  const channels = rgb.map(v => {
    const s = v / 255;
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) await capture(page, testInfo, 'failure');
});

test('login source differs only by explicit presentation hooks and accessible nav names', async () => {
  const html = readFileSync('site/teacher/login/index.html', 'utf8');
  const original = html
    .replace(`  <link rel="preload" as="image" href="${SCENE}" />\n`, '')
    .replace(`  <link rel="stylesheet" href="${CSS}" />\n`, '')
    .replace('<body class="rc-teacher-login">', '<body>')
    .replace('<a href="/" aria-label="Home">', '<a href="/">')
    .replace('<a href="/student/" aria-label="Student Portal">', '<a href="/student/">')
    .replace('<a href="/teacher/" aria-label="Teacher Center">', '<a href="/teacher/">');
  const blob = createHash('sha1').update(`blob ${Buffer.byteLength(original)}\0${original}`).digest('hex');
  // Original blob from reviewed PR head 8d38d972. Includes every auth script,
  // cookie/fetch option, validation rule, redirect, ID, handler and form field.
  expect(blob).toBe('264c1400e80a2beb1c22fa9ca09e42c96a96afd9');
  expect(html.indexOf(CSS)).toBeLessThan(html.indexOf('</head>'));
  const css = readFileSync('site/assets/css/teacher-canyonpath-login.css', 'utf8');
  expect(css).not.toMatch(/@view-transition|@import|animation-delay/);
  for (const file of ['site/index.html', 'site/student/index.html', 'site/substitute/index.html', 'site/teacher/index.html', 'site/web/sidebar-init.js', 'site/web/teacher-shell.css']) {
    expect(readFileSync(file, 'utf8')).not.toContain('teacher-canyonpath-login.css');
  }
});

for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'chromebook', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`CanyonPath login ${size.name}: actual image, empty form, nav and keyboard`, async ({ page }, testInfo) => {
    const posts = await isolate(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(LOGIN);
    await expect(page.locator('head link[rel="stylesheet"][href*="teacher-canyonpath-login"]')).toHaveCount(1);
    await expect(page.locator('.tc-topbar')).toHaveCSS('background-color', 'rgb(5, 37, 31)');
    await expect(page.locator('.login-card')).toHaveCSS('background-color', 'rgba(5, 48, 40, 0.96)');
    const natural = await page.evaluate(src => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = reject;
      image.src = src;
    }), SCENE);
    expect(natural).toEqual([912, 579]);
    await expect(page.locator('.tc-main')).toHaveCSS('background-image', /rc-annotated-canyon\.svg/);
    await expect(page.locator('#username')).toBeEditable();
    await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');
    await expect(page.locator('#submitButton')).toBeInViewport();
    await expect(page.locator('#errorMessage')).toBeHidden();
    await expect(page.locator('.tc-nav a')).toHaveCount(3);
    await expect(page.locator('.tc-nav').getByRole('link', { name: 'Student Portal', exact: true })).toBeVisible();
    await expect(page.locator('.tc-nav a[href="/teacher/gradebook/"]')).toHaveCount(0);
    await expect(page.locator('script[src*="teacher-shell.js"]')).toHaveCount(0);
    await page.locator('#username').focus();
    await expect(page.locator('#username')).toHaveCSS('outline-width', '3px');
    await page.keyboard.press('Tab');
    await expect(page.locator('#password')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#submitButton')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await capture(page, testInfo, 'teacher-login-' + size.name);
    await page.locator('#tcSidebarToggle').click();
    await expect(page.locator('html')).toHaveClass(/tc-collapsed/);
    await page.locator('#tcSidebarToggle').click();
    await expect(page.locator('html')).not.toHaveClass(/tc-collapsed/);
    // The existing toggle must never leave the form covered on a small screen.
    await page.locator('#username').click();
    await expect(page.locator('#username')).toBeFocused();
    expect(posts).toHaveLength(0);
  });
}

test('native required validation and whitespace validation do not issue login requests', async ({ page }) => {
  const posts = await isolate(page);
  await page.goto(LOGIN);
  await page.locator('#submitButton').click();
  expect(await page.locator('#username').evaluate(el => el.validity.valueMissing)).toBe(true);
  expect(posts).toHaveLength(0);
  await page.locator('#username').fill('   ');
  await page.locator('#password').fill(SYNTHETIC.password);
  await page.locator('#submitButton').click();
  await expect(page.locator('#errorMessage')).toHaveText('Please enter both username and password');
  expect(posts).toHaveLength(0);
});

test('pending sign-in stays readable and disabled, then denial clears password and supports retry', async ({ page }, testInfo) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const posts = await isolate(page, async route => {
    await pending;
    return route.fulfill({ status: 401, json: { ok: false, error: 'Synthetic sign-in denied. Please try again.' } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(LOGIN);
  await enterSyntheticLogin(page);
  await page.locator('#submitButton').click();
  await expect(page.locator('#submitButton')).toBeDisabled();
  await expect(page.locator('#submitButton')).toHaveText('Signing In...');
  await expect(page.locator('#loginForm')).toBeVisible();
  await capture(page, testInfo, 'teacher-login-pending');
  release();
  await expect(page.locator('#errorMessage')).toBeVisible();
  await expect(page.locator('#errorMessage')).toContainText('Synthetic sign-in denied');
  await expect(page.locator('#submitButton')).toBeEnabled();
  await expect(page.locator('#password')).toHaveValue('');
  await expect(page.locator('#password')).toBeFocused();
  await expect(page.locator('#username')).toHaveValue(SYNTHETIC.username);
  await capture(page, testInfo, 'teacher-login-denied');
  await enterSyntheticLogin(page);
  await page.locator('#submitButton').click();
  await expect(page.locator('#errorMessage')).toBeVisible();
  expect(posts).toHaveLength(2);
});

for (const failure of ['network', 'server']) {
  test(`login ${failure} failure stays visible without hiding the form`, async ({ page }, testInfo) => {
    await isolate(page, route => failure === 'network' ? route.abort('failed') : route.fulfill({ status: 503, json: { ok: false, error: 'Synthetic service unavailable. Try again.' } }));
    await page.goto(LOGIN);
    await enterSyntheticLogin(page);
    await page.locator('#submitButton').click();
    await expect(page.locator('#errorMessage')).toBeVisible();
    await expect(page.locator('#errorMessage')).toContainText(failure === 'network' ? 'Network error.' : 'Synthetic service unavailable.');
    await expect(page.locator('#submitButton')).toBeEnabled();
    await expect(page.locator('#loginForm')).toBeVisible();
    await capture(page, testInfo, 'teacher-login-' + failure + '-error');
  });
}

for (const next of ['/teacher/review/?scope=synthetic#example', 'https://invalid.example/teacher/', '//invalid.example/teacher/', '/teacher/../../student/', '/teacher-admin/']) {
  test(`login success preserves the existing next-path validation: ${next}`, async ({ page }) => {
    const posts = await isolate(page, route => route.fulfill({ json: { ok: true } }));
    await page.goto(LOGIN + '?next=' + encodeURIComponent(next));
    await enterSyntheticLogin(page);
    await page.locator('#password').press('Enter');
    const expected = next.startsWith('/teacher/review/') ? next : '/teacher/';
    await expect(page).toHaveURL('http://localhost:8888' + expected);
    expect(posts).toHaveLength(1);
    expect(posts[0].method()).toBe('POST');
    expect(posts[0].postDataJSON()).toEqual(SYNTHETIC);
  });
}

for (const theme of ['dark', 'light']) {
  test(`login ${theme}: readable text, focus, reduced motion and print`, async ({ page }, testInfo) => {
    await isolate(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(LOGIN);
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    await page.locator('#username').focus();
    await expect(page.locator('#username')).toHaveCSS('outline-width', '3px');
    await expect(page.locator('#username')).toHaveCSS('transition-duration', '0s');
    await expect(page.locator('.tc-sidebar')).toHaveCSS('transition-duration', '0s');
    const colors = await page.evaluate(() => {
      const rgb = value => value.match(/[\d.]+/g).map(Number);
      return {
        panel: rgb(getComputedStyle(document.querySelector('.login-card')).backgroundColor),
        label: rgb(getComputedStyle(document.querySelector('.login-label')).color),
        input: rgb(getComputedStyle(document.querySelector('.login-input')).color),
        inputBg: rgb(getComputedStyle(document.querySelector('.login-input')).backgroundColor),
        button: rgb(getComputedStyle(document.querySelector('.login-button')).color),
        buttonBg: rgb(getComputedStyle(document.querySelector('.login-button')).backgroundColor),
      };
    });
    // Check translucent-card label contrast against both extreme backdrop colors.
    for (const backdrop of [0, 255]) {
      const alpha = colors.panel[3] ?? 1;
      const panel = colors.panel.slice(0, 3).map(c => c * alpha + backdrop * (1 - alpha));
      expect(contrast(colors.label.slice(0, 3), panel)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(colors.input.slice(0, 3), colors.inputBg.slice(0, 3))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.button.slice(0, 3), colors.buttonBg.slice(0, 3))).toBeGreaterThanOrEqual(4.5);
    await capture(page, testInfo, 'teacher-login-' + theme + '-focus');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.tc-main')).toHaveCSS('background-image', 'none');
  });
}

test('forced colors removes scenery and keeps the form usable', async ({ page }) => {
  await isolate(page);
  await page.goto(LOGIN);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('.tc-main')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.login-input').first()).toHaveCSS('border-width', '1px');
  await page.getByLabel('Username', { exact: true }).fill('synthetic-teacher');
  await expect(page.locator('#submitButton')).toBeVisible();
});

test('short mobile viewport scrolls to every input, error and sign-in action', async ({ page }) => {
  await isolate(page);
  await page.setViewportSize({ width: 390, height: 450 });
  await page.goto(LOGIN);
  await enterSyntheticLogin(page);
  await page.locator('#submitButton').click();
  await expect(page.locator('#errorMessage')).toBeVisible();
  await page.locator('#submitButton').scrollIntoViewIfNeeded();
  await expect(page.locator('#submitButton')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
