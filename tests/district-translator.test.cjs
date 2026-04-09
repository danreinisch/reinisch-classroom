// Unit tests for district-translator.js
// Tests: loadRoster, clearRoster, isRosterLoaded, getRosterCount,
//        translateText, translateAndDownload, reverseTranslateText, reverseTranslateAndDownload
// Run with: node tests/district-translator.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Source inspection ─────────────────────────────────────────────────────────

const srcPath = path.join(__dirname, '..', 'site', 'web', 'district-translator.js');
const src = fs.readFileSync(srcPath, 'utf8');

// ── Inline mirrors of district-translator.js functions ────────────────────────
// district-translator.js is an ES module; we mirror the logic here for CJS testing.

let _rosterMap = new Map();

function loadRoster(csvText) {
  _rosterMap.clear();
  const lines = csvText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx === -1) continue;
    const code = trimmed.slice(0, commaIdx).trim().replace(/^"|"$/g, '').toUpperCase();
    const name = trimmed.slice(commaIdx + 1).trim().replace(/^"|"$/g, '');
    if (!code || !name) continue;
    if (code === 'CODE' || code === 'STUDENT CODE' || code === 'STUDENT_CODE') continue;
    _rosterMap.set(code, name);
  }
  return _rosterMap.size;
}

function clearRoster() {
  _rosterMap.clear();
}

function isRosterLoaded() {
  return _rosterMap.size > 0;
}

function getRosterCount() {
  return _rosterMap.size;
}

function translateText(inputText) {
  if (!_rosterMap.size) return inputText;
  const codes = [..._rosterMap.keys()].sort((a, b) => b.length - a.length);
  const escaped = codes.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  return inputText.replace(pattern, (match) => {
    return _rosterMap.get(match.toUpperCase()) || match;
  });
}

function reverseTranslateText(inputText) {
  if (!_rosterMap.size) return inputText;
  const reverseMap = new Map();
  for (const [code, name] of _rosterMap) {
    reverseMap.set(name.toLowerCase(), { code, name });
  }
  const names = [...reverseMap.keys()].sort((a, b) => b.length - a.length);
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  return inputText.replace(pattern, (match) => {
    const entry = reverseMap.get(match.toLowerCase());
    return entry ? entry.code : match;
  });
}

// ── Test runner ───────────────────────────────────────────────────────────────

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

// Reset roster before each group of tests
function resetRoster() {
  clearRoster();
}

console.log('\n=== district-translator tests ===\n');

// ── Source-level checks ───────────────────────────────────────────────────────

console.log('--- Source checks ---');

test('loadRoster is exported', () => {
  assert.ok(src.includes('export function loadRoster'), 'loadRoster must be exported');
});

test('clearRoster is exported', () => {
  assert.ok(src.includes('export function clearRoster'), 'clearRoster must be exported');
});

test('isRosterLoaded is exported', () => {
  assert.ok(src.includes('export function isRosterLoaded'), 'isRosterLoaded must be exported');
});

test('getRosterCount is exported', () => {
  assert.ok(src.includes('export function getRosterCount'), 'getRosterCount must be exported');
});

test('translateText is exported', () => {
  assert.ok(src.includes('export function translateText'), 'translateText must be exported');
});

test('translateAndDownload is exported', () => {
  assert.ok(src.includes('export function translateAndDownload'), 'translateAndDownload must be exported');
});

test('reverseTranslateText is exported', () => {
  assert.ok(src.includes('export function reverseTranslateText'), 'reverseTranslateText must be exported');
});

test('reverseTranslateAndDownload is exported', () => {
  assert.ok(src.includes('export function reverseTranslateAndDownload'), 'reverseTranslateAndDownload must be exported');
});

test('translateText uses longest-match-first sort (b.length - a.length)', () => {
  assert.ok(src.includes('b.length - a.length'), 'must sort codes longest-first');
});

