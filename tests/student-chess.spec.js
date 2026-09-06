import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const CODE = 'CHESS_TEST_A';
const key = slot => `rc_chess_v1:${CODE}:slot:${slot}`;
async function move(surface, from, to) {
  await surface.locator(`[data-square="${from}"]`).click();
  await surface.locator(`[data-square="${to}"]`).click();
}
async function saved(page, slot = 0) { return page.evaluate(k => JSON.parse(localStorage.getItem(k)), key(slot)); }
async function setup(page, { mode = 'local', slot = 0, side = 'w', level = 'friendly' } = {}) {
  await page.locator('[data-view="play"]').click();
  await page.locator('#newGameBtn').click();
  await page.locator('#modeSelect').selectOption(mode);
  if (mode === 'computer') {
    await page.locator('#sideSelect').selectOption(side);
    await page.locator('#levelSelect').selectOption(level);
  }
  await page.locator('#slotSelect').selectOption(String(slot));
  await page.locator('#startGameBtn').click();
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"error":"Synthetic chess test"}' });
    return route.continue();
  });
  await page.goto('/activities/chess/');
  await page.evaluate(code => { sessionStorage.setItem('rc_user_role', 'student'); sessionStorage.setItem('rc_user_code', code); }, CODE);
  await page.reload();
  await expect(page.locator('#board button')).toHaveCount(64);
});

test('portal opens chess in Viewer and exits directly to Activities with the same session', async ({ page }) => {
  await page.goto('/student/?tab=activities');
  await expect(page.locator('#tabActivities')).toBeVisible();
  await page.locator('#tabActivities .st-activity-card').filter({ hasText: 'Open Chess' }).click();
  await expect(page).toHaveURL(/\/viewer\/\?.*activity=1/);
  const chess = page.frameLocator('#contentIframe');
  await expect(chess.locator('#board button')).toHaveCount(64);
  await expect(chess.locator('#storageStatus')).toContainText('on this device');
  await expect(page.locator('#exitActivityBtn')).toBeVisible();
  await page.locator('#exitActivityBtn').click();
  await expect(page).toHaveURL(/\/student\/\?tab=activities$/);
  await expect(page.locator('#tabActivities')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('rc_user_code'))).toBe(CODE);
});

test('two-player games fill three separate slots and resume after reload', async ({ page }) => {
  await setup(page); await move(page, 'e2', 'e4'); await move(page, 'e7', 'e5');
  await setup(page, { slot: 1 }); await move(page, 'd2', 'd4');
  await setup(page, { slot: 2 }); await move(page, 'g1', 'f3');
  await page.reload(); await expect(page.locator('#gameTitle')).toHaveText('Game 3');
  expect((await saved(page, 0)).game.moves).toHaveLength(2);
  expect((await saved(page, 1)).game.moves[0].from).toBe('d2');
  expect((await saved(page, 2)).game.moves[0].from).toBe('g1');
  await page.locator('[data-view="saves"]').click();
  await page.locator('.save-card').nth(0).getByRole('button', { name: 'Resume game' }).click();
  await expect(page.locator('#gameTitle')).toHaveText('Game 1');
  await expect(page.locator('[data-square="e4"]')).toHaveAttribute('aria-label', 'e4, White pawn');
  await expect(page.locator('[data-square="e5"]')).toHaveAttribute('aria-label', 'e5, Black pawn');
});

test('computer can play either color and replies only once per turn', async ({ page }) => {
  await setup(page, { mode: 'computer', level: 'friendly' });
  await move(page, 'e2', 'e4');
  await expect.poll(async () => (await saved(page)).game.moves.length).toBe(2);
  await expect(page.locator('#positionStatus')).toContainText('White to move');
  await setup(page, { mode: 'computer', side: 'b', slot: 1, level: 'challenge' });
  await expect.poll(async () => (await saved(page, 1)).game.moves.length).toBe(1);
  await move(page, 'e7', 'e5');
  await expect.poll(async () => (await saved(page, 1)).game.moves.length).toBe(3);
  await expect(page.locator('#positionStatus')).toContainText('Black to move');
  await page.locator('#undoBtn').click();
  expect((await saved(page, 1)).game.moves).toHaveLength(1);
  await expect(page.locator('#positionStatus')).toContainText('Black to move');
});

