'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const constants = read('site/web/constants.js');
const model = read('site/web/tc-review-command-model.js');
const qol = read('site/web/tc-review-qol.js');
const css = read('site/web/tc-review-qol.css');
const core = read('site/web/tc-review.js');

console.log('--- Review command-center presentation contract ---');

assert.ok(
  constants.includes('window.location.pathname.startsWith("/teacher/review")') &&
    constants.includes('/web/tc-review-qol.js?v=20260911-review-polish'),
  'Review must load the versioned command-center layer only on Review pages'
);
assert.ok(
  qol.includes('/web/tc-review-command-model.js?v=20260911-review-polish'),
  'Review command center must use its isolated read-only presentation model'
);

for (const marker of [
  'Review, score, return, and finalize student work.',
  'rc_tc_review_command_center_v1',
  'data-rv-status-card',
  'data-rv-folder',
  'data-rv-open-assignment',
  'data-rv-focus',
  'Review Tools',
  'Finalize & Next',
]) {
  assert.ok(qol.includes(marker), `missing approved Review presentation marker: ${marker}`);
}
console.log('✓ folder → assignment → student → focus workflow is present');

for (const marker of [
  'rvBtnAutoGrade',
  'rvBtnMarkAllReviewed',
  'rvBtnFinalizeAll',
  'rvBtnFinalizeAllReviewed',
  'rvBtnRevertAllReviewed',
]) {
  assert.ok(qol.includes(marker), `Review Tools must proxy existing ${marker} control`);
}
console.log('✓ Review Tools delegate to the existing bulk controls');

assert.ok(qol.includes('db.listSubmissions({ excludeFinalized: false })'));
assert.ok(qol.includes('db.listAssignmentInstances()'));
assert.ok(
  qol.includes('queueObserver.observe(legacy.queue, { childList: true });'),
  'Review queue observer must watch direct child replacements only'
);
assert.ok(model.includes("if (value === 'pending' || value === 'in_progress') return 'needs-review';"));
assert.ok(model.includes("status === 'reviewed'"));
assert.ok(model.includes("status === 'finalized'"));
console.log('✓ Review lifecycle grouping and direct-child observer guard are present');

for (const forbidden of [
  '.from(',
  'service_role',
  'teacher-review-save',
  'db.finalizeSubmission',
  'db.updateSubmissionAnswer',
]) {
  assert.ok(
    !qol.includes(forbidden),
    `presentation layer must not own the Review write path: ${forbidden}`
  );
}
console.log('✓ presentation layer does not reimplement grading/finalization writes');

for (const engineMarker of [
  'handleFinalizeSubmission',
  'handleReturnForRevision',
  'handleSaveGrade',
  'handleAutoGradeAll',
  'itemRequiresObjectiveComponents',
]) {
  assert.ok(core.includes(engineMarker), `existing Review engine marker must remain: ${engineMarker}`);
}
console.log('✓ existing grading, revision, AI, and IEP objective engine remains authoritative');

assert.ok(qol.includes('/web/tc-review-qol.css?v=20260911-review-polish'));
assert.ok(css.includes('.rv-qol-focus .rv-response-text'));
assert.ok(
  css.includes('rgba(128,198,165,.30)'),
  'approved written-response surface must use the soft green tint'
);
assert.ok(
  !/\.rv-qol-focus\s+\.rv-response-text[^}]*background\s*:\s*(?:#fff|white)/i.test(css),
  'written-response surface must not use a bright white background'
);
console.log('✓ approved soft-green written-response treatment is locked in');

console.log('--- Review polish regression contract ---');

const runtimeSource = model
  .replace(/export\s+const\s+/g, 'const ')
  .replace(/export\s+function\s+/g, 'function ');
const runtime = new Function(`${runtimeSource}\nreturn { normalizeAssignmentTitle, logicalAssignmentKey, makeRows, groupAssignments, assignmentRows, assignmentSummary };`)();

assert.strictEqual(
  runtime.normalizeAssignmentTitle('WEEK 2 — Seeker — Chapters 4–6 — S003', 'S003'),
  'WEEK 2 — Seeker — Chapters 4–6'
);
assert.strictEqual(
  runtime.normalizeAssignmentTitle('WEEK 2 — Transitional Skills — Reading Simple Job Postings for S004', 'S004'),
  'WEEK 2 — Transitional Skills — Reading Simple Job Postings'
);
console.log('✓ individualized student suffixes normalize conservatively');

