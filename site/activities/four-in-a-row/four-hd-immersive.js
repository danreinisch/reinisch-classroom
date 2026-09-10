const $ = id => document.getElementById(id);

const STYLE_ID = 'fourHdImmersiveStyles';
const STYLE_HREF = './four-hd-immersive.css?v=20260909-four-immersive-1';
const ZOOM_MIN = 85;
const ZOOM_MAX = 125;
const ZOOM_STEP = 5;
const REFLECTIVE_BOARDS = new Set(['canyon-classic', 'tournament-blue']);
const REFLECTIVE_PIECES = new Set(['marble', 'metal']);

let initialized = false;
let open = false;
let panelTouched = false;
let zoom = 100;
let camera = 'perspective';
let reflectionRequested = false;
let returnFocus = null;
let returnScroll = { x: 0, y: 0 };
let appWasInert = false;
let appAriaHidden = null;
const anchors = {};

function installStyles() {
  if ($(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  document.head.append(link);
}

function installLaunchButton() {
  if ($('fourHdBoardBtn')) return;
  const focus = $('focusBoardBtn');
  if (!focus?.parentNode) return;
  const actions = document.createElement('div');
  actions.className = 'four-hd-view-actions';
  focus.before(actions);
  actions.append(focus);
  const button = document.createElement('button');
  button.id = 'fourHdBoardBtn';
  button.className = 'primary four-hd-launch';
  button.type = 'button';
  button.textContent = 'HD Board';
  button.setAttribute('aria-label', 'Open immersive Four in a Row HD Board');
  actions.append(button);
}

function installShell() {
  if ($('fourHdImmersiveShell')) return;
  const shell = document.createElement('section');
  shell.id = 'fourHdImmersiveShell';
  shell.className = 'four-hd-immersive-shell';
  shell.hidden = true;
  shell.dataset.camera = camera;
  shell.dataset.panel = 'expanded';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');
  shell.setAttribute('aria-label', 'Four in a Row HD Board');
  shell.innerHTML = `
    <div class="four-hd-immersive-topbar">
      <button id="fourHdBackBtn" class="quiet small four-hd-back" type="button">← Back</button>
      <div class="four-hd-camera" role="group" aria-label="Board view">
        <button id="fourHdPerspectiveBtn" class="quiet small" type="button" aria-pressed="true">Perspective</button>
        <button id="fourHdStraightBtn" class="quiet small" type="button" aria-pressed="false">Straight-on</button>
      </div>
      <div class="four-hd-zoom" role="group" aria-label="Board zoom">
        <button id="fourHdZoomOutBtn" class="quiet small" type="button" aria-label="Zoom out">−</button>
        <output id="fourHdZoomValue" aria-live="polite">100%</output>
        <button id="fourHdZoomInBtn" class="quiet small" type="button" aria-label="Zoom in">+</button>
        <button id="fourHdFitBtn" class="quiet small" type="button">Fit</button>
      </div>
      <div id="fourHdSettingsMount" class="four-hd-settings-mount"></div>
    </div>
    <div class="four-hd-immersive-layout">
      <div id="fourHdBoardStage" class="four-hd-board-stage">
        <div id="fourHdBoardMount" class="four-hd-board-mount"></div>
      </div>
      <aside id="fourHdPanel" class="four-hd-panel" aria-label="Four in a Row game controls">
        <button id="fourHdPanelToggle" class="four-hd-panel-toggle" type="button"
          aria-controls="fourHdPanelMount" aria-expanded="true" aria-label="Collapse game controls">›</button>
        <div id="fourHdPanelMount" class="four-hd-panel-mount"></div>
      </aside>
    </div>`;
  document.body.append(shell);
}

function installDifficultyShortcut() {
  if ($('fourHdDifficultyCard')) return;
  const modeCard = document.querySelector('.hd-mode-card');
  if (!modeCard) return;
  const card = document.createElement('div');
  card.id = 'fourHdDifficultyCard';
  card.className = 'four-hd-difficulty-card';
  card.innerHTML = `
    <span class="four-hd-difficulty-copy"><small>Computer strength</small><strong id="fourHdDifficultyValue">Casual</strong></span>
    <button id="fourHdDifficultyBtn" class="quiet small" type="button" aria-label="Change computer difficulty through New Game setup">Change</button>`;
  modeCard.after(card);
  $('fourHdDifficultyBtn').addEventListener('click', () => $('newGameBtn')?.click());
  syncDifficultyShortcut();
}

function installReflectionToggle() {
  if ($('fourHdReflectionToggle')) return;
  const list = document.querySelector('#settingsDialog .hd-toggle-list');
  if (!list) return;
  const row = document.createElement('label');
  row.id = 'fourHdReflectionRow';
  row.className = 'hd-toggle-row four-hd-reflection-row';
  row.htmlFor = 'fourHdReflectionToggle';
  row.hidden = true;
  row.innerHTML = `
    <span><strong>Subtle disc reflection</strong><small id="fourHdReflectionHint">Available on selected satin HD materials.</small></span>
    <span class="hd-switch"><input id="fourHdReflectionToggle" type="checkbox"><i aria-hidden="true"></i></span>`;
  const reduced = $('reducedMotionToggle')?.closest('label');
  if (reduced) list.insertBefore(row, reduced);
  else list.append(row);
  $('fourHdReflectionToggle').addEventListener('change', event => {
    reflectionRequested = Boolean(event.currentTarget.checked);
    syncReflection();
  });
}

function makeAnchor(node, name) {
  if (!node || anchors[name]) return;
  const anchor = document.createElement('span');
  anchor.hidden = true;
  anchor.dataset.fourHdAnchor = name;
  node.before(anchor);
  anchors[name] = anchor;
}

function restoreNode(node, name) {
  const anchor = anchors[name];
  if (!node || !anchor?.parentNode) return;
  anchor.parentNode.insertBefore(node, anchor.nextSibling);
}

function moveIntoShell() {
  const boardCard = document.querySelector('.hd-board-card');
  const sideCard = document.querySelector('.hd-side-card');
  const settings = $('settingsBtn');
  if (!boardCard || !sideCard || !settings) return false;
  makeAnchor(boardCard, 'board');
  makeAnchor(sideCard, 'side');
  makeAnchor(settings, 'settings');
  $('fourHdBoardMount').append(boardCard);
  $('fourHdPanelMount').append(sideCard);
  $('fourHdSettingsMount').append(settings);
  return true;
}

function restoreFromShell() {
  const boardCard = document.querySelector('.hd-board-card');
  if (boardCard) {
    boardCard.style.width = '';
    boardCard.style.maxWidth = '';
  }
  restoreNode(boardCard, 'board');
  restoreNode(document.querySelector('.hd-side-card'), 'side');
  restoreNode($('settingsBtn'), 'settings');
}

function setAppBackgroundInert(on) {
  const app = document.querySelector('.four-hd-app');
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

function ensureAppBackgroundInert() {
  if (!open) return;
  const app = document.querySelector('.four-hd-app');
  if (!app) return;
  app.inert = true;
  app.setAttribute('aria-hidden', 'true');
}

function setPanelCollapsed(collapsed, touched = true) {
  const shell = $('fourHdImmersiveShell');
  const toggle = $('fourHdPanelToggle');
  if (!shell || !toggle) return;
  if (touched) panelTouched = true;
  shell.dataset.panel = collapsed ? 'collapsed' : 'expanded';
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Expand game controls' : 'Collapse game controls');
  toggle.textContent = collapsed ? '‹' : '›';
}

function syncResponsivePanel(force = false) {
  if (!open || (!force && panelTouched)) return;
  setPanelCollapsed(window.innerWidth < 900, false);
}

function clampZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(numeric / ZOOM_STEP) * ZOOM_STEP));
}

