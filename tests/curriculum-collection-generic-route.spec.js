import { test, expect } from '@playwright/test';

test.describe('Curriculum Collection Registry v2 generic route', () => {
  test('resolves an active legacy collection through the reusable route', async ({ page }) => {
    await page.goto('/language-arts/collection/?collection=adit');

    await expect(page.locator('[data-collection-title]')).toHaveText(
      'A Door Into Time'
    );

    await expect(page).toHaveTitle('A Door Into Time – Reinisch Classroom');

    await expect(
      page.locator('[data-collection-nav="true"]')
    ).toHaveCount(4);
  });

  test('keeps the existing legacy book route intact', async ({ page }) => {
    await page.goto('/language-arts/a-door-into-time/');

    await expect(page.locator('h1')).toHaveText('A Door Into Time');
    await expect(page).toHaveTitle('A Door Into Time – Reinisch Classroom');
  });
});

test('resolves a new registry-only collection without a dedicated route', async ({ page }) => {
  await page.route('**/assets/data/units.json*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();

    data.units.push({
      id: 'future-text-set',
      title: 'Future Text Set',
      kind: 'text-set',
      description: 'A registry-only collection used for browser acceptance testing.',
      status: 'active',
      sortOrder: 50,
      section: 'language-arts',
      slots: 16,
      baseOut: 'presentations/future-text-set',
      pagePath: '/language-arts/collection/',
    });

    await route.fulfill({
      response,
      json: data,
    });
  });

  await page.goto('/language-arts/collection/?collection=future-text-set');

  await expect(page.locator('[data-collection-title]')).toHaveText(
    'Future Text Set'
  );

  await expect(
    page.locator('[data-collection-description]')
  ).toHaveText(
    'A registry-only collection used for browser acceptance testing.'
  );

  await expect(page).toHaveTitle('Future Text Set – Reinisch Classroom');

  await expect(
    page.locator('[data-collection-nav="true"]')
  ).toHaveCount(5);

  await expect(
    page.locator('[data-collection-nav="true"]').filter({
      hasText: 'Future Text Set',
    })
  ).toHaveCount(1);
});


test('orders active registry collections and hides archived collections', async ({ page }) => {
  await page.route('**/assets/data/units.json*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();

    data.units.push(
      {
        id: 'prelude-unit',
        title: 'Prelude Unit',
        kind: 'unit',
        description: 'Appears before the legacy books by display order.',
        status: 'active',
        sortOrder: 5,
        section: 'language-arts',
        slots: 16,
        baseOut: 'presentations/prelude-unit',
        pagePath: '/language-arts/collection/',
      },
      {
        id: 'retired-text-set',
        title: 'Retired Text Set',
        kind: 'text-set',
        description: 'Must remain out of active navigation.',
        status: 'archived',
        sortOrder: 1,
        section: 'language-arts',
        slots: 16,
        baseOut: 'presentations/retired-text-set',
        pagePath: '/language-arts/collection/',
      }
    );

    await route.fulfill({
      response,
      json: data,
    });
  });

  await page.goto('/language-arts/collection/?collection=adit');

  const collectionLinks = page.locator('[data-collection-nav="true"]');

  await expect(collectionLinks).toHaveCount(5);
  await expect(collectionLinks.first()).toContainText('Prelude Unit');

  await expect(
    collectionLinks.filter({ hasText: 'Retired Text Set' })
  ).toHaveCount(0);
});
