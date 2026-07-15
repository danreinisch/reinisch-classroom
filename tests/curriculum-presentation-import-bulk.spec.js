import { test, expect } from '@playwright/test';

const collections = [
  ['1984-2026-27', '1984', 14, '/presentations/1984-2026-27'],
  ['seeker-2026-27', 'Seeker', 19, '/presentations/seeker-2026-27'],
  ['escape-camp-14-2026-27', 'Escape from Camp 14', 9, '/presentations/escape-camp-14-2026-27'],
  ['lik-2026-27', 'Lost in Kragdon-Ah', 16, '/presentations/lik-2026-27'],
  ['adit-2026-27', 'A Door Into Time', 15, '/presentations/adit-2026-27'],
  ['wok-2026-27', 'Warrior of Kragdon-Ah', 18, '/presentations/wok-2026-27'],
  ['rfk-2026-27', 'Return from Kragdon-Ah', 15, '/presentations/rfk-2026-27']
];

test('resolves all active 2026-27 Language Arts collections', async ({ page }) => {
  for (const [id, title] of collections) {
    await page.goto(`/language-arts/collection/?collection=${id}`);
    await expect(page.locator('[data-collection-title]')).toHaveText(title);
    await expect(page.locator('[data-collection-nav="true"]')).toHaveCount(7);
  }
});

test('serves first and final routes for all eight collections', async ({ request }) => {
  const routes = collections.flatMap(([, , slots, prefix]) => [
    `${prefix}/presentation-01/`,
    `${prefix}/presentation-${String(slots).padStart(2, '0')}/`
  ]);
  routes.push(
    '/life-skills/presentations-2026-27/presentation-01/',
    '/life-skills/presentations-2026-27/presentation-37/'
  );

  for (const route of routes) {
    const response = await request.get(route);
    expect(response.ok(), `${route} must return HTTP 200`).toBeTruthy();
    const html = await response.text();
    expect(html).toContain('<title>Week ');
    expect(html).toMatch(/prefers-reduced-motion\s*:\s*reduce/i);
  }
});

test('retains continuous Life Skills animation and interaction', async ({ page }) => {
  await page.goto('/life-skills/presentations-2026-27/presentation-01/');
  await expect(page).toHaveTitle(
    'Week 1: Course Orientation & Baseline - Worker Profile and Functional Baselines'
  );

  expect(await page.evaluate(() => {
    const slide = document.querySelector('.slide.active');
    return {
      drift: getComputedStyle(slide, '::before').animationName,
      drift2: getComputedStyle(slide, '::after').animationName,
      shimmer: getComputedStyle(document.querySelector('.bar')).animationName
    };
  })).toEqual({ drift: 'drift', drift2: 'drift2', shimmer: 'shimmer' });

  const counter = page.locator('#count');
  const before = await counter.textContent();
  await page.locator('#nav button').last().click();
  await expect.poll(async () => counter.textContent()).not.toBe(before);

  expect(await page.evaluate(() => ({
    bob: getComputedStyle(document.querySelector('.slide.active .dot')).animationName,
    spin: getComputedStyle(document.querySelector('.slide.active .ring')).animationName
  }))).toEqual({ bob: 'bob', spin: 'spin' });
});
