import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const CODE = 'FOUR_TEST_A';
const KEY = `rc_four_v1:${CODE}:game`;
const options = { mode: 'local', level: 'friendly', human: 1 };
const drop = (surface, column) => surface.locator(`[data-column="${column}"]`).click();
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
async function setup(page, mode = 'local', human = 1, level = 'learning') {
  await page.locator('#newGameBtn').click();
  await page.locator('#modeSelect').selectOption(mode);
  if (mode === 'computer') { await page.locator('#humanSelect').selectOption(String(human)); await page.locator('#levelSelect').selectOption(level); }
  await page.locator('#startGameBtn').click();
}
async function seed(page, moves, extra = {}) {
  await page.evaluate(({ key, game }) => localStorage.setItem(key, JSON.stringify({ revision:'fixture', savedAt:1, game })), { key:KEY, game:{ version:1, moves, ...options, ...extra } });
  await page.reload();
}
async function openCode(page, id) {
  const details = page.locator('.rules-note');
  if (!(await details.evaluate(el => el.open))) await details.locator('summary').click();
  await page.locator(id).click();
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) return route.fulfill({ status:503, contentType:'application/json', body:'{"ok":false,"error":"Synthetic Four in a Row test"}' });
    return route.continue();
  });
  await page.goto('/activities/four-in-a-row/');
  await page.evaluate(code => { sessionStorage.setItem('rc_user_role','student'); sessionStorage.setItem('rc_user_code',code); },CODE);
  await page.reload();
  await expect(page.locator('#board button')).toHaveCount(7);
});

test('Activities launches the game in Viewer and returns with the student session intact', async ({ page }) => {
  await page.goto('/student/?tab=activities');
  await expect(page.locator('#tabActivities')).toBeVisible();
  await expect(page.locator('#tabActivities .st-activity-card')).toHaveCount(4);
  await page.locator('#tabActivities .st-activity-card').filter({ hasText:'Open Four in a Row' }).click();
  const game = page.frameLocator('#contentIframe');
  await expect(game.locator('#board button')).toHaveCount(7);
  await expect(game.locator('#backLink')).toBeHidden();
  await expect(game.locator('#storageStatus')).toContainText('on this device');
  await page.locator('#exitActivityBtn').click();
  await expect(page).toHaveURL(/\/student\/\?tab=activities$/);
  expect(await page.evaluate(() => sessionStorage.getItem('rc_user_code'))).toBe(CODE);
});

test('two-player games win, highlight four, stop accepting moves, and resume the result', async ({ page }) => {
  await setup(page);
  for (const column of [0,6,1,6,2,5,3]) await drop(page,column);
  await expect(page.locator('#positionStatus')).toContainText('Player 1 connected four');
  await expect(page.locator('.cell.winner')).toHaveCount(4);
  await expect(page.locator('[data-column="4"]')).toHaveAttribute('aria-disabled','true');
  await page.locator('[data-column="4"]').press('Enter'); expect((await saved(page)).game.moves).toHaveLength(7);
  await page.reload(); await expect(page.locator('.cell.winner')).toHaveCount(4);
  await page.locator('#undoBtn').click(); await expect(page.locator('.cell.winner')).toHaveCount(0);
  expect((await saved(page)).game.moves).toHaveLength(6);
});

test('a full column refuses a move without changing turn or saved history', async ({ page }) => {
  await seed(page,[3,3,3,3,3,3]);
  await expect(page.locator('[data-column="3"]')).toHaveAttribute('aria-disabled','true');
  await page.locator('[data-column="3"]').press('Enter');
  await expect(page.locator('#playFeedback')).toContainText('column is full');
  expect((await saved(page)).game.moves).toHaveLength(6);
  await expect(page.locator('#positionStatus')).toContainText('Player 1');
  await drop(page,2); expect((await saved(page)).game.moves).toHaveLength(7);
});

test('autosave restores a two-player game and an undone move after reload', async ({ page }) => {
  await setup(page); for (const c of [0,1,2]) await drop(page,c);
  await page.reload(); await expect(page.locator('#moveCount')).toHaveText('3 of 42 spaces');
  await page.locator('#undoBtn').click(); await page.reload();
  expect((await saved(page)).game.moves).toEqual([0,1]);
  await expect(page.locator('#positionStatus')).toContainText('Player 1');
});

