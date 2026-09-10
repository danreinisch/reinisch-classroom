import { ChessStore } from './core.js';

const $ = id => document.getElementById(id);
const SETS = new Set(['staunton', 'circle', 'modern', 'minimal', 'academic']);
const TYPES = Object.freeze({ pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' });
const LABELS = Object.freeze({
  staunton: 'Classic Staunton HD',
  circle: 'Canyon Carved',
  modern: 'Modern',
  minimal: 'Minimal',
  academic: 'Accessibility / Academic',
});
const ZOOM_MIN = 85;
const ZOOM_MAX = 125;
const ZOOM_STEP = 5;
const TABLETOP_STYLESHEET_ID = 'chessHdTabletopStyles';
let metalGradientSerial = 0;
let metalBaseSelectionGuard = false;

const SHAPES = Object.freeze({
  staunton: Object.freeze({
    p: '<circle class="hd-piece-body" cx="32" cy="14.5" r="7.2"/><path class="hd-piece-body" d="M25.5 25.5h13l-1.7 8.2c5.6 3.7 8.2 9 8.8 15.8H18.4c.6-6.8 3.2-12.1 8.8-15.8z"/><path class="hd-piece-base" d="M17 49.5h30l4 7.5H13z"/><path class="hd-piece-highlight" d="M25.8 28.2h12.4M22.6 46.8h18.8"/>',
    r: '<path class="hd-piece-body" d="M16 9h8v7h5V9h6v7h5V9h8v15l-5 5.5V46H21V29.5L16 24z"/><path class="hd-piece-ridge" d="M20 25.5h24M23.5 32h17M22 44.5h20"/><path class="hd-piece-base" d="M18 47h28l5 10H13z"/>',
    n: '<path class="hd-piece-body" d="M17 49c1.1-11.8 5.9-18.4 18.6-24.1l-8.9-4.7-7 8.5-8.7-2.2 6.8-13.2 13.9-6 2.2-4.3 8.2 7.2c9 7.7 10.7 19.1 5.2 38.8z"/><path class="hd-piece-cut" d="m25.5 16.3 9.8 2.5-7.1 4.1"/><circle class="hd-piece-eye" cx="30.4" cy="13.8" r="1.35"/><path class="hd-piece-base" d="M17 49h31l4 8H13z"/>',
    b: '<path class="hd-piece-body" d="M32 5.5c-4.7 5.4-14.1 14.9-14.1 22.1 0 6.4 5.4 10.6 14.1 10.6s14.1-4.2 14.1-10.6C46.1 20.4 36.7 10.9 32 5.5z"/><path class="hd-piece-cut" d="m37.4 16.7-10.1 13"/><path class="hd-piece-ridge" d="M24.2 35.1h15.6"/><path class="hd-piece-body" d="M27 38h10l4.4 10.5H22.6z"/><path class="hd-piece-base" d="M18 49h28l5 8H13z"/>',
    q: '<path class="hd-piece-body" d="m13.5 19.2 9.4 6.6L32 12l9.1 13.8 9.4-6.6-8.6 27.1H22.1z"/><circle class="hd-piece-body" cx="13.1" cy="15.5" r="3.1"/><circle class="hd-piece-body" cx="32" cy="8.2" r="3.4"/><circle class="hd-piece-body" cx="50.9" cy="15.5" r="3.1"/><path class="hd-piece-ridge" d="M23.2 39.2h17.6M21.5 45.2h21"/><path class="hd-piece-base" d="M18 46.5h28l5 10.5H13z"/>',
    k: '<path class="hd-piece-body" d="M28.5 4h7v7h7v6.5h-7V25h-7v-7.5h-7V11h7z"/><path class="hd-piece-body" d="M21 46.5c.8-7.8-7.6-13-5.6-20 1.5-5.7 9.6-6.3 16.6 1.8 7-8.1 15.1-7.5 16.6-1.8 2 7-6.4 12.2-5.6 20z"/><path class="hd-piece-ridge" d="M22.2 42.5h19.6"/><path class="hd-piece-base" d="M18 47h28l5 10H13z"/>',
  }),
  circle: Object.freeze({
    p: '<circle class="hd-piece-body" cx="32" cy="14" r="7.8"/><path class="hd-piece-body" d="M26 24h12l4 9-3 12H25l-3-12z"/><path class="hd-piece-carve" d="M27 28h10M26 35h12M27 42h10"/><path class="hd-piece-base" d="M18 46h28l5 11H13z"/>',
    r: '<path class="hd-piece-body" d="M15 9h9v8h5V9h6v8h5V9h9v15l-5 5v16H20V29l-5-5z"/><path class="hd-piece-carve" d="M20 25h24M24 30v14M32 30v14M40 30v14"/><path class="hd-piece-base" d="M17 46h30l5 11H12z"/>',
    n: '<path class="hd-piece-body" d="M17 48c1-11 5-18 16-24l-7-6-7 9-8-2 6-13 15-6 12 9c5 5 7 15 2 33z"/><path class="hd-piece-carve" d="m22 16 12 4-7 5M22 34c5-3 11-4 18-2"/><circle class="hd-piece-eye" cx="30" cy="13" r="1.4"/><path class="hd-piece-base" d="M16 48h32l5 9H11z"/>',
    b: '<path class="hd-piece-body" d="M32 5 45 23l-5 13-8 4-8-4-5-13z"/><path class="hd-piece-cut" d="m37 15-10 14"/><path class="hd-piece-carve" d="M24 32h16M27 37h10"/><path class="hd-piece-body" d="M27 40h10l5 7H22z"/><path class="hd-piece-base" d="M17 48h30l5 9H12z"/>',
    q: '<path class="hd-piece-body" d="m13 18 10 7 9-14 9 14 10-7-7 28H20z"/><path class="hd-piece-carve" d="M20 27h24M22 35h20M23 42h18"/><circle class="hd-piece-body" cx="13" cy="14" r="3"/><circle class="hd-piece-body" cx="32" cy="7" r="3.4"/><circle class="hd-piece-body" cx="51" cy="14" r="3"/><path class="hd-piece-base" d="M17 47h30l5 10H12z"/>',
    k: '<path class="hd-piece-body" d="M28 4h8v7h7v7h-7v7h-8v-7h-7v-7h7z"/><path class="hd-piece-body" d="M20 45c0-11 5-18 12-22 7 4 12 11 12 22z"/><path class="hd-piece-carve" d="M24 31h16M22 38h20"/><path class="hd-piece-base" d="M17 46h30l5 11H12z"/>',
  }),
  modern: Object.freeze({
    p: '<circle class="hd-piece-body" cx="32" cy="15" r="8.5"/><path class="hd-piece-body" d="M25 27h14l8 27H17z"/><path class="hd-piece-line" d="M22 48h20"/>',
    r: '<path class="hd-piece-body" d="M16 10h9v9h5v-9h5v9h5v-9h8v18H16z"/><path class="hd-piece-body" d="M22 29h20v19H22z"/><path class="hd-piece-base" d="M16 49h32v7H16z"/>',
    n: '<path class="hd-piece-body" d="m18 13 18-7 13 13-5 29H22l4-17 12-8-12-2-7 8-8-3z"/><path class="hd-piece-line" d="m28 17 9 3-7 4"/><circle class="hd-piece-eye" cx="31" cy="14" r="1.4"/><path class="hd-piece-base" d="M16 49h32v7H16z"/>',
    b: '<path class="hd-piece-body" d="m32 5 14 19-14 14-14-14z"/><path class="hd-piece-cut" d="m37 17-10 11"/><path class="hd-piece-body" d="M26 39h12l9 16H17z"/>',
    q: '<path class="hd-piece-body" d="m12 14 13 11 7-18 7 18 13-11-10 31H22z"/><path class="hd-piece-line" d="M22 40h20"/><path class="hd-piece-base" d="M17 48h30l4 7H13z"/>',
    k: '<path class="hd-piece-body" d="M28 4h8v9h9v8h-9v9h-8v-9h-9v-8h9z"/><path class="hd-piece-body" d="M24 32h16l8 23H16z"/><path class="hd-piece-line" d="M21 49h22"/>',
  }),
  minimal: Object.freeze({
    p: '<circle class="hd-piece-body" cx="32" cy="16" r="7"/><path class="hd-piece-body" d="M25 28h14l5 24H20z"/><path class="hd-piece-base" d="M17 53h30v4H17z"/>',
    r: '<path class="hd-piece-body" d="M19 11h8v7h10v-7h8v17H19z"/><path class="hd-piece-body" d="M24 29h16v22H24z"/><path class="hd-piece-base" d="M17 52h30v5H17z"/>',
    n: '<path class="hd-piece-body" d="M19 49c2-13 8-20 19-25l-10-6-9 10-8-3 7-13 16-6 12 12-4 31z"/><circle class="hd-piece-eye" cx="30" cy="14" r="1.3"/><path class="hd-piece-base" d="M16 51h32v6H16z"/>',
    b: '<path class="hd-piece-body" d="M32 6 44 25 32 38 20 25z"/><path class="hd-piece-cut" d="m36 18-8 10"/><path class="hd-piece-body" d="M26 39h12l6 13H20z"/><path class="hd-piece-base" d="M17 53h30v4H17z"/>',
    q: '<path class="hd-piece-body" d="m15 18 10 7 7-15 7 15 10-7-8 31H23z"/><path class="hd-piece-base" d="M17 52h30v5H17z"/>',
    k: '<path class="hd-piece-body" d="M29 6h6v8h8v6h-8v8h-6v-8h-8v-6h8z"/><path class="hd-piece-body" d="M24 31h16l6 21H18z"/><path class="hd-piece-base" d="M17 53h30v4H17z"/>',
  }),
  academic: Object.freeze({
    p: '<circle class="hd-piece-body" cx="32" cy="14" r="7"/><path class="hd-piece-body" d="M24 26h16l-3 10 7 13H20l7-13z"/><path class="hd-piece-academic" d="M27 29h10"/><path class="hd-piece-base" d="M16 50h32l4 7H12z"/>',
    r: '<path class="hd-piece-body" d="M14 8h10v9h5V8h6v9h5V8h10v18l-6 5v16H20V31l-6-5z"/><path class="hd-piece-academic" d="M20 27h24M24 34h16"/><path class="hd-piece-base" d="M16 48h32l4 9H12z"/>',
    n: '<path class="hd-piece-body" d="M15 49c1-12 6-20 20-26l-9-5-8 10-9-3 8-15 16-5 14 12-4 32z"/><circle class="hd-piece-eye" cx="30" cy="12" r="1.6"/><path class="hd-piece-academic" d="m22 15 13 5-8 5M21 36h21"/><path class="hd-piece-base" d="M15 50h34l4 7H11z"/>',
    b: '<path class="hd-piece-body" d="M32 4c-6 7-15 15-15 24 0 7 6 11 15 11s15-4 15-11C47 19 38 11 32 4z"/><path class="hd-piece-cut" d="m38 15-12 16"/><circle class="hd-piece-academic-dot" cx="32" cy="33" r="2.2"/><path class="hd-piece-body" d="M26 40h12l5 9H21z"/><path class="hd-piece-base" d="M16 50h32l4 7H12z"/>',
    q: '<path class="hd-piece-body" d="m11 18 11 8 10-15 10 15 11-8-9 29H20z"/><circle class="hd-piece-academic-dot" cx="12" cy="13" r="3.2"/><circle class="hd-piece-academic-dot" cx="32" cy="6.5" r="3.5"/><circle class="hd-piece-academic-dot" cx="52" cy="13" r="3.2"/><path class="hd-piece-academic" d="M21 38h22M20 45h24"/><path class="hd-piece-base" d="M16 48h32l4 9H12z"/>',
    k: '<path class="hd-piece-body" d="M27.5 3h9v8h8v8h-8v8h-9v-8h-8v-8h8z"/><path class="hd-piece-body" d="M19 47c0-12 5-20 13-24 8 4 13 12 13 24z"/><path class="hd-piece-academic" d="M23 34h18M21 42h22"/><path class="hd-piece-base" d="M16 48h32l4 9H12z"/>',
  }),
});

let storage = null;
let session = null;
let store = null;
try { storage = window.localStorage; } catch { storage = null; }
try { session = window.sessionStorage; } catch { session = null; }
try { if (storage && session) store = new ChessStore(storage, session); } catch { store = null; }

const meta = (() => {
  try { return store?.readMeta() || {}; } catch { return {}; }
})();

function clampZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  const stepped = Math.round(numeric / ZOOM_STEP) * ZOOM_STEP;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, stepped));
}

