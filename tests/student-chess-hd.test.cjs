const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function student(code = 'CHESS_HD_TEST') {
  const session = memoryStorage();
  session.setItem('rc_user_role', 'student');
  session.setItem('rc_user_code', code);
  return session;
}

test('HD shell keeps the existing activity hooks while exposing the approved customization surface', () => {
  const html = read('site/activities/chess/index.html');
  for (const id of [
    'board', 'settingsBtn', 'newGameBtn', 'hintBtn', 'undoBtn', 'moveList', 'flipBtn',
    'themeSelect', 'piecesSelect', 'legalToggle', 'rotateToggle', 'coordsToggle',
    'pieceNamesToggle', 'animateToggle', 'reducedToggle', 'hdCapturedPanel', 'hdSaveStrip',
  ]) assert.match(html, new RegExp(`id="${id}"`), id);

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML contains duplicate ids');

  assert.match(html, /chess-hd\.css\?v=20260908-chess-hd-1/);
  assert.match(html, /hd-ui\.js\?v=20260908-chess-hd-1/);
  assert.doesNotMatch(html, /<script[^>]+src="\.\/app\.js/);

  for (const theme of ['canyon-classic', 'desert-stone', 'tournament', 'modern-slate', 'high-contrast']) {
    assert.match(html, new RegExp(`data-hd-theme-option="${theme}"`), theme);
  }
  for (const pieces of ['staunton', 'modern', 'minimal', 'circle', 'academic']) {
    assert.match(html, new RegExp(`data-hd-piece-option="${pieces}"`), pieces);
  }
  assert.doesNotMatch(html, /data-hd-piece-option="(?:letters|labeled)"/);
  assert.match(html, /Show piece names/);
  assert.match(html, /White at bottom/);
  assert.match(html, /Black at bottom/);
});

test('HD controller enhances rather than replaces the working chess controller', () => {
  const js = read('site/activities/chess/hd-ui.js');
  assert.match(js, /import '\.\/app\.js\?v=20260906-chess-2'/);
  assert.match(js, /new ChessStore\(storage, session\)/);
  assert.match(js, /new MutationObserver/);
  assert.match(js, /hdTheme/);
  assert.match(js, /hdPieces/);
  assert.match(js, /hdPieceNames/);
  assert.match(js, /hdReducedMotion/);
  assert.doesNotMatch(js, /fetch\(|supabase|localStorage\.clear\(|sessionStorage\.setItem/);
});

test('HD styling defines every approved board theme and accessibility motion fallback', () => {
  const css = read('site/activities/chess/chess-hd.css');
  for (const theme of ['canyon-classic', 'desert-stone', 'tournament', 'modern-slate', 'high-contrast']) {
    assert.match(css, new RegExp(`data-hd-theme='${theme}'`), theme);
  }
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /\.square:focus-visible/);
  assert.match(css, /\.hd-hide-coordinates \.coord/);
  assert.match(css, /rc-annotated-canyon-approved\.webp/);
});

test('Tabletop and Forged Metal stay additive, bounded, persistent, and presentation-only', () => {
  const js = read('site/activities/chess/chess-hd-polish.js');
  const css = read('site/activities/chess/chess-hd-tabletop.css');

  assert.match(js, /chess-hd-tabletop\.css\?v=20260909-chess-tabletop-1/);
  assert.match(js, /Forged Metal HD/);
  assert.match(js, /ZOOM_MIN = 85/);
  assert.match(js, /ZOOM_MAX = 125/);
  assert.match(js, /hdView/);
  assert.match(js, /hdZoom/);
  assert.match(js, /hdMetalPieces/);
  assert.match(js, /data-hd-board-view/);
  assert.doesNotMatch(js, /from '\.\/engine\.js'|findMove\(|worker\.postMessage|new Worker\(/);

  assert.match(css, /data-hd-view='tabletop'/);
  assert.match(css, /rotateX\(13deg\)/);
  assert.match(css, /--hd-board-zoom/);
  assert.match(css, /data-hd-metal='on'/);
  assert.match(css, /data-hd-theme='high-contrast'\]\[data-hd-metal='on'/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('existing browser-local metadata safely merges HD appearance fields with chess progress', async () => {
  const { ChessStore } = await import('../site/activities/chess/core.js');
  const store = new ChessStore(memoryStorage(), student());
  store.writeMeta({ activeSlot: 2, completed: ['pawn-step'], theme: 'forest', pieces: 'classic' });
  store.writeMeta({
    hdTheme: 'desert-stone',
    hdPieces: 'academic',
    hdCoordinates: false,
    hdPieceNames: true,
    hdAnimate: false,
    hdReducedMotion: true,
    hdOrientation: 'black',
    hdView: 'tabletop',
    hdZoom: 115,
    hdMetalPieces: true,
  });
  const meta = store.readMeta();
  assert.equal(meta.activeSlot, 2);
  assert.deepEqual(meta.completed, ['pawn-step']);
  assert.equal(meta.theme, 'forest');
  assert.equal(meta.pieces, 'classic');
  assert.equal(meta.hdTheme, 'desert-stone');
  assert.equal(meta.hdPieces, 'academic');
  assert.equal(meta.hdCoordinates, false);
  assert.equal(meta.hdPieceNames, true);
  assert.equal(meta.hdAnimate, false);
  assert.equal(meta.hdReducedMotion, true);
  assert.equal(meta.hdOrientation, 'black');
  assert.equal(meta.hdView, 'tabletop');
  assert.equal(meta.hdZoom, 115);
  assert.equal(meta.hdMetalPieces, true);
});
