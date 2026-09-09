import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const CODE = 'CHESS_HD_TEST';
const key = slot => `rc_chess_v1:${CODE}:slot:${slot}`;

async function move(page, from, to) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}

async function setupLocalGame(page, slot = 0) {
  await page.locator('#newGameBtn').click();
  await page.locator('#modeSelect').selectOption('local');
  await page.locator('#slotSelect').selectOption(String(slot));
  await page.locator('#startGameBtn').click();
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"error":"Synthetic chess HD test"}' });
    }
    return route.continue();
  });
  await page.goto('/activities/chess/');
  await page.evaluate(code => {
    sessionStorage.setItem('rc_user_role', 'student');
    sessionStorage.setItem('rc_user_code', code);
  }, CODE);
  await page.reload();
  await expect(page.locator('#board button')).toHaveCount(64);
});

test('HD defaults use Canyon Classic, Staunton pieces, and the five approved independent choices', async ({ page }) => {
  await expect(page.locator('body')).toHaveAttribute('data-hd-theme', 'canyon-classic');
  await expect(page.locator('body')).toHaveAttribute('data-hd-piece-set', 'staunton');
  await expect(page.locator('#board svg.hd-piece')).toHaveCount(32);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsDialog')).toBeVisible();
  await expect(page.locator('[data-hd-theme-option]')).toHaveCount(5);
  await expect(page.locator('[data-hd-piece-option]')).toHaveCount(5);
  await expect(page.locator('[data-hd-piece-option="letters"]')).toHaveCount(0);
  await expect(page.locator('[data-hd-theme-option="canyon-classic"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-hd-piece-option="staunton"]')).toHaveAttribute('aria-pressed', 'true');
});

test('board and piece choices are independent and HD appearance preferences persist locally', async ({ page }) => {
  await setupLocalGame(page);
  await page.locator('#settingsBtn').click();
  await page.locator('[data-hd-theme-option="desert-stone"]').click();
  await page.locator('[data-hd-piece-option="academic"]').click();
  await page.locator('#coordsToggle').uncheck();
  await page.locator('#pieceNamesToggle').check();
  await page.locator('#animateToggle').uncheck();
  await page.locator('#reducedToggle').check();
  await page.locator('[data-hd-orientation="black"]').click();

  await expect(page.locator('body')).toHaveAttribute('data-hd-theme', 'desert-stone');
  await expect(page.locator('body')).toHaveAttribute('data-hd-piece-set', 'academic');
  await expect(page.locator('body')).toHaveClass(/hd-hide-coordinates/);
  await expect(page.locator('body')).toHaveClass(/hd-reduced-motion/);
  await expect(page.locator('.hd-piece-name')).toHaveCount(32);
  await expect(page.locator('#board button').first()).toHaveAttribute('data-square', 'h1');
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(`rc_chess_v1:${sessionStorage.getItem('rc_user_code')}:meta`)));
  expect(stored.hdTheme).toBe('desert-stone');
  expect(stored.hdPieces).toBe('academic');
  expect(stored.hdCoordinates).toBe(false);
  expect(stored.hdPieceNames).toBe(true);
  expect(stored.hdAnimate).toBe(false);
  expect(stored.hdReducedMotion).toBe(true);
  expect(stored.hdOrientation).toBe('black');

  await page.reload();
  await expect(page.locator('#board button').first()).toHaveAttribute('data-square', 'h1');
  await expect(page.locator('body')).toHaveAttribute('data-hd-theme', 'desert-stone');
  await expect(page.locator('body')).toHaveAttribute('data-hd-piece-set', 'academic');
  await expect(page.locator('.hd-piece-name')).toHaveCount(32);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#coordsToggle')).not.toBeChecked();
  await expect(page.locator('#pieceNamesToggle')).toBeChecked();
  await expect(page.locator('#animateToggle')).not.toBeChecked();
  await expect(page.locator('#reducedToggle')).toBeChecked();
  await expect(page.locator('[data-hd-theme-option="desert-stone"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-hd-piece-option="academic"]')).toHaveAttribute('aria-pressed', 'true');
});

