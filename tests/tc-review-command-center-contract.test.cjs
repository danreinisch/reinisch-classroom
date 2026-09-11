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
    constants.includes('/web/tc-review-qol.js?v=20260911-review-command-center'),
  'Review must load the versioned command-center layer only on Review pages'
);
assert.ok(
  qol.includes('/web/tc-review-command-model.js?v=20260911-review-command-center'),
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

assert.ok(qol.includes('/web/tc-review-qol.css?v=20260911-review-command-center'));
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

console.log('Review command-center contract PASS');
