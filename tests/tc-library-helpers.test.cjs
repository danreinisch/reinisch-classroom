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
  if (instances.length === 0) {
    if (assignment.active === false) return 'finalized';
    if (assignment.finalized_at) return 'finalized';
    return 'upcoming';
  }
  // Per-assignment: if the teacher marked the assignment inactive, it's finalized
  if (assignment.active === false) return 'finalized';
  // Explicitly finalized via timestamp (e.g. teacher pressed "Finalize")
  if (assignment.finalized_at) return 'finalized';
  const anyActive = instances.some(i =>
    ['Assigned', 'In Progress', 'Submitted'].includes(i.status)
  );
  if (anyActive) return 'current';
  const allTerminal = instances.every(i => i.status === 'Graded' || i.status === 'Reviewed');
  if (allTerminal) return 'finalized';
  return 'upcoming';
}

console.log('\n--- Lane computation ---');

test('no instances → Upcoming', () => {
  assert.strictEqual(computeLane({ id: 'A1' }, []), 'upcoming');
});

test('no instances + active=false → Finalized (archived before issue)', () => {
  assert.strictEqual(computeLane({ id: 'A1', active: false }, []), 'finalized');
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

test('active=false with mixed instance statuses → Finalized (per-assignment)', () => {
  const inst = [
    { assignment_id: 'A1', status: 'Assigned' },
    { assignment_id: 'A1', status: 'In Progress' },
    { assignment_id: 'A1', status: 'Reviewed' }
  ];
  assert.strictEqual(computeLane({ id: 'A1', active: false }, inst), 'finalized');
});

test('all Reviewed → Finalized', () => {
  const inst = [
    { assignment_id: 'A1', status: 'Reviewed' },
    { assignment_id: 'A1', status: 'Reviewed' }
  ];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'finalized');
});

test('mix of Graded and Reviewed → Finalized', () => {
  const inst = [
    { assignment_id: 'A1', status: 'Graded' },
    { assignment_id: 'A1', status: 'Reviewed' }
  ];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'finalized');
});

test('finalized_at present + no instances → Finalized', () => {
  assert.strictEqual(
    computeLane({ id: 'A1', finalized_at: '2025-01-01T00:00:00Z' }, []),
    'finalized'
  );
});

test('finalized_at present + active instances → still Finalized (timestamp wins)', () => {
  const inst = [
    { assignment_id: 'A1', status: 'Submitted' },
    { assignment_id: 'A1', status: 'In Progress' }
  ];
  assert.strictEqual(
    computeLane({ id: 'A1', finalized_at: '2025-01-01T00:00:00Z' }, inst),
    'finalized'
  );
});

test('finalized_at present + active=true → Finalized (timestamp wins over active flag)', () => {
  const inst = [{ assignment_id: 'A1', status: 'Assigned' }];
  assert.strictEqual(
    computeLane({ id: 'A1', active: true, finalized_at: '2025-03-01T12:00:00Z' }, inst),
    'finalized'
  );
});

test('finalized_at null → not finalized by that field', () => {
  const inst = [{ assignment_id: 'A1', status: 'Assigned' }];
  assert.strictEqual(
    computeLane({ id: 'A1', finalized_at: null }, inst),
    'current'
  );
});

test('finalized_at empty string → not finalized by that field', () => {
  const inst = [{ assignment_id: 'A1', status: 'Assigned' }];
  assert.strictEqual(
    computeLane({ id: 'A1', finalized_at: '' }, inst),
    'current'
  );
});

test('Reviewed with active instances → Current', () => {
  const inst = [
    { assignment_id: 'A1', status: 'Reviewed' },
    { assignment_id: 'A1', status: 'Assigned' }
  ];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'current');
});

// ── Assignment Stats ──────────────────────────────────────────────────────────

/**
 * Mirrors getAssignmentStats() from tc-library.js for unit testing.
 */
function getAssignmentStats(assignment, allInstances, allSubmissions) {
  const instances = allInstances.filter(i => i.assignment_id === assignment.id);
  const instanceIds = new Set(instances.map(i => i.id));
  const subs = allSubmissions.filter(s => {
    if (s.assignment_instances) return instanceIds.has(s.assignment_instances.id);
    return instanceIds.has(s.instance_id);
  });
  const scores = subs
    .map(s => s.score_total)
    .filter(s => s != null && !isNaN(Number(s)))
    .map(Number);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
  const gradedCount = instances.filter(i => i.status === 'Graded' || i.status === 'Reviewed').length;
  const submittedCount = instances.filter(i => i.status === 'Submitted').length;
  return { avgScore, studentCount: instances.length, gradedCount, submittedCount, scores };
}

console.log('\n--- Assignment stats ---');

test('gradedCount includes Graded instances', () => {
  const instances = [{ id: 'I1', assignment_id: 'A1', status: 'Graded' }];
  const { gradedCount } = getAssignmentStats({ id: 'A1' }, instances, []);
  assert.strictEqual(gradedCount, 1);
});