test('the computer plays either side and undo returns to the human turn', async ({ page }) => {
  await setup(page,'computer',1); await drop(page,0);
  await expect(page.locator('#moveCount')).toHaveText('2 of 42 spaces');
  await expect(page.locator('#positionStatus')).toContainText('Your turn');
  await page.locator('#undoBtn').click(); expect((await saved(page)).game.moves).toHaveLength(0);
  await setup(page,'computer',2,'challenge');
  await expect(page.locator('#moveCount')).toHaveText('1 of 42 spaces');
  await expect(page.locator('#undoBtn')).toBeDisabled();
  await drop(page,0); await expect(page.locator('#moveCount')).toHaveText('3 of 42 spaces');
  await page.locator('#undoBtn').click(); expect((await saved(page)).game.moves).toHaveLength(1);
  await expect(page.locator('#positionStatus')).toContainText('Your turn');
});

test('coaching explains a block and can be switched off without making a move', async ({ page }) => {
  await seed(page,[0,1,0,1,2,1]);
  await page.locator('#hintBtn').click();
  await expect(page.locator('#playFeedback')).toContainText('column 2');
  await expect(page.locator('#playFeedback')).toContainText('block');
  await expect(page.locator('[data-column="1"]')).toHaveClass(/hint/);
  await page.locator('#coachToggle').uncheck();
  await expect(page.locator('#playFeedback')).toContainText('Turn on Coach mode');
  expect((await saved(page)).game.moves).toHaveLength(6);
  await page.reload(); await expect(page.locator('#coachToggle')).not.toBeChecked();
});

test('challenges give useful feedback, accept alternate answers, and preserve the saved game', async ({ page }) => {
  await setup(page); await drop(page,3);
  const before = await saved(page);
  await page.locator('[data-view="challenges"]').click();
  await page.locator('[data-exercise="two-finishes"]').click();
  await drop(page,2); await expect(page.locator('#exerciseSuccess')).toBeHidden();
  await expect(page.locator('#exerciseFeedback')).toContainText('does not connect four');
  await page.locator('#exerciseHintBtn').click(); await page.locator('#exerciseHintBtn').click(); await page.locator('#exerciseHintBtn').click();
  await expect(page.locator('#exerciseFeedback')).toContainText('Column 1 or column 5');
  await drop(page,4); await expect(page.locator('#exerciseSuccess')).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await page.locator('[data-view="play"]').click(); await expect(page.locator('#moveCount')).toHaveText('1 of 42 spaces');
  await page.reload(); await page.locator('[data-view="challenges"]').click();
  await expect(page.locator('[data-exercise="two-finishes"]')).toHaveClass(/complete/);
});

test('guided lessons require a correct move and keep practice separate from saves', async ({ page }) => {
  await page.locator('[data-view="learn"]').click(); await expect(page.locator('.exercise-card')).toHaveCount(4);
  await page.locator('[data-exercise="first-drop"]').click(); await drop(page,0);
  await expect(page.locator('#exerciseSuccess')).toBeHidden();
  await drop(page,3); await expect(page.locator('#exerciseSuccess')).toBeVisible();
  expect(await saved(page)).toBeNull();
  await page.locator('#nextExerciseBtn').click(); await expect(page.locator('#exerciseTitle')).toHaveText('Connect across');
});

test('board themes and distinguishable piece styles persist', async ({ page }) => {
  await setup(page); await drop(page,0); await drop(page,1); await page.locator('#settingsBtn').click();
  for (const theme of ['midnight','forest','ocean','contrast']) { await page.locator('#themeSelect').selectOption(theme); await expect(page.locator('body')).toHaveAttribute('data-theme',theme); }
  for (const pieces of ['symbols','numbers','rings','patterns']) { await page.locator('#piecesSelect').selectOption(pieces); await expect(page.locator('body')).toHaveAttribute('data-pieces',pieces); }
  await expect(page.locator('[data-cell="35"] > span')).toHaveText('1');
  await expect(page.locator('[data-cell="36"] > span')).toHaveText('2');
  await page.locator('[data-close="settingsDialog"]').last().click(); await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme','contrast'); await expect(page.locator('body')).toHaveAttribute('data-pieces','patterns');
});

test('keyboard column navigation and number shortcuts each make one move', async ({ page }) => {
  await setup(page); await page.locator('[data-column="3"]').focus();
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('[data-column="2"]')).toBeFocused();
  await page.keyboard.press('Enter'); expect((await saved(page)).game.moves).toEqual([2]);
  await page.keyboard.press('7'); expect((await saved(page)).game.moves).toEqual([2,6]);
  await page.keyboard.press('Home'); await expect(page.locator('[data-column="0"]')).toBeFocused();
  await page.keyboard.press('Space'); expect((await saved(page)).game.moves).toEqual([2,6,0]);
  await expect(page.locator('#board [tabindex="0"]')).toHaveCount(1);
});