const state = {
  layout: meta.hdLayout === 'focus' ? 'focus' : 'standard',
  boardDepth: meta.hdBoardDepth === true,
  view: meta.hdView === 'tabletop' ? 'tabletop' : 'top-down',
  zoom: clampZoom(meta.hdZoom),
  metalPieces: meta.hdMetalPieces === true,
};

function writeMeta(change) {
  try {
    if (store?.owner && store.isCurrent()) store.writeMeta(change);
  } catch {
    // Visual preferences are best-effort. The existing chess app owns save messaging.
  }
}

function activePieceSet() {
  if (state.metalPieces) return 'staunton';
  const active = document.querySelector('[data-hd-piece-option][aria-pressed="true"]');
  if (!active || !SETS.has(active.dataset.hdPieceOption)) return null;
  return active.dataset.hdPieceOption;
}

function parseSquarePiece(square) {
  const match = square.getAttribute('aria-label')?.match(/^[a-h][1-8], (White|Black) (pawn|knight|bishop|rook|queen|king)/);
  if (!match) return null;
  return { color: match[1] === 'White' ? 'w' : 'b', type: TYPES[match[2]] };
}

function metalGradientMarkup(color, serial) {
  const bodyId = `rc-metal-body-${serial}`;
  const baseId = `rc-metal-base-${serial}`;
  const bodyStops = color === 'w'
    ? [['0%', '#666f72'], ['14%', '#f1f5f6'], ['31%', '#aeb6b8'], ['49%', '#fbfcfc'], ['68%', '#858f92'], ['84%', '#e5eaeb'], ['100%', '#6d777a']]
    : [['0%', '#080a0b'], ['16%', '#555e61'], ['34%', '#15191a'], ['52%', '#737d80'], ['70%', '#101314'], ['86%', '#424a4d'], ['100%', '#090b0c']];
  const baseStops = color === 'w'
    ? [['0%', '#4f585b'], ['24%', '#d7dddf'], ['48%', '#858f92'], ['70%', '#f1f4f5'], ['100%', '#596265']]
    : [['0%', '#050607'], ['24%', '#3f4749'], ['48%', '#0d1011'], ['70%', '#5a6366'], ['100%', '#060708']];
  const stops = values => values.map(([offset, stopColor]) => `<stop offset="${offset}" stop-color="${stopColor}"/>`).join('');
  return {
    bodyId,
    baseId,
    markup: `<defs><linearGradient id="${bodyId}" x1="0" y1="0" x2="1" y2=".15">${stops(bodyStops)}</linearGradient><linearGradient id="${baseId}" x1="0" y1="0" x2="1" y2="0">${stops(baseStops)}</linearGradient></defs>`,
  };
}