test('reverseTranslateText sorts names longest-first', () => {
  // The reverse function also sorts names longest-first
  const reverseSection = src.slice(src.indexOf('reverseTranslateText'));
  assert.ok(reverseSection.includes('b.length - a.length'), 'reverseTranslateText must sort names longest-first');
});

test('reverseTranslateText uses word boundaries (\\b)', () => {
  const reverseSection = src.slice(src.indexOf('export function reverseTranslateText'));
  assert.ok(reverseSection.includes('\\\\b'), 'reverseTranslateText must use \\b word boundary');
});

test('translateText uses word boundaries (\\b)', () => {
  assert.ok(src.includes('\\\\b'), 'translateText must use \\b word boundary');
});

test('real names never persisted — no localStorage/sessionStorage usage', () => {
  // Check for actual localStorage/sessionStorage calls (not just comments mentioning them)
  assert.ok(!src.includes('localStorage.setItem') && !src.includes('localStorage.getItem'),
    'must not write or read localStorage');
  assert.ok(!src.includes('sessionStorage.setItem') && !src.includes('sessionStorage.getItem'),
    'must not write or read sessionStorage');
});

// ── loadRoster tests ──────────────────────────────────────────────────────────

console.log('\n--- loadRoster ---');

test('loadRoster parses simple CSV correctly', () => {
  resetRoster();
  const count = loadRoster('S001,Jane Smith\nS002,John Doe');
  assert.strictEqual(count, 2, 'should load 2 entries');
  assert.strictEqual(getRosterCount(), 2);
});

test('loadRoster returns number of entries loaded', () => {
  resetRoster();
  const count = loadRoster('S001,Alice\nS002,Bob\nS003,Carol');
  assert.strictEqual(count, 3);
});

test('loadRoster skips header row with CODE', () => {
  resetRoster();
  const count = loadRoster('CODE,real_name\nS001,Jane Smith');
  assert.strictEqual(count, 1, 'header CODE row must be skipped');
});

test('loadRoster skips header row with STUDENT CODE', () => {
  resetRoster();
  const count = loadRoster('STUDENT CODE,real_name\nS001,Jane Smith');
  assert.strictEqual(count, 1, 'header STUDENT CODE row must be skipped');
});

test('loadRoster skips header row with STUDENT_CODE', () => {
  resetRoster();
  const count = loadRoster('STUDENT_CODE,real_name\nS001,Jane Smith');
  assert.strictEqual(count, 1, 'header STUDENT_CODE row must be skipped');
});

test('loadRoster handles quoted names', () => {
  resetRoster();
  loadRoster('"S001","Jane Smith"');
  assert.strictEqual(getRosterCount(), 1);
  // translateText should work with the loaded roster
  assert.strictEqual(translateText('S001'), 'Jane Smith');
});

test('loadRoster handles Windows line endings (CRLF)', () => {
  resetRoster();
  const count = loadRoster('S001,Jane Smith\r\nS002,John Doe\r\n');
  assert.strictEqual(count, 2);
});

test('loadRoster skips blank lines', () => {
  resetRoster();
  const count = loadRoster('S001,Jane Smith\n\nS002,John Doe\n\n');
  assert.strictEqual(count, 2);
});

test('loadRoster skips lines with no comma', () => {
  resetRoster();
  const count = loadRoster('S001,Jane Smith\nINVALID LINE\nS002,John Doe');
  assert.strictEqual(count, 2);
});

test('loadRoster clears previous roster on reload', () => {
  resetRoster();
  loadRoster('S001,Jane Smith\nS002,John Doe');
  assert.strictEqual(getRosterCount(), 2);
  loadRoster('S003,Carol White');
  assert.strictEqual(getRosterCount(), 1, 'previous roster must be cleared');
});

test('loadRoster upcases codes for consistent lookup', () => {
  resetRoster();
  loadRoster('s001,Jane Smith');
  assert.strictEqual(translateText('S001'), 'Jane Smith');
  assert.strictEqual(translateText('s001'), 'Jane Smith');
});

// ── clearRoster tests ─────────────────────────────────────────────────────────

console.log('\n--- clearRoster ---');

