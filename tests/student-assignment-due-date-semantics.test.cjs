'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');


const studentUi =
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'site',
      'web',
      'student-portal-init.js'
    ),
    'utf8'
  );


function extractFunction(name) {
  const marker =
    `function ${name}(`;

  const start =
    studentUi.indexOf(marker);

  assert.notStrictEqual(
    start,
    -1,
    `${name} must remain discoverable`
  );

  const braceStart =
    studentUi.indexOf(
      '{',
      start
    );

  assert.notStrictEqual(
    braceStart,
    -1
  );

  let depth = 0;

  let quote = null;
  let escaped = false;

  let lineComment = false;
  let blockComment = false;

  for (
    let i = braceStart;
    i < studentUi.length;
    i++
  ) {
    const ch =
      studentUi[i];

    const next =
      studentUi[i + 1] || '';

    /*
     * Ignore braces and apostrophes inside comments.
     * This is important for ordinary source comments such as:
     *   // Otherwise it's in progress
     */
    if (lineComment) {
      if (ch === '\n') {
        lineComment = false;
      }

      continue;
    }

    if (blockComment) {
      if (
        ch === '*' &&
        next === '/'
      ) {
        blockComment = false;
        i++;
      }

      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === quote) {
        quote = null;
      }

      continue;
    }

    if (
      ch === '/' &&
      next === '/'
    ) {
      lineComment = true;
      i++;
      continue;
    }

    if (
      ch === '/' &&
      next === '*'
    ) {
      blockComment = true;
      i++;
      continue;
    }

    if (
      ch === "'" ||
      ch === '"' ||
      ch === '`'
    ) {
      quote = ch;
      continue;
    }

    if (ch === '{') {
      depth++;
      continue;
    }

    if (ch === '}') {
      depth--;

      if (depth === 0) {
        return studentUi.slice(
          start,
          i + 1
        );
      }
    }
  }

  assert.fail(
    `Could not extract ${name}`
  );
}

const deadlineSource =
  extractFunction(
    'parseAssignmentDeadline'
  );

const parseAssignmentDeadline =
  new Function(
    `return (${deadlineSource});`
  )();


const statusSource =
  extractFunction(
    'getAssignmentStatus'
  );

const getAssignmentStatus =
  new Function(
    'parseAssignmentDeadline',
    `return (${statusSource});`
  )(
    parseAssignmentDeadline
  );


const dueSoonSource =
  extractFunction(
    'checkDueSoonBanner'
  );

const badgeSource =
  extractFunction(
    'renderBadges'
  );


const originalTz =
  process.env.TZ;