test('gradedCount includes Reviewed instances', () => {
  const instances = [{ id: 'I1', assignment_id: 'A1', status: 'Reviewed' }];
  const { gradedCount } = getAssignmentStats({ id: 'A1' }, instances, []);
  assert.strictEqual(gradedCount, 1);
});

test('gradedCount includes both Graded and Reviewed', () => {
  const instances = [
    { id: 'I1', assignment_id: 'A1', status: 'Graded' },
    { id: 'I2', assignment_id: 'A1', status: 'Reviewed' },
    { id: 'I3', assignment_id: 'A1', status: 'Submitted' }
  ];
  const { gradedCount } = getAssignmentStats({ id: 'A1' }, instances, []);
  assert.strictEqual(gradedCount, 2);
});

test('avgScore is computed from submissions with score_total', () => {
  const instances = [
    { id: 'I1', assignment_id: 'A1', status: 'Reviewed' },
    { id: 'I2', assignment_id: 'A1', status: 'Reviewed' }
  ];
  const subs = [
    { instance_id: 'I1', score_total: 90 },
    { instance_id: 'I2', score_total: 80 }
  ];
  const { avgScore } = getAssignmentStats({ id: 'A1' }, instances, subs);
  assert.strictEqual(avgScore, 85);
});

test('avgScore is null when no scored submissions', () => {
  const instances = [{ id: 'I1', assignment_id: 'A1', status: 'Reviewed' }];
  const { avgScore } = getAssignmentStats({ id: 'A1' }, instances, []);
  assert.strictEqual(avgScore, null);
});

// ── School Year ───────────────────────────────────────────────────────────────

/**
 * Mirrors getSchoolYear() from tc-library.js.
 */
function getSchoolYearLabel(date) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed; August = 7
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

// ── updateAssignment local logic ──────────────────────────────────────────────

/**
 * Mirror of the local updateAssignment() logic from data-adapter.js.
 * Takes a mutable array of assignments, an id, and updates object.
 * Returns the updated assignment or throws if not found.
 */
function updateAssignmentLocal(arr, id, updates) {
  const idx = arr.findIndex(a => a.id === id);
  if (idx === -1) throw new Error('Assignment not found');
  const originalMeta = arr[idx].meta;
  arr[idx] = { ...arr[idx], ...updates };
  // For meta, merge rather than replace
  if (updates.meta) {
    arr[idx].meta = { ...(originalMeta || {}), ...updates.meta };
  }
  return arr[idx];
}

console.log('\n--- updateAssignment local logic ---');

test('updates a scalar field on an existing assignment', () => {
  const arr = [{ id: 'A1', title: 'Old Title', meta: {} }];
  const result = updateAssignmentLocal(arr, 'A1', { title: 'New Title' });
  assert.strictEqual(result.title, 'New Title');
  assert.strictEqual(arr[0].title, 'New Title');
});

test('throws when assignment id is not found', () => {
  const arr = [{ id: 'A1', title: 'Exists' }];
  assert.throws(() => updateAssignmentLocal(arr, 'MISSING', { title: 'X' }), /Assignment not found/);
});

test('preserves all other fields when updating meta', () => {
  // Verifies that updating one meta field (e.g. notes) does not clobber existing fields
  const arr = [{ id: 'A5', title: 'Keep Me', type: 'file', meta: { foo: 'bar' } }];
  updateAssignmentLocal(arr, 'A5', { meta: { notes: 'hello' } });
  assert.strictEqual(arr[0].title, 'Keep Me');
  assert.strictEqual(arr[0].type, 'file');
  assert.strictEqual(arr[0].meta.foo, 'bar');
  assert.strictEqual(arr[0].meta.notes, 'hello');
});

// ── unit_id / section_id / tags fields ───────────────────────────────────────

console.log('\n--- unit_id / section_id / tags handling ---');

test('createAssignment-like spread includes unit_id, section_id, tags', () => {
  // Mirrors the local createAssignment spread: { id, ...a, school_year, created_at }
  const a = {
    title: 'Quiz 1',
    type: 'html',
    unit_id: 'lost-in-kragdon-ah',
    section_id: 'language-arts',
    tags: ['quiz', 'vocabulary']
  };
  const id = 'ATEST01';
  const entry = { id, ...a, school_year: '2025-2026', created_at: new Date().toISOString() };
  assert.strictEqual(entry.unit_id, 'lost-in-kragdon-ah');
  assert.strictEqual(entry.section_id, 'language-arts');
  assert.deepStrictEqual(entry.tags, ['quiz', 'vocabulary']);
});

test('createAssignment-like spread preserves null unit_id', () => {
  const a = { title: 'Uncategorized Assignment', type: 'html', unit_id: null, section_id: null, tags: [] };
  const entry = { id: 'ATEST02', ...a };
  assert.strictEqual(entry.unit_id, null);
  assert.strictEqual(entry.section_id, null);
  assert.deepStrictEqual(entry.tags, []);
});

