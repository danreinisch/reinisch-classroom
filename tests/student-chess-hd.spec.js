import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';

test.use({ serviceWorkers: 'block' });
const CODE = 'CHESS_HD_TEST';
const key = slot => `rc_chess_v1:${CODE}:slot:${slot}`;


function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function lowerLightPixelRatio(png, lowerFraction = 0.12) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.subarray(0, 8).equals(signature)).toBe(true);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset); offset += 4;
    const type = png.toString('ascii', offset, offset + 4); offset += 4;
    const data = png.subarray(offset, offset + length); offset += length + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  expect(bitDepth).toBe(8);
  expect([2, 6]).toContain(colorType);
  expect(interlace).toBe(0);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const rows = new Array(height);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos++];
    const row = Buffer.alloc(stride);
    const prev = y ? rows[y - 1] : null;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[pos++];
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= bpp ? prev[x - bpp] : 0;
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + up) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255;
      else throw new Error(`Unsupported PNG filter ${filter}`);
    }
    rows[y] = row;
  }
  const startY = Math.max(0, Math.floor(height * (1 - lowerFraction)));
  let sampled = 0;
  let light = 0;
  for (let y = startY; y < height; y += 2) {
    const row = rows[y];
    for (let x = 0; x < width; x += 2) {
      const i = x * bpp;
      const r = row[i];
      const g = row[i + 1];
      const b = row[i + 2];
      sampled += 1;
      if (r > 218 && g > 218 && b > 218 && Math.max(r, g, b) - Math.min(r, g, b) < 28) light += 1;
    }
  }
  return light / sampled;
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

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
  await expect(page.locator('#board svg[data-hd-premium-piece="true"]')).toHaveCount(32);
  const lightSquareMaterial = await page.locator('[data-square="b1"]').evaluate(el => getComputedStyle(el).backgroundSize);
  expect(lightSquareMaterial).toContain('11px 11px');
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsDialog')).toBeVisible();
  await expect(page.locator('[data-hd-theme-option]')).toHaveCount(5);
  await expect(page.locator('[data-hd-piece-option]')).toHaveCount(5);
  await expect(page.locator('[data-hd-piece-option="letters"]')).toHaveCount(0);
  await expect(page.locator('[data-hd-theme-option="canyon-classic"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-hd-piece-option="staunton"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-hd-piece-option="staunton"] > span').last()).toHaveText('Classic Staunton HD');
  await expect(page.locator('[data-hd-piece-option="circle"] > span').last()).toHaveText('Canyon Carved');
  await expect(page.locator('[data-hd-piece-option="academic"] > span').last()).toHaveText('Accessibility / Academic');
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

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1365, height: 900 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
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

test('premium SVG sets are genuinely distinct and Board depth stays optional, persistent, and high-contrast safe', async ({ page }) => {
  await setupLocalGame(page);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#boardDepthToggle')).not.toBeChecked();
  const signatures = [];
  for (const set of ['staunton', 'circle', 'modern', 'minimal', 'academic']) {
    await page.locator(`[data-hd-piece-option="${set}"]`).click();
    await expect(page.locator('#board svg[data-hd-premium-piece="true"]')).toHaveCount(32);
    signatures.push(await page.locator('[data-square="b1"] svg.hd-premium-piece').evaluate(el => el.innerHTML));
  }
  expect(new Set(signatures).size).toBe(5);

  await page.locator('#boardDepthToggle').check();
  await expect(page.locator('body')).toHaveAttribute('data-hd-board-depth', 'on');
  await expect.poll(async () => Number(await page.locator('[data-square="b1"] .hd-piece-contact').evaluate(el => getComputedStyle(el).opacity))).toBeGreaterThan(0.1);

  await page.locator('[data-hd-theme-option="high-contrast"]').click();
  const filter = await page.locator('[data-square="b1"] svg.hd-premium-piece').evaluate(el => getComputedStyle(el).filter);
  expect(filter).toBe('none');
  const highContrastContact = Number(await page.locator('[data-square="b1"] .hd-piece-contact').evaluate(el => getComputedStyle(el).opacity));
  expect(highContrastContact).toBe(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(`rc_chess_v1:${sessionStorage.getItem('rc_user_code')}:meta`)));
  expect(stored.hdBoardDepth).toBe(true);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-hd-board-depth', 'on');
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#boardDepthToggle')).toBeChecked();
});

