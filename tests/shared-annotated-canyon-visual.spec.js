import { test, expect } from '@playwright/test';

const SCENE = '/assets/bg/rc-annotated-canyon.svg?v=20260908-annotated1';

async function screenshot(page, testInfo, name, fullPage = true) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

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

  return { writes, errors };
}

async function sceneBackground(page, selector, pseudo = null) {
  return page.locator(selector).evaluate(
    (element, pseudoElement) =>
      getComputedStyle(element, pseudoElement).backgroundImage,
    pseudo
  );
}

test('Student dashboard and long Grades surface share the annotated scene', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const result = await localOnly(page);

  await page.goto('/student/');
  await page.waitForFunction(() =>
    document.body.classList.contains('rc-student-canyonpath')
  );

  await page.evaluate(() => {
    document.querySelector('#loginView')?.classList.add('hidden');

    const dashboard = document.querySelector('#studentDashboardView');
    dashboard?.classList.remove('hidden');

    document.querySelectorAll('.st-tab-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    document.querySelector('#tabDashboard')?.classList.add('active');

    const recent = document.querySelector('#dashRecentAssignments');
    if (recent) {
      recent.innerHTML = '';

      for (let index = 1; index <= 4; index += 1) {
        const card = document.createElement('div');
        card.className = 'st-assignment-card';
        card.innerHTML =
          `<strong>Synthetic Assignment ${index}</strong>` +
          `<div>Language Arts · Week ${index}</div>`;
        recent.appendChild(card);
      }
    }

    window.RCStudentPortalPolish?.enhance?.();
  });

  await expect(page.locator('#studentDashboardView')).toBeVisible();
  await expect(page.locator('#tabDashboard')).toHaveClass(/active/);

  const dashboardScene = await sceneBackground(
    page,
    '.tc-main',
    '::before'
  );

  expect(dashboardScene).toContain('rc-annotated-canyon.svg');
  expect(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1
    )
  ).toBe(true);

  await screenshot(page, testInfo, 'student-dashboard');

  await page.evaluate(() => {
    document.querySelectorAll('.st-tab-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    const grades = document.querySelector('#tabGrades');
    grades?.classList.add('active');

    const content =
      document.querySelector('#gradesContent') ||
      document.querySelector('#tabGrades .st-dashboard-content');

    if (!content) return;

    const old = content.querySelector('[data-annotated-visual-test]');
    old?.remove();

    const shell = document.createElement('div');
    shell.dataset.annotatedVisualTest = 'true';

    for (let index = 1; index <= 28; index += 1) {
      const row = document.createElement('div');
      row.className = 'st-grade-row';
      row.innerHTML =
        `<div class="st-grade-info">` +
          `<h4>Synthetic Grade Record ${index}</h4>` +
          `<div class="st-grade-meta">Language Arts · Q1 · Test data only</div>` +
        `</div>` +
        `<div class="st-grade-score">${70 + (index % 25)}%</div>`;
      shell.appendChild(row);
    }

    content.appendChild(shell);
  });

  await expect(page.locator('#tabGrades')).toHaveClass(/active/);

  expect(
    await page.evaluate(() =>
      document.documentElement.scrollHeight > innerHeight * 1.4
    )
  ).toBe(true);

  const gradesScene = await sceneBackground(
    page,
    '.tc-main',
    '::before'
  );

  expect(gradesScene).toContain('rc-annotated-canyon.svg');

  await screenshot(page, testInfo, 'student-grades-long');

  expect(result.writes).toEqual([]);
  expect(result.errors).toEqual([]);
});

test('Student mobile login keeps scenery and controls readable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const result = await localOnly(page);

  await page.goto('/student/');
  await page.waitForFunction(() =>
    document.body.classList.contains('rc-student-canyonpath')
  );

  await expect(page.locator('#loginView')).toBeVisible();

  const scene = await sceneBackground(
    page,
    '.tc-main',
    '::before'
  );

  expect(scene).toContain('rc-annotated-canyon.svg');

  expect(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1
    )
  ).toBe(true);

  await screenshot(page, testInfo, 'student-login-mobile');

  expect(result.writes).toEqual([]);
  expect(result.errors).toEqual([]);
});

test('Substitute login and dashboard use the shared scene and print cleanly', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const result = await localOnly(page);

  await page.goto('/substitute/');

  await expect(page.locator('body')).toHaveClass(/rc-substitute-canyonpath/);
  await expect(page.locator('#loginView')).toBeVisible();

  const loginScene = await sceneBackground(page, '.tc-main');
  expect(loginScene).toContain('rc-annotated-canyon.svg');

  await screenshot(page, testInfo, 'substitute-login');

  await page.evaluate(() => {
    document.querySelector('#loginView')?.classList.add('hidden');

    const dashboard = document.querySelector('#dashboardView');
    dashboard?.classList.remove('hidden');

    const root = document.querySelector('.sp-dashboard');
    if (!root) return;

    const old = root.querySelector('[data-annotated-visual-test]');
    old?.remove();

    const card = document.createElement('section');
    card.className = 'sp-card';
    card.dataset.annotatedVisualTest = 'true';
    card.innerHTML = `
      <h2 class="sp-card-title">Synthetic Substitute Plan</h2>
      <div class="sp-label">Language Arts</div>
      <div class="sp-value">Continue the assigned reading and guided notes.</div>
      <div class="sp-label">Transitional Skills</div>
      <div class="sp-value">Complete the scheduled classroom activity.</div>
      <div class="sp-label">Teacher Notes</div>
      <div class="sp-notes-box">Synthetic test content only. No student information.</div>
    `;
    root.appendChild(card);
  });

  await expect(page.locator('#dashboardView')).toBeVisible();
  await expect(page.locator('[data-annotated-visual-test]')).toBeVisible();

  const dashboardScene = await sceneBackground(page, '.tc-main');
  expect(dashboardScene).toContain('rc-annotated-canyon.svg');

  await screenshot(page, testInfo, 'substitute-dashboard');

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.tc-main')).toHaveCSS(
    'background-image',
    'none'
  );

  expect(result.writes).toEqual([]);
  expect(result.errors).toEqual([]);
});

test('Missing shared scene leaves public content usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.route('**/assets/bg/rc-annotated-canyon.svg*', route =>
    route.abort()
  );

  await page.route('**/.netlify/functions/**', route =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false }),
    })
  );

  await page.goto('/language-arts/');

  await expect(
    page.getByRole('heading', { name: 'Language Arts', exact: true })
  ).toBeVisible();

  await expect(page.locator('.book-card').first()).toBeVisible();

  await screenshot(page, testInfo, 'public-scene-failure');

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.cp-public-landscape')).toBeHidden();
});
