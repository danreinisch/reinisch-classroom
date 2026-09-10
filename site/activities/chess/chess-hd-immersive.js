const $ = id => document.getElementById(id);

const STYLE_ID = 'chessHdImmersiveStyles';
const STYLE_HREF = './chess-hd-immersive.css?v=20260909-chess-immersive-1';
const PHYSICAL_STYLE_ID = 'chessHdPhysicalStyles';
const PHYSICAL_STYLE_HREF = './chess-hd-physical.css?v=20260909-chess-physical-1';
const REFLECTIVE_THEMES = new Set(['canyon-classic', 'tournament']);
const SVG_NS = 'http://www.w3.org/2000/svg';

let initialized = false;
let open = false;
let panelTouched = false;
let returnFocus = null;
let returnScroll = { x: 0, y: 0 };
let appWasInert = false;
let appAriaHidden = null;
let reflectionRequested = false;
let physicalSerial = 0;
let physicalSyncQueued = false;

const anchors = {};

function installStylesheet(id, href) {
  if ($(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

function installStyles() {
  installStylesheet(STYLE_ID, STYLE_HREF);
  installStylesheet(PHYSICAL_STYLE_ID, PHYSICAL_STYLE_HREF);
}

function makeAnchor(node, name) {
  if (!node || anchors[name]) return;
  const anchor = document.createElement('span');
  anchor.hidden = true;
  anchor.dataset.hdImmersiveAnchor = name;
  node.before(anchor);
  anchors[name] = anchor;
}

function restoreNode(node, name) {
  const anchor = anchors[name];
  if (!node || !anchor?.parentNode) return;
  anchor.parentNode.insertBefore(node, anchor.nextSibling);
}

function installShell() {
  if ($('hdImmersiveShell')) return;
  const shell = document.createElement('section');
  shell.id = 'hdImmersiveShell';
  shell.className = 'hd-immersive-shell';
  shell.hidden = true;
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');
  shell.setAttribute('aria-label', 'Classroom Chess HD Board');
  shell.innerHTML = `
    <div class="hd-immersive-topbar">
      <button id="hdBackBtn" class="quiet small hd-immersive-back" type="button">← Back</button>
      <div id="hdImmersiveToolbarMount" class="hd-immersive-toolbar-mount"></div>
      <div class="hd-immersive-aux">
        <button id="hdImmersiveFlipBtn" class="quiet small" type="button" aria-label="Flip board orientation">↻ Flip</button>
        <div id="hdImmersiveSettingsMount"></div>
      </div>
    </div>
    <div class="hd-immersive-layout">
      <div id="hdImmersiveBoardStage" class="hd-immersive-board-stage">
        <div id="hdImmersiveBoardMount" class="hd-immersive-board-mount"></div>
      </div>
      <aside id="hdImmersivePanel" class="hd-immersive-panel" aria-label="Chess game controls">
        <button id="hdImmersivePanelToggle" class="hd-immersive-panel-toggle" type="button"
          aria-controls="hdImmersivePanelMount" aria-expanded="true" aria-label="Collapse game controls">›</button>
        <div id="hdImmersivePanelMount" class="hd-immersive-panel-mount"></div>
      </aside>
    </div>`;
  document.body.append(shell);
}

function installReflectionToggle() {
  if ($('hdReflectionToggle')) return;
  const list = document.querySelector('#settingsDialog .hd-switch-list');
  if (!list) return;
  const row = document.createElement('label');
  row.id = 'hdReflectionRow';
  row.className = 'hd-switch-row';
  row.htmlFor = 'hdReflectionToggle';
  row.hidden = true;
  row.innerHTML = '<span>Subtle piece reflection <small id="hdReflectionHint">Satin HD boards only</small></span><input type="checkbox" id="hdReflectionToggle">';
  const reduced = $('reducedToggle')?.closest('label');
  if (reduced) list.insertBefore(row, reduced);
  else list.append(row);
  $('hdReflectionToggle')?.addEventListener('change', event => {
    reflectionRequested = Boolean(event.currentTarget.checked);
    syncPhysicalEffects();
  });
}

function setPanelCollapsed(collapsed, touched = true) {
  const shell = $('hdImmersiveShell');
  const toggle = $('hdImmersivePanelToggle');
  if (!shell || !toggle) return;
  if (touched) panelTouched = true;
  shell.dataset.panel = collapsed ? 'collapsed' : 'expanded';
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Expand game controls' : 'Collapse game controls');
  toggle.textContent = collapsed ? '‹' : '›';
}

function syncResponsivePanel(force = false) {
  if (!open) return;
  if (!force && panelTouched) return;
  setPanelCollapsed(window.innerWidth < 900, false);
}

function centerImmersiveBoard() {
  const stage = $('hdImmersiveBoardStage');
  if (!stage || !open) return;
  requestAnimationFrame(() => {
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
    stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
  });
}

function setAppBackgroundInert(on) {
  const app = document.querySelector('.chess-hd-app');
  if (!app) return;
  if (on) {
    appWasInert = Boolean(app.inert);
    appAriaHidden = app.getAttribute('aria-hidden');
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
    return;
  }
  app.inert = appWasInert;
  if (appAriaHidden === null) app.removeAttribute('aria-hidden');
  else app.setAttribute('aria-hidden', appAriaHidden);
}

function moveIntoShell() {
  const boardCard = document.querySelector('.hd-board-card');
  const sideCard = document.querySelector('.hd-side-card');
  const toolbar = $('hdCameraToolbar');
  const settings = $('settingsBtn');
  if (!boardCard || !sideCard || !toolbar || !settings) return false;

  makeAnchor(boardCard, 'board');
  makeAnchor(sideCard, 'side');
  makeAnchor(toolbar, 'toolbar');
  makeAnchor(settings, 'settings');

  $('hdImmersiveBoardMount')?.append(boardCard);
  $('hdImmersivePanelMount')?.append(sideCard);
  $('hdImmersiveToolbarMount')?.append(toolbar);
  $('hdImmersiveSettingsMount')?.append(settings);
  return true;
}

function restoreFromShell() {
  const boardCard = document.querySelector('.hd-board-card');
  const sideCard = document.querySelector('.hd-side-card');
  restoreNode($('hdCameraToolbar'), 'toolbar');
  restoreNode($('settingsBtn'), 'settings');
  restoreNode(boardCard, 'board');
  restoreNode(sideCard, 'side');
}

function makeMetalDepthFilter(svg) {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.prepend(defs);
  }
  const filterId = `rc-hd-metal-depth-${++physicalSerial}`;
  defs.insertAdjacentHTML('beforeend', `<filter id="${filterId}" x="-25%" y="-22%" width="150%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="0.72" result="shape"/><feSpecularLighting in="shape" surfaceScale="2.1" specularConstant="0.27" specularExponent="18" lighting-color="#ffffff" result="spec"><feDistantLight azimuth="225" elevation="52"/></feSpecularLighting><feComposite in="spec" in2="SourceAlpha" operator="in" result="specMask"/><feBlend in="SourceGraphic" in2="specMask" mode="screen"/></filter>`);
  svg.style.setProperty('--hd-metal-depth-filter', `url(#${filterId})`);
}

function addMetalFoot(svg) {
  if (svg.querySelector('.hd-metal-foot')) return;
  const contact = svg.querySelector('.hd-piece-contact');
  const base = svg.querySelector('.hd-piece-base');
  const baseFill = base?.style.fill || base?.getAttribute('fill') || 'var(--piece-base)';

  const foot = document.createElementNS(SVG_NS, 'ellipse');
  foot.setAttribute('class', 'hd-metal-foot');
  foot.setAttribute('cx', '32');
  foot.setAttribute('cy', '53.7');
  foot.setAttribute('rx', '19.2');
  foot.setAttribute('ry', '3.85');
  foot.style.fill = baseFill;

  const shadow = document.createElementNS(SVG_NS, 'ellipse');
  shadow.setAttribute('class', 'hd-metal-rim-shadow');
  shadow.setAttribute('cx', '32');
  shadow.setAttribute('cy', '55.05');
  shadow.setAttribute('rx', '18.2');
  shadow.setAttribute('ry', '2.45');

  const highlight = document.createElementNS(SVG_NS, 'ellipse');
  highlight.setAttribute('class', 'hd-metal-rim-highlight');
  highlight.setAttribute('cx', '32');
  highlight.setAttribute('cy', '52.55');
  highlight.setAttribute('rx', '16.7');
  highlight.setAttribute('ry', '2.05');

  if (contact) {
    contact.after(foot);
    foot.after(shadow);
    shadow.after(highlight);
  } else {
    const defs = svg.querySelector('defs');
    if (defs) defs.after(foot);
    else svg.prepend(foot);
    foot.after(shadow);
    shadow.after(highlight);
  }
}

function enhanceForgedPiece(svg) {
  if (!(svg instanceof SVGElement) || svg.dataset.hdPhysicalEnhanced === 'true') return;
  svg.dataset.hdPhysicalEnhanced = 'true';
  makeMetalDepthFilter(svg);
  addMetalFoot(svg);
}

function enhanceForgedPieces() {
  for (const svg of document.querySelectorAll('svg.hd-forged-metal-piece')) enhanceForgedPiece(svg);
}

function reflectionKey(piece) {
  return [piece.dataset.hdPieceType, piece.dataset.hdPieceColor, piece.dataset.hdPieceSet, piece.dataset.hdMetal].join(':');
}

function buildReflection(piece) {
  const reflection = piece.cloneNode(true);
  reflection.querySelectorAll('defs, .hd-piece-contact').forEach(node => node.remove());
  reflection.removeAttribute('style');
  reflection.removeAttribute('data-hd-premium-piece');
  reflection.removeAttribute('data-hd-physical-enhanced');
  reflection.removeAttribute('data-hd-metal');
  reflection.removeAttribute('aria-label');
  reflection.setAttribute('aria-hidden', 'true');
  reflection.setAttribute('focusable', 'false');
  reflection.setAttribute('class', `hd-piece-reflection ${piece.classList.contains('hd-piece-black') ? 'hd-reflection-black' : 'hd-reflection-white'}`);
  reflection.dataset.hdReflectionKey = reflectionKey(piece);
  for (const node of reflection.querySelectorAll('*')) {
    node.removeAttribute('id');
    node.removeAttribute('style');
    node.removeAttribute('filter');
  }
  return reflection;
}

function reflectionsActive() {
  return document.body.dataset.hdImmersive === 'on'
    && document.body.dataset.hdReflectiveSurface === 'on'
    && document.body.dataset.hdPieceReflection === 'on'
    && document.body.dataset.hdTheme !== 'high-contrast';
}

function syncReflections() {
  const board = $('board');
  if (!board) return;
  const active = reflectionsActive();
  for (const square of board.children) {
    const piece = square.querySelector('svg.hd-premium-piece');
    const current = square.querySelector(':scope > svg.hd-piece-reflection');
    if (!active || !piece) {
      current?.remove();
      continue;
    }
    const key = reflectionKey(piece);
    if (current?.dataset.hdReflectionKey === key) continue;
    current?.remove();
    square.prepend(buildReflection(piece));
  }
}

function syncPhysicalEffects() {
  const body = document.body;
  const immersive = body.dataset.hdImmersive === 'on';
  const theme = body.dataset.hdTheme || 'canyon-classic';
  const highContrast = theme === 'high-contrast';
  const reflectiveSurface = REFLECTIVE_THEMES.has(theme) && !highContrast;
  body.dataset.hdReflectiveSurface = reflectiveSurface ? 'on' : 'off';
  body.dataset.hdPieceReflection = immersive && reflectiveSurface && reflectionRequested ? 'on' : 'off';

  const row = $('hdReflectionRow');
  const toggle = $('hdReflectionToggle');
  const hint = $('hdReflectionHint');
  if (row) {
    row.hidden = !immersive;
    row.dataset.surface = reflectiveSurface ? 'satin' : 'matte';
  }
  if (toggle) {
    toggle.checked = reflectionRequested;
    toggle.disabled = !immersive || !reflectiveSurface || highContrast;
  }
  if (hint) {
    if (highContrast) hint.textContent = 'Disabled in High Contrast';
    else if (!reflectiveSurface) hint.textContent = 'Unavailable on this matte finish';
    else hint.textContent = 'Satin HD finish · deliberately faint';
  }
  syncReflections();
}

function queuePhysicalSync() {
  if (physicalSyncQueued) return;
  physicalSyncQueued = true;
  queueMicrotask(() => {
    physicalSyncQueued = false;
    enhanceForgedPieces();
    syncPhysicalEffects();
  });
}

function installPhysicalObservers() {
  const board = $('board');
  if (board) {
    const boardObserver = new MutationObserver(queuePhysicalSync);
    boardObserver.observe(board, { childList: true, subtree: true });
  }
  const bodyObserver = new MutationObserver(queuePhysicalSync);
  bodyObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-hd-theme', 'data-hd-immersive', 'data-hd-metal'],
  });
}

