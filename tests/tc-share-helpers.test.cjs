// Unit tests for tc-share.js helpers
// Tests: isValidToken (shape validation), loadShareTokens resilience, escapeHtml-free patterns
// Run with: node tests/tc-share-helpers.test.cjs

'use strict';

const assert = require('assert');

// ── Inline mirrors of helpers from tc-share.js ────────────────────────────────

// Validate a share token object has the expected shape
function isValidToken(t) {
  return typeof t === 'object' && t !== null && !Array.isArray(t) &&
    typeof t.id === 'string' && typeof t.token === 'string';
}

// Simulate loadShareTokens with injected raw storage string
function loadShareTokens(rawStorageValue) {
  try {
    const parsed = rawStorageValue ? JSON.parse(rawStorageValue) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidToken);
  } catch (e) {
    return [];
  }
}

// Helper used by renderShareLinksTable to format dates
function formatDate(dateStr) {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Never';
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Test runner ───────────────────────────────────────────────────────────────

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

// ── isValidToken: reject malformed tokens ─────────────────────────────────────

console.log('\n--- isValidToken: reject malformed entries ---');

test('rejects null', () => {
  assert.strictEqual(isValidToken(null), false);
});

test('rejects undefined', () => {
  assert.strictEqual(isValidToken(undefined), false);
});

test('rejects string', () => {
  assert.strictEqual(isValidToken('some-string'), false);
});

test('rejects number', () => {
  assert.strictEqual(isValidToken(42), false);
});

test('rejects array', () => {
  assert.strictEqual(isValidToken(['id', 'token']), false);
});

test('rejects empty object (no id or token)', () => {
  assert.strictEqual(isValidToken({}), false);
});

test('rejects object with numeric id', () => {
  assert.strictEqual(isValidToken({ id: 123, token: 'abc' }), false);
});

test('rejects object with missing token', () => {
  assert.strictEqual(isValidToken({ id: 'share_1' }), false);
});

test('rejects object with missing id', () => {
  assert.strictEqual(isValidToken({ token: 'abc123' }), false);
});

test('rejects object with null id', () => {
  assert.strictEqual(isValidToken({ id: null, token: 'abc123' }), false);
});

test('rejects object with non-string token', () => {
  assert.strictEqual(isValidToken({ id: 'share_1', token: 99 }), false);
});

// ── isValidToken: accept well-formed tokens ───────────────────────────────────

console.log('\n--- isValidToken: accept well-formed tokens ---');

test('accepts minimal valid token (id + token as strings)', () => {
  assert.strictEqual(isValidToken({ id: 'share_1', token: 'abc123' }), true);
});

test('accepts full share token object', () => {
  const t = {
    id: 'share_1234567890',
    token: 'Xk9mPqRsTuVwXyZ01234567890123',
    student_code: 'STU01',
    student_name: 'Alice Smith',
    goal_codes: ['G1', 'G2'],
    created_at: new Date().toISOString(),
    expires_at: null,
    created_by: 'Teacher',
    entries: [],
    revoked: false
  };
  assert.strictEqual(isValidToken(t), true);
});

test('accepts token with extra unexpected fields', () => {
  assert.strictEqual(isValidToken({ id: 'share_x', token: 'tok', unexpected: true }), true);
});

test('accepts token with empty string id (still a string)', () => {
  // Empty string id is technically valid per the type check (string), 
  // even if semantically undesirable. Validates type-level only.
  assert.strictEqual(isValidToken({ id: '', token: 'tok' }), true);
});

// ── loadShareTokens: localStorage resilience ─────────────────────────────────

console.log('\n--- loadShareTokens: localStorage resilience ---');

test('returns empty array on null storage value', () => {
  const result = loadShareTokens(null);
  assert.deepStrictEqual(result, []);
});

test('returns empty array on empty storage string', () => {
  const result = loadShareTokens('');
  assert.deepStrictEqual(result, []);
});

test('returns empty array on corrupt JSON', () => {
  const result = loadShareTokens('{invalid json');
  assert.deepStrictEqual(result, []);
});

test('returns empty array when JSON is not an array', () => {
  const result = loadShareTokens('{"id":"share_1","token":"abc"}');
  assert.deepStrictEqual(result, []);
});

test('filters out null entries from array', () => {
  const raw = JSON.stringify([null, { id: 'share_1', token: 'tok1' }]);
  const result = loadShareTokens(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'share_1');
});

test('filters out string entries from array', () => {
  const raw = JSON.stringify(['not-a-token', { id: 'share_1', token: 'tok1' }]);
  const result = loadShareTokens(raw);
  assert.strictEqual(result.length, 1);
});

test('filters out tokens missing id field', () => {
  const raw = JSON.stringify([{ token: 'tok1' }, { id: 'share_1', token: 'tok2' }]);
  const result = loadShareTokens(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'share_1');
});

test('filters out tokens missing token field', () => {
  const raw = JSON.stringify([{ id: 'share_1' }, { id: 'share_2', token: 'tok2' }]);
  const result = loadShareTokens(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'share_2');
});

test('filters out tokens with numeric id', () => {
  const raw = JSON.stringify([{ id: 123, token: 'tok1' }, { id: 'share_2', token: 'tok2' }]);
  const result = loadShareTokens(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'share_2');
});

test('returns all valid tokens from a mixed array', () => {
  const tokens = [
    null,
    'string',
    42,
    { id: 'share_1', token: 'tok1' },
    { id: 'share_2', token: 'tok2', revoked: false },
    { token: 'tok3' }, // missing id
    { id: 123, token: 'tok4' } // numeric id
  ];
  const result = loadShareTokens(JSON.stringify(tokens));
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result.map(t => t.id), ['share_1', 'share_2']);
});

test('returns all items when all are valid', () => {
  const tokens = [
    { id: 'share_1', token: 'tok1' },
    { id: 'share_2', token: 'tok2' },
    { id: 'share_3', token: 'tok3' }
  ];
  const result = loadShareTokens(JSON.stringify(tokens));
  assert.strictEqual(result.length, 3);
});

// ── formatDate helper ─────────────────────────────────────────────────────────

console.log('\n--- formatDate helper ---');

test('returns "Never" for null input', () => {
  assert.strictEqual(formatDate(null), 'Never');
});

test('returns "Never" for undefined input', () => {
  assert.strictEqual(formatDate(undefined), 'Never');
});

test('returns "Never" for empty string', () => {
  assert.strictEqual(formatDate(''), 'Never');
});

test('returns "Never" for invalid date string', () => {
  assert.strictEqual(formatDate('not-a-date'), 'Never');
});

test('returns formatted string for a valid ISO date', () => {
  const result = formatDate('2026-03-01T12:00:00.000Z');
  assert.ok(typeof result === 'string' && result.length > 5);
  assert.notStrictEqual(result, 'Never');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
