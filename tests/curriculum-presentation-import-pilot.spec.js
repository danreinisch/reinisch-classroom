import { test, expect } from '@playwright/test';

const displayTitle =
  'Week 1: Evidence, Inference & Character Development - Surveillance & Thoughtcrime';

test('publishes the 1984 Week 1 animated import pilot', async ({ page }) => {
  await page.goto('/presentations/1984-2026-27/presentation-01/');

  await expect(page).toHaveTitle(displayTitle);

  const activeSlide = page.locator('.slide.active');
  await expect(activeSlide).toHaveCount(1);
  await expect(activeSlide.locator('h1')).toHaveText('1984');

  const initialMotion = await page.evaluate(() => {
    const slide = document.querySelector('.slide.active');
    const bar = document.querySelector('.bar');

    return {
      drift: getComputedStyle(slide, '::before').animationName,
      drift2: getComputedStyle(slide, '::after').animationName,
      shimmer: getComputedStyle(bar).animationName
    };
  });

  expect(initialMotion).toEqual({
    drift: 'drift',
    drift2: 'drift2',
    shimmer: 'shimmer'
  });

  const counter = page.locator('#count');
  const initialCounter = await counter.textContent();

  await page.locator('#nav button').last().click();

  await expect.poll(async () => counter.textContent())
    .not.toBe(initialCounter);

  const ambientMotion = await page.evaluate(() => ({
    bob: getComputedStyle(
      document.querySelector('.slide.active .dot')
    ).animationName,
    spin: getComputedStyle(
      document.querySelector('.slide.active .ring')
    ).animationName
  }));

  expect(ambientMotion).toEqual({
    bob: 'bob',
    spin: 'spin'
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });

  const reducedMotion = await page.evaluate(() => {
    const slide = document.querySelector('.slide.active');

    return [
      getComputedStyle(slide, '::before').animationName,
      getComputedStyle(slide, '::after').animationName,
      getComputedStyle(document.querySelector('.bar')).animationName,
      getComputedStyle(
        document.querySelector('.slide.active .dot')
      ).animationName,
      getComputedStyle(
        document.querySelector('.slide.active .ring')
      ).animationName
    ];
  });

  expect(reducedMotion).toEqual([
    'none',
    'none',
    'none',
    'none',
    'none'
  ]);
});
