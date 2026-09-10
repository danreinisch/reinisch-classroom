const $ = id => document.getElementById(id);

const STYLE_ID = 'chessHdImmersiveStyles';
const STYLE_HREF = './chess-hd-immersive.css?v=20260909-chess-immersive-1';

let initialized = false;
let open = false;
let panelTouched = false;
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