const submissions = [
  { id: 'sub-3', instance_id: 'inst-3', assignment_id: 'asg-3', student_code: 'S003', review_status: 'finalized', submitted_at: '2026-09-10T15:00:00Z', answers: { q1: 'A' }, score_total: 100 },
  { id: 'sub-4', instance_id: 'inst-4', assignment_id: 'asg-4', student_code: 'S004', review_status: 'finalized', submitted_at: '2026-09-10T15:05:00Z', answers: { q1: 'A' }, score_total: 100 },
];
const instances = [
  { id: 'inst-3', assignment_id: 'asg-3', student_code: 'S003', due_at: '2026-09-10' },
  { id: 'inst-4', assignment_id: 'asg-4', student_code: 'S004', due_at: '2026-09-10' },
];
const assignments = [
  { id: 'asg-3', title: 'WEEK 2 — Seeker — Chapters 4–6 — S003', class_name: 'Language Arts 4 SC', due_at: '2026-09-10' },
  { id: 'asg-4', title: 'WEEK 2 — Seeker — Chapters 4–6 — S004', class_name: 'Language Arts 4 SC', due_at: '2026-09-10' },
];
const students = [{ code: 'S003' }, { code: 'S004' }];
const rows = runtime.makeRows(submissions, instances, assignments, students);

assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].assignmentId, rows[1].assignmentId, 'individualized siblings must share one logical assignment identity');
assert.notStrictEqual(rows[0].sourceAssignmentId, rows[1].sourceAssignmentId, 'physical assignment identities must remain distinct');
assert.strictEqual(rows[0].assignmentTitle, 'WEEK 2 — Seeker — Chapters 4–6');
const groups = runtime.groupAssignments(rows, rows, { className: 'All Classes', sort: 'recent' });
assert.strictEqual(groups.length, 1, 'individualized sibling assignments must collapse into one assignment card');
assert.strictEqual(groups[0].submitted, 2);
assert.strictEqual(groups[0].status, 'finalized');
assert.strictEqual(runtime.assignmentRows(rows, rows[0].assignmentId, { className: 'All Classes' }).length, 2);
assert.strictEqual(runtime.assignmentSummary(rows, rows[0].assignmentId, 'All Classes').title, 'WEEK 2 — Seeker — Chapters 4–6');
console.log('✓ individualized physical assignments collapse into assignment → student hierarchy without losing source IDs');

for (const marker of [
  'You’re caught up.',
  'Nothing is waiting to be finalized.',
  'group.status',
  'Ready to finalize',
  'row.sourceAssignmentId || null',
  'polishLegacyFocus(selected)',
  'rv-qol-zero-manual',
  'rv-qol-debug',
]) {
  assert.ok(qol.includes(marker), `missing Review polish behavior: ${marker}`);
}
assert.ok(
  qol.includes("await syncLegacyFilters({ status: 'all', className: state.className, assignmentId: null });"),
  'logical assignment view must not pass virtual IDs into the legacy assignment dropdown'
);
console.log('✓ logical hierarchy stays isolated from the legacy physical-assignment filter');

for (const selector of [
  '.rv-qol-selected .rv-btn-save-grade',
  '.rv-qol-selected .rv-btn-return',
  '.rv-qol-selected .rv-btn-finalize',
  '.rv-qol-selected .rv-btn-reopen',
  '.rv-qol-debug',
  '.rv-qol-zero-manual',
]) {
  assert.ok(css.includes(selector), `focused Review must retire duplicate/noisy legacy surface: ${selector}`);
}
console.log('✓ focused Review hides duplicate proxy actions, debug chrome, and empty manual-score noise');

assert.ok(
  qol.includes("if (shouldAdvance && updated && statusOf(updated) === 'finalized')"),
  'Finalize & Next must advance even when finalized submissions remain readable in the all-history data set'
);
console.log('✓ Finalize & Next handles retained finalized history correctly');

console.log('Review command-center contract PASS');