import { test, expect } from '@playwright/test';

const SYNTHETIC_CODE = 'S001';

async function mockStudentFunctions(page) {
  await page.route('**/.netlify/functions/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    // Browser Supabase configuration is intentionally unavailable in this
    // synthetic test. Student Portal behavior is exercised through mocked
    // server endpoints only.
    if (pathname.endsWith('/browser-supabase-config')) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'Not used by synthetic Library smoke test',
        }),
      });
      return;
    }

    const syntheticStudent = {
      code: SYNTHETIC_CODE,
      name: 'Synthetic Student',
      active: true,
      class_id: null,
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        code: SYNTHETIC_CODE,
        name: 'Synthetic Student',
        student: syntheticStudent,
        students: [syntheticStudent],
        assignments: [],
        instances: [],
        submissions: [],
        goals: [],
        progress: [],
        data_points: [],
      }),
    });
  });
}

test.describe('RC-LIBRARY-01 Student Portal Library shell', () => {
  test('separates Library books from current instructional Resources and classifies Lost securely', async ({
    context,
    page,
  }) => {
    await context.addInitScript((studentCode) => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', studentCode);

      /*
       * Simulate stale pseudo-reader progress from the retired Lost reader.
       * Secure EPUB Library cards must ignore this legacy state.
       */
      const secureLostLink =
        '/student/resources/presentation-02/';

      const legacyStorageKey =
        'rc_book_page_' +
        encodeURIComponent(secureLostLink);

      localStorage.setItem(
        legacyStorageKey,
        '1'
      );

      localStorage.setItem(
        legacyStorageKey + '_total',
        '535'
      );
    }, SYNTHETIC_CODE);

    await mockStudentFunctions(page);

    const bookIndexRequests = [];

    page.on('request', (request) => {
      if (
        request.url().includes(
          '/student/resources/presentation-02/book-index.json'
        )
      ) {
        bookIndexRequests.push(request.method());
      }
    });

    await page.goto('/student/');

    await expect(
      page.locator('#studentDashboardView')
    ).toBeVisible({ timeout: 10000 });

    // Library should contain the book and not the instructional resource.
    await page.locator('[data-tab="library"]:visible').first().click();

    await expect(page.locator('#tabLibrary')).toHaveClass(/active/);

    const library = page.locator('#libraryContent');

    await expect(library).toContainText(
      '"Lost in Kragdon-ah" by Shawn Inmon',
      { timeout: 10000 }
    );

    await expect(library).not.toContainText(
      'Language Arts Skill Builder'
    );

    const lostCard = library.locator(
      '.st-resource-card[data-library-book="true"]',
      { hasText: 'Lost in Kragdon-ah' }
    );

    await expect(lostCard).toHaveCount(1);
    await expect(lostCard).toBeVisible();

    // Secure EPUB cards must not display stale pseudo-reader page progress.
    await expect(lostCard).not.toContainText(
      'Page 1 of 535'
    );

    await expect(lostCard).not.toContainText(
      '0% read'
    );

    await expect(
      lostCard.locator('.st-resource-progress')
    ).toBeHidden();

    // Resources should expose current instructional collections,
    // not the retired Skill Builder download wrapper.
    await page.locator(
      '[data-tab="resources"]:visible'
    ).first().click();

    await expect(
      page.locator('#tabResources')
    ).toHaveClass(/active/);

    const resources =
      page.locator('#resourcesContent');

    await expect(resources).toContainText(
      'Language Arts Toolkit'
    );

    await expect(resources).toContainText(
      '1984'
    );

    await expect(resources).toContainText(
      'Seeker'
    );

    await expect(resources).toContainText(
      'Escape from Camp 14'
    );

    await expect(resources).toContainText(
      'Transitional Skills'
    );

    await expect(resources).not.toContainText(
      'Language Arts Skill Builder'
    );

    /*
     * Books belong in Library, so Resources should not
     * contain the author-labelled Library cards.
     */
    await expect(resources).not.toContainText(
      'by Shawn Inmon'
    );

    const nineteenEightyFourCard =
      resources.locator(
        '.st-resource-card',
        { hasText: '1984' }
      );

    await expect(
      nineteenEightyFourCard
    ).toHaveCount(1);

    await expect(
      nineteenEightyFourCard
    ).toHaveAttribute(
      'href',
      '/language-arts/collection/?collection=1984-2026-27'
    );

    /*
     * Critical regression check:
     * instructional resources are browser links,
     * never download links.
     */
    await expect(
      nineteenEightyFourCard
    ).not.toHaveAttribute(
      'download',
      /.*/
    );

    const popupPromise =
      page.waitForEvent('popup');

    await nineteenEightyFourCard.click();

    const resourcePage =
      await popupPromise;

    await resourcePage.waitForLoadState(
      'domcontentloaded'
    );

    await expect(
      resourcePage
    ).toHaveURL(
      /\/language-arts\/collection\/\?collection=1984-2026-27$/
    );

    await resourcePage.close();

    // Secure EPUB classification must not probe or load the retired
    // presentation-02 public book index. Actual reader opening is covered
    // by the certified real-EPUB browser smoke.
    expect(bookIndexRequests).toEqual([]);
  });
});
