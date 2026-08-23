'use strict';

const assert = require('assert');

const {
  selectAssignmentReuseCandidate,
} = require('../netlify/functions/_lib/objective-item-mapping');

console.log(
  'Running objective assignment identity tests...\n'
);

assert.strictEqual(
  typeof selectAssignmentReuseCandidate,
  'function',
  'objective assignment identity selector must be exported'
);

function generic(id) {
  return {
    id,
    meta: {
      days: [],
    },
  };
}

function objectiveFor(id, studentCode) {
  return {
    id,
    meta: {
      objective_assignment_student_code:
        studentCode,
      days: [],
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Class-wide / ordinary assignments                                          */
/* -------------------------------------------------------------------------- */

{
  const candidates = [
    objectiveFor('objective-s009', 'S009'),
    generic('generic'),
  ];

  const selected =
    selectAssignmentReuseCandidate({
      candidates,
      objectiveStudentCode: null,
      targetedStudentCode: null,
    });

  assert.strictEqual(
    selected.id,
    'generic',
    'ordinary class-wide issuance must reuse generic assignment, not a student-specific objective assignment'
  );

  console.log(
    '✓ class-wide no-IO issuance ignores student-specific objective assignments'
  );
}

/* -------------------------------------------------------------------------- */
/* New objective-aware assignment                                             */
/* -------------------------------------------------------------------------- */

{
  const candidates = [
    objectiveFor('objective-s008', 'S008'),
    objectiveFor('objective-s009', 'S009'),
    generic('generic'),
  ];

  const selected =
    selectAssignmentReuseCandidate({
      candidates,
      objectiveStudentCode: 'S009',
      targetedStudentCode: 'S009',
    });

  assert.strictEqual(
    selected.id,
    'objective-s009',
    'objective-aware issuance must reuse only the matching student-specific assignment'
  );

  console.log(
    '✓ objective-aware S009 issuance reuses only S009 assignment'
  );
}

{
  const candidates = [
    generic('generic'),
    objectiveFor('objective-s008', 'S008'),
  ];

  const selected =
    selectAssignmentReuseCandidate({
      candidates,
      objectiveStudentCode: 'S009',
      targetedStudentCode: 'S009',
    });

  assert.strictEqual(
    selected,
    null,
    'objective-aware S009 issuance must create a new assignment rather than reuse a generic or another student assignment'
  );

  console.log(
    '✓ first S009 objective-aware issue creates separate assignment identity'
  );
}

/* -------------------------------------------------------------------------- */
/* Different students must never share objective assignment/items             */
/* -------------------------------------------------------------------------- */

{
  const candidates = [
    objectiveFor('objective-s008', 'S008'),
  ];

  const selected =
    selectAssignmentReuseCandidate({
      candidates,
      objectiveStudentCode: 'S009',
      targetedStudentCode: 'S009',
    });

  assert.strictEqual(
    selected,
    null,
    'S009 must never reuse S008 objective-aware assignment'
  );

  console.log(
    '✓ different students cannot share objective-aware assignment identity'
  );
}

/* -------------------------------------------------------------------------- */
/* Cleanup reissue: IO removed, but student-specific identity must survive     */
/* -------------------------------------------------------------------------- */

{
  const candidates = [
    generic('generic'),
    objectiveFor('objective-s009', 'S009'),
  ];

  const selected =
    selectAssignmentReuseCandidate({
      candidates,
      objectiveStudentCode: null,
      targetedStudentCode: 'S009',
    });

  assert.strictEqual(
    selected.id,
    'objective-s009',
    'targeted no-IO reissue must find the prior student-specific objective assignment so stale mappings can be cleared'
  );

  console.log(
    '✓ targeted IO-removal reissue finds prior student-specific assignment'
  );
}

{
  const candidates = [
    objectiveFor('objective-s009', 'S009'),
    generic('generic'),
  ];

  const selected =
    selectAssignmentReuseCandidate({
      candidates,
      objectiveStudentCode: null,
      targetedStudentCode: 'S010',
    });

  assert.strictEqual(
    selected.id,
    'generic',
    'targeted S010 no-IO issuance must not reuse S009 student-specific assignment'
  );

  console.log(
    '✓ targeted no-IO issuance never crosses student identity'
  );
}

console.log('');
console.log(
  'OBJECTIVE ASSIGNMENT IDENTITY: PASS'
);