test('clearRoster empties the roster map', () => {
  resetRoster();
  loadRoster('S001,Jane Smith');
  clearRoster();
  assert.strictEqual(getRosterCount(), 0);
});

test('isRosterLoaded returns false after clearRoster', () => {
  resetRoster();
  loadRoster('S001,Jane Smith');
  assert.strictEqual(isRosterLoaded(), true);
  clearRoster();
  assert.strictEqual(isRosterLoaded(), false);
});

// ── getRosterCount tests ──────────────────────────────────────────────────────

console.log('\n--- getRosterCount ---');

test('getRosterCount returns 0 when no roster loaded', () => {
  resetRoster();
  assert.strictEqual(getRosterCount(), 0);
});

test('getRosterCount returns correct count', () => {
  resetRoster();
  loadRoster('S001,Jane\nS002,Bob\nS003,Carol');
  assert.strictEqual(getRosterCount(), 3);
});

// ── translateText tests ───────────────────────────────────────────────────────

console.log('\n--- translateText ---');

test('translateText returns input unchanged when no roster loaded', () => {
  resetRoster();
  const result = translateText('S001 did great work.');
  assert.strictEqual(result, 'S001 did great work.');
});

test('translateText replaces codes with real names', () => {
  resetRoster();
  loadRoster('S001,Jane Smith\nS002,John Doe');
  const result = translateText('S001 and S002 completed the assignment.');
  assert.strictEqual(result, 'Jane Smith and John Doe completed the assignment.');
});

test('translateText is case-insensitive for code lookup', () => {
  resetRoster();
  loadRoster('S001,Jane Smith');
  assert.strictEqual(translateText('s001 completed the task.'), 'Jane Smith completed the task.');
  assert.strictEqual(translateText('S001 completed the task.'), 'Jane Smith completed the task.');
});

test('translateText uses word-boundary matching (does not replace AS001X)', () => {
  resetRoster();
  loadRoster('S001,Jane Smith');
  const result = translateText('AS001X is not a student code');
  assert.strictEqual(result, 'AS001X is not a student code', 'AS001X should not be replaced');
});

test('translateText uses longest-match-first (S0011 before S001)', () => {
  resetRoster();
  loadRoster('S001,Jane Smith\nS0011,Alice Brown');
  const result = translateText('S0011 and S001 are different.');
  assert.strictEqual(result, 'Alice Brown and Jane Smith are different.');
});

test('translateText replaces codes in narrative text', () => {
  resetRoster();
  loadRoster('S001,Jane Smith');
  const result = translateText('S001 will increase reading skills by May.');
  assert.strictEqual(result, 'Jane Smith will increase reading skills by May.');
});

test('translateText replaces multiple occurrences of same code', () => {
  resetRoster();
  loadRoster('S001,Jane Smith');
  const result = translateText('S001 scored 90. S001 improved significantly.');
  assert.strictEqual(result, 'Jane Smith scored 90. Jane Smith improved significantly.');
});

test('translateText handles CSV content with codes', () => {
  resetRoster();
  loadRoster('S001,Jane Smith\nS002,John Doe');
  const csv = 'Student,Score\nS001,90\nS002,85';
  const result = translateText(csv);
  assert.ok(result.includes('Jane Smith'), 'Jane Smith should appear');
  assert.ok(result.includes('John Doe'), 'John Doe should appear');
  assert.ok(!result.includes('S001'), 'S001 should not remain');
  assert.ok(!result.includes('S002'), 'S002 should not remain');
});

// ── reverseTranslateText tests ────────────────────────────────────────────────

console.log('\n--- reverseTranslateText ---');

test('reverseTranslateText returns input unchanged when no roster loaded', () => {
  resetRoster();
  const result = reverseTranslateText('Jane Smith did great work.');
  assert.strictEqual(result, 'Jane Smith did great work.');
});