function createPieceSvg(type, color, set, accessibleLabel = null, metal = state.metalPieces) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.dataset.hdPieceSet = set;
  svg.dataset.hdPremiumPiece = 'true';
  svg.dataset.hdPieceType = type;
  svg.dataset.hdPieceColor = color;
  svg.dataset.hdMetal = metal ? 'true' : 'false';
  svg.classList.add('hd-piece', 'hd-premium-piece', color === 'w' ? 'hd-piece-white' : 'hd-piece-black', `hd-piece-set-${set}`);
  if (metal) svg.classList.add('hd-forged-metal-piece');
  if (accessibleLabel) svg.setAttribute('aria-label', accessibleLabel);
  else svg.setAttribute('aria-hidden', 'true');

  let defs = '';
  let gradient = null;
  if (metal) {
    gradient = metalGradientMarkup(color, ++metalGradientSerial);
    defs = gradient.markup;
  }
  svg.innerHTML = `${defs}<ellipse class="hd-piece-contact" cx="32" cy="57.5" rx="17" ry="2.7"/>${SHAPES[set][type]}`;
  if (gradient) {
    for (const node of svg.querySelectorAll('.hd-piece-body')) node.style.fill = `url(#${gradient.bodyId})`;
    for (const node of svg.querySelectorAll('.hd-piece-base')) node.style.fill = `url(#${gradient.baseId})`;
  }
  return svg;
}

