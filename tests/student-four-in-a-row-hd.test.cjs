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
  assert.match(html, /four-hd\.css\?v=20260908-four-hd-1/);
  assert.match(html, /app\.js\?v=20260908-four-hd-1/);
  assert.match(app, /from '\.\/core\.js\?v=20260908-four-hd-1'/);
  assert.match(app, /new Worker\(new URL\('\.\/worker\.js\?v=20260908-four-hd-1'/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html, /\son(?:click|change|load|submit)=/i);
  for (const file of ['core.js', 'engine.js', 'worker.js', 'exercises.js']) assert.ok(fs.existsSync(path.join(activity, file)));
});

test('HD settings expose exactly the approved material and board choices', () => {
  const html = read('index.html');
  assert.deepEqual(valuesFor(html, 'data-piece-choice'), ['marble', 'wood', 'metal', 'canyon-stone', 'high-contrast']);
  assert.deepEqual(valuesFor(html, 'data-theme-choice'), ['wood', 'canyon-classic', 'modern-slate', 'tournament-blue', 'high-contrast']);
  for (const id of ['animateDropsToggle', 'thinkingPauseToggle', 'reducedMotionToggle', 'focusBoardToggle', 'focusBoardBtn']) assert.match(html, new RegExp(`id="${id}"`));
});

test('rendered game pieces are material-only with no printed player marks', () => {
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

test('focus, thinking pause, drop animation, and reduced motion are visual state only', () => {
  const app = read('app.js');
  assert.match(app, /document\.body\.dataset\.focusBoard = String\(preferences\.focusBoard\)/);
  assert.match(app, /THINKING_PAUSE_MS = 680/);
  assert.match(app, /thinkingColumn = data\.column/);
  assert.match(app, /startDropAnimation\(play\.game\.last/);
  assert.match(app, /preferences\.reducedMotion \|\| !preferences\.animateDrops/);
  assert.match(app, /play\.game = drop\(play\.game, data\.column\)/);
});

test('HD page has unique ids and a dark full-page background contract', () => {
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