test('Focus Board meaningfully enlarges the desktop board without resetting selection, moves, controls, or scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await setupLocalGame(page);
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await page.locator('[data-square="g1"]').click();
  await expect(page.locator('[data-square="g1"]')).toHaveClass(/selected/);
  const standard = await page.locator('#board').boundingBox();
  const beforeY = await page.evaluate(() => window.scrollY);

  await page.locator('#focusBoardBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-hd-layout', 'focus');
  await expect(page.locator('#focusBoardBtn')).toHaveText('Standard view');
  await expect(page.locator('[data-square="g1"]')).toHaveClass(/selected/);
  const focused = await page.locator('#board').boundingBox();
  expect(focused.width - standard.width).toBeGreaterThan(70);
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeY);
  await expectNoHorizontalOverflow(page);

  for (const selector of ['#hdPlayerStrip', '#newGameBtn', '#hintBtn', '#undoBtn', '#moveList', '#hdCapturedPanel', '#settingsBtn']) {
    await expect(page.locator(selector)).toBeVisible();
  }
  await expect(page.locator('#focusBoardBtn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-square="f3"]').click();
  const savedFocus = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key(0));
  expect(savedFocus.game.moves).toHaveLength(3);

  await page.locator('#focusBoardBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-hd-layout', 'standard');
  const standardAgain = await page.locator('#board').boundingBox();
  expect(standardAgain.width).toBeLessThan(focused.width);
  const savedStandard = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key(0));
  expect(savedStandard.game.moves).toHaveLength(3);

  await page.locator('#focusBoardBtn').click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-hd-layout', 'focus');
  await expect(page.locator('#focusBoardBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#moveList')).toContainText('Nf3');
});

test('Standard and Focus layouts fit the required classroom/mobile viewports with visible focus and no horizontal overflow', async ({ page }) => {
  await setupLocalGame(page);
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1365, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    if ((await page.locator('body').getAttribute('data-hd-layout')) === 'focus') await page.locator('#focusBoardBtn').click();
    await expect(page.locator('body')).toHaveAttribute('data-hd-layout', 'standard');
    await expectNoHorizontalOverflow(page);
    await page.locator('#focusBoardBtn').click();
    await expect(page.locator('body')).toHaveAttribute('data-hd-layout', 'focus');
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('#board button')).toHaveCount(64);
  }
  await page.locator('#flipBtn').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#focusBoardBtn')).toBeFocused();
  const outline = await page.locator('#focusBoardBtn').evaluate(el => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});

test('HD-only play chrome does not leak into Learn, Challenges, or My games and the lower viewport stays dark', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await setupLocalGame(page);
  await move(page, 'e2', 'e4');
  await page.locator('#settingsBtn').click();
  await page.locator('[data-hd-piece-option="circle"]').click();
  await page.locator('#boardDepthToggle').check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  const direct = await page.screenshot({ type: 'png' });
  expect(lowerLightPixelRatio(direct)).toBeLessThan(0.4);
  await expectNoHorizontalOverflow(page);

  for (const view of ['learn', 'challenges', 'saves']) {
    await page.locator(`[data-view="${view}"]`).click();
    await expect(page.locator('#workspace')).toBeHidden();
    await expect(page.locator('#hdSaveStrip')).toBeHidden();
    await expectNoHorizontalOverflow(page);
  }
  await page.locator('[data-view="play"]').click();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#hdSaveStrip')).toBeVisible();
});

test('Viewer route keeps the polished board inside its iframe without lower light artifact or overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/viewer/?src=%2Factivities%2Fchess%2F&title=Classroom%20Chess');
  const frame = page.frameLocator('#contentIframe');
  await expect(frame.locator('#board button')).toHaveCount(64);
  await expect(frame.locator('body')).toHaveClass(/hd-embedded-view/);
  await expect(frame.locator('#focusBoardBtn')).toBeVisible();
  await frame.locator('#focusBoardBtn').click();
  await expect(frame.locator('body')).toHaveAttribute('data-hd-layout', 'focus');
  expect(await frame.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const iframeImage = await page.locator('#contentIframe').screenshot({ type: 'png' });
  expect(lowerLightPixelRatio(iframeImage)).toBeLessThan(0.4);
});
