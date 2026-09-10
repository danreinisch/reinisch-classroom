const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const activity = path.join(root, 'site/activities/four-in-a-row');
const read = file => fs.readFileSync(path.join(activity, file), 'utf8');

function valuesFor(html, attribute) {
  return [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map(match => match[1]);
}

test('Four In a Row HD stays layered over the existing activity engine', () => {
  const html = read('index.html');
  const app = read('app.js');
  const immersive = read('four-hd-immersive.js');
  assert.match(html, /four-hd\.css\?v=20260908-four-hd-1/);
  assert.match(html, /app\.js\?v=20260909-four-hd-2/);
  assert.match(html, /four-hd-immersive\.js\?v=20260909-four-immersive-1/);
  assert.match(app, /from '\.\/core\.js\?v=20260909-four-hd-2'/);
  assert.match(app, /new Worker\(new URL\('\.\/worker\.js\?v=20260909-four-hd-2'/);
  assert.match(app, /worker\.postMessage\(\{ id, moves: play\.game\.moves, level: play\.options\.level \}\)/);
  assert.doesNotMatch(immersive, /from ['"]\.\/core\.js|from ['"]\.\/engine\.js|new Worker\(|localStorage|sessionStorage|play\.game\s*=/);
  assert.match(immersive, /fourHdBoardMount.*append\(boardCard\)/s);
  assert.match(immersive, /restoreNode\(boardCard, 'board'\)/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html, /\son(?:click|change|load|submit)=/i);
  for (const file of ['core.js', 'engine.js', 'worker.js', 'exercises.js', 'four-hd-immersive.js', 'four-hd-immersive.css']) assert.ok(fs.existsSync(path.join(activity, file)));
});

test('HD settings preserve the existing material choices and expose twelve computer levels', () => {
  const html = read('index.html');
  assert.deepEqual(valuesFor(html, 'data-piece-choice'), ['marble', 'wood', 'metal', 'canyon-stone', 'high-contrast']);
  assert.deepEqual(valuesFor(html, 'data-theme-choice'), ['wood', 'canyon-classic', 'modern-slate', 'tournament-blue', 'high-contrast']);
  for (const id of ['animateDropsToggle', 'thinkingPauseToggle', 'reducedMotionToggle', 'focusBoardToggle', 'focusBoardBtn']) assert.match(html, new RegExp(`id="${id}"`));
  const select = html.match(/<select id="levelSelect"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
  const levels = [...select.matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(match => [match[1], match[2].replace(/^\d+\s*·\s*/, '')]);
  assert.deepEqual(levels, [
    ['first-drops', 'First Drops'], ['rookie', 'Rookie'], ['learning', 'Learning'], ['casual', 'Casual'],
    ['developing', 'Developing'], ['club', 'Club'], ['skilled', 'Skilled'], ['advanced', 'Advanced'],
    ['expert', 'Expert'], ['master', 'Master'], ['ruthless', 'Ruthless'], ['canyon-boss', 'Canyon Boss'],
  ]);
});

test('twelve computer profiles are genuine, bounded, legal, immutable, and legacy saves migrate', async () => {
  const { COMPUTER_LEVELS, normalizeLevel, replay, legalColumns, snapshot, restore } = await import('../site/activities/four-in-a-row/core.js');
  const { LEVEL_PROFILES, chooseMove } = await import('../site/activities/four-in-a-row/engine.js');
  const keys = COMPUTER_LEVELS.map(level => level.key);
  assert.deepEqual(keys, ['first-drops','rookie','learning','casual','developing','club','skilled','advanced','expert','master','ruthless','canyon-boss']);
  assert.deepEqual(Object.keys(LEVEL_PROFILES), keys);
  assert.equal(new Set(Object.values(LEVEL_PROFILES).map(profile => JSON.stringify(profile))).size, 12);

  const profiles = keys.map(key => LEVEL_PROFILES[key]);
  for (let index = 1; index < profiles.length; index++) {
    assert.ok(profiles[index].maxDepth >= profiles[index - 1].maxDepth, `depth regressed at level ${index + 1}`);
    assert.ok(profiles[index].budgetMs > profiles[index - 1].budgetMs, `budget did not increase at level ${index + 1}`);
    assert.ok(profiles[index].nodeLimit > profiles[index - 1].nodeLimit, `node budget did not increase at level ${index + 1}`);
    assert.ok(profiles[index].choiceWindow <= profiles[index - 1].choiceWindow, `choice window widened at level ${index + 1}`);
    assert.ok(profiles[index].mistakeRate <= profiles[index - 1].mistakeRate, `mistake rate increased at level ${index + 1}`);
  }
  assert.equal(profiles[6].maxDepth, 7);
  assert.equal(profiles[6].budgetMs, 850);
  assert.equal(profiles[6].nodeLimit, 60000);

  assert.equal(normalizeLevel('friendly'), 'casual');
  assert.equal(normalizeLevel('challenge'), 'skilled');
  for (const [legacy, current] of Object.entries({ friendly: 'casual', challenge: 'skilled' })) {
    const restored = restore({ version: 1, moves: [3, 2], mode: 'computer', level: legacy, human: 1 });
    assert.equal(restored.options.level, current);
    assert.equal(snapshot(restored.game, { ...restored.options, level: legacy }).level, current);
  }

  for (const key of keys) {
    const game = replay([3, 3, 2, 4]);
    const before = JSON.stringify(game);
    const move = chooseMove(game, key, 60, () => 0.37);
    assert.ok(legalColumns(game).includes(move), `${key} returned illegal column ${move}`);
    assert.equal(JSON.stringify(game), before, `${key} mutated the authoritative input game`);
  }
});

test('all twelve levels take immediate wins and block a single immediate threat', async () => {
  const { COMPUTER_LEVELS, replay } = await import('../site/activities/four-in-a-row/core.js');
  const { chooseMove } = await import('../site/activities/four-in-a-row/engine.js');
  for (const { key } of COMPUTER_LEVELS) {
    assert.equal(chooseMove(replay([6,0,6,1,6,2]), key, 60, () => .9), 6, `${key} missed an immediate win`);
    assert.equal(chooseMove(replay([0,1,0,1,2,1]), key, 60, () => .9), 1, `${key} missed an immediate block`);
  }
});

test('rendered game pieces remain material-only with no printed player marks', () => {
  const app = read('app.js');
  const css = read('four-hd.css');
  assert.match(app, /cell\.firstChild\.textContent = ''/);
  assert.match(app, /disc\.textContent = ''/);
  assert.doesNotMatch(app, /pieceMark\s*\(/);
  assert.match(css, /no\s+letters,\s+numbers,\s+words,\s+or\s+icons/i);
  assert.match(css, /data-piece-set='marble'/);
  assert.match(css, /data-piece-set='wood'/);
  assert.match(css, /data-piece-set='metal'/);
  assert.match(css, /data-piece-set='canyon-stone'/);
  assert.match(css, /data-piece-set='high-contrast'/);
});

test('focus, thinking pause, drop animation, and reduced motion remain presentation state only', () => {
  const app = read('app.js');
  assert.match(app, /document\.body\.dataset\.focusBoard = String\(preferences\.focusBoard\)/);
  assert.match(app, /THINKING_PAUSE_MS = 680/);
  assert.match(app, /thinkingColumn = data\.column/);
  assert.match(app, /startDropAnimation\(play\.game\.last/);
  assert.match(app, /preferences\.reducedMotion \|\| !preferences\.animateDrops/);
  assert.match(app, /play\.game = drop\(play\.game, data\.column\)/);
});

test('immersive physical presentation includes bounded zoom, two cameras, high contrast, reduced motion, and restrained reflections', () => {
  const js = read('four-hd-immersive.js');
  const css = read('four-hd-immersive.css');
  assert.match(js, /ZOOM_MIN = 85/);
  assert.match(js, /ZOOM_MAX = 125/);
  assert.match(js, /ZOOM_STEP = 5/);
  assert.match(js, /fourHdPerspectiveBtn/);
  assert.match(js, /fourHdStraightBtn/);
  assert.match(js, /setPanelCollapsed\(window\.innerWidth < 900, false\)/);
  assert.match(js, /REFLECTIVE_BOARDS = new Set\(\['canyon-classic', 'tournament-blue'\]\)/);
  assert.match(css, /rotateX\(2\.2deg\).*rotateY\(-5\.2deg\)/s);
  assert.match(css, /data-camera='straight'.*transform:none/s);
  assert.match(css, /data-board-theme='high-contrast'.*transform:none!important/s);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /overflow:auto/);
  assert.match(css, /scrollbar-width:none/);
  assert.match(css, /rc-annotated-canyon-approved\.webp/);
});

test('HD page has unique static ids and a dark full-page background contract', () => {
  const html = read('index.html');
  const css = read('four-hd.css');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML contains duplicate ids');
  assert.match(css, /html[\s\S]*background:\s*var\(--hd-bg\)/);
  assert.match(css, /body[\s\S]*min-height:\s*100dvh/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
});
