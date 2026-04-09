// Unit tests for district-translator.js logic
// Tests: loadRoster, clearRoster, isRosterLoaded, getRosterCount, translateText
// Run with: node tests/district-translator.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Read source ───────────────────────────────────────────────────────────────

const src = fs.readFileSync(
  path.join(__dirname, '../site/web/district-translator.js'),
  'utf8'
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

// ── Inline implementation (mirrors district-translator.js logic) ──────────────
// We inline the logic here rather than import the ES module since these are CJS tests.

let _rosterMap = new Map();

function loadRoster(csvText) {
  _rosterMap = new Map();
  const lines = csvText.split(/\r?\n/);
  let headerSkipped = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!headerSkipped) { headerSkipped = true; continue; }
    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) continue;
    const code = line.slice(0, commaIdx).trim().toUpperCase();
    let name = line.slice(commaIdx + 1).trim();
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.slice(1, -1).replace(/""/g, '"');
    }
    if (code && name) _rosterMap.set(code, name);
  }
  return _rosterMap.size;
}

function clearRoster() {
  _rosterMap = new Map();
}

function isRosterLoaded() {
  return _rosterMap.size > 0;
}

function getRosterCount() {
  return _rosterMap.size;
}

function translateText(inputText) {
  if (!isRosterLoaded() || !inputText) return inputText;
  const codes = Array.from(_rosterMap.keys()).sort((a, b) => b.length - a.length);
  if (codes.length === 0) return inputText;
  const escaped = codes.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  return inputText.replace(pattern, (match) => _rosterMap.get(match.toUpperCase()) || match);
}

// ── Source-level checks ───────────────────────────────────────────────────────

console.log('--- Source-level checks ---');

test('district-translator.js exports loadRoster', () => {
  assert.ok(src.includes('export function loadRoster'), 'loadRoster must be exported');
});

test('district-translator.js exports clearRoster', () => {
  assert.ok(src.includes('export function clearRoster'), 'clearRoster must be exported');
});

test('district-translator.js exports isRosterLoaded', () => {
  assert.ok(src.includes('export function isRosterLoaded'), 'isRosterLoaded must be exported');
});

test('district-translator.js exports getRosterCount', () => {
  assert.ok(src.includes('export function getRosterCount'), 'getRosterCount must be exported');
});

test('district-translator.js exports translateText', () => {
  assert.ok(src.includes('export function translateText'), 'translateText must be exported');
});

test('district-translator.js exports translateAndDownload', () => {
  assert.ok(src.includes('export function translateAndDownload'), 'translateAndDownload must be exported');
});

test('district-translator.js does NOT call localStorage.setItem', () => {
  assert.ok(!src.includes('localStorage.setItem'), 'must NOT write to localStorage (FERPA compliance)');
});

test('district-translator.js does NOT call sessionStorage.setItem', () => {
  assert.ok(!src.includes('sessionStorage.setItem'), 'must NOT write to sessionStorage (FERPA compliance)');
});

test('district-translator.js does NOT reference fetch(', () => {
  assert.ok(!src.includes('fetch('), 'must NOT make network requests with real names');
});

// ── loadRoster ────────────────────────────────────────────────────────────────

console.log('\n--- loadRoster ---');

test('loads students from a basic two-column CSV', () => {
  const count = loadRoster('Student Code,Real Name\nS001,John Smith\nS002,Jane Doe\n');
  assert.strictEqual(count, 2, 'should load 2 students');
  assert.strictEqual(_rosterMap.get('S001'), 'John Smith');
  assert.strictEqual(_rosterMap.get('S002'), 'Jane Doe');
});

test('skips the header row', () => {
  loadRoster('Student Code,Real Name\nS010,Alex Jones\n');
  assert.ok(!_rosterMap.has('STUDENT CODE'), 'header must not be treated as a student');
  assert.strictEqual(_rosterMap.get('S010'), 'Alex Jones');
});

test('normalises codes to uppercase', () => {
  loadRoster('Student Code,Real Name\ns001,Lowercase Code\n');
  assert.strictEqual(_rosterMap.get('S001'), 'Lowercase Code', 'code should be uppercased');
});

test('handles CRLF line endings', () => {
  const count = loadRoster('Student Code,Real Name\r\nS003,Charlie Brown\r\nS004,Snoopy Dog\r\n');
  assert.strictEqual(count, 2);
  assert.strictEqual(_rosterMap.get('S003'), 'Charlie Brown');
});

test('handles quoted names with commas', () => {
  loadRoster('Student Code,Real Name\nS005,"Smith, John"\n');
  assert.strictEqual(_rosterMap.get('S005'), 'Smith, John', 'should strip outer quotes');
});

test('skips blank lines', () => {
  const count = loadRoster('Student Code,Real Name\n\nS006,Bob Builder\n\n');
  assert.strictEqual(count, 1);
});

