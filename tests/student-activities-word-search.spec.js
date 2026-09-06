import { test, expect } from '@playwright/test';

// Keep these synthetic activity checks on the local static server.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      await route.abort();
      return;
    }
    if (url.pathname.startsWith('/.netlify/functions/')) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'Synthetic activity test: server function unavailable'
        })
      });
      return;
    }
    await route.continue();
  });
});


/**
 * Student Activities / Word Search browser verification.
 *
 * Scope:
 * - same-tab synthetic student session only
 * - no real student data
 * - no production APIs
 * - no Supabase writes
 * - static local browser server only
 */

async function makeFunctionCallsHarmless(page) {
  await page.route('**/.netlify/functions/**', async route => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: 'Synthetic browser test: server function unavailable'
      })
    });
  });
}

async function seedSyntheticStudentSession(page) {
  // Seed once in this browser tab/origin.
  // We intentionally do NOT use addInitScript so that the test verifies
  // sessionStorage survives the Viewer round trip naturally.
  await page.goto('/');
  await page.evaluate(() => {
    sessionStorage.setItem('rc_user_role', 'student');
    sessionStorage.setItem('rc_user_code', 'S010');
  });
}

test.describe('Student Activities / Word Search', () => {
  test('student can open Word Search, use All Themes, and exit back to Activities', async ({ page }) => {
    await makeFunctionCallsHarmless(page);
    await seedSyntheticStudentSession(page);

    await page.goto('/student/?tab=activities');

    await expect(
      page.locator('#studentDashboardView')
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.locator('#loginView')
    ).toBeHidden();

    await expect(
      page.locator('#tabActivities')
    ).toBeVisible();

    await expect(
      page.locator('[data-tab="activities"].active')
    ).toHaveCount(2);

    // Open the student-facing Word Search activity.
    await page
      .locator('#tabActivities .st-activity-card').filter({ hasText: 'Open Word Search' })
      .click();

    await expect(page).toHaveURL(
      /\/viewer\/\?.*activity=1/
    );

    const exitActivity =
      page.locator('#exitActivityBtn');

    await expect(exitActivity).toBeVisible();

    // Word Search is inside the existing Viewer iframe.
    const wordSearch =
      page.frameLocator('#contentIframe');

    const firstTheme =
      wordSearch.locator('.theme-card').first();

    await expect(firstTheme).toBeVisible({
      timeout: 10000
    });

    // Enter a puzzle.
    await firstTheme.click();

    const allThemes =
      wordSearch.getByRole('button', {
        name: '← All Themes'
      });

    await expect(allThemes).toBeVisible();

    // Internal navigation should return to the 30-theme home view.
    await allThemes.click();

    await expect(
      wordSearch.locator('#homeView')
    ).toHaveClass(/active/);

    await expect(
      wordSearch.locator('.theme-card').first()
    ).toBeVisible();

    // Simulate the Viewer compatibility state used by classroom displays.
    await page.evaluate(() => {
      document.documentElement.classList.add(
        'rc-display-safe'
      );
    });

    // The sidebar is intentionally unavailable in display-safe mode...
    await expect(
      page.locator('.tc-sidebar')
    ).toBeHidden();

    // ...but the new activity exit must remain obvious and usable.
    await expect(exitActivity).toBeVisible();

    const exitBox =
      await exitActivity.boundingBox();

    expect(exitBox).not.toBeNull();
    expect(exitBox.height).toBeGreaterThanOrEqual(44);

    // Exit the activity.
    await exitActivity.click();

    await expect(page).toHaveURL(
      /\/student\/\?tab=activities$/
    );

    // Student should return directly to Activities without being logged out.
    await expect(
      page.locator('#studentDashboardView')
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.locator('#loginView')
    ).toBeHidden();

    await expect(
      page.locator('#tabActivities')
    ).toBeVisible();

    await expect(
      page.locator('[data-tab="activities"].active')
    ).toHaveCount(2);

    // Prove the same-tab student session survived Viewer navigation.
    const session = await page.evaluate(() => ({
      role: sessionStorage.getItem('rc_user_role'),
      code: sessionStorage.getItem('rc_user_code')
    }));

    expect(session).toEqual({
      role: 'student',
      code: 'S010'
    });
  });

  test('toolkit Word Search also has a usable exit in display-safe mode', async ({ page }) => {
    await page.goto('/language-arts/toolkit/');

    const wordSearchLink =
      page.locator(
        'a[href*="/viewer/"][href*="presentation-03"]'
      ).filter({
        hasText: 'Word Search'
      });

    await expect(wordSearchLink).toBeVisible();

    await wordSearchLink.click();

    await expect(page).toHaveURL(
      /\/viewer\/\?.*presentation-03/
    );

    const exitActivity =
      page.locator('#exitActivityBtn');

    await expect(exitActivity).toBeVisible();

    const wordSearch =
      page.frameLocator('#contentIframe');

    await expect(
      wordSearch.locator('.theme-card').first()
    ).toBeVisible({
      timeout: 10000
    });

    // Reproduce the important classroom-display condition.
    await page.evaluate(() => {
      document.documentElement.classList.add(
        'rc-display-safe'
      );
    });

    await expect(
      page.locator('.tc-sidebar')
    ).toBeHidden();

    await expect(exitActivity).toBeVisible();

    const exitBox =
      await exitActivity.boundingBox();

    expect(exitBox).not.toBeNull();
    expect(exitBox.height).toBeGreaterThanOrEqual(44);

    // Because this launch came from the toolkit, Viewer history should
    // return there rather than dumping the user at the site home page.
    await exitActivity.click();

    await expect(page).toHaveURL(
      /\/language-arts\/toolkit\/$/
    );

    await expect(
      page.getByText('Word Search', { exact: true })
    ).toBeVisible();
  });
});

