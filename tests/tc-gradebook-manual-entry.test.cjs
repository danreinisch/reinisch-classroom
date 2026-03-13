// Unit tests for tc-gradebook.js manual assignment entry helpers
// Tests: validateManualAssignmentInputs — validation edge cases, acceptance, and output shape
// Run with: node tests/tc-gradebook-manual-entry.test.cjs

'use strict';

const assert = require('assert');

// ── Inline mirror of validateManualAssignmentInputs from tc-gradebook.js ─────

function validateManualAssignmentInputs({ title, studentCodes, total, score, date, category }) {
  if (!title || !title.trim()) return { valid: false, error: 'Assignment Title is required.' };
  if (!studentCodes || studentCodes.length === 0) return { valid: false, error: 'At least one Student Code is required.' };
  const totalNum = Number(total);
  if (!total && total !== 0) return { valid: false, error: 'Total Possible Points is required.' };
  if (!Number.isFinite(totalNum) || totalNum < 1) return { valid: false, error: 'Total Possible Points must be a number ≥ 1.' };
  const scoreNum = Number(score);
  if (score === '' || score === null || score === undefined) return { valid: false, error: 'Score Earned is required.' };
  if (!Number.isFinite(scoreNum) || scoreNum < 0) return { valid: false, error: 'Score Earned must be a number ≥ 0.' };
  if (scoreNum > totalNum) return { valid: false, error: 'Score Earned cannot exceed Total Possible Points.' };
  if (!date) return { valid: false, error: 'Date is required.' };
  return {
    valid: true,
    data: {
      title: title.trim(),
      studentCodes,
      total: totalNum,
      score: scoreNum,
      percent: Math.round((scoreNum / totalNum) * 100),
      date,
      category: category || 'assignment'
    }
  };
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

// ── Validation: reject invalid inputs ────────────────────────────────────────

console.log('\n--- validateManualAssignmentInputs: reject invalid inputs ---');

test('rejects empty title (empty string)', () => {
  const r = validateManualAssignmentInputs({ title: '', studentCodes: ['ABC'], total: '100', score: '85', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('title'));
});

test('rejects whitespace-only title', () => {
  const r = validateManualAssignmentInputs({ title: '   ', studentCodes: ['ABC'], total: '100', score: '85', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('title'));
});

test('rejects null title', () => {
  const r = validateManualAssignmentInputs({ title: null, studentCodes: ['ABC'], total: '100', score: '85', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('title'));
});

test('rejects empty student codes array', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: [], total: '100', score: '85', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('student'));
});

test('rejects null studentCodes', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: null, total: '100', score: '85', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('student'));
});

test('rejects total possible < 1 (zero)', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: ['ABC'], total: '0', score: '0', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('total'));
});

test('rejects total possible < 1 (negative)', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: ['ABC'], total: '-5', score: '0', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('total'));
});

test('rejects non-numeric total', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: ['ABC'], total: 'abc', score: '85', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('total'));
});

test('rejects Infinity as total', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: ['ABC'], total: Infinity, score: '85', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('total'));
});

test('rejects negative score', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: ['ABC'], total: '100', score: '-1', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('score'));
});

test('rejects score > total', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: ['ABC'], total: '100', score: '101', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('score') || r.error.toLowerCase().includes('exceed'));
});

test('rejects NaN score', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: ['ABC'], total: '100', score: 'NaN', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('score'));
});

test('rejects empty score string', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: ['ABC'], total: '100', score: '', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('score'));
});

test('rejects missing date', () => {
  const r = validateManualAssignmentInputs({ title: 'Quiz 1', studentCodes: ['ABC'], total: '100', score: '85', date: '', category: 'quiz' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.error.toLowerCase().includes('date'));
});

// ── Validation: accept valid inputs ──────────────────────────────────────────

console.log('\n--- validateManualAssignmentInputs: accept valid inputs ---');

test('accepts valid typical inputs', () => {
  const r = validateManualAssignmentInputs({ title: 'Chapter 5 Quiz', studentCodes: ['ABC123'], total: '100', score: '85', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, true);
  assert.ok(r.data);
});

test('produces correct output shape', () => {
  const r = validateManualAssignmentInputs({ title: '  Chapter 5 Quiz  ', studentCodes: ['ABC123', 'DEF456'], total: '50', score: '40', date: '2026-03-01', category: 'test' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.data.title, 'Chapter 5 Quiz'); // trimmed
  assert.strictEqual(r.data.total, 50);
  assert.strictEqual(r.data.score, 40);
  assert.strictEqual(r.data.percent, 80);
  assert.strictEqual(r.data.category, 'test');
  assert.strictEqual(r.data.date, '2026-03-01');
  assert.deepStrictEqual(r.data.studentCodes, ['ABC123', 'DEF456']);
});

test('score of 0 is valid', () => {
  const r = validateManualAssignmentInputs({ title: 'Participation', studentCodes: ['ABC'], total: '10', score: '0', date: '2026-03-01', category: 'participation' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.data.score, 0);
  assert.strictEqual(r.data.percent, 0);
});

test('score equal to total is valid (100%)', () => {
  const r = validateManualAssignmentInputs({ title: 'Perfect Score', studentCodes: ['ABC'], total: '100', score: '100', date: '2026-03-01', category: 'assignment' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.data.percent, 100);
});

test('defaults category to "assignment" when not provided', () => {
  const r = validateManualAssignmentInputs({ title: 'Hw 1', studentCodes: ['ABC'], total: '10', score: '8', date: '2026-03-01', category: '' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.data.category, 'assignment');
});

test('accepts string numbers for score and total', () => {
  const r = validateManualAssignmentInputs({ title: 'Test', studentCodes: ['ABC'], total: '20', score: '15', date: '2026-01-15', category: 'homework' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.data.total, 20);
  assert.strictEqual(r.data.score, 15);
  assert.strictEqual(r.data.percent, 75);
});

// ── Edge cases ────────────────────────────────────────────────────────────────

console.log('\n--- Edge cases ---');

test('very large score and total (both valid)', () => {
  const r = validateManualAssignmentInputs({ title: 'Mega Test', studentCodes: ['ABC'], total: '999999', score: '999998', date: '2026-03-01', category: 'test' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.data.percent, 100);
});

test('fractional total is valid (e.g., 2.5)', () => {
  const r = validateManualAssignmentInputs({ title: 'Short Quiz', studentCodes: ['ABC'], total: '2.5', score: '2', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.data.total, 2.5);
  assert.strictEqual(r.data.score, 2);
});

test('rejects fractional total below 1 (e.g., 0.5)', () => {
  const r = validateManualAssignmentInputs({ title: 'Tiny', studentCodes: ['ABC'], total: '0.5', score: '0.4', date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
});

test('multiple student codes accepted', () => {
  const r = validateManualAssignmentInputs({ title: 'Group Activity', studentCodes: ['ABC', 'DEF', 'GHI'], total: '100', score: '90', date: '2026-03-01', category: 'classwork' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.data.studentCodes.length, 3);
});

test('rejects Infinity score', () => {
  const r = validateManualAssignmentInputs({ title: 'Test', studentCodes: ['ABC'], total: '100', score: Infinity, date: '2026-03-01', category: 'quiz' });
  assert.strictEqual(r.valid, false);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
