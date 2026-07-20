'use strict';

const assert = require('assert');

const {
  getStudentVisibleSchoolYears,
} = require(
  '../netlify/functions/_lib/student-visible-school-years'
);

console.log(
  'Running Student Portal school-year visibility tests...\n'
);

assert.deepStrictEqual(
  getStudentVisibleSchoolYears(
    new Date('2026-06-30T12:00:00')
  ),
  [2025]
);

console.log(
  '✓ June shows ending 2025-26 school year only'
);

assert.deepStrictEqual(
  getStudentVisibleSchoolYears(
    new Date('2026-07-18T12:00:00')
  ),
  [2025, 2026]
);

console.log(
  '✓ July shows ending 2025-26 and upcoming 2026-27'
);

assert.deepStrictEqual(
  getStudentVisibleSchoolYears(
    new Date('2026-08-01T12:00:00')
  ),
  [2026]
);

console.log(
  '✓ August shows 2026-27 school year only'
);

assert.deepStrictEqual(
  getStudentVisibleSchoolYears(
    new Date('2027-01-15T12:00:00')
  ),
  [2026]
);

console.log(
  '✓ January remains in 2026-27'
);

console.log(
  '\n✓ All Student Portal visibility tests passed!'
);