test('all five board themes render distinct board colors and piece names remain independent of piece style', async ({ page }) => {
  await page.locator('#settingsBtn').click();
  const colors = [];
  for (const theme of ['canyon-classic', 'desert-stone', 'tournament', 'modern-slate', 'high-contrast']) {
    await page.locator(`[data-hd-theme-option="${theme}"]`).click();
    await page.waitForTimeout(220);
    colors.push(await page.locator('[data-square="a1"]').evaluate(el => getComputedStyle(el).backgroundColor));
  }
  expect(new Set(colors).size).toBe(5);
  await page.locator('#pieceNamesToggle').check();
  for (const pieces of ['staunton', 'modern', 'minimal', 'circle', 'academic']) {
    await page.locator(`[data-hd-piece-option="${pieces}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-hd-piece-set', pieces);
    await expect(page.locator('#board svg.hd-piece')).toHaveCount(32);
    await expect(page.locator('.hd-piece-name')).toHaveCount(32);
  }
});

test('captured-piece panel follows actual move history and updates after undo', async ({ page }) => {
  await setupLocalGame(page);
  await move(page, 'e2', 'e4');
  await move(page, 'd7', 'd5');
  await move(page, 'e4', 'd5');
  await expect(page.locator('#hdWhiteCaptured svg')).toHaveCount(1);
  await expect(page.locator('#hdWhiteCaptured svg')).toHaveAttribute('aria-label', 'Black pawn');
  await expect(page.locator('#hdBlackCaptured svg')).toHaveCount(0);
  await page.locator('#undoBtn').click();
  await expect(page.locator('#hdWhiteCaptured svg')).toHaveCount(0);
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key(0));
  expect(saved.game.moves).toHaveLength(2);
});

test('HD layer preserves keyboard play, legal-move cues, fixed orientation, and responsive no-overflow behavior', async ({ page }) => {
  await setupLocalGame(page);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#legalToggle')).toBeChecked();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await page.locator('[data-square="e2"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.square.legal')).toHaveCount(2);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key(0));
  expect(saved.game.moves[0].to).toBe('e4');

  await page.locator('#settingsBtn').click();
  await page.locator('[data-hd-orientation="black"]').click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('#board button').first()).toHaveAttribute('data-square', 'h1');

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1365, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('#board button')).toHaveCount(64);
    const board = await page.locator('#board').boundingBox();
    expect(board.width).toBeGreaterThan(260);
  }
});

test('reduced motion disables HD transitions without removing the playable board', async ({ page }) => {
  await setupLocalGame(page);
  await page.locator('#settingsBtn').click();
  await page.locator('#reducedToggle').check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await move(page, 'e2', 'e4');
  await expect(page.locator('body')).toHaveClass(/hd-reduced-motion/);
  const duration = await page.locator('[data-square="e4"] .hd-piece').evaluate(el => getComputedStyle(el).animationDuration);
  const seconds = duration.endsWith('ms') ? parseFloat(duration) / 1000 : parseFloat(duration);
  expect(seconds).toBeLessThanOrEqual(0.001);
  await expect(page.locator('#board button')).toHaveCount(64);
});

test('temporary visual-reference capture for all six approved HD directions', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await setupLocalGame(page);
  for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'b5'], ['a7', 'a6']]) {
    await move(page, from, to);
  }

  await page.locator('#settingsBtn').click();
  await page.locator('[data-hd-theme-option="canyon-classic"]').click();
  await page.locator('[data-hd-piece-option="staunton"]').click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'playwright-report/visual/01-gold-standard.png', fullPage: false });

  await page.locator('#settingsBtn').click();
  await page.screenshot({ path: 'playwright-report/visual/02-board-and-pieces.png', fullPage: false });

  await page.locator('[data-hd-theme-option="desert-stone"]').click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'playwright-report/visual/03-desert-stone.png', fullPage: false });

  await page.locator('#settingsBtn').click();
  await page.locator('[data-hd-theme-option="tournament"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'playwright-report/visual/04-tournament.png', fullPage: false });

  await page.locator('[data-hd-theme-option="modern-slate"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'playwright-report/visual/05-modern-slate.png', fullPage: false });

  await page.locator('[data-hd-theme-option="high-contrast"]').click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'playwright-report/visual/06-high-contrast.png', fullPage: false });

  throw new Error('VISUAL_CAPTURE_COMPLETE');
});