function premiumSquare(square, set) {
  const piece = parseSquarePiece(square);
  if (!piece) return;
  const current = square.querySelector('svg.hd-piece');
  const metal = state.metalPieces;
  if (current?.dataset.hdPremiumPiece === 'true' && current.dataset.hdPieceSet === set && current.dataset.hdPieceType === piece.type && current.dataset.hdPieceColor === piece.color && current.dataset.hdMetal === String(metal)) return;
  const svg = createPieceSvg(piece.type, piece.color, set, null, metal);
  if (current) current.replaceWith(svg);
  else square.prepend(svg);
}

function premiumBoard() {
  const set = activePieceSet();
  if (!set) return;
  for (const square of $('board')?.children || []) premiumSquare(square, set);
}

function premiumCaptured() {
  const set = activePieceSet();
  if (!set) return;
  const metal = state.metalPieces;
  for (const list of [$('hdWhiteCaptured'), $('hdBlackCaptured')]) {
    if (!list) continue;
    for (const current of [...list.querySelectorAll('svg')]) {
      const label = current.getAttribute('aria-label') || '';
      const match = label.match(/^(White|Black) (pawn|knight|bishop|rook|queen|king)$/);
      if (!match) continue;
      const color = match[1] === 'White' ? 'w' : 'b';
      const type = TYPES[match[2]];
      if (current.dataset.hdPremiumPiece === 'true' && current.dataset.hdPieceSet === set && current.dataset.hdMetal === String(metal)) continue;
      current.replaceWith(createPieceSvg(type, color, set, label, metal));
    }
  }
}

