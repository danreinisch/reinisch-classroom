// Unit tests for tc-work.js helper logic
// Tests: readDrafts() resilience, formatWhen() edge cases
// Run with: node tests/tc-work-helpers.test.cjs

'use strict';

const assert = require('assert');

// ── readDrafts helpers (mirror logic from tc-work.js) ────────────────────────

const STORAGE_KEY = 'rc_tc_work_drafts_v1';

// Simulate readDrafts() with a mock localStorage getter
function readDrafts(rawStorageValue) {
  try {
    const arr = rawStorageValue ? JSON.parse(rawStorageValue) : [];
    if (!Array.isArray(arr)) return [];
    // Filter out non-object entries (corrupted data, null, strings, numbers, nested arrays)
    return arr.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item));
  } catch (_) {
    return [];
  }
}

// ── formatWhen helper (mirror logic from tc-work.js) ─────────────────────────

function safeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function formatWhen(v) {
  const s = safeStr(v);
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s; // return raw string if unparseable
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  } catch (_) {
    return s;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// --- readDrafts() resilience ---
console.log('\n--- readDrafts() localStorage resilience ---');

test('valid drafts array is returned as-is', () => {
  const drafts = [{ id: 'd1', title: 'Test' }, { id: 'd2', title: 'Test 2' }];
  const result = readDrafts(JSON.stringify(drafts));
  assert.deepStrictEqual(result, drafts);
});

test('corrupted JSON returns empty array', () => {
  const result = readDrafts('{not valid json[[[');
  assert.deepStrictEqual(result, []);
});

test('null raw value returns empty array', () => {
  const result = readDrafts(null);
  assert.deepStrictEqual(result, []);
});

test('undefined raw value returns empty array', () => {
  const result = readDrafts(undefined);
  assert.deepStrictEqual(result, []);
});

test('empty string raw value returns empty array', () => {
  const result = readDrafts('');
  assert.deepStrictEqual(result, []);
});

test('non-array JSON (object) returns empty array', () => {
  const result = readDrafts('{"key": "value"}');
  assert.deepStrictEqual(result, []);
});

test('non-array JSON (string) returns empty array', () => {
  const result = readDrafts('"just a string"');
  assert.deepStrictEqual(result, []);
});

test('null entries in array are filtered out', () => {
  const raw = JSON.stringify([null, { id: 'd1', title: 'Valid' }, null]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'd1');
});

test('string entries in array are filtered out', () => {
  const raw = JSON.stringify(['foo', { id: 'd1' }, 'bar']);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'd1');
});

test('number entries in array are filtered out', () => {
  const raw = JSON.stringify([42, { id: 'd1' }, 99]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
});

test('nested arrays in array are filtered out', () => {
  const raw = JSON.stringify([[1, 2, 3], { id: 'd1' }]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'd1');
});

test('boolean entries in array are filtered out', () => {
  const raw = JSON.stringify([true, false, { id: 'd1' }]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
});

test('mixed valid and invalid entries — only valid objects preserved', () => {
  const raw = JSON.stringify([
    { id: 'd1', title: 'Good' },
    null,
    'bad string',
    42,
    [1, 2],
    { id: 'd2', title: 'Also Good' }
  ]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].id, 'd1');
  assert.strictEqual(result[1].id, 'd2');
});

test('empty array returns empty array', () => {
  const result = readDrafts('[]');
  assert.deepStrictEqual(result, []);
});

// --- formatWhen() ---
console.log('\n--- formatWhen() helper ---');

test('null returns fallback "—"', () => {
  assert.strictEqual(formatWhen(null), '—');
});

test('undefined returns fallback "—"', () => {
  assert.strictEqual(formatWhen(undefined), '—');
});

test('empty string returns fallback "—"', () => {
  assert.strictEqual(formatWhen(''), '—');
});

test('valid ISO date string returns formatted string', () => {
  const result = formatWhen('2025-06-15T10:30:00Z');
  assert.ok(typeof result === 'string' && result.length > 0, 'should return non-empty string');
  assert.ok(result !== '—', 'should not return fallback');
  assert.ok(!result.includes('NaN'), 'should not contain NaN');
});

test('invalid date string returns the raw input unchanged', () => {
  const result = formatWhen('not-a-date');
  // Since Date('not-a-date') is invalid, it returns the raw string
  assert.strictEqual(result, 'not-a-date');
});

test('numeric timestamp string is handled', () => {
  const result = formatWhen('1749000000000');
  // This may parse as a valid date depending on engine; should not throw
  assert.ok(typeof result === 'string');
  assert.ok(!result.includes('NaN'));
});

test('date-only string "2025-01-01" is handled', () => {
  const result = formatWhen('2025-01-01');
  assert.ok(typeof result === 'string' && result.length > 0);
  assert.ok(result !== '—', 'should not return fallback for valid date');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('✗ Some tc-work-helpers tests failed!');
  process.exit(1);
} else {
  console.log('✓ All tc-work-helpers tests passed!');
}