test('leaving or undoing during a delayed computer turn cannot apply a stale move', async ({ page }) => {
  await page.route('**/activities/chess/worker.js', route => route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage = e => setTimeout(() => self.postMessage({id:e.data.id,move:{from:"e7",to:"e5"}}), 450);' }));
  await setup(page, { mode: 'computer' }); await move(page, 'e2', 'e4');
  await page.locator('[data-view="learn"]').click();
  await expect(page.locator('#catalogTitle')).toBeVisible();
  await page.waitForTimeout(600);
  expect((await saved(page)).game.moves).toHaveLength(1);
  await page.locator('[data-view="play"]').click(); await page.locator('#undoBtn').click();
  await page.waitForTimeout(600);
  expect((await saved(page)).game.moves).toHaveLength(0);
  await expect(page.locator('[data-square="e7"]')).toHaveAttribute('aria-label', 'e7, Black pawn');
});

test('a wrong tutorial move gets useful feedback and completion requires the correct move', async ({ page }) => {
  await setup(page); await move(page, 'd2', 'd4');
  const before = await saved(page);
  await page.locator('[data-view="learn"]').click();
  await page.locator('.exercise-card').filter({ hasText: 'Meet the pawn' }).click();
  await move(page, 'e2', 'e3');
  await expect(page.locator('#exerciseFeedback')).toContainText('does not solve');
  await expect(page.locator('#exerciseSuccess')).toBeHidden();
  await move(page, 'e2', 'e4'); await expect(page.locator('#exerciseSuccess')).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await page.reload(); await page.locator('[data-view="learn"]').click();
  await expect(page.locator('#catalogProgress')).toHaveText('1 of 12 complete');
});

test('promotion asks for a piece, can be canceled, and accepts underpromotion', async ({ page }) => {
  await page.locator('[data-view="learn"]').click();
  await page.locator('.exercise-card').filter({ hasText: 'Promote a pawn' }).click();
  await move(page, 'a7', 'a8'); await expect(page.locator('#promotionDialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel move' }).click();
  await expect(page.locator('[data-square="a7"]')).toHaveAttribute('aria-label', 'a7, White pawn');
  await page.locator('[data-square="a8"]').click();
  await page.locator('[data-promote="n"]').click();
  await expect(page.locator('[data-square="a8"]')).toHaveAttribute('aria-label', 'a8, White knight');
  await expect(page.locator('#exerciseSuccess')).toBeVisible();
});

test('challenge accepts an alternate mate and gives graduated hints', async ({ page }) => {
  await page.locator('[data-view="challenges"]').click();
  await page.locator('.exercise-card').filter({ hasText: 'King and queen teamwork' }).click();
  await page.locator('#exerciseHintBtn').click(); await expect(page.locator('.square.hint')).toHaveCount(0);
  await page.locator('#exerciseHintBtn').click(); await expect(page.locator('.square.hint')).toHaveCount(2);
  await move(page, 'f7', 'h7'); await expect(page.locator('#exerciseSuccess')).toBeVisible();
  await expect(page.locator('#exerciseExplanation')).toContainText('escape routes');
});

test('four board styles and four piece styles work and preferences persist', async ({ page }) => {
  await setup(page);
  await page.locator('#settingsBtn').click();
  expect(await page.locator('#themeSelect option').count()).toBe(4);
  expect(await page.locator('#piecesSelect option').count()).toBe(4);
  const colors = [];
  for (const theme of ['forest', 'classic', 'ocean', 'contrast']) {
    await page.locator('#themeSelect').selectOption(theme);
    colors.push(await page.locator('[data-square="a1"]').evaluate(el => getComputedStyle(el).backgroundColor));
  }
  expect(new Set(colors).size).toBe(4);
  await page.locator('#piecesSelect').selectOption('labeled'); await expect(page.locator('.piece-name')).toHaveCount(32);
  await page.locator('#piecesSelect').selectOption('letters'); await expect(page.locator('.piece-letter')).toHaveCount(32);
  await page.locator('#piecesSelect').selectOption('modern'); await expect(page.locator('#board svg')).toHaveCount(32);
  await page.locator('#legalToggle').uncheck(); await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('[data-square="e2"]').click(); await expect(page.locator('.square.legal')).toHaveCount(0);
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-theme', 'contrast');
  await page.locator('#settingsBtn').click(); await expect(page.locator('#piecesSelect')).toHaveValue('modern');
  await expect(page.locator('#legalToggle')).not.toBeChecked();
});

test('keyboard play and small screens retain all 64 accessible squares without overflow', async ({ page }) => {
  await setup(page);
  await page.locator('[data-square="e2"]').focus();
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  expect((await saved(page)).game.moves[0].to).toBe('e4');
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1365, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await page.locator('#board').boundingBox(); expect(box.width).toBeGreaterThan(260);
    await expect(page.locator('#board button')).toHaveCount(64);
  }
});