function centerBoard() {
  const stage = $('fourHdBoardStage');
  if (!stage || !open) return;
  requestAnimationFrame(() => {
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
    stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
  });
}

function setZoom(value) {
  zoom = clampZoom(value);
  const card = document.querySelector('#fourHdBoardMount > .hd-board-card');
  if (card) {
    card.style.width = `${zoom}%`;
    card.style.maxWidth = 'none';
  }
  $('fourHdZoomValue').textContent = `${zoom}%`;
  $('fourHdZoomOutBtn').disabled = zoom <= ZOOM_MIN;
  $('fourHdZoomInBtn').disabled = zoom >= ZOOM_MAX;
  $('fourHdImmersiveShell').dataset.zoom = String(zoom);
  centerBoard();
}

function setCamera(next) {
  camera = next === 'straight' ? 'straight' : 'perspective';
  const shell = $('fourHdImmersiveShell');
  shell.dataset.camera = camera;
  $('fourHdPerspectiveBtn').setAttribute('aria-pressed', String(camera === 'perspective'));
  $('fourHdStraightBtn').setAttribute('aria-pressed', String(camera === 'straight'));
  centerBoard();
}

function syncDifficultyShortcut() {
  const card = $('fourHdDifficultyCard');
  if (!card) return;
  const computer = ($('modeLabel')?.textContent || '').toLowerCase().includes('computer');
  card.hidden = !computer;
  const details = $('gameDetails')?.textContent || '';
  const level = details.match(/^(.+?) level\b/)?.[1] || 'Casual';
  $('fourHdDifficultyValue').textContent = level;
  $('fourHdDifficultyBtn').setAttribute('aria-label', `Current level ${level}. Opens New Game setup to change computer difficulty.`);
}