function premiumPreviews() {
  for (const preview of document.querySelectorAll('[data-hd-piece-preview]')) {
    const set = preview.dataset.hdPiecePreview;
    if (!SETS.has(set)) continue;
    preview.replaceChildren(createPieceSvg('n', 'w', set, null, false), createPieceSvg('p', 'b', set, null, false));
  }
}

function renamePieceSets() {
  for (const [set, label] of Object.entries(LABELS)) {
    const button = document.querySelector(`[data-hd-piece-option="${set}"]`);
    const text = button?.querySelector(':scope > span:last-child');
    if (text) text.textContent = label;
  }
}

function setLayout(layout, persist = true) {
  state.layout = layout === 'focus' ? 'focus' : 'standard';
  document.body.dataset.hdLayout = state.layout;
  const button = $('focusBoardBtn');
  if (button) {
    const focused = state.layout === 'focus';
    button.setAttribute('aria-pressed', String(focused));
    button.textContent = focused ? 'Standard view' : 'Focus board';
    button.setAttribute('aria-label', focused ? 'Return to standard chess layout' : 'Expand the chess board and compact the play controls');
  }
  if (persist) writeMeta({ hdLayout: state.layout });
}

function setBoardDepth(on, persist = true) {
  state.boardDepth = Boolean(on);
  document.body.dataset.hdBoardDepth = state.boardDepth ? 'on' : 'off';
  const toggle = $('boardDepthToggle');
  if (toggle) toggle.checked = state.boardDepth;
  if (persist) writeMeta({ hdBoardDepth: state.boardDepth });
}

function setBoardView(view, persist = true) {
  state.view = view === 'tabletop' ? 'tabletop' : 'top-down';
  document.body.dataset.hdView = state.view;
  for (const button of document.querySelectorAll('[data-hd-board-view]')) {
    button.setAttribute('aria-pressed', String(button.dataset.hdBoardView === state.view));
  }
  if (persist) writeMeta({ hdView: state.view });
}

function centerBoardScroll() {
  const frame = document.querySelector('.hd-board-frame');
  if (!frame) return;
  frame.scrollLeft = state.zoom > 100 ? Math.max(0, (frame.scrollWidth - frame.clientWidth) / 2) : 0;
}