test('storage failure is visible and does not erase the game being played', async ({ page }) => {
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k.startsWith('rc_chess_v1:')) throw new Error('Test quota exceeded'); return original.call(this, k, v); }; });
  await move(page, 'e2', 'e4');
  await expect(page.locator('#storageStatus')).toContainText('Saving needs attention');
  await expect(page.locator('[data-square="e4"]')).toHaveAttribute('aria-label', 'e4, White pawn');
  expect(await saved(page)).toBeNull();
});

test('corrupt saves survive viewing and require explicit confirmation to delete', async ({ page }) => {
  await page.evaluate(k => localStorage.setItem(k, '{broken'), key(0));
  await page.reload(); await page.locator('[data-view="saves"]').click();
  await expect(page.locator('.save-card').first()).toContainText('unreadable');
  await page.getByRole('button', { name: 'Delete Game 1', exact: true }).click();
  await page.getByRole('button', { name: 'Keep game', exact: true }).click();
  expect(await page.evaluate(k => localStorage.getItem(k), key(0))).toBe('{broken');
  await page.getByRole('button', { name: 'Delete Game 1', exact: true }).click();
  await page.getByRole('button', { name: 'Delete game', exact: true }).click();
  expect(await page.evaluate(k => localStorage.getItem(k), key(0))).toBeNull();
});

test('changing student session locks the old board and a fresh visit has separate slots', async ({ page }) => {
  await setup(page); await move(page, 'e2', 'e4');
  const before = await saved(page);
  await page.evaluate(() => sessionStorage.setItem('rc_user_code', 'CHESS_TEST_B'));
  await page.locator('#newGameBtn').click(); await expect(page.locator('#sessionNotice')).toBeVisible();
  await expect(page.locator('#mainContent')).toBeHidden();
  expect(await saved(page)).toEqual(before);
  await page.reload(); await expect(page.locator('#moveCount')).toHaveText('New game');
  await page.locator('[data-view="saves"]').click(); await expect(page.locator('.save-card').first()).toContainText('An open spot');
});

test('copy and import preserves game settings and requires an explicit slot choice', async ({ page }) => {
  await setup(page); await move(page, 'e2', 'e4');
  await page.locator('[data-view="saves"]').click(); await page.locator('#copyGameBtn').click();
  const code = await page.locator('#gameCode').inputValue(); expect(code).not.toContain(CODE);
  await page.locator('[data-close="transferDialog"]').click(); await page.locator('#importGameBtn').click();
  await page.locator('#gameCode').fill('{bad'); await page.locator('#transferAction').click();
  await expect(page.locator('#transferError')).toContainText('complete game code');
  await page.locator('#gameCode').fill(code); await page.locator('#transferAction').click();
  await expect(page.locator('#newGameDialog')).toBeVisible();
  await page.locator('#slotSelect').selectOption('1'); await page.locator('#startGameBtn').click();
  expect((await saved(page, 1)).game).toEqual((await saved(page, 0)).game);
});

test('the entire board fits a Chromebook screen, including inside Viewer', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const board = await page.locator('#board').boundingBox();
  expect(board.width).toBeGreaterThan(350);
  expect(board.y + board.height).toBeLessThan(740);
  await page.goto('/viewer/?src=%2Factivities%2Fchess%2F&return=%2Fstudent%2F%3Ftab%3Dactivities&title=Classroom%20Chess&activity=1');
  const frame = page.frameLocator('#contentIframe');
  await expect(frame.locator('#board button')).toHaveCount(64);
  expect(await frame.locator('#board').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.bottom <= window.innerHeight && rect.width > 320;
  })).toBe(true);
});

test('automatic board turning follows two-player turns and undo', async ({ page }) => {
  await setup(page);
  await page.locator('#settingsBtn').click(); await page.locator('#rotateToggle').check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await move(page, 'e2', 'e4');
  await expect(page.locator('#board button').first()).toHaveAttribute('data-square', 'h1');
  await move(page, 'e7', 'e5');
  await expect(page.locator('#board button').first()).toHaveAttribute('data-square', 'a8');
  await page.locator('#undoBtn').click();
  await expect(page.locator('#board button').first()).toHaveAttribute('data-square', 'h1');
});

test('stale-tab saves produce a visible conflict and keep the newer game intact', async ({ page, context }) => {
  await setup(page);
  const second = await context.newPage();
  await second.goto('/activities/chess/');
  await second.evaluate(code => { sessionStorage.setItem('rc_user_role', 'student'); sessionStorage.setItem('rc_user_code', code); }, CODE);
  await second.reload();
  await move(page, 'e2', 'e4');
  await move(second, 'd2', 'd4');
  await expect(second.locator('#storageStatus')).toContainText('another tab');
  expect((await saved(page)).game.moves[0].from).toBe('e2');
  await second.close();
});