test('updateAssignment replaces unit_id', () => {
  const arr = [{ id: 'A1', title: 'Quiz', unit_id: null, section_id: null, tags: [] }];
  const result = updateAssignmentLocal(arr, 'A1', { unit_id: 'lost-in-kragdon-ah', section_id: 'language-arts' });
  assert.strictEqual(result.unit_id, 'lost-in-kragdon-ah');
  assert.strictEqual(result.section_id, 'language-arts');
});

test('updateAssignment replaces tags (does not merge)', () => {
  const arr = [{ id: 'A1', title: 'Quiz', unit_id: null, tags: ['quiz', 'old-tag'] }];
  const result = updateAssignmentLocal(arr, 'A1', { tags: ['review'] });
  assert.deepStrictEqual(result.tags, ['review'], 'tags should be fully replaced, not merged');
});

test('updateAssignment can clear tags to empty array', () => {
  const arr = [{ id: 'A1', title: 'Quiz', tags: ['quiz', 'vocabulary'] }];
  updateAssignmentLocal(arr, 'A1', { tags: [] });
  assert.deepStrictEqual(arr[0].tags, []);
});

test('updateAssignment unit_id/section_id does not affect meta (meta still merges)', () => {
  const arr = [{ id: 'A1', title: 'Quiz', meta: { html_src: '<p>Test</p>' }, unit_id: null, tags: [] }];
  updateAssignmentLocal(arr, 'A1', { unit_id: 'life-skills', meta: { notes: 'updated' } });
  assert.strictEqual(arr[0].unit_id, 'life-skills');
  assert.strictEqual(arr[0].meta.html_src, '<p>Test</p>', 'meta.html_src should be preserved via merge');
  assert.strictEqual(arr[0].meta.notes, 'updated');
});

// ── relDate helper ────────────────────────────────────────────────────────────

/**
 * Mirrors relDate() from tc-library.js for unit testing.
 */
function relDate(iso) {
  if (iso == null) return 'Unknown';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 'just now';
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) { const w = Math.floor(days / 7); return `${w} week${w !== 1 ? 's' : ''} ago`; }
  if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m !== 1 ? 's' : ''} ago`; }
  const y = Math.floor(days / 365);
  return `${y} year${y !== 1 ? 's' : ''} ago`;
}

function daysAgoISO(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString();
}

console.log('\n--- relDate helper ---');

test('null returns Unknown', () => {
  assert.strictEqual(relDate(null), 'Unknown');
});

test('undefined returns Unknown', () => {
  assert.strictEqual(relDate(undefined), 'Unknown');
});

test('invalid date string returns Unknown', () => {
  assert.strictEqual(relDate('not-a-date'), 'Unknown');
});

test('future date returns just now', () => {
  const future = new Date(Date.now() + 3600000).toISOString();
  assert.strictEqual(relDate(future), 'just now');
});

test('0 days ago returns today', () => {
  assert.strictEqual(relDate(daysAgoISO(0)), 'today');
});

test('1 day ago returns yesterday', () => {
  assert.strictEqual(relDate(daysAgoISO(1)), 'yesterday');
});

test('3 days ago returns "3 days ago"', () => {
  assert.strictEqual(relDate(daysAgoISO(3)), '3 days ago');
});

test('6 days ago returns "6 days ago"', () => {
  assert.strictEqual(relDate(daysAgoISO(6)), '6 days ago');
});

test('7 days ago returns "1 week ago"', () => {
  assert.strictEqual(relDate(daysAgoISO(7)), '1 week ago');
});

test('14 days ago returns "2 weeks ago"', () => {
  assert.strictEqual(relDate(daysAgoISO(14)), '2 weeks ago');
});

test('29 days ago returns weeks ago (not months)', () => {
  const result = relDate(daysAgoISO(29));
  assert.ok(result.includes('week'), `expected weeks, got "${result}"`);
});

test('30 days ago returns "1 month ago"', () => {
  assert.strictEqual(relDate(daysAgoISO(30)), '1 month ago');
});

test('90 days ago returns "3 months ago"', () => {
  assert.strictEqual(relDate(daysAgoISO(90)), '3 months ago');
});

test('364 days ago returns months ago (not years)', () => {
  const result = relDate(daysAgoISO(364));
  assert.ok(result.includes('month'), `expected months, got "${result}"`);
});

test('365 days ago returns "1 year ago"', () => {
  assert.strictEqual(relDate(daysAgoISO(365)), '1 year ago');
});

test('730 days ago returns "2 years ago"', () => {
  assert.strictEqual(relDate(daysAgoISO(730)), '2 years ago');
});


// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('✗ Some tc-library-helpers tests failed!');
  process.exit(1);
} else {
  console.log('✓ All tc-library-helpers tests passed!');
}
