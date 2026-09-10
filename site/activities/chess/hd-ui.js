import { Chess, ChessStore } from './core.js?v=20260909-chess-levels-1';
import './app.js?v=20260909-chess-levels-1';

const $ = id => document.getElementById(id);
const THEMES = new Set(['canyon-classic', 'desert-stone', 'tournament', 'modern-slate', 'high-contrast']);
const PIECE_SETS = new Set(['staunton', 'modern', 'minimal', 'circle', 'academic']);
const ORIENTATIONS = new Set(['white', 'black']);
const PIECE_TYPES = Object.freeze({ pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' });
const PIECE_LABELS = Object.freeze({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' });

let storage;
try { storage = window.localStorage; } catch { storage = null; }
let session;
try { session = window.sessionStorage; } catch { session = null; }
let hdStore = null;
try { if (storage && session) hdStore = new ChessStore(storage, session); } catch { hdStore = null; }
const meta = (() => {
  try { return hdStore?.readMeta() || {}; } catch { return {}; }
})();

const systemReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const legacyThemeMap = Object.freeze({ forest: 'canyon-classic', classic: 'desert-stone', ocean: 'tournament', contrast: 'high-contrast' });
const legacyPieceMap = Object.freeze({ classic: 'staunton', modern: 'modern', labeled: 'staunton', letters: 'staunton' });
const state = {
  theme: THEMES.has(meta.hdTheme) ? meta.hdTheme : (legacyThemeMap[meta.theme] || 'canyon-classic'),
  pieces: PIECE_SETS.has(meta.hdPieces) ? meta.hdPieces : (legacyPieceMap[meta.pieces] || 'staunton'),
  coordinates: meta.hdCoordinates !== false,
  pieceNames: typeof meta.hdPieceNames === 'boolean' ? meta.hdPieceNames : ['labeled', 'letters'].includes(meta.pieces),
  animate: meta.hdAnimate !== false,
  reducedMotion: typeof meta.hdReducedMotion === 'boolean' ? meta.hdReducedMotion : systemReducedMotion,
  orientation: ORIENTATIONS.has(meta.hdOrientation) ? meta.hdOrientation : null,
};

let legacyThemeMode = false;
let legacyPieceMode = false;
let orientationGuard = false;

const stauntonShapes = Object.freeze({
  p: '<circle class="hd-piece-fill" cx="32" cy="16" r="7.5"/><path class="hd-piece-fill" d="M25 28h14l-2.5 9 7 12H20.5l7-12z"/><path class="hd-piece-fill" d="M18 50h28l3 7H15z"/>',
  r: '<path class="hd-piece-fill" d="M17 9h8v8h5V9h5v8h5V9h8v16l-6 6v16H22V31l-5-6z"/><path class="hd-piece-fill" d="M19 47h26l4 10H15z"/><path class="hd-piece-detail" d="M23 28h18"/>',
  n: '<path class="hd-piece-fill" d="M20 49c0-10 4-17 17-23l-8-5-8 9-9-3 7-14 13-5 1-5 8 8c9 7 11 17 6 29l-3 9z"/><path class="hd-piece-fill" d="M18 49h29l3 8H15z"/><circle class="hd-piece-detail" cx="29" cy="16" r="1.3"/>',
  b: '<path class="hd-piece-fill" d="M32 6c-4 5-14 14-14 21 0 7 5 10 14 10s14-3 14-10C46 20 36 11 32 6z"/><path class="hd-piece-detail" d="M37 17 28 29"/><path class="hd-piece-fill" d="M27 38h10l4 11H23z"/><path class="hd-piece-fill" d="M19 50h26l5 7H14z"/>',
  q: '<path class="hd-piece-fill" d="m14 20 9 6 9-13 9 13 9-6-8 26H22z"/><circle class="hd-piece-fill" cx="13" cy="16" r="3.5"/><circle class="hd-piece-fill" cx="32" cy="9" r="3.5"/><circle class="hd-piece-fill" cx="51" cy="16" r="3.5"/><path class="hd-piece-detail" d="M23 39h18"/><path class="hd-piece-fill" d="M20 46h24l5 11H15z"/>',
  k: '<path class="hd-piece-fill" d="M28 5h8v7h7v7h-7v8h-8v-8h-7v-7h7z"/><path class="hd-piece-fill" d="M22 46c1-9-9-14-7-21 1-6 10-6 17 2 7-8 16-8 17-2 2 7-8 12-7 21z"/><path class="hd-piece-fill" d="M20 47h24l5 10H15z"/>',
});

const modernShapes = Object.freeze({
  p: '<circle class="hd-piece-fill" cx="32" cy="16" r="9"/><path class="hd-piece-fill" d="M26 30h12l8 24H18z"/>',
  r: '<path class="hd-piece-fill" d="M17 11h8v8h4v-8h6v8h4v-8h8v17H17z"/><path class="hd-piece-fill" d="M23 29h18v18H23z"/><path class="hd-piece-fill" d="M17 48h30v7H17z"/>',
  n: '<path class="hd-piece-fill" d="m19 12 17-6 12 12-4 29H23l3-15 11-9-10-1-6 7-9-3z"/><path class="hd-piece-fill" d="M17 48h30v7H17z"/><circle class="hd-piece-detail" cx="31" cy="15" r="1.5"/>',
  b: '<path class="hd-piece-fill" d="m32 5 13 19-13 13-13-13z"/><path class="hd-piece-detail" d="m36 18-8 9"/><path class="hd-piece-fill" d="M27 38h10l9 17H18z"/>',
  q: '<path class="hd-piece-fill" d="m13 15 12 9 7-17 7 17 12-9-9 29H22z"/><path class="hd-piece-fill" d="M22 47h20l6 8H16z"/>',
  k: '<path class="hd-piece-fill" d="M28 5h8v8h8v8h-8v8h-8v-8h-8v-8h8z"/><path class="hd-piece-fill" d="M25 32h14l7 23H18z"/>',
});

const minimalShapes = Object.freeze({
  p: '<circle class="hd-piece-fill" cx="32" cy="17" r="7"/><path class="hd-piece-fill" d="M25 29h14l5 23H20z"/><path class="hd-piece-detail" d="M18 54h28"/>',
  r: '<path class="hd-piece-fill" d="M20 12h7v7h5v-7h5v7h7v9H20z"/><path class="hd-piece-fill" d="M25 29h14v22H25z"/><path class="hd-piece-detail" d="M18 54h28"/>',
  n: '<path class="hd-piece-fill" d="M20 48c1-13 7-20 18-25l-10-5-9 10-7-2 7-13 15-6 12 12-3 29z"/><path class="hd-piece-detail" d="M17 54h30"/>',
  b: '<path class="hd-piece-fill" d="M32 7 43 25 32 37 21 25z"/><path class="hd-piece-detail" d="m36 18-8 10M25 40h14l5 12H20zM17 54h30"/>',
  q: '<path class="hd-piece-fill" d="m16 19 9 6 7-14 7 14 9-6-7 29H23z"/><path class="hd-piece-detail" d="M18 54h28"/>',
  k: '<path class="hd-piece-fill" d="M29 7h6v7h7v6h-7v8h-6v-8h-7v-6h7z"/><path class="hd-piece-fill" d="M24 32h16l5 20H19z"/><path class="hd-piece-detail" d="M17 54h30"/>',
});

function baseShape(set, type) {
  if (set === 'modern') return modernShapes[type];
  if (set === 'minimal') return minimalShapes[type];
  return stauntonShapes[type];
}

function makePieceSvg(type, color, set = state.pieces) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.hdPieceSet = set;
  svg.classList.add('hd-piece', color === 'w' ? 'hd-piece-white' : 'hd-piece-black', `hd-piece-set-${set}`);
  const raw = baseShape(set, type);
  if (set === 'circle') {
    svg.innerHTML = `<circle class="hd-piece-disc" cx="32" cy="32" r="27"/><g transform="translate(8 8) scale(.75)">${raw}</g>`;
  } else if (set === 'academic') {
    svg.innerHTML = `<g transform="translate(1 0) scale(.97 1)">${raw}</g>`;
  } else svg.innerHTML = raw;
  return svg;
}

function writeMeta(change) {
  try {
    if (hdStore?.owner && hdStore.isCurrent()) hdStore.writeMeta(change);
  } catch {
    // Appearance persistence is best-effort. The existing app owns save/error messaging.
  }
}

function boardOrientation() {
  const first = $('board')?.firstElementChild?.dataset.square;
  if (first === 'a8') return 'white';
  if (first === 'h1') return 'black';
  return null;
}

function syncOrientationButtons() {
  const current = boardOrientation();
  document.querySelectorAll('[data-hd-orientation]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.hdOrientation === current));
  });
}

function ensureOrientation() {
  if (orientationGuard || !state.orientation || $('rotateToggle')?.checked) { syncOrientationButtons(); return; }
  const current = boardOrientation();
  if (!current || current === state.orientation) { syncOrientationButtons(); return; }
  orientationGuard = true;
  $('flipBtn')?.click();
  orientationGuard = false;
  syncOrientationButtons();
}

function updateBodyPreferences() {
  if (!legacyThemeMode) document.body.dataset.hdTheme = state.theme;
  document.body.dataset.hdPieceSet = state.pieces;
  document.body.classList.toggle('hd-hide-coordinates', !state.coordinates);
  document.body.classList.toggle('hd-show-piece-names', state.pieceNames);
  document.body.classList.toggle('hd-motion', state.animate);
  document.body.classList.toggle('hd-no-animation', !state.animate);
  document.body.classList.toggle('hd-reduced-motion', state.reducedMotion);
  $('coordsToggle').checked = state.coordinates;
  $('pieceNamesToggle').checked = state.pieceNames;
  $('animateToggle').checked = state.animate;
  $('reducedToggle').checked = state.reducedMotion;
  document.querySelectorAll('[data-hd-theme-option]').forEach(button => button.setAttribute('aria-pressed', String(!legacyThemeMode && button.dataset.hdThemeOption === state.theme)));
  document.querySelectorAll('[data-hd-piece-option]').forEach(button => button.setAttribute('aria-pressed', String(!legacyPieceMode && button.dataset.hdPieceOption === state.pieces)));
}

function parseSquarePiece(square) {
  const match = square.getAttribute('aria-label')?.match(/^[a-h][1-8], (White|Black) (pawn|knight|bishop|rook|queen|king)/);
  if (!match) return null;
  return { color: match[1] === 'White' ? 'w' : 'b', name: match[2], type: PIECE_TYPES[match[2]] };
}

function decorateBoard() {
  if (legacyPieceMode) return;
  for (const square of $('board')?.children || []) {
    const piece = parseSquarePiece(square);
    square.querySelector('.hd-piece-name')?.remove();
    if (!piece) continue;
    square.querySelector('.piece-name')?.remove();
    square.querySelector('.piece-letter')?.remove();
    const current = square.querySelector('svg[data-hd-piece-set]');
    if (!current || current.dataset.hdPieceSet !== state.pieces) {
      square.querySelector('svg')?.remove();
      square.prepend(makePieceSvg(piece.type, piece.color));
    }
    if (state.pieceNames) {
      const label = document.createElement('span');
      label.className = 'hd-piece-name';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = piece.name;
      square.append(label);
    }
  }
}

function renderPiecePreviews() {
  document.querySelectorAll('[data-hd-piece-preview]').forEach(preview => {
    const set = preview.dataset.hdPiecePreview;
    preview.replaceChildren(makePieceSvg('n', 'w', set), makePieceSvg('p', 'b', set));
  });
}

function updatePlayers() {
  const mode = $('modeLabel')?.textContent || '';
  const details = $('gameDetails')?.textContent || '';
  const position = $('positionStatus')?.textContent || '';
  const computer = mode.toLowerCase().includes('computer');
  if (computer) {
    const side = details.match(/You play (White|Black)/)?.[1] || 'White';
    const opponent = side === 'White' ? 'Black' : 'White';
    const level = details.match(/^(.+?) level\b/)?.[1] || 'Casual';
    $('hdHumanLabel').textContent = `You — ${side}`;
    $('hdOpponentLabel').textContent = `Computer — ${opponent}`;
    $('hdHumanStatus').textContent = position.includes(`${side} to move`) ? 'Your move' : 'Waiting';
    $('hdOpponentStatus').textContent = position.includes('thinking') ? 'Thinking…' : `${level} level`;
  } else {
    $('hdHumanLabel').textContent = 'Player 1 — White';
    $('hdOpponentLabel').textContent = 'Player 2 — Black';
    $('hdHumanStatus').textContent = position.includes('White to move') ? 'Your move' : 'Waiting';
    $('hdOpponentStatus').textContent = position.includes('Black to move') ? 'Your move' : 'Waiting';
  }
}

function moveSans() {
  const sans = [];
  for (const row of $('moveList')?.children || []) {
    const cells = [...row.children].slice(1);
    for (const cell of cells) if (cell.textContent && cell.textContent !== '…') sans.push(cell.textContent.trim());
  }
  return sans;
}

function capturedFromHistory() {
  const replay = new Chess();
  const captures = { w: [], b: [] };
  for (const san of moveSans()) {
    try {
      const move = replay.move(san);
      if (move?.captured) captures[move.color].push({ type: move.captured, color: move.color === 'w' ? 'b' : 'w' });
    } catch { break; }
  }
  return captures;
}

function renderCapturedList(target, captures) {
  target.replaceChildren();
  if (!captures.length) {
    const empty = document.createElement('span');
    empty.textContent = '—';
    empty.setAttribute('aria-hidden', 'true');
    target.append(empty);
    return;
  }
  for (const capture of captures) {
    const svg = makePieceSvg(capture.type, capture.color);
    svg.removeAttribute('data-hd-piece-set');
    svg.setAttribute('aria-label', `${capture.color === 'w' ? 'White' : 'Black'} ${PIECE_LABELS[capture.type]}`);
    svg.removeAttribute('aria-hidden');
    target.append(svg);
  }
}

function updateCaptured() {
  const captures = capturedFromHistory();
  renderCapturedList($('hdWhiteCaptured'), captures.w);
  renderCapturedList($('hdBlackCaptured'), captures.b);
}

function updateSaveStrip() {
  const current = Number((($('storageStatus')?.textContent || '').match(/Game (\d)/)?.[1] || 0)) - 1;
  document.querySelectorAll('[data-hd-save-slot]').forEach(button => {
    const slot = Number(button.dataset.hdSaveSlot);
    let saved = false;
    try { saved = Boolean(hdStore?.owner && !hdStore.readSlot(slot).empty); } catch { saved = false; }
    button.classList.toggle('is-saved', saved);
    button.classList.toggle('is-current', slot === current);
  });
}

function selectTheme(theme) {
  if (!THEMES.has(theme)) return;
  legacyThemeMode = false;
  state.theme = theme;
  document.body.dataset.hdTheme = theme;
  writeMeta({ hdTheme: theme });
  updateBodyPreferences();
}

function selectPieceSet(set) {
  if (!PIECE_SETS.has(set)) return;
  legacyPieceMode = false;
  state.pieces = set;
  writeMeta({ hdPieces: set });
  updateBodyPreferences();
  decorateBoard();
  updateCaptured();
}

document.querySelectorAll('[data-hd-theme-option]').forEach(button => button.addEventListener('click', () => selectTheme(button.dataset.hdThemeOption)));
document.querySelectorAll('[data-hd-piece-option]').forEach(button => button.addEventListener('click', () => selectPieceSet(button.dataset.hdPieceOption)));

$('coordsToggle').addEventListener('change', () => {
  state.coordinates = $('coordsToggle').checked;
  writeMeta({ hdCoordinates: state.coordinates });
  updateBodyPreferences();
});
$('pieceNamesToggle').addEventListener('change', () => {
  state.pieceNames = $('pieceNamesToggle').checked;
  writeMeta({ hdPieceNames: state.pieceNames });
  updateBodyPreferences();
  decorateBoard();
});
$('animateToggle').addEventListener('change', () => {
  state.animate = $('animateToggle').checked;
  writeMeta({ hdAnimate: state.animate });
  updateBodyPreferences();
});
$('reducedToggle').addEventListener('change', () => {
  state.reducedMotion = $('reducedToggle').checked;
  writeMeta({ hdReducedMotion: state.reducedMotion });
  updateBodyPreferences();
});

$('themeSelect').addEventListener('change', () => {
  legacyThemeMode = true;
  delete document.body.dataset.hdTheme;
  updateBodyPreferences();
});
$('piecesSelect').addEventListener('change', () => {
  legacyPieceMode = true;
  document.querySelectorAll('[data-hd-piece-option]').forEach(button => button.setAttribute('aria-pressed', 'false'));
});

$('flipBtn').addEventListener('click', () => {
  if (orientationGuard) return;
  queueMicrotask(() => {
    const current = boardOrientation();
    if (!current) return;
    state.orientation = current;
    writeMeta({ hdOrientation: current });
    syncOrientationButtons();
  });
});

document.querySelectorAll('[data-hd-orientation]').forEach(button => button.addEventListener('click', () => {
  const orientation = button.dataset.hdOrientation;
  if (!ORIENTATIONS.has(orientation)) return;
  if ($('rotateToggle').checked) {
    $('rotateToggle').checked = false;
    $('rotateToggle').dispatchEvent(new Event('change', { bubbles: true }));
  }
  state.orientation = orientation;
  writeMeta({ hdOrientation: orientation });
  ensureOrientation();
}));
$('rotateToggle').addEventListener('change', () => queueMicrotask(ensureOrientation));

document.querySelectorAll('[data-hd-save-slot]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('[data-view="saves"]')?.click();
}));

const boardObserver = new MutationObserver(() => {
  decorateBoard();
  queueMicrotask(ensureOrientation);
});
boardObserver.observe($('board'), { childList: true });
const playObserver = new MutationObserver(() => {
  updatePlayers();
  updateCaptured();
});
for (const node of [$('modeLabel'), $('gameDetails'), $('positionStatus'), $('moveList')]) {
  if (node) playObserver.observe(node, { childList: true, subtree: true, characterData: true });
}
const storageObserver = new MutationObserver(updateSaveStrip);
if ($('storageStatus')) storageObserver.observe($('storageStatus'), { childList: true, subtree: true, characterData: true });

updateBodyPreferences();
renderPiecePreviews();
decorateBoard();
updatePlayers();
updateCaptured();
updateSaveStrip();
ensureOrientation();
