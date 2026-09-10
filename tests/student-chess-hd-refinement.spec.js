import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const CODE = 'CHESS_HD_REFINEMENT_TEST';
const key = slot => `rc_chess_v1:${CODE}:slot:${slot}`;

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function setupGame(page, mode = 'computer', level = 'casual') {
  await page.locator('#newGameBtn').click();
  await page.locator('#modeSelect').selectOption(mode);
  if (mode === 'computer') await page.locator('#levelSelect').selectOption(level);
  await page.locator('#slotSelect').selectOption('0');
  await page.locator('#startGameBtn').click();
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"error":"Synthetic Chess HD refinement test"}' });
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

test('HD Board exposes all twelve computer levels and changes level only through explicit new-game setup', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await setupGame(page, 'computer', 'casual');
  const before = await page.evaluate(storageKey => localStorage.getItem(storageKey), key(0));

  await page.locator('#hdTabletopBtn').click();
  await expect(page.locator('#hdImmersiveDifficultyBtn')).toBeVisible();
  await expect(page.locator('#hdImmersiveDifficultyLabel')).toHaveText('Computer strength');
  await expect(page.locator('#hdImmersiveDifficultyValue')).toHaveText('Casual');
  await expect(page.locator('#hdImmersiveDifficultyBtn')).toHaveAttribute('aria-label', /Current level Casual/);

  await page.locator('#hdImmersiveDifficultyBtn').click();
  await expect(page.locator('#newGameDialog')).toBeVisible();
  await expect(page.locator('#levelSelect')).toHaveValue('casual');
  await expect(page.locator('#levelSelect option:not([hidden])')).toHaveCount(12);
  await expect(page.locator('#levelSelect option:not([hidden])').first()).toHaveText('1 · First Steps');
  await expect(page.locator('#levelSelect option:not([hidden])').last()).toHaveText('12 · Canyon Boss');
  await page.locator('#levelSelect').selectOption('canyon-boss');
  await page.getByRole('button', { name: 'Close game setup' }).click();
  await expect(page.locator('#newGameDialog')).toBeHidden();
  await expect(page.locator('#hdImmersiveDifficultyValue')).toHaveText('Casual');
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key(0))).toBe(before);

  await page.locator('#hdImmersiveDifficultyBtn').click();
  await page.locator('#levelSelect').selectOption('canyon-boss');
  await page.locator('#slotSelect').selectOption('0');
  await page.locator('#startGameBtn').click();
  await expect(page.locator('#hdImmersiveDifficultyValue')).toHaveText('Canyon Boss');
  await expect(page.locator('#gameDetails')).toContainText('Canyon Boss level');
  await expect(page.locator('#hdOpponentStatus')).toContainText('Canyon Boss level');
  const saved = await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), key(0));
  expect(saved.game.level).toBe('canyon-boss');
  expect(saved.game.moves).toEqual([]);
});

test('HD Board removes the bottom stage artifact, clears toolbar overlap, and keeps the instrument panel responsive at required breakpoints', async ({ page }) => {
  await setupGame(page, 'local');

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1365, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    if (!(await page.locator('#hdImmersiveShell').isHidden())) await page.locator('#hdBackBtn').click();
    await page.setViewportSize(viewport);
    await page.locator('#hdTabletopBtn').click();
    await expect(page.locator('#hdImmersiveShell')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const stagePresentation = await page.locator('#hdImmersiveBoardStage').evaluate(element => {
      const style = getComputedStyle(element);
      const mount = getComputedStyle(document.getElementById('hdImmersiveBoardMount'));
      return { background: style.backgroundColor, scrollbarWidth: style.scrollbarWidth, mountBackground: mount.backgroundColor };
    });
    expect(stagePresentation.background).toBe('rgba(0, 0, 0, 0)');
    expect(stagePresentation.mountBackground).toBe('rgba(0, 0, 0, 0)');
    expect(stagePresentation.scrollbarWidth).toBe('none');

    const toolbar = await page.locator('.hd-immersive-topbar').boundingBox();
    const frame = await page.locator('.hd-immersive-shell .hd-board-frame').boundingBox();
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(frame.y + 4);
    expect(frame.width).toBeGreaterThan(260);
    expect(frame.width).toBeLessThanOrEqual(viewport.width + 1);

    if (viewport.width >= 900) {
      await expect(page.locator('#hdImmersiveShell')).toHaveAttribute('data-panel', 'expanded');
      const panel = await page.locator('#hdImmersivePanel').boundingBox();
      expect(panel.width).toBeLessThanOrEqual(300);
      expect(panel.x + 2).toBeGreaterThanOrEqual(frame.x + frame.width);
      await expect(page.locator('#hdImmersiveDifficultyBtn')).toBeVisible();
    } else {
      await expect(page.locator('#hdImmersiveShell')).toHaveAttribute('data-panel', 'collapsed');
      const collapsed = await page.locator('#hdImmersivePanel').boundingBox();
      expect(collapsed.width).toBeLessThanOrEqual(50);
      await page.locator('#hdImmersivePanelToggle').click();
      await expect(page.locator('#hdImmersiveShell')).toHaveAttribute('data-panel', 'expanded');
      await expect.poll(async () => (await page.locator('#hdImmersivePanel').boundingBox())?.width || 0).toBeGreaterThan(220);
      const expanded = await page.locator('#hdImmersivePanel').boundingBox();
      expect(expanded.width).toBeLessThanOrEqual(viewport.width - 12);
      await expect(page.locator('#hdImmersiveDifficultyBtn')).toBeVisible();
      await page.locator('#hdImmersivePanelToggle').click();
      await expect(page.locator('#hdImmersiveShell')).toHaveAttribute('data-panel', 'collapsed');
    }
  }
});

test('Viewer iframe gets the same artifact-free HD presentation and twelve-level difficulty access', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/viewer/?src=%2Factivities%2Fchess%2F&title=Classroom%20Chess');
  const frame = page.frameLocator('#contentIframe');
  await expect(frame.locator('#board button')).toHaveCount(64);
  await frame.locator('#hdTabletopBtn').click();
  await expect(frame.locator('#hdImmersiveShell')).toBeVisible();
  expect(await frame.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(frame.locator('#hdImmersiveDifficultyBtn')).toBeVisible();
  await frame.locator('#hdImmersiveDifficultyBtn').click();
  await expect(frame.locator('#levelSelect option:not([hidden])')).toHaveCount(12);
  await frame.getByRole('button', { name: 'Close game setup' }).click();
  const stage = await frame.locator('#hdImmersiveBoardStage').evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, scrollbarWidth: style.scrollbarWidth };
  });
  expect(stage.background).toBe('rgba(0, 0, 0, 0)');
  expect(stage.scrollbarWidth).toBe('none');
  const toolbar = await frame.locator('.hd-immersive-topbar').boundingBox();
  const board = await frame.locator('.hd-immersive-shell .hd-board-frame').boundingBox();
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(board.y + 4);
});