test('Skill Builder opens from Activities and exits with the student session intact', async ({ page }, testInfo) => {
  await seedSyntheticStudentSession(page);
  await page.goto('/student/?tab=activities');

  await expect(page.locator('#studentDashboardView')).toBeVisible();
  await expect(page.locator('#loginView')).toBeHidden();
  await expect(page.locator('#tabActivities')).toBeVisible();
  await expect(page.locator('#tabActivities .st-activity-card')).toHaveCount(2);

  const card = page.locator('#tabActivities .st-activity-card').filter({
    hasText: 'Language Arts Skill Builder'
  });
  await expect(card).toHaveCount(1);
  await expect(card).toBeVisible();

  await page.locator('#tabActivities').screenshot({
    path: testInfo.outputPath('activities-card.png')
  });

  // Activate the card from the keyboard.
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/viewer\/\?.*activity=1/);
  const launch = new URL(page.url());
  expect(launch.searchParams.get('src')).toBe(
    '/presentations/language-arts-toolkit/presentation-01/' +
    'final_exam_skill_builder_20q_feedback.html'
  );
  expect(launch.searchParams.get('return')).toBe('/student/?tab=activities');

  const exitActivity = page.locator('#exitActivityBtn');
  await expect(exitActivity).toBeVisible();

  const builder = page.frameLocator('#contentIframe');
  await expect(builder.locator('#scoreTotalMenu')).toHaveText('140');
  await builder.locator('[data-open-skill="wordparts"]').click();
  await expect(builder.locator('.prompt')).toHaveText(
    'Which part of replay is the prefix?'
  );
  await expect(builder.locator('[data-choice-read]')).toHaveCount(4);
  await expect(builder.locator('[data-choice-read="1"]')).toBeVisible();

  await builder.locator('.choice').filter({ hasText: 're-' }).click();
  await expect(builder.locator('.feedback')).toHaveClass(/correct/);
  await builder.locator('#seeFeedbackBtn').click();
  await expect(builder.locator('#firstTrySummary')).toContainText(
    '100%. 19 unattempted'
  );

  // The exit must remain usable on classroom displays.
  await page.evaluate(() => {
    document.documentElement.classList.add('rc-display-safe');
  });
  await expect(page.locator('.tc-sidebar')).toBeHidden();
  await expect(exitActivity).toBeVisible();
  const box = await exitActivity.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThanOrEqual(44);

  await exitActivity.click();
  await expect(page).toHaveURL(/\/student\/\?tab=activities$/);
  await expect(page.locator('#studentDashboardView')).toBeVisible();
  await expect(page.locator('#loginView')).toBeHidden();
  await expect(page.locator('#tabActivities')).toBeVisible();
  await expect(page.locator('[data-tab="activities"].active')).toHaveCount(2);

  expect(await page.evaluate(() => ({
    role: sessionStorage.getItem('rc_user_role'),
    code: sessionStorage.getItem('rc_user_code')
  }))).toEqual({ role: 'student', code: 'S010' });
});