function openImmersive() {
  if (open || $('workspace')?.hidden) return;
  if (!moveIntoShell()) return;

  open = true;
  panelTouched = false;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  returnScroll = { x: window.scrollX, y: window.scrollY };

  const shell = $('hdImmersiveShell');
  shell.hidden = false;
  document.body.dataset.hdImmersive = 'on';
  document.documentElement.dataset.hdImmersive = 'on';
  document.body.classList.add('hd-immersive-open');
  setAppBackgroundInert(true);
  syncResponsivePanel(true);
  queuePhysicalSync();
  centerImmersiveBoard();

  requestAnimationFrame(() => $('hdBackBtn')?.focus({ preventScroll: true }));
}

function closeImmersive({ topDown = true } = {}) {
  if (!open) return;
  const shell = $('hdImmersiveShell');

  if (topDown && $('hdTopDownBtn') && !$('hdTopDownBtn').disabled) $('hdTopDownBtn').click();

  setAppBackgroundInert(false);
  restoreFromShell();

  shell.hidden = true;
  delete document.body.dataset.hdImmersive;
  delete document.documentElement.dataset.hdImmersive;
  document.body.classList.remove('hd-immersive-open');
  open = false;
  syncPhysicalEffects();
  window.scrollTo(returnScroll.x, returnScroll.y);

  if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') {
    requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
  }
}

