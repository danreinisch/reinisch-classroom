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
  assert.match(css, /\.hd-immersive-board-stage::-webkit-scrollbar\s*\{[^}]*height:\s*0/s);
  assert.match(css, /--hd-immersive-panel-width:\s*clamp\(248px, 20vw, 292px\)/);
  assert.match(css, /\.hd-immersive-shell \.hd-game-summary > div\s*\{[^}]*display:\s*block/s);
  assert.match(css, /\.hd-immersive-shell \.hd-difficulty-shortcut\s*\{[^}]*display:\s*block/s);
  assert.match(css, /data-hd-theme='high-contrast'.*\.hd-difficulty-button/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width: 899px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
});

test('difficulty shortcut exposes twelve real current levels while legacy saves remain readable', async () => {
  const coreSource = read('site/activities/chess/core.js');
  const engineSource = read('site/activities/chess/engine.js');
  const html = read('site/activities/chess/index.html');
  const js = read('site/activities/chess/chess-hd-refinement.js');

  const expected = [
    ['first-steps', 'First Steps'],
    ['beginner', 'Beginner'],
    ['learning', 'Learning'],
    ['casual', 'Casual'],
    ['developing', 'Developing'],
    ['club', 'Club'],
    ['skilled', 'Skilled'],
    ['advanced', 'Advanced'],
    ['expert', 'Expert'],
    ['master', 'Master'],
    ['ruthless', 'Ruthless'],
    ['canyon-boss', 'Canyon Boss'],
  ];

  assert.match(coreSource, /COMPUTER_LEVELS/);
  assert.match(coreSource, /starter:\s*'first-steps'/);
  assert.match(coreSource, /friendly:\s*'casual'/);
  assert.match(coreSource, /challenge:\s*'skilled'/);
  assert.match(engineSource, /LEVEL_PROFILES/);
  assert.match(engineSource, /profile\.maxDepth/);
  assert.match(engineSource, /profile\.budgetMs/);
  assert.match(engineSource, /profile\.choiceWindow/);
  assert.match(engineSource, /profile\.mistakeRate/);

  const select = html.match(/<select id="levelSelect"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
  const optionTags = [...select.matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>([^<]*)<\/option>/g)].map(match => ({
    key: match[1],
    text: match[2],
    hidden: /\bhidden\b/.test(match[0]),
  }));
  const visible = optionTags.filter(option => !option.hidden);
  assert.equal(visible.length, 12);
  assert.deepEqual(visible.map(option => option.key), expected.map(([key]) => key));
  assert.deepEqual(visible.map(option => option.text.replace(/^\d+\s*·\s*/, '')), expected.map(([, label]) => label));
  assert.deepEqual(optionTags.filter(option => option.hidden).map(option => option.key), ['starter', 'friendly', 'challenge']);
  assert.match(html, /Level 12 uses the deepest supported classroom search/);
  assert.match(js, /Current level \$\{current\}/);
  assert.match(js, /Opens new game setup/);
  assert.doesNotMatch(js, /levelSelect.*(?:value|selectedIndex)/);

  const { Chess, COMPUTER_LEVELS, makeSnapshot, normalizeLevel, restoreSnapshot } = await import('../site/activities/chess/core.js');
  const { LEVEL_PROFILES, findMove } = await import('../site/activities/chess/engine.js');
  assert.deepEqual(COMPUTER_LEVELS.map(level => [level.key, level.label]), expected);
  assert.deepEqual(Object.keys(LEVEL_PROFILES), expected.map(([key]) => key));
  assert.equal(new Set(Object.values(LEVEL_PROFILES).map(profile => JSON.stringify(profile))).size, 12);

  const profiles = expected.map(([key]) => LEVEL_PROFILES[key]);
  for (let index = 1; index < profiles.length; index++) {
    assert.ok(profiles[index].maxDepth >= profiles[index - 1].maxDepth, `depth regressed at level ${index + 1}`);
    assert.ok(profiles[index].budgetMs > profiles[index - 1].budgetMs, `budget did not increase at level ${index + 1}`);
    assert.ok(profiles[index].choiceWindow <= profiles[index - 1].choiceWindow, `choice window widened at level ${index + 1}`);
    assert.ok(profiles[index].mistakeRate <= profiles[index - 1].mistakeRate, `mistake rate increased at level ${index + 1}`);
  }

  assert.equal(normalizeLevel('starter'), 'first-steps');
  assert.equal(normalizeLevel('friendly'), 'casual');
  assert.equal(normalizeLevel('challenge'), 'skilled');
  for (const [legacy, migrated] of Object.entries({ starter: 'first-steps', friendly: 'casual', challenge: 'skilled' })) {
    const restored = restoreSnapshot({ version: 1, moves: [], mode: 'computer', level: legacy, human: 'w' });
    assert.equal(restored.options.level, migrated);
    assert.equal(makeSnapshot(new Chess(), { mode: 'computer', level: legacy, human: 'w' }).level, migrated);
  }

  for (const [key] of expected) {
    const chess = new Chess();
    for (const move of ['e4', 'e5', 'Nf3']) chess.move(move);
    const fen = chess.fen();
    const history = chess.history();
    const move = findMove(chess, key, 60, () => 0.37);
    assert.equal(chess.fen(), fen, `${key} mutated the source position`);
    assert.deepEqual(chess.history(), history, `${key} mutated move history`);
    assert.ok(chess.move(move), `${key} did not return a legal move`);
  }
});