function setZoom(value, persist = true) {
  state.zoom = clampZoom(value);
  document.documentElement.style.setProperty('--hd-board-zoom', `${state.zoom}%`);
  document.body.dataset.hdZoom = state.zoom === 100 ? 'fit' : 'custom';
  if ($('hdZoomRange')) $('hdZoomRange').value = String(state.zoom);
  if ($('hdZoomValue')) $('hdZoomValue').textContent = `${state.zoom}%`;
  if ($('hdZoomOutBtn')) $('hdZoomOutBtn').disabled = state.zoom <= ZOOM_MIN;
  if ($('hdZoomInBtn')) $('hdZoomInBtn').disabled = state.zoom >= ZOOM_MAX;
  requestAnimationFrame(centerBoardScroll);
  if (persist) writeMeta({ hdZoom: state.zoom });
}

function syncMetalSelection() {
  document.body.dataset.hdMetal = state.metalPieces ? 'on' : 'off';
  const metalButton = document.querySelector('[data-hd-metal-option]');
  const desiredMetalState = String(state.metalPieces);
  if (metalButton && metalButton.getAttribute('aria-pressed') !== desiredMetalState) {
    metalButton.setAttribute('aria-pressed', desiredMetalState);
  }
  if (!state.metalPieces) return;
  for (const button of document.querySelectorAll('[data-hd-piece-option]')) {
    if (button.getAttribute('aria-pressed') !== 'false') button.setAttribute('aria-pressed', 'false');
  }
}

function setMetalPieces(on, persist = true) {
  const next = Boolean(on);
  if (next) {
    const staunton = document.querySelector('[data-hd-piece-option="staunton"]');
    if (staunton && staunton.getAttribute('aria-pressed') !== 'true') {
      metalBaseSelectionGuard = true;
      staunton.click();
      metalBaseSelectionGuard = false;
    }
  }
  state.metalPieces = next;
  syncMetalSelection();
  premiumBoard();
  premiumCaptured();
  if (persist) writeMeta({ hdMetalPieces: state.metalPieces });
}

function installTabletopStyles() {
  if (document.getElementById(TABLETOP_STYLESHEET_ID)) return;
  const link = document.createElement('link');
  link.id = TABLETOP_STYLESHEET_ID;
  link.rel = 'stylesheet';
  link.href = './chess-hd-tabletop.css?v=20260909-chess-tabletop-1';
  document.head.append(link);
}

function installFocusButton() {
  const heading = document.querySelector('.hd-board-heading');
  if (!heading || $('focusBoardBtn')) return;
  const button = document.createElement('button');
  button.id = 'focusBoardBtn';
  button.type = 'button';
  button.className = 'quiet small hd-focus-button';
  button.setAttribute('aria-controls', 'workspace');
  button.addEventListener('click', () => setLayout(state.layout === 'focus' ? 'standard' : 'focus'));
  heading.append(button);
}

function installBoardDepthToggle() {
  if ($('boardDepthToggle')) return;
  const list = document.querySelector('#settingsDialog .hd-switch-list');
  const reduced = $('reducedToggle')?.closest('label');
  if (!list) return;
  const row = document.createElement('label');
  row.className = 'hd-switch-row hd-depth-row';
  row.htmlFor = 'boardDepthToggle';
  row.innerHTML = '<span>Board depth <small>(subtle contact shadow)</small></span><input type="checkbox" id="boardDepthToggle">';
  if (reduced) list.insertBefore(row, reduced);
  else list.append(row);
  $('boardDepthToggle')?.addEventListener('change', () => setBoardDepth($('boardDepthToggle').checked));
}

function installMetalPieceOption() {
  if (document.querySelector('[data-hd-metal-option]')) return;
  const grid = document.querySelector('#settingsDialog .hd-piece-grid');
  if (!grid) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hd-piece-card hd-metal-card';
  button.dataset.hdMetalOption = 'forged';
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = '<span class="hd-piece-preview hd-metal-preview" aria-hidden="true"></span><span>Forged Metal HD</span>';
  button.querySelector('.hd-metal-preview')?.replaceChildren(
    createPieceSvg('n', 'w', 'staunton', null, true),
    createPieceSvg('p', 'b', 'staunton', null, true),
  );
  button.addEventListener('click', () => setMetalPieces(true));
  grid.append(button);
}