function dialogOpen() {
  return Boolean(document.querySelector('dialog[open]'));
}

function trapFocus(event) {
  if (!open || event.key !== 'Tab' || dialogOpen()) return;
  const shell = $('hdImmersiveShell');
  const focusable = [...shell.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )].filter(element => !element.hidden && element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function onKeyDown(event) {
  if (!open) return;
  if (event.key === 'Escape' && !dialogOpen()) {
    event.preventDefault();
    closeImmersive();
    return;
  }
  trapFocus(event);
}

function init() {
  if (initialized) return;
  const tabletop = $('hdTabletopBtn');
  const topDown = $('hdTopDownBtn');
  const toolbar = $('hdCameraToolbar');
  if (!tabletop || !topDown || !toolbar) {
    requestAnimationFrame(init);
    return;
  }

  initialized = true;
  installStyles();
  installShell();
  installReflectionToggle();
  installPhysicalObservers();
  queuePhysicalSync();

  tabletop.textContent = 'HD Board';
  tabletop.setAttribute('aria-label', 'Open immersive HD Board view');

  $('hdBackBtn')?.addEventListener('click', () => closeImmersive());
  $('hdImmersiveFlipBtn')?.addEventListener('click', () => $('flipBtn')?.click());
  $('hdImmersivePanelToggle')?.addEventListener('click', () => {
    const collapsed = $('hdImmersiveShell')?.dataset.panel === 'collapsed';
    setPanelCollapsed(!collapsed);
    centerImmersiveBoard();
  });

  tabletop.addEventListener('click', () => {
    if (!tabletop.disabled) openImmersive();
  });

  for (const control of [$('hdZoomOutBtn'), $('hdZoomInBtn'), $('hdZoomFitBtn'), $('hdZoomRange')]) {
    control?.addEventListener('click', centerImmersiveBoard);
    control?.addEventListener('input', centerImmersiveBoard);
  }

  window.addEventListener('resize', () => {
    syncResponsivePanel();
    centerImmersiveBoard();
  }, { passive: true });
  document.addEventListener('keydown', onKeyDown, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
