// Unit tests for tc-library.js helper logic
// Tests: score validation, score percentage calculation, file type/size validation
// Run with: node tests/tc-library-helpers.test.cjs

'use strict';

const assert = require('assert');

// ── Score validation helpers (mirror logic from uploadPaperAssignment) ────────

/**
 * Validates the score fields from the paper upload form.
 * Returns null if valid, or an error string if invalid.
 */
function validateScoreFields(scoreEarned, totalPossible, studentCode) {
  if (scoreEarned === null) return null; // no score provided — valid

  if (!studentCode || !String(studentCode).trim()) {
    return 'Student Code is required when entering a grade.';
  }
  if (!Number.isFinite(scoreEarned) || scoreEarned < 0) {
    return 'Score Earned must be a non-negative number.';
  }
  if (!Number.isFinite(totalPossible) || totalPossible < 1) {
    return 'Total Possible must be at least 1.';
  }
  if (scoreEarned > totalPossible) {
    return 'Score cannot exceed total possible points.';
  }
  return null;
}

// ── Score percentage calculation ──────────────────────────────────────────────

function calcScorePercent(earned, total) {
  return Math.round((earned / total) * 100);
}

// ── File validation helpers ───────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png',
  'image/heic', 'image/heif', 'image/gif', 'image/webp'
]);
const ALLOWED_EXTS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.gif', '.webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function isFileTypeAllowed(mimeType, filename) {
  if (ALLOWED_TYPES.has(mimeType)) return true;
  const ext = '.' + (filename.split('.').pop() || '').toLowerCase();
  return ALLOWED_EXTS.has(ext);
}

function isFileSizeAllowed(sizeBytes) {
  return sizeBytes <= MAX_FILE_SIZE;
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

// --- Score validation ---
console.log('\n--- Score validation ---');

test('null score (no grade) is accepted', () => {
  assert.strictEqual(validateScoreFields(null, 100, ''), null);
  assert.strictEqual(validateScoreFields(null, 100, 'S001'), null);
});

test('score without student code is rejected', () => {
  const err = validateScoreFields(85, 100, '');
  assert.ok(err, 'expected error');
  assert.ok(err.toLowerCase().includes('student code'), `unexpected error: ${err}`);
});

test('score > total_possible is rejected', () => {
  const err = validateScoreFields(101, 100, 'S001');
  assert.ok(err, 'expected error');
  assert.ok(err.toLowerCase().includes('exceed'), `unexpected error: ${err}`);
});

test('score equal to total_possible is accepted', () => {
  assert.strictEqual(validateScoreFields(100, 100, 'S001'), null);
});

test('score = 0 is accepted', () => {
  assert.strictEqual(validateScoreFields(0, 100, 'S001'), null);
});

test('negative score is rejected', () => {
  const err = validateScoreFields(-1, 100, 'S001');
  assert.ok(err, 'expected error');
  assert.ok(err.toLowerCase().includes('non-negative') || err.toLowerCase().includes('score'), `unexpected: ${err}`);
});

test('non-numeric score (NaN) is rejected', () => {
  const err = validateScoreFields(NaN, 100, 'S001');
  assert.ok(err, 'expected error');
});

test('Infinity score is rejected', () => {
  const err = validateScoreFields(Infinity, 100, 'S001');
  assert.ok(err, 'expected error');
});

test('total_possible = 0 is rejected', () => {
  const err = validateScoreFields(0, 0, 'S001');
  assert.ok(err, 'expected error');
  assert.ok(err.toLowerCase().includes('total') || err.toLowerCase().includes('possible'), `unexpected: ${err}`);
});

test('total_possible < 1 is rejected', () => {
  const err = validateScoreFields(0, 0.5, 'S001');
  assert.ok(err, 'expected error');
});

// --- Score percentage calculation ---
console.log('\n--- Score percentage calculation ---');

test('0 / 100 = 0%', () => {
  assert.strictEqual(calcScorePercent(0, 100), 0);
});

test('100 / 100 = 100%', () => {
  assert.strictEqual(calcScorePercent(100, 100), 100);
});

test('85 / 100 = 85%', () => {
  assert.strictEqual(calcScorePercent(85, 100), 85);
});

test('7 / 10 = 70%', () => {
  assert.strictEqual(calcScorePercent(7, 10), 70);
});

test('1 / 3 rounds to 33%', () => {
  assert.strictEqual(calcScorePercent(1, 3), 33);
});

test('2 / 3 rounds to 67%', () => {
  assert.strictEqual(calcScorePercent(2, 3), 67);
});

test('50 / 200 = 25%', () => {
  assert.strictEqual(calcScorePercent(50, 200), 25);
});

test('rounding: 0.5 rounds up', () => {
  // 1/2 = 0.5 → Math.round(0.5) = 1
  assert.strictEqual(calcScorePercent(1, 2), 50);
});

// --- File type validation ---
console.log('\n--- File type validation ---');

test('PDF by MIME type is allowed', () => {
  assert.ok(isFileTypeAllowed('application/pdf', 'homework.pdf'));
});

test('JPEG by MIME type is allowed', () => {
  assert.ok(isFileTypeAllowed('image/jpeg', 'scan.jpg'));
});

test('PNG by extension fallback is allowed', () => {
  assert.ok(isFileTypeAllowed('', 'scan.png'));
});

test('HEIC by extension is allowed', () => {
  assert.ok(isFileTypeAllowed('', 'photo.heic'));
});

test('HEIF by extension is allowed', () => {
  assert.ok(isFileTypeAllowed('', 'photo.heif'));
});

test('GIF by extension is allowed', () => {
  assert.ok(isFileTypeAllowed('image/gif', 'anim.gif'));
});

test('WEBP is allowed', () => {
  assert.ok(isFileTypeAllowed('image/webp', 'img.webp'));
});

test('MP4 video is rejected', () => {
  assert.ok(!isFileTypeAllowed('video/mp4', 'video.mp4'));
});

test('EXE is rejected', () => {
  assert.ok(!isFileTypeAllowed('application/octet-stream', 'malware.exe'));
});

test('HTML file is rejected', () => {
  assert.ok(!isFileTypeAllowed('text/html', 'page.html'));
});

// --- File size validation ---
console.log('\n--- File size validation ---');

test('1 byte is accepted', () => {
  assert.ok(isFileSizeAllowed(1));
});

test('exactly 10 MB is accepted', () => {
  assert.ok(isFileSizeAllowed(10 * 1024 * 1024));
});

test('10 MB + 1 byte is rejected', () => {
  assert.ok(!isFileSizeAllowed(10 * 1024 * 1024 + 1));
});

test('0 bytes is accepted', () => {
  assert.ok(isFileSizeAllowed(0));
});

test('5 MB is accepted', () => {
  assert.ok(isFileSizeAllowed(5 * 1024 * 1024));
});

test('20 MB is rejected', () => {
  assert.ok(!isFileSizeAllowed(20 * 1024 * 1024));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('✗ Some tc-library-helpers tests failed!');
  process.exit(1);
} else {
  console.log('✓ All tc-library-helpers tests passed!');
}
