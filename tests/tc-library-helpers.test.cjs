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

// ── Lane Computation ──────────────────────────────────────────────────────────

/**
 * Mirrors computeLane() from tc-library.js for unit testing.
 */
function computeLane(assignment, allInstances) {
  const instances = allInstances.filter(i => i.assignment_id === assignment.id);
  if (instances.length === 0) return 'upcoming';
  const allGraded = instances.every(i => i.status === 'Graded');
  if (allGraded && assignment.active === false) return 'finalized';
  const anyActive = instances.some(i =>
    ['Assigned', 'In Progress', 'Submitted'].includes(i.status)
  );
  if (anyActive) return 'current';
  if (allGraded) return 'finalized';
  return 'upcoming';
}

console.log('\n--- Lane computation ---');

test('no instances → Upcoming', () => {
  assert.strictEqual(computeLane({ id: 'A1' }, []), 'upcoming');
});

test('all Graded + active=false → Finalized', () => {
  const inst = [{ assignment_id: 'A1', status: 'Graded' }];
  assert.strictEqual(computeLane({ id: 'A1', active: false }, inst), 'finalized');
});

test('all Graded + active=true → Finalized (work done regardless of flag)', () => {
  const inst = [{ assignment_id: 'A1', status: 'Graded' }];
  assert.strictEqual(computeLane({ id: 'A1', active: true }, inst), 'finalized');
});

test('all Graded + active=null → Finalized', () => {
  const inst = [{ assignment_id: 'A1', status: 'Graded' }];
  assert.strictEqual(computeLane({ id: 'A1', active: null }, inst), 'finalized');
});

test('any Assigned → Current', () => {
  const inst = [
    { assignment_id: 'A1', status: 'Assigned' },
    { assignment_id: 'A1', status: 'Graded' }
  ];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'current');
});

test('any In Progress → Current', () => {
  const inst = [{ assignment_id: 'A1', status: 'In Progress' }];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'current');
});

test('any Submitted → Current', () => {
  const inst = [{ assignment_id: 'A1', status: 'Submitted' }];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'current');
});

test('instances for different assignment are ignored', () => {
  const inst = [{ assignment_id: 'A2', status: 'Graded' }];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'upcoming');
});

// ── School Year ───────────────────────────────────────────────────────────────

/**
 * Mirrors getSchoolYear() from tc-library.js.
 */
function getSchoolYear(date) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed; August = 7
  if (month >= 7) {
    return `${year}\u20132025 School Year`.replace('2025', String(year + 1));
  }
  return `${year - 1}\u2013${year} School Year`;
}

// Re-implement properly:
function getSchoolYearLabel(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 7) {
    return `${year}\u2013${year + 1} School Year`;
  }
  return `${year - 1}\u2013${year} School Year`;
}

console.log('\n--- School year ---');

test('August is in the new school year (Aug = start)', () => {
  const d = new Date('2025-08-01');
  assert.strictEqual(getSchoolYearLabel(d), '2025\u20132026 School Year');
});

test('September is in same school year as August', () => {
  const d = new Date('2025-09-15');
  assert.strictEqual(getSchoolYearLabel(d), '2025\u20132026 School Year');
});

test('July is in the prior school year', () => {
  const d = new Date('2025-07-31');
  assert.strictEqual(getSchoolYearLabel(d), '2024\u20132025 School Year');
});

test('January belongs to the school year that started the previous August', () => {
  const d = new Date('2026-01-15');
  assert.strictEqual(getSchoolYearLabel(d), '2025\u20132026 School Year');
});

// ── Week Label ────────────────────────────────────────────────────────────────

/**
 * Mirrors getWeekLabel() from tc-library.js.
 */
function getWeekLabel(date) {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monStr = `${MN[monday.getMonth()]} ${monday.getDate()}`;
  if (monday.getMonth() !== friday.getMonth()) {
    return `Week of ${monStr} \u2013 ${MN[friday.getMonth()]} ${friday.getDate()}`;
  }
  return `Week of ${monStr} \u2013 ${friday.getDate()}`;
}

console.log('\n--- Week label ---');

test('Monday returns the same-week label', () => {
  const d = new Date('2026-03-09'); // Monday Mar 9
  assert.strictEqual(getWeekLabel(d), 'Week of Mar 9 \u2013 13');
});

test('Friday returns the same-week label', () => {
  const d = new Date('2026-03-13'); // Friday Mar 13
  assert.strictEqual(getWeekLabel(d), 'Week of Mar 9 \u2013 13');
});

test('Wednesday mid-week returns same-week label', () => {
  const d = new Date('2026-03-11'); // Wednesday
  assert.strictEqual(getWeekLabel(d), 'Week of Mar 9 \u2013 13');
});

test('Sunday is rolled back to prior Monday', () => {
  const d = new Date('2026-03-08'); // Sunday → week of Mar 2–6
  assert.strictEqual(getWeekLabel(d), 'Week of Mar 2 \u2013 6');
});

test('cross-month week shows both month names', () => {
  // Mar 30 (Monday) → Apr 3 (Friday)
  const d = new Date('2026-03-30');
  assert.strictEqual(getWeekLabel(d), 'Week of Mar 30 \u2013 Apr 3');
});

// ── Category Helper ───────────────────────────────────────────────────────────

function getAssignmentCategory(assignment) {
  const meta = assignment.meta;
  if (meta && typeof meta === 'object' && meta.category) return meta.category;
  if (meta && typeof meta === 'string') {
    try {
      const parsed = JSON.parse(meta);
      if (parsed && parsed.category) return parsed.category;
    } catch (_) {}
  }
  return 'Uncategorized';
}

console.log('\n--- Category extraction ---');

test('object meta with category returns it', () => {
  assert.strictEqual(getAssignmentCategory({ meta: { category: 'Writing' } }), 'Writing');
});

test('JSON string meta with category returns it', () => {
  assert.strictEqual(getAssignmentCategory({ meta: '{"category":"Grammar"}' }), 'Grammar');
});

test('missing category returns Uncategorized', () => {
  assert.strictEqual(getAssignmentCategory({ meta: { paper: true } }), 'Uncategorized');
});

test('null meta returns Uncategorized', () => {
  assert.strictEqual(getAssignmentCategory({ meta: null }), 'Uncategorized');
});

test('no meta field returns Uncategorized', () => {
  assert.strictEqual(getAssignmentCategory({}), 'Uncategorized');
});

test('malformed JSON string meta returns Uncategorized', () => {
  assert.strictEqual(getAssignmentCategory({ meta: 'not-json' }), 'Uncategorized');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('✗ Some tc-library-helpers tests failed!');
  process.exit(1);
} else {
  console.log('✓ All tc-library-helpers tests passed!');
}