test('mobile and Chromebook layouts keep the board visible without horizontal overflow', async ({ page }) => {
  for (const viewport of [{width:375,height:812},{width:1366,height:768}]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await page.locator('.board-card').boundingBox(); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator('.cell')).toHaveCount(42);
  }
  await page.goto('/viewer/?src=%2Factivities%2Ffour-in-a-row%2F&return=%2Fstudent%2F%3Ftab%3Dactivities&title=Four%20in%20a%20Row&activity=1');
  const board = page.frameLocator('#contentIframe').locator('#board'); await expect(board).toBeVisible();
  expect(await board.evaluate(element => element.closest('.board-card').getBoundingClientRect().bottom <= innerHeight)).toBe(true);
});

test('a quota failure keeps the board and prior save and visibly reports the unsaved move', async ({ page }) => {
  await setup(page); const before = await saved(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if (k.startsWith('rc_four_v1:')) throw new Error('Test quota exceeded'); return original.call(this,k,v); }; });
  await drop(page,0); await expect(page.locator('#moveCount')).toHaveText('1 of 42 spaces');
  await expect(page.locator('#storageStatus')).toContainText('Test quota exceeded'); expect(await saved(page)).toEqual(before);
});

test('blocked storage still allows practice and reports the saving limitation', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(window,'localStorage',{ configurable:true,get() { throw new DOMException('Blocked storage','SecurityError'); } }));
  await page.reload(); await expect(page.locator('#storageStatus')).toContainText('Browser storage is unavailable');
  await setup(page,'local'); await drop(page,0); await drop(page,1);
  await expect(page.locator('#moveCount')).toHaveText('2 of 42 spaces'); expect(errors).toEqual([]);
});

test('unreadable saves are kept until explicitly replaced', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key,'{broken'),KEY); await page.reload();
  await expect(page.locator('#storageStatus')).toContainText('unreadable saved game was kept');
  await page.locator('#newGameBtn').click(); await expect(page.locator('#startGameBtn')).toHaveText('Replace saved game & start');
  await page.locator('[data-close="newGameDialog"]').click(); expect(await page.evaluate(key => localStorage.getItem(key),KEY)).toBe('{broken');
  await setup(page); expect((await saved(page)).game.moves).toEqual([]);
});

test('stale tabs cannot silently replace the newer game', async ({ page }) => {
  await setup(page); await drop(page,0);
  await page.evaluate(key => { const data=JSON.parse(localStorage.getItem(key)); data.revision='newer-tab'; data.game.moves=[0,1]; localStorage.setItem(key,JSON.stringify(data)); },KEY);
  await drop(page,2); await expect(page.locator('#storageStatus')).toContainText('Another tab changed');
  expect((await saved(page)).game.moves).toEqual([0,1]);
  await openCode(page,'#copyBtn'); expect(JSON.parse(await page.locator('#gameCode').inputValue()).moves).toEqual([0,2]);
});

test('changing students locks the old game and keeps the next student’s save separate', async ({ page }) => {
  await setup(page); await drop(page,0);
  await page.evaluate(() => sessionStorage.setItem('rc_user_code','FOUR_TEST_B')); await drop(page,2);
  await expect(page.locator('#mainContent')).toBeHidden(); await expect(page.locator('#sessionNotice')).toBeVisible();
  expect((await saved(page)).game.moves).toEqual([0]);
  await page.reload(); await expect(page.locator('#moveCount')).toHaveText('New game');
  expect(await page.evaluate(() => localStorage.getItem('rc_four_v1:FOUR_TEST_B:game'))).toBeNull();
});

test('game-code import validates first and confirms replacement before saving', async ({ page }) => {
  await setup(page); await drop(page,0); const before = await saved(page);
  await openCode(page,'#pasteBtn'); await page.locator('#gameCode').fill('{broken'); await page.locator('#transferAction').click();
  await expect(page.locator('#transferError')).toContainText('complete Four in a Row'); expect(await saved(page)).toEqual(before);
  const code = JSON.stringify({version:1,moves:[3,2,4],...options});
  await page.locator('#gameCode').fill(code); await page.locator('#transferAction').click();
  await expect(page.locator('#startGameBtn')).toHaveText('Replace saved game & load'); expect(await saved(page)).toEqual(before);
  await page.locator('#startGameBtn').click(); expect((await saved(page)).game.moves).toEqual([3,2,4]);
  await openCode(page,'#copyBtn'); expect(await page.locator('#gameCode').inputValue()).not.toContain(CODE);
});

test('leaving or undoing a delayed computer turn cancels the late reply', async ({ page }) => {
  await page.route('**/activities/four-in-a-row/worker.js*', route => route.fulfill({contentType:'text/javascript',body:'self.onmessage=e=>setTimeout(()=>self.postMessage({id:e.data.id,column:2}),600);'}));
  await setup(page,'computer'); await drop(page,0); await page.locator('[data-view="learn"]').click();
  await page.waitForTimeout(800); expect((await saved(page)).game.moves).toHaveLength(1);
  await page.locator('[data-view="play"]').click(); await page.locator('#undoBtn').click();
  await page.waitForTimeout(800); expect((await saved(page)).game.moves).toHaveLength(0);
});

