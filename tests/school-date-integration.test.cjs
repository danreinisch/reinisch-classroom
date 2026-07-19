'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

console.log(
  'Running school-local date integration tests...\n'
);

const submitSource =
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'netlify',
      'functions',
      'student-submit-answer.js'
    ),
    'utf8'
  );

const issueSource =
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'netlify',
      'functions',
      'teacher-issue-draft.js'
    ),
    'utf8'
  );

assert.match(
  submitSource,
  /getSchoolLocalDate\(\)/
);

assert.ok(
  !submitSource.includes(
    "const today = new Date().toISOString().split('T')[0]"
  ),
  'student goal evidence must not derive calendar date from UTC ISO'
);

console.log(
  '✓ student goal evidence uses school-local date helper'
);

assert.match(
  issueSource,
  /const todayDate = getSchoolLocalDate\(\);/
);

assert.ok(
  !issueSource.includes(
    'const todayDate = new Date().toISOString().substring(0, 10);'
  ),
  'assignment assigned_at must not derive calendar date from UTC ISO'
);

console.log(
  '✓ assignment issuance uses school-local date helper'
);

/*
 * Full timestamps remain UTC ISO.
 * These should NOT be converted to date-only local values.
 */
assert.match(
  submitSource,
  /submitted_at:\s*new Date\(\)\.toISOString\(\)/
);

assert.match(
  submitSource,
  /scored_at:\s*new Date\(\)\.toISOString\(\)/
);

console.log(
  '✓ full submission/scoring timestamps remain UTC ISO'
);

console.log('');
console.log(
  'SCHOOL-LOCAL DATE INTEGRATION: PASS'
);