function syncReflection() {
  const theme = document.body.dataset.boardTheme || '';
  const pieces = document.body.dataset.pieceSet || '';
  const highContrast = theme === 'high-contrast' || pieces === 'high-contrast';
  const supported = open && !highContrast && REFLECTIVE_BOARDS.has(theme) && REFLECTIVE_PIECES.has(pieces);
  const row = $('fourHdReflectionRow');
  const toggle = $('fourHdReflectionToggle');
  const hint = $('fourHdReflectionHint');
  if (row) row.hidden = !open;
  if (toggle) {
    toggle.checked = reflectionRequested;
    toggle.disabled = !supported;
  }
  if (hint) {
    if (highContrast) hint.textContent = 'Disabled in High Contrast.';
    else if (!REFLECTIVE_BOARDS.has(theme)) hint.textContent = 'This board uses a matte finish.';
    else if (!REFLECTIVE_PIECES.has(pieces)) hint.textContent = 'This disc material uses a matte finish.';
    else hint.textContent = 'A deliberately faint satin reflection.';
  }
  document.body.dataset.fourHdReflection = supported && reflectionRequested ? 'on' : 'off';
}

function sessionStillValid() {
  return !$('mainContent')?.hidden && Boolean($('sessionNotice')?.hidden);
}

function openImmersive() {
  if (open || $('workspace')?.hidden || !sessionStillValid() || document.querySelector('dialog[open]')) return;
  if (!moveIntoShell()) return;
  open = true;
  panelTouched = false;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  returnScroll = { x: window.scrollX, y: window.scrollY };
  const shell = $('fourHdImmersiveShell');
  shell.hidden = false;
  document.body.dataset.fourHdImmersive = 'on';
  document.documentElement.dataset.fourHdImmersive = 'on';
  document.body.classList.add('four-hd-immersive-open');
  setAppBackgroundInert(true);
  syncResponsivePanel(true);
  setCamera(camera);
  setZoom(100);
  syncDifficultyShortcut();
  syncReflection();
  requestAnimationFrame(() => $('fourHdBackBtn')?.focus({ preventScroll: true }));
}

function closeImmersive() {
  if (!open) return;
  const shell = $('fourHdImmersiveShell');
  setAppBackgroundInert(false);
  restoreFromShell();
  shell.hidden = true;
  delete document.body.dataset.fourHdImmersive;
  delete document.documentElement.dataset.fourHdImmersive;
  document.body.classList.remove('four-hd-immersive-open');
  document.body.dataset.fourHdReflection = 'off';
  open = false;
  if ($('fourHdReflectionRow')) $('fourHdReflectionRow').hidden = true;
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
  const shell = $('fourHdImmersiveShell');
  const focusable = [...shell.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hidden && element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}

function onKeyDown(event) {
  if (!open) return;
  if (event.key === 'Escape' && !dialogOpen()) {
    event.preventDefault(); closeImmersive(); return;
  }
  trapFocus(event);
}

function init() {
  if (initialized) return;
  if (!$('board') || !$('focusBoardBtn') || !$('settingsBtn') || !document.querySelector('.hd-side-card')) {
    requestAnimationFrame(init);
    return;
  }
  initialized = true;
  installStyles();
  installLaunchButton();
  installShell();
  installDifficultyShortcut();
  installReflectionToggle();

  $('fourHdBoardBtn').addEventListener('click', openImmersive);
  $('fourHdBackBtn').addEventListener('click', closeImmersive);
  $('fourHdPanelToggle').addEventListener('click', () => {
    setPanelCollapsed($('fourHdImmersiveShell').dataset.panel !== 'collapsed');
    centerBoard();
  });
  $('fourHdPerspectiveBtn').addEventListener('click', () => setCamera('perspective'));
  $('fourHdStraightBtn').addEventListener('click', () => setCamera('straight'));
  $('fourHdZoomOutBtn').addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  $('fourHdZoomInBtn').addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  $('fourHdFitBtn').addEventListener('click', () => setZoom(100));

  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', () => {
    ensureAppBackgroundInert();
    syncDifficultyShortcut();
    syncReflection();
  });

  const observer = new MutationObserver(() => {
    syncDifficultyShortcut();
    syncReflection();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-board-theme', 'data-piece-set', 'data-reduced-motion'] });
  if ($('gameDetails')) observer.observe($('gameDetails'), { childList: true, characterData: true, subtree: true });
  if ($('modeLabel')) observer.observe($('modeLabel'), { childList: true, characterData: true, subtree: true });

  window.addEventListener('resize', () => { syncResponsivePanel(); centerBoard(); }, { passive: true });
  window.addEventListener('storage', () => { if (open && !sessionStillValid()) closeImmersive(); });
  document.addEventListener('keydown', onKeyDown, true);
  syncDifficultyShortcut();
  syncReflection();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
