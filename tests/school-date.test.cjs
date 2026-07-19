'use strict';

const assert =
  require('assert');

const {
  SCHOOL_TIME_ZONE,
  getSchoolLocalDate,
} = require(
  '../netlify/functions/_lib/school-date'
);

console.log(
  'Running school-local date tests...\n'
);

assert.strictEqual(
  SCHOOL_TIME_ZONE,
  'America/Chicago'
);

console.log(
  '✓ canonical school timezone is America/Chicago'
);

/*
 * July 18, 2026 at 8:00 PM CDT
 * is July 19 at 01:00 UTC.
 *
 * This is the exact class of bug found by Pilot 1B.
 */
assert.strictEqual(
  getSchoolLocalDate(
    '2026-07-19T01:00:00.000Z'
  ),
  '2026-07-18'
);

console.log(
  '✓ summer evening UTC rollover stays July 18 in Chicago'
);

/*
 * After midnight locally, it should advance normally.
 * 06:00 UTC = 1:00 AM CDT.
 */
assert.strictEqual(
  getSchoolLocalDate(
    '2026-07-19T06:00:00.000Z'
  ),
  '2026-07-19'
);

console.log(
  '✓ local post-midnight time advances to July 19'
);

/*
 * Standard-time check.
 * Jan 15 05:30 UTC = Jan 14 11:30 PM CST.
 */
assert.strictEqual(
  getSchoolLocalDate(
    '2027-01-15T05:30:00.000Z'
  ),
  '2027-01-14'
);

console.log(
  '✓ winter CST rollover is handled correctly'
);

/*
 * Jan 15 06:30 UTC = Jan 15 12:30 AM CST.
 */
assert.strictEqual(
  getSchoolLocalDate(
    '2027-01-15T06:30:00.000Z'
  ),
  '2027-01-15'
);

console.log(
  '✓ winter post-midnight date advances correctly'
);

/*
 * Date object input.
 */
assert.strictEqual(
  getSchoolLocalDate(
    new Date(
      '2026-08-31T13:00:00.000Z'
    )
  ),
  '2026-08-31'
);

console.log(
  '✓ Date object input is supported'
);

assert.throws(
  () =>
    getSchoolLocalDate(
      'not-a-date'
    ),
  /valid date/
);

console.log(
  '✓ invalid dates fail loudly'
);

console.log('');
console.log(
  'SCHOOL-LOCAL DATE: PASS'
);
