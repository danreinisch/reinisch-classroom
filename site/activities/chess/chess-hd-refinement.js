const $ = id => document.getElementById(id);

const STYLE_ID = 'chessHdRefinementStyles';
const STYLE_HREF = './chess-hd-refinement.css?v=20260909-chess-refine-1';
let initialized = false;

function installStyles() {
  if ($(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  document.head.append(link);
}

function syncDifficultyShortcut() {
  const shortcut = $('hdImmersiveDifficultyBtn');
  const label = $('hdImmersiveDifficultyLabel');
  const value = $('hdImmersiveDifficultyValue');
  const action = $('hdImmersiveDifficultyAction');
  if (!shortcut || !label || !value || !action) return;

  const mode = $('modeLabel')?.textContent?.trim() || '';
  const details = $('gameDetails')?.textContent?.trim() || '';
  const computer = /computer/i.test(mode);

  if (computer) {
    const current = details.match(/^(.+?) level\b/i)?.[1]?.trim() || 'Friendly';
    label.textContent = 'Computer strength';
    value.textContent = current;
    action.textContent = 'Change';
    shortcut.setAttribute('aria-label', `Change computer difficulty. Current level ${current}. Opens new game setup.`);
    return;
  }

  label.textContent = 'Game setup';
  value.textContent = 'Two players';
  action.textContent = 'Open';
  shortcut.setAttribute('aria-label', 'Open game setup');
}

function installDifficultyShortcut() {
  if ($('hdImmersiveDifficultyShortcut')) return;
  const summary = document.querySelector('#playPanel .hd-game-summary');
  if (!summary) return;

  const row = document.createElement('div');
  row.id = 'hdImmersiveDifficultyShortcut';
  row.className = 'hd-difficulty-shortcut';
  row.innerHTML = `
    <button id="hdImmersiveDifficultyBtn" class="hd-difficulty-button" type="button">
      <span id="hdImmersiveDifficultyLabel" class="hd-difficulty-label">Computer strength</span>
      <strong id="hdImmersiveDifficultyValue" class="hd-difficulty-value">Friendly</strong>
      <span id="hdImmersiveDifficultyAction" class="hd-difficulty-action">Change</span>
    </button>`;
  summary.after(row);

  $('hdImmersiveDifficultyBtn')?.addEventListener('click', () => $('newGameBtn')?.click());

  const observer = new MutationObserver(syncDifficultyShortcut);
  for (const node of [$('modeLabel'), $('gameDetails')]) {
    if (node) observer.observe(node, { childList: true, subtree: true, characterData: true });
  }
  syncDifficultyShortcut();
}

function init() {
  if (initialized) return;
  if (!$('hdImmersiveShell') || !$('chessHdPhysicalStyles') || !$('newGameBtn') || !$('playPanel')) {
    requestAnimationFrame(init);
    return;
  }

  initialized = true;
  installStyles();
  installDifficultyShortcut();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