test('a malformed computer reply pauses safely and a retry can continue', async ({ page }) => {
  let attempts = 0;
  await page.route('**/activities/four-in-a-row/worker.js*', route => route.fulfill({contentType:'text/javascript',body:++attempts === 1 ? 'self.onmessage=()=>self.postMessage(null);' : 'self.onmessage=e=>self.postMessage({id:e.data.id,column:2});'}));
  await setup(page,'computer'); await drop(page,0); await expect(page.locator('#retryBtn')).toBeVisible();
  expect((await saved(page)).game.moves).toHaveLength(1);
  await page.locator('#retryBtn').click(); await expect(page.locator('#moveCount')).toHaveText('2 of 42 spaces');
  await expect(page.locator('#retryBtn')).toBeHidden();
});

test('the real worker rejects malformed requests and processes a later valid request', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const worker = new Worker('/activities/four-in-a-row/worker.js?v=20260906-four-2');
    const send = data => new Promise((resolve,reject) => { worker.onmessage=e=>resolve(e.data); worker.onerror=e=>reject(new Error(e.message)); worker.postMessage(data); });
    try { return [await send(null),await send({id:3,moves:[-1],level:'learning'}),await send({id:4,moves:[],level:'learning'})]; }
    finally { worker.terminate(); }
  });
  expect(results[0]).toEqual({id:null,error:'The computer paused. Try again.'});
  expect(results[1]).toEqual({id:3,error:'The computer paused. Try again.'});
  expect(results[2].id).toBe(4); expect(results[2].column).toBeGreaterThanOrEqual(0); expect(results[2].column).toBeLessThan(7);
});

test('older-browser fallbacks keep dialogs, keyboard focus, computer play, and imports usable', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.hasOwn = undefined;
    HTMLDialogElement.prototype.showModal = undefined; HTMLDialogElement.prototype.close = undefined;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, settings) {
        if (settings?.type === 'module') throw new Error('Module workers unavailable');
        super(url, settings);
      }
    };
  });
  await page.reload();
  await page.locator('#newGameBtn').click();
  await expect(page.locator('#newGameDialog')).toBeVisible();
  await expect(page.locator('[data-close="newGameDialog"]')).toBeFocused();
  await page.locator('#startGameBtn').focus(); await page.keyboard.press('Tab');
  await expect(page.locator('[data-close="newGameDialog"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#startGameBtn')).toBeFocused();
  await page.locator('#newGameBtn').evaluate(element => element.focus());
  await expect(page.locator('[data-close="newGameDialog"]')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#newGameDialog')).toBeHidden();
  await expect(page.locator('#newGameBtn')).toBeFocused();
  await setup(page, 'computer'); await drop(page, 0);
  await expect(page.locator('#moveCount')).toHaveText('2 of 42 spaces');
  await page.locator('#settingsBtn').click(); await page.locator('#themeSelect').selectOption('forest');
  await page.keyboard.press('Escape'); await expect(page.locator('#settingsBtn')).toBeFocused();
  await openCode(page, '#pasteBtn');
  await page.locator('#gameCode').fill(JSON.stringify({ version: 1, moves: [3,2,4], ...options }));
  await page.locator('#transferAction').click(); await page.locator('#startGameBtn').click();
  expect((await saved(page)).game.moves).toEqual([3,2,4]);
  await page.reload(); await expect(page.locator('#moveCount')).toHaveText('3 of 42 spaces');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'forest');
  expect(errors).toEqual([]);
});

test('the board stays legible without dynamic viewport units or CSS aspect ratios', async ({ page }) => {
  await page.route('**/activities/four-in-a-row/game.css*', async route => {
    const response = await route.fetch();
    const css = (await response.text()).replace(/[^{};]*100dvh[^;]*;/g, '').replace(/aspect-ratio\s*:[^;]+;/g, '');
    await route.fulfill({ response, body: css });
  });
  await page.reload(); await setup(page);
  for (const viewport of [{width:375,height:812}, {width:1366,height:768}]) {
    await page.setViewportSize(viewport);
    const sizes = await page.locator('.cell').evaluateAll(cells => cells.map(cell => { const box=cell.getBoundingClientRect(); return {width:box.width,height:box.height}; }));
    expect(sizes).toHaveLength(42);
    for (const size of sizes) { expect(size.width).toBeGreaterThan(20); expect(Math.abs(size.height-size.width)).toBeLessThan(2); }
    const box=await page.locator('.board-card').boundingBox(); expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await drop(page, 0); await expect(page.locator('#moveCount')).toHaveText('1 of 42 spaces');
});
