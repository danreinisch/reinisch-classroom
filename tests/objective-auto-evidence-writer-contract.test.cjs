'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running auto-scored objective evidence writer integration contract...\n'
);

const repoRoot =
  path.join(__dirname, '..');

const studentSubmit =
  fs.readFileSync(
    path.join(
      repoRoot,
      'netlify',
      'functions',
      'student-submit-answer.js'
    ),
    'utf8'
  );

const teacherReview =
  fs.readFileSync(
    path.join(
      repoRoot,
      'netlify',
      'functions',
      'teacher-review-save.js'
    ),
    'utf8'
  );

const tcReview =
  fs.readFileSync(
    path.join(
      repoRoot,
      'site',
      'web',
      'tc-review.js'
    ),
    'utf8'
  );

/* -------------------------------------------------------------------------- */
/* Server-only helper integration                                             */
/* -------------------------------------------------------------------------- */

assert.match(
  studentSubmit,
  /require\(['"]\.\/_lib\/objective-auto-evidence-writer['"]\)/,
  '5B1 student submit must import the server-only objective auto-evidence writer'
);

for (const symbol of [
  'getObjectiveCandidateItemIds',
  'fetchAssignmentItemObjectiveMappings',
  'buildAutoObjectiveEvidenceRows',
  'reconcileAssignmentObjectiveDataPoints',
]) {
  assert.match(
    studentSubmit,
    new RegExp(`\\b${symbol}\\b`),
    `student submit must use ${symbol}`
  );
}

/* -------------------------------------------------------------------------- */
/* No IO = no objective mapping query                                         */
/* -------------------------------------------------------------------------- */

assert.match(
  studentSubmit,
  /getObjectiveCandidateItemIds\s*\(\s*items\s*\)/,
  'student submit must preflight objective candidates from issued item metadata'
);

assert.match(
  studentSubmit,
  /objectiveCandidateItemIds\.length\s*>\s*0[\s\S]*fetchAssignmentItemObjectiveMappings/,
  'assignment_item_objectives must be queried only when objective candidates exist'
);

assert.match(
  studentSubmit,
  /assignment_item_objectives/,
  '5B1 must resolve normalized assignment-item objective mappings'
);

/* -------------------------------------------------------------------------- */
/* Auto-scored rows only                                                      */
/* -------------------------------------------------------------------------- */

assert.match(
  studentSubmit,
  /buildAutoObjectiveEvidenceRows\s*\(/,
  'student submit must build child evidence from completed auto-scoring results'
);

assert.match(
  studentSubmit,
  /submissionAnswers\s*:\s*subAnswers|subAnswers/,
  'objective evidence must be derived from the canonical scored submission-answer rows'
);

assert.match(
  studentSubmit,
  /reconcileAssignmentObjectiveDataPoints\s*\(/,
  'student submit must reconcile objective evidence identities'
);

/*
 * Objective auto evidence must be written before the parent Step 8 gate.
 * Otherwise a mixed assignment with one unscored writing item would suppress
 * valid auto-scored child evidence from its other questions.
 */
const objectiveWriteIndex =
  studentSubmit.indexOf(
    'await reconcileAssignmentObjectiveDataPoints'
  );

const parentStepIndex =
  studentSubmit.indexOf(
    'Step 8: Auto-upsert goal_progress'
  );

assert.ok(
  objectiveWriteIndex >= 0 &&
  parentStepIndex >= 0 &&
  objectiveWriteIndex < parentStepIndex,
  '5B1 objective evidence must not be hidden inside the all-auto-scoreable parent-progress gate'
);

/* -------------------------------------------------------------------------- */
/* Separation from parent evidence                                            */
/* -------------------------------------------------------------------------- */

assert.ok(
  !studentSubmit.includes(
    'objective_earned: earnedPoints'
  ),
  '5B1 must not blindly copy academic earned points into objective evidence'
);

/* -------------------------------------------------------------------------- */
/* 5B1 auto scoring remains isolated from 5B2 Teacher Review scoring          */
/* -------------------------------------------------------------------------- */

assert.ok(
  !teacherReview.includes(
    'objective-auto-evidence-writer'
  ),
  'Teacher Review must not reuse the 5B1 auto-evidence writer'
);

assert.ok(
  teacherReview.includes(
    'objective-review-evidence-writer'
  ),
  'Teacher Review child-objective writes must use the separate 5B2 review writer'
);

assert.ok(
  !studentSubmit.includes(
    'objective-review-evidence-writer'
  ) &&
  !studentSubmit.includes(
    'save_objective_components'
  ),
  '5B1 student auto-scoring must not acquire 5B2 Teacher Review component behavior'
);

assert.ok(
  !tcReview.includes(
    'objective-auto-evidence-writer'
  ),
  'Teacher Review UI must never invoke the 5B1 server auto-evidence writer'
);

console.log(
  '✓ objective writer remains server-side'
);
console.log(
  '✓ no-IO path has an explicit zero-query preflight'
);
console.log(
  '✓ normalized mappings are required'
);
console.log(
  '✓ objective evidence derives from scored submission answers'
);
console.log(
  '✓ mixed assignments can preserve valid auto-scored child evidence'
);
console.log(
  '✓ parent evidence path remains separate'
);
console.log(
  '✓ 5B1 auto evidence remains isolated from separate 5B2 Teacher Review scoring'
);
console.log('');
console.log(
  'OBJECTIVE AUTO-EVIDENCE WRITER INTEGRATION: PASS'
);