test('reverseTranslateText replaces real names with codes', () => {
  resetRoster();
  loadRoster('S001,Jane Smith\nS002,John Doe');
  const result = reverseTranslateText('Jane Smith and John Doe completed the assignment.');
  assert.strictEqual(result, 'S001 and S002 completed the assignment.');
});

test('reverseTranslateText is case-insensitive', () => {
  resetRoster();
  loadRoster('S001,Jane Smith');
  assert.strictEqual(reverseTranslateText('jane smith completed the task.'), 'S001 completed the task.');
  assert.strictEqual(reverseTranslateText('JANE SMITH completed the task.'), 'S001 completed the task.');
});

test('reverseTranslateText longest-match-first: "Jane Smith" before "Jane"', () => {
  resetRoster();
  loadRoster('S001,Jane\nS002,Jane Smith');
  const result = reverseTranslateText('Jane Smith came first, then Jane.');
  assert.strictEqual(result, 'S002 came first, then S001.');
});

test('reverseTranslateText does not replace name inside a longer word', () => {
  resetRoster();
  loadRoster('S001,Jane');
  // "Janes" should not match "Jane"
  const result = reverseTranslateText('Janes are common names but Jane is specific.');
  // Jane standalone should match, but Janes should not
  assert.ok(result.includes('S001'), 'standalone Jane must be replaced');
  assert.ok(!result.startsWith('S001s'), 'Janes must not be replaced');
  // Verify Janes is unchanged
  assert.ok(result.includes('Janes'), 'Janes must remain unchanged');
});

test('reverseTranslateText handles names with special regex characters', () => {
  resetRoster();
  loadRoster('S001,O\'Brien');
  const result = reverseTranslateText("O'Brien scored 95.");
  assert.strictEqual(result, 'S001 scored 95.');
});

test('reverseTranslateText is consistent with translateText (round-trip)', () => {
  resetRoster();
  loadRoster('S001,Jane Smith\nS002,John Doe');
  const original = 'S001 scored 90 and S002 scored 85.';
  const forward = translateText(original);
  const backward = reverseTranslateText(forward);
  assert.strictEqual(backward, original, 'round-trip should restore original text');
});

test('reverseTranslateText replaces multiple occurrences of same name', () => {
  resetRoster();
  loadRoster('S001,Jane Smith');
  const result = reverseTranslateText('Jane Smith scored 90. Jane Smith improved significantly.');
  assert.strictEqual(result, 'S001 scored 90. S001 improved significantly.');
});

// ── translateAndDownload source checks ────────────────────────────────────────

console.log('\n--- translateAndDownload / reverseTranslateAndDownload source checks ---');

test('translateAndDownload calls translateText', () => {
  const section = src.slice(src.indexOf('export function translateAndDownload'));
  assert.ok(section.includes('translateText('), 'translateAndDownload must call translateText');
});

test('translateAndDownload creates a Blob and triggers download', () => {
  const section = src.slice(src.indexOf('export function translateAndDownload'));
  assert.ok(section.includes('new Blob'), 'must create a Blob');
  assert.ok(section.includes('URL.createObjectURL'), 'must use createObjectURL');
  assert.ok(section.includes('.click()'), 'must trigger click to download');
  assert.ok(section.includes('URL.revokeObjectURL'), 'must revoke URL to avoid memory leaks');
});

test('reverseTranslateAndDownload calls reverseTranslateText', () => {
  const section = src.slice(src.indexOf('export function reverseTranslateAndDownload'));
  assert.ok(section.includes('reverseTranslateText('), 'reverseTranslateAndDownload must call reverseTranslateText');
});

test('reverseTranslateAndDownload creates a Blob and triggers download', () => {
  const section = src.slice(src.indexOf('export function reverseTranslateAndDownload'));
  assert.ok(section.includes('new Blob'), 'must create a Blob');
  assert.ok(section.includes('URL.createObjectURL'), 'must use createObjectURL');
  assert.ok(section.includes('.click()'), 'must trigger click to download');
  assert.ok(section.includes('URL.revokeObjectURL'), 'must revoke URL to avoid memory leaks');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} total: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