try {
  process.env.TZ =
    'America/Chicago';


  /* -------------------------------------------------------- */
  /* DATE column semantics                                    */
  /* -------------------------------------------------------- */

  const deadline =
    parseAssignmentDeadline(
      '2026-09-04'
    );

  assert.ok(
    deadline instanceof Date
  );

  assert.strictEqual(
    deadline.getFullYear(),
    2026
  );

  assert.strictEqual(
    deadline.getMonth(),
    8
  );

  assert.strictEqual(
    deadline.getDate(),
    4
  );

  assert.strictEqual(
    deadline.getHours(),
    23
  );

  assert.strictEqual(
    deadline.getMinutes(),
    59
  );

  assert.strictEqual(
    deadline.getSeconds(),
    59
  );

  assert.strictEqual(
    deadline.getMilliseconds(),
    999
  );

  assert.strictEqual(
    deadline.toISOString(),
    '2026-09-05T04:59:59.999Z',
    'Sep 4 deadline must end at 11:59:59.999 PM CDT'
  );


  /* -------------------------------------------------------- */
  /* Full timestamps keep normal instant semantics            */
  /* -------------------------------------------------------- */

  assert.strictEqual(
    parseAssignmentDeadline(
      '2026-09-04T23:59:00-05:00'
    ).toISOString(),
    '2026-09-05T04:59:00.000Z'
  );

  assert.strictEqual(
    parseAssignmentDeadline(
      'not-a-date'
    ),
    null
  );


  /* -------------------------------------------------------- */
  /* Overdue boundary                                         */
  /* -------------------------------------------------------- */

  const assigned = {
    status:
      'Assigned',

    due_at:
      '2026-09-04',
  };

  assert.strictEqual(
    getAssignmentStatus(
      assigned,
      new Date(
        '2026-09-04T12:00:00-05:00'
      )
    ),
    'in-progress',
    'assignment must not be overdue during the due date'
  );

  assert.strictEqual(
    getAssignmentStatus(
      assigned,
      new Date(
        '2026-09-04T23:59:59.999-05:00'
      )
    ),
    'in-progress',
    'assignment remains on time through the final millisecond'
  );

  assert.strictEqual(
    getAssignmentStatus(
      assigned,
      new Date(
        '2026-09-05T00:00:00-05:00'
      )
    ),
    'overdue',
    'assignment becomes overdue when the next local day begins'
  );


  /* -------------------------------------------------------- */
  /* Submitted/graded status behavior is unchanged            */
  /* -------------------------------------------------------- */

  assert.strictEqual(
    getAssignmentStatus(
      {
        ...assigned,
        status:
          'Submitted',
      },
      new Date(
        '2026-09-06T12:00:00-05:00'
      )
    ),
    'submitted'
  );

  assert.strictEqual(
    getAssignmentStatus(
      {
        ...assigned,
        status:
          'Reviewed',
      },
      new Date(
        '2026-09-06T12:00:00-05:00'
      )
    ),
    'completed'
  );


  /* -------------------------------------------------------- */
  /* On-time submission boundary                              */
  /* -------------------------------------------------------- */

  const onTimeSubmission =
    new Date(
      '2026-09-04T23:59:59.999-05:00'
    );

  const lateSubmission =
    new Date(
      '2026-09-05T00:00:00-05:00'
    );

  assert.ok(
    onTimeSubmission <= deadline,
    'submission at final due-date millisecond is on time'
  );

  assert.ok(
    lateSubmission > deadline,
    'submission after local midnight is late'
  );


  /* -------------------------------------------------------- */
  /* Due Soon uses the same canonical deadline                */
  /* -------------------------------------------------------- */

  const fortyEightHourWindowStart =
    new Date(
      '2026-09-03T00:00:00-05:00'
    );

  const hoursUntilDue =
    (
      deadline -
      fortyEightHourWindowStart
    ) /
    (
      1000 *
      60 *
      60
    );

  assert.ok(
    hoursUntilDue > 0 &&
    hoursUntilDue <= 48,
    'date-only deadline must enter Due Soon during the preceding 48 hours'
  );


  /* -------------------------------------------------------- */
  /* Structural regression guards                             */
  /* -------------------------------------------------------- */

  assert.strictEqual(
    (
      studentUi.match(
        /new Date\((?:instance|inst)\.due_at\)/g
      ) ||
      []
    ).length,
    0,
    'Student Portal must not interpret DATE-column due_at as UTC midnight'
  );

  assert.ok(
    (
      dueSoonSource.match(
        /parseAssignmentDeadline\(inst\.due_at\)/g
      ) ||
      []
    ).length >= 2,
    'Due Soon filter and urgent calculation must use canonical deadline'
  );

  assert.ok(
    (
      badgeSource.match(
        /parseAssignmentDeadline\(inst\.due_at\)/g
      ) ||
      []
    ).length >= 2,
    'On Time and streak calculations must use canonical deadline'
  );

  assert.match(
    statusSource,
    /parseAssignmentDeadline\(instance\.due_at\)/,
    'overdue status must use canonical deadline'
  );

  console.log(
    '✓ date-only assignment deadlines resolve to local end-of-day'
  );

  console.log(
    '✓ full timestamps retain normal instant semantics'
  );

  console.log(
    '✓ assignments remain in progress throughout the due date'
  );

  console.log(
    '✓ assignments become overdue at the next local day boundary'
  );

  console.log(
    '✓ Due Soon, On Time, and streak paths use the same deadline'
  );

  console.log(
    '✓ Student Portal no longer parses due_at DATE values as UTC midnight'
  );

} finally {
  if (
    originalTz ===
    undefined
  ) {
    delete process.env.TZ;
  } else {
    process.env.TZ =
      originalTz;
  }
}

const studentIndex =
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'site',
      'student',
      'index.html'
    ),
    'utf8'
  );

assert.ok(
  studentIndex.includes(
    '/web/student-portal-init.js?v=20260906-assignment-dictation'
  ),
  'Student Portal cache key must move with due-date semantics'
);

console.log(
  '✓ Student Portal runtime cache key moves with deadline fix'
);

console.log('');
console.log(
  'STUDENT ASSIGNMENT DUE-DATE SEMANTICS: PASS'
);