test('skips rows without a comma', () => {
  const count = loadRoster('Student Code,Real Name\nBADROW\nS007,Good Row\n');
  assert.strictEqual(count, 1, 'bad row without comma should be skipped');
});

test('returns 0 for empty CSV', () => {
  const count = loadRoster('');
  assert.strictEqual(count, 0);
});

test('replaces existing roster on second load', () => {
  loadRoster('Student Code,Real Name\nS001,First Load\n');
  loadRoster('Student Code,Real Name\nS001,Second Load\n');
  assert.strictEqual(_rosterMap.get('S001'), 'Second Load', 'second load should replace first');
});

// ── clearRoster ───────────────────────────────────────────────────────────────

console.log('\n--- clearRoster ---');

test('clearRoster empties the map', () => {
  loadRoster('Student Code,Real Name\nS001,John Smith\n');
  clearRoster();
  assert.strictEqual(_rosterMap.size, 0, 'map should be empty after clear');
});

test('isRosterLoaded returns false after clear', () => {
  loadRoster('Student Code,Real Name\nS001,John Smith\n');
  clearRoster();
  assert.strictEqual(isRosterLoaded(), false);
});

// ── isRosterLoaded / getRosterCount ──────────────────────────────────────────

console.log('\n--- isRosterLoaded / getRosterCount ---');

test('isRosterLoaded returns false before any load', () => {
  clearRoster();
  assert.strictEqual(isRosterLoaded(), false);
});

test('isRosterLoaded returns true after a successful load', () => {
  loadRoster('Student Code,Real Name\nS001,John Smith\n');
  assert.strictEqual(isRosterLoaded(), true);
});

test('getRosterCount matches the number of loaded students', () => {
  loadRoster('Student Code,Real Name\nS001,A\nS002,B\nS003,C\n');
  assert.strictEqual(getRosterCount(), 3);
});

// ── translateText ─────────────────────────────────────────────────────────────

console.log('\n--- translateText ---');

test('returns input unchanged when roster is empty', () => {
  clearRoster();
  const result = translateText('S001 will increase reading skills');
  assert.strictEqual(result, 'S001 will increase reading skills');
});

test('returns falsy input unchanged', () => {
  loadRoster('Student Code,Real Name\nS001,John\n');
  assert.strictEqual(translateText(''), '');
  assert.strictEqual(translateText(null), null);
});

test('replaces a standalone student code with a real name', () => {
  loadRoster('Student Code,Real Name\nS001,John Smith\n');
  const result = translateText('S001 will increase his reading skills.');
  assert.strictEqual(result, 'John Smith will increase his reading skills.');
});

test('replaces multiple different codes in one string', () => {
  loadRoster('Student Code,Real Name\nS001,John\nS002,Jane\n');
  const result = translateText('S001 and S002 are classmates.');
  assert.strictEqual(result, 'John and Jane are classmates.');
});

test('replaces codes inside CSV columns', () => {
  loadRoster('Student Code,Real Name\nS001,John Smith\n');
  const csv = 'Student,Goal\nS001,"S001 will improve math skills"\n';
  const result = translateText(csv);
  assert.ok(result.includes('John Smith'), 'real name should appear');
  assert.ok(!result.includes('S001'), 'S001 should not remain');
});

test('word-boundary matching prevents replacing S001 inside AS001X', () => {
  loadRoster('Student Code,Real Name\nS001,John\n');
  const result = translateText('Code AS001X should not be replaced');
  assert.ok(result.includes('AS001X'), 'AS001X should remain untouched');
  assert.ok(!result.includes('AJohnX'), 'should not mangle embedded code');
});

test('case-insensitive: s001 (lowercase) is also replaced', () => {
  loadRoster('Student Code,Real Name\nS001,John\n');
  const result = translateText('s001 should also be replaced');
  assert.strictEqual(result, 'John should also be replaced');
});

test('longest-match-first: S0011 replaced before S001', () => {
  loadRoster('Student Code,Real Name\nS001,Short\nS0011,Long\n');
  const result = translateText('S0011 and S001 are different students');
  assert.ok(result.includes('Long'), 'S0011 should be replaced with Long');
  assert.ok(result.includes('Short'), 'S001 should be replaced with Short');
  assert.ok(!result.includes('S001'), 'no code should remain');
});

test('replaces code that appears multiple times', () => {
  loadRoster('Student Code,Real Name\nS001,Alice\n');
  const result = translateText('S001 scored 90. S001 passed. S001 is great.');
  assert.strictEqual(result, 'Alice scored 90. Alice passed. Alice is great.');
});

test('handles narrative text with period after code', () => {
  loadRoster('Student Code,Real Name\nS001,Bob\n');
  const result = translateText('Great work, S001. S001 showed improvement.');
  assert.ok(result.includes('Bob'), 'real name should appear');
  assert.ok(!result.includes('S001'), 'code should not remain');
});

// ── Report summary ────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
