import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const CODE = 'FOUR_HD_TEST';
const GAME_KEY = `rc_four_v1:${CODE}:game`;
const VISUAL_KEY = 'rc_four_hd_visual_v1';
const FAST_VISUALS = {
  theme: 'canyon-classic',
  pieces: 'marble',
  animateDrops: false,
  thinkingPause: false,
  reducedMotion: true,
  focusBoard: false,
};

async function establishStudent(page, visual = FAST_VISUALS) {
  await page.goto('/activities/four-in-a-row/');
  await page.evaluate(({ code, visualKey, visual }) => {
    sessionStorage.setItem('rc_user_role', 'student');
    sessionStorage.setItem('rc_user_code', code);
    localStorage.setItem(visualKey, JSON.stringify(visual));
  }, { code: CODE, visualKey: VISUAL_KEY, visual });
  await page.reload();
  await expect(page.locator('#board .cell')).toHaveCount(42);
}

async function setupLocal(page) {
  await page.locator('#newGameBtn').click();
  await page.locator('#modeSelect').selectOption('local');
  await page.locator('#startGameBtn').click();
}

async function seedGame(page, moves, extra = {}) {
  await page.evaluate(({ key, moves, extra }) => {
    localStorage.setItem(key, JSON.stringify({
      revision: 'hd-fixture',
      savedAt: 1,
      game: { version: 1, moves, mode: 'local', level: 'friendly', human: 1, ...extra },
    }));
  }, { key: GAME_KEY, moves, extra });
  await page.reload();
}

async function savedMoves(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key))?.game?.moves || [], GAME_KEY);
}

async function openSettings(page) {
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsDialog')).toBeVisible();
}

async function setVisuals(page, change) {
  await page.evaluate(({ key, change }) => {
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...current, ...change }));
  }, { key: VISUAL_KEY, change });
  await page.reload();
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const board = await page.locator('#board').boundingBox();
  expect(board).not.toBeNull();
  expect(board.x).toBeGreaterThanOrEqual(0);
  expect(board.x + board.width).toBeLessThanOrEqual((await page.viewportSize()).width + 1);
  expect(board.width).toBeGreaterThan(250);
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"error":"Synthetic Four HD test"}' });
    }
    return route.continue();
  });
  await establishStudent(page);
});

