'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

console.log(
  'Running assignment evidence reconciliation contract tests...\n'
);

const studentSubmit =
  read('netlify/functions/student-submit-answer.js');

const teacherProgress =
  read('netlify/functions/teacher-goal-progress.js');

const studentGoalDataPoints =
  read('netlify/functions/student-goal-data-points.js');

const dataAdapter =
  read('site/web/data-adapter.js');

/* -------------------------------------------------------------------------- */
/* Shared server reconciliation foundation                                    */
/* -------------------------------------------------------------------------- */

const helperPath = path.join(
  root,
  'netlify',
  'functions',
  '_lib',
  'assignment-evidence-reconciliation.js'
);

assert.ok(
  fs.existsSync(helperPath),
  'Slice 3 must add one shared server reconciliation helper'
);

const helper = read(
  'netlify/functions/_lib/assignment-evidence-reconciliation.js'
);

assert.ok(
  helper.includes('assignment_instance_id'),
  'reconciliation must be assignment-provenance scoped'
);

assert.ok(
  helper.includes('goal_id'),
  'parent checkpoint reconciliation must include goal_id'
);

assert.ok(
  helper.includes('item_id'),
  'parent item evidence reconciliation must include item_id'
);

assert.ok(
  helper.includes("source === 'assignment'") ||
    helper.includes("source !== 'assignment'"),
  'reconciliation must explicitly distinguish assignment evidence'
);

assert.ok(
  /method:\s*['"]PATCH['"]/.test(helper),
  'existing assignment evidence must be updated rather than appended'
);

assert.ok(
  /method:\s*['"]POST['"]/.test(helper),
  'a missing assignment evidence identity must still be inserted'
);

assert.ok(
  !/\bDELETE\b/i.test(helper),
  'Slice 3 reconciliation must not delete historical duplicate evidence rows'
);

console.log(
  '✓ shared server reconciliation updates existing identities without historical deletion'
);

/* -------------------------------------------------------------------------- */
/* Student auto-scoring path                                                  */
/* -------------------------------------------------------------------------- */

assert.ok(
  studentSubmit.includes(
    "require('./_lib/assignment-evidence-reconciliation')"
  ),
  'student submission must use the shared assignment evidence reconciler'
);

assert.ok(
  studentSubmit.includes(
    'reconcileAssignmentGoalProgress'
  ),
  'student submission must reconcile parent assignment checkpoints'
);

assert.ok(
  studentSubmit.includes(
    'reconcileAssignmentGoalDataPoints'
  ),
  'student submission must reconcile per-item parent evidence'
);

const oldStudentProgressPost =
  'fetch(`${SUPABASE_URL}/rest/v1/goal_progress`';

const oldStudentDataPointPost =
  'fetch(`${SUPABASE_URL}/rest/v1/goal_data_points`';

assert.ok(
  !studentSubmit.includes(oldStudentProgressPost),
  'student submission must no longer directly append goal_progress'
);

assert.ok(
  !studentSubmit.includes(oldStudentDataPointPost),
  'student submission must no longer directly append goal_data_points'
);

console.log(
  '✓ student submit path reconciles both parent evidence layers'
);

/* -------------------------------------------------------------------------- */
/* Teacher Review / signed teacher path                                       */
/* -------------------------------------------------------------------------- */

assert.ok(
  teacherProgress.includes(
    "require('./_lib/assignment-evidence-reconciliation')"
  ),
  'teacher goal-progress boundary must use the shared reconciler'
);

assert.ok(
  teacherProgress.includes(
    'reconcileAssignmentGoalProgress'
  ),
  'assignment-linked teacher writes must reconcile parent checkpoints'
);

assert.ok(
  teacherProgress.includes(
    'assignmentInstanceId'
  ),
  'teacher reconciliation must retain exact assignment-instance provenance'
);

assert.ok(
  teacherProgress.includes(
    'await insertRows('
  ),
  'manual/import-compatible insert path must remain available'
);

console.log(
  '✓ teacher assignment writes reconcile while manual insert behavior remains available'
);

/* -------------------------------------------------------------------------- */
/* Canonical read dedup                                                       */
/* -------------------------------------------------------------------------- */

for (const [name, source] of [
  ['student goal-data-points endpoint', studentGoalDataPoints],
  ['teacher data adapter', dataAdapter],
]) {
  assert.ok(
    source.includes('dedupeAssignmentGoalDataPoints'),
    `${name} must canonicalize duplicate assignment item evidence`
  );

  assert.ok(
    source.includes('assignment_instance_id'),
    `${name} dedup must use assignment-instance provenance`
  );

  assert.ok(
    source.includes('item_id'),
    `${name} dedup must include item identity`
  );

  assert.ok(
    source.includes('goal_id'),
    `${name} dedup must include parent goal identity`
  );

  assert.ok(
    source.includes('created_at'),
    `${name} dedup must select the latest stored version deterministically`
  );
}

console.log(
  '✓ student and teacher goal-data-point readers collapse legacy assignment duplicates'
);

/* -------------------------------------------------------------------------- */
/* Manual/unlinked evidence preservation                                      */
/* -------------------------------------------------------------------------- */

assert.ok(
  studentGoalDataPoints.includes(
    '!row.assignment_instance_id'
  ),
  'student reader must preserve unlinked/manual evidence'
);

assert.ok(
  dataAdapter.includes(
    '!row.assignment_instance_id'
  ),
  'teacher reader must preserve unlinked/manual evidence'
);

console.log(
  '✓ manual/unlinked evidence remains outside assignment dedup identity'
);

/* -------------------------------------------------------------------------- */
/* Slice boundaries                                                           */
/* -------------------------------------------------------------------------- */

for (const source of [
  helper,
  studentSubmit,
  teacherProgress,
  studentGoalDataPoints,
  dataAdapter,
]) {
  assert.ok(
    !source.includes('objective_data_points'),
    'Slice 3 must not introduce objective evidence'
  );
}

assert.ok(
  !helper.includes('goal_objectives'),
  'Slice 3 reconciliation must remain parent-evidence-only'
);

assert.ok(
  !helper.includes('assignment_item_objectives'),
  'Slice 3 must not activate objective item mappings'
);

console.log(
  '✓ Slice 3 remains parent-evidence-only'
);

console.log('');
console.log(
  'ASSIGNMENT EVIDENCE RECONCILIATION CONTRACT: PASS'
);
