const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('immersive refinement stays additive, presentation-only, and loads after the physical layer', () => {
  const html = read('site/activities/chess/index.html');
  const js = read('site/activities/chess/chess-hd-refinement.js');
  const css = read('site/activities/chess/chess-hd-refinement.css');

  assert.match(html, /chess-hd-refinement\.js\?v=20260909-chess-refine-1/);
  assert.match(js, /chessHdPhysicalStyles/);
  assert.match(js, /chess-hd-refinement\.css\?v=20260909-chess-refine-1/);
  assert.match(js, /hdImmersiveDifficultyBtn/);
  assert.match(js, /\$\('newGameBtn'\)\?\.click\(\)/);
  assert.match(js, /new MutationObserver\(syncDifficultyShortcut\)/);
  assert.doesNotMatch(js, /from ['"]\.\/core\.js|from ['"]\.\/engine\.js|findMove\(|new Chess\(|new Worker\(|worker\.postMessage|localStorage|sessionStorage|writeMeta/);

  assert.match(css, /\.hd-immersive-topbar\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /--hd-immersive-toolbar-clearance/);
  assert.match(css, /\.hd-immersive-board-stage\s*\{[^}]*background:\s*transparent !important/s);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /\.hd-immersive-board-stage::\-webkit-scrollbar\s*\{[^}]*height:\s*0/s);
  assert.match(css, /--hd-immersive-panel-width:\s*clamp\(248px, 20vw, 292px\)/);
  assert.match(css, /\.hd-immersive-shell \.hd-game-summary > div\s*\{[^}]*display:\s*block/s);
  assert.match(css, /\.hd-immersive-shell \.hd-difficulty-shortcut\s*\{[^}]*display:\s*block/s);
  assert.match(css, /data-hd-theme='high-contrast'.*\.hd-difficulty-button/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width: 899px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
});

test('difficulty shortcut exposes the authoritative existing levels instead of inventing presentation-only levels', () => {
  const core = read('site/activities/chess/core.js');
  const html = read('site/activities/chess/index.html');
  const js = read('site/activities/chess/chess-hd-refinement.js');

  assert.match(core, /LEVELS = \{ starter: 'Learning', friendly: 'Friendly', challenge: 'Challenge' \}/);
  const select = html.match(/<select id="levelSelect">([\s\S]*?)<\/select>/)?.[1] || '';
  const options = [...select.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(options, ['starter', 'friendly', 'challenge']);
  assert.match(js, /Current level \$\{current\}/);
  assert.match(js, /Opens new game setup/);
  assert.doesNotMatch(js, /levelSelect.*(?:value|selectedIndex)|twelve|12 levels/i);
});
