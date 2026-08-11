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
  test('separates books from Resources and opens Lost inline', async ({
    context,
    page,
  }) => {
    await context.addInitScript((studentCode) => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', studentCode);
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

    // Resources should contain Skill Builder and not the book.
    await page.locator('[data-tab="resources"]:visible').first().click();

    await expect(page.locator('#tabResources')).toHaveClass(/active/);

    const resources = page.locator('#resourcesContent');

    await expect(resources).toContainText(
      'Language Arts Skill Builder'
    );

    await expect(resources).not.toContainText(
      'Lost in Kragdon-ah'
    );

    // Return to Library and prove the existing inline reader opens.
    await page.locator('[data-tab="library"]:visible').first().click();

    const requestsBeforeOpen = bookIndexRequests.length;

    await lostCard.click();

    await expect(page.locator('#bookTtsBtn')).toBeVisible({
      timeout: 10000,
    });

    await expect(
      page.locator('#bookReadingHelperBtn')
    ).toBeVisible();

    // Inline means we remain in Student Portal rather than navigating
    // to the generated resource landing page.
    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/presentation-02/');

    // Detection uses HEAD; opening the reader should add a GET for
    // the actual chunked book index.
    await expect
      .poll(() => bookIndexRequests.length)
      .toBeGreaterThan(requestsBeforeOpen);

    expect(bookIndexRequests).toContain('GET');
  });
});