function installCameraToolbar() {
  if ($('hdCameraToolbar')) return;
  const heading = document.querySelector('.hd-board-heading');
  if (!heading) return;
  const toolbar = document.createElement('div');
  toolbar.id = 'hdCameraToolbar';
  toolbar.className = 'hd-camera-toolbar';
  toolbar.setAttribute('aria-label', 'Board view and zoom');
  toolbar.innerHTML = `
    <div class="hd-camera-group" role="group" aria-label="Board view">
      <span class="hd-camera-label">View</span>
      <button id="hdTopDownBtn" class="quiet small hd-view-choice" type="button" data-hd-board-view="top-down">Top Down</button>
      <button id="hdTabletopBtn" class="quiet small hd-view-choice" type="button" data-hd-board-view="tabletop">HD Tabletop</button>
    </div>
    <div class="hd-zoom-group" role="group" aria-label="Board zoom">
      <span class="hd-zoom-label">Zoom</span>
      <button id="hdZoomOutBtn" class="quiet small hd-zoom-step" type="button" aria-label="Zoom board out">−</button>
      <input id="hdZoomRange" type="range" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="${ZOOM_STEP}" aria-label="Board zoom percentage">
      <output id="hdZoomValue" for="hdZoomRange">100%</output>
      <button id="hdZoomInBtn" class="quiet small hd-zoom-step" type="button" aria-label="Zoom board in">+</button>
      <button id="hdZoomFitBtn" class="quiet small" type="button" aria-label="Fit the full board">Fit</button>
    </div>`;
  heading.insertAdjacentElement('afterend', toolbar);

  const supportsPerspective = typeof CSS === 'undefined' || !CSS.supports || CSS.supports('transform', 'perspective(900px) rotateX(12deg)');
  if (!supportsPerspective && $('hdTabletopBtn')) {
    $('hdTabletopBtn').disabled = true;
    $('hdTabletopBtn').title = 'This browser does not support the HD Tabletop view.';
    state.view = 'top-down';
  }
  $('hdTopDownBtn')?.addEventListener('click', () => setBoardView('top-down'));
  $('hdTabletopBtn')?.addEventListener('click', () => setBoardView('tabletop'));
  $('hdZoomOutBtn')?.addEventListener('click', () => setZoom(state.zoom - ZOOM_STEP));
  $('hdZoomInBtn')?.addEventListener('click', () => setZoom(state.zoom + ZOOM_STEP));
  $('hdZoomFitBtn')?.addEventListener('click', () => setZoom(100));
  $('hdZoomRange')?.addEventListener('input', event => setZoom(event.currentTarget.value));
}

function markEmbeddedViewer() {
  try {
    if (window.self !== window.top) document.body.classList.add('hd-embedded-view');
  } catch {
    document.body.classList.add('hd-embedded-view');
  }
}

installTabletopStyles();
installFocusButton();
installBoardDepthToggle();
installMetalPieceOption();
installCameraToolbar();
renamePieceSets();
markEmbeddedViewer();
setLayout(state.layout, false);
setBoardDepth(state.boardDepth, false);
setBoardView(state.view, false);
setZoom(state.zoom, false);
premiumPreviews();
setMetalPieces(state.metalPieces, false);
premiumBoard();
premiumCaptured();

for (const button of document.querySelectorAll('[data-hd-piece-option]')) {
  button.addEventListener('click', () => {
    const preserveMetal = metalBaseSelectionGuard;
    queueMicrotask(() => {
      if (!preserveMetal && state.metalPieces) setMetalPieces(false);
      premiumBoard();
      premiumCaptured();
    });
  });
}

const pieceGrid = document.querySelector('#settingsDialog .hd-piece-grid');
const metalSelectionObserver = new MutationObserver(() => queueMicrotask(syncMetalSelection));
if (pieceGrid) metalSelectionObserver.observe(pieceGrid, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });

const boardObserver = new MutationObserver(() => queueMicrotask(premiumBoard));
if ($('board')) boardObserver.observe($('board'), { childList: true, subtree: true });
const capturedObserver = new MutationObserver(() => queueMicrotask(premiumCaptured));
for (const target of [$('hdWhiteCaptured'), $('hdBlackCaptured')]) {
  if (target) capturedObserver.observe(target, { childList: true, subtree: true });
}