test('Board & Pieces exposes the approved HD choices and visual preferences persist', async ({ page }) => {
  await setupLocal(page);
  await page.locator('[data-column="0"]').click();
  await page.locator('[data-column="1"]').click();
  await openSettings(page);

  for (const pieces of ['marble', 'wood', 'metal', 'canyon-stone', 'high-contrast']) {
    await page.locator(`[data-piece-choice="${pieces}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-piece-set', pieces);
  }
  for (const theme of ['wood', 'canyon-classic', 'modern-slate', 'tournament-blue', 'high-contrast']) {
    await page.locator(`[data-theme-choice="${theme}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-board-theme', theme);
  }

  await page.locator('#animateDropsToggle').check();
  await page.locator('#thinkingPauseToggle').check();
  await page.locator('#reducedMotionToggle').uncheck();
  await page.locator('#focusBoardToggle').check();

  await expect(page.locator('.cell.p1 .piece-surface')).toHaveText('');
  await expect(page.locator('.cell.p2 .piece-surface')).toHaveText('');
  await expect(page.locator('.cell.p1 .piece-surface')).not.toContainText(/1|P1|Player/i);
  await expect(page.locator('.cell.p2 .piece-surface')).not.toContainText(/2|P2|Player/i);

  await page.locator('[data-close="settingsDialog"]').last().click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-piece-set', 'high-contrast');
  await expect(page.locator('body')).toHaveAttribute('data-board-theme', 'high-contrast');
  await expect(page.locator('body')).toHaveAttribute('data-focus-board', 'true');
  await expect(page.locator('#animateDropsToggle')).toBeChecked();
  await expect(page.locator('#thinkingPauseToggle')).toBeChecked();
  await expect(page.locator('#reducedMotionToggle')).not.toBeChecked();
});

test('Focus Board enlarges the board without resetting or changing the game state', async ({ page }) => {
  await setupLocal(page);
  for (const column of [0, 1, 2]) await page.locator(`[data-column="${column}"]`).click();
  const beforeMoves = await savedMoves(page);
  const standard = await page.locator('#board').boundingBox();

  await page.locator('#focusBoardBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-focus-board', 'true');
  await expect(page.locator('#focusBoardBtn')).toHaveText('Standard view');
  expect(await savedMoves(page)).toEqual(beforeMoves);
  await expect(page.locator('.cell.p1')).toHaveCount(2);
  await expect(page.locator('.cell.p2')).toHaveCount(1);

  const focused = await page.locator('#board').boundingBox();
  expect(focused.width).toBeGreaterThanOrEqual(standard.width - 1);

  await page.locator('#focusBoardBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-focus-board', 'false');
  expect(await savedMoves(page)).toEqual(beforeMoves);
});

test('computer thinking is visible before the unchanged worker-selected move drops', async ({ page }) => {
  await setVisuals(page, { animateDrops: true, thinkingPause: true, reducedMotion: false, focusBoard: false });
  await seedGame(page, [6, 0, 6, 1, 5, 2, 4], { mode: 'computer', level: 'learning', human: 1 });

  await expect(page.locator('#turnCard')).toHaveClass(/is-thinking/);
  await expect(page.locator('#turnHeadline')).toContainText('Computer is thinking');
  await expect(page.locator('#moveCount')).toHaveText('7 of 42 spaces');
  await expect(page.locator('#thinkingDots')).toBeVisible();

  await expect.poll(() => savedMoves(page), { timeout: 4000 }).toEqual([6, 0, 6, 1, 5, 2, 4, 3]);
  await expect(page.locator('[data-cell="38"]')).toHaveClass(/p2/);
  await expect(page.locator('#positionStatus')).toContainText(/computer connected four/i);
});

test('piece drops animate into the correct landing slot and reduced motion removes the travel animation', async ({ page }) => {
  await setVisuals(page, { animateDrops: true, thinkingPause: false, reducedMotion: false, focusBoard: false });
  await setupLocal(page);
  await page.locator('[data-column="3"]').click();
  await expect(page.locator('[data-cell="38"]')).toHaveClass(/p1.*dropping|dropping.*p1/);
  await expect(page.locator('#positionStatus')).toContainText('Piece in motion');
  await expect(page.locator('[data-cell="38"]')).not.toHaveClass(/dropping/, { timeout: 1500 });
  await expect(page.locator('[data-cell="38"]')).toHaveClass(/p1/);

  await openSettings(page);
  await page.locator('#reducedMotionToggle').check();
  await page.locator('[data-close="settingsDialog"]').last().click();
  await page.locator('[data-column="4"]').click();
  await expect(page.locator('[data-cell="39"]')).toHaveClass(/p2/);
  await expect(page.locator('[data-cell="39"]')).not.toHaveClass(/dropping/);
});

test('approved responsive sizes fit in Standard and Focus layouts with no light bottom artifact', async ({ page }) => {
  await setupLocal(page);
  const sizes = [
    { width: 1366, height: 768 },
    { width: 1365, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];

  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('.cell')).toHaveCount(42);
    const colors = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      bodyHeight: document.body.getBoundingClientRect().height,
      viewportHeight: innerHeight,
    }));
    expect(colors.html).not.toBe('rgb(255, 255, 255)');
    expect(colors.body).not.toBe('rgb(255, 255, 255)');
    expect(colors.bodyHeight).toBeGreaterThanOrEqual(viewport.height - 1);

    await page.locator('#focusBoardBtn').click();
    await expect(page.locator('body')).toHaveAttribute('data-focus-board', 'true');
    await expectNoHorizontalOverflow(page);
    await page.locator('#focusBoardBtn').click();
    await expect(page.locator('body')).toHaveAttribute('data-focus-board', 'false');
  }
});

test('direct activity and normal Viewer routes both render the HD board without changing routing', async ({ page }) => {
  await page.goto('/activities/four-in-a-row/');
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('h1')).toContainText('Four In a Row HD');

  await page.goto('/viewer/?src=%2Factivities%2Ffour-in-a-row%2F&return=%2Fstudent%2F%3Ftab%3Dactivities&title=Four%20in%20a%20Row&activity=1');
  const game = page.frameLocator('#contentIframe');
  await expect(game.locator('#board')).toBeVisible();
  await expect(game.locator('body')).toHaveAttribute('data-board-theme', /.+/);
  await expect(game.locator('#backLink')).toBeHidden();
});
