'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf8'
  );
}

const sources = {
  gradebook: read('site/web/tc-gradebook.js'),
  overview: read('site/web/tc-overview.js'),
  reporting: read('site/web/tc-reporting.js'),
  calendar: read('site/web/tc-calendar.js'),
};

function extractDeadlineHelper(source) {
  const match = source.match(
    /function parseAssignmentDeadline\(dateStr\) \{[\s\S]*?\n {2}\}/
  );

  assert.ok(
    match,
    'parseAssignmentDeadline must remain discoverable'
  );

  return new Function(
    `return (${match[0]});`
  )();
}

const originalTz = process.env.TZ;

try {
  process.env.TZ = 'America/Chicago';

  for (const [name, source] of Object.entries(sources)) {
    const parseDeadline = extractDeadlineHelper(source);
    const due = parseDeadline('2026-09-04');

    assert.equal(
      due.toISOString(),
      '2026-09-05T04:59:59.999Z',
      `${name}: Sep 4 must end at 11:59:59.999 PM CDT`
    );

    assert.equal(
      parseDeadline(
        '2026-09-04T23:59:00-05:00'
      ).toISOString(),
      '2026-09-05T04:59:00.000Z',
      `${name}: full timestamps retain instant semantics`
    );

    assert.equal(
      parseDeadline('not-a-date'),
      null,
      `${name}: invalid deadlines fail closed`
    );

    assert.ok(
      due >= new Date(
        '2026-09-04T23:59:59.999-05:00'
      )
    );

    assert.ok(
      due < new Date(
        '2026-09-05T00:00:00-05:00'
      )
    );
  }

  const due = extractDeadlineHelper(
    sources.gradebook
  )('2026-09-04');

  const firstLateInstant = new Date(
    '2026-09-05T00:00:00-05:00'
  );

  const daysOverdue = Math.max(
    1,
    Math.ceil(
      (firstLateInstant - due) /
      (1000 * 60 * 60 * 24)
    )
  );

  assert.equal(
    daysOverdue,
    1,
    'first local calendar day late must display as 1 day overdue'
  );

  assert.ok(
    new Date(
      '2026-09-04T23:59:59.999-05:00'
    ) <= due
  );

  assert.ok(
    new Date(
      '2026-09-05T00:00:00-05:00'
    ) > due
  );
} finally {
  if (originalTz === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTz;
  }
}

assert.match(
  sources.gradebook,
  /parseAssignmentDeadline\(instance\.due_at\)/
);

assert.ok(
  !sources.gradebook.includes(
    'new Date(instance.due_at)'
  )
);

assert.match(
  sources.gradebook,
  /Math\.max\(\s*1,\s*Math\.ceil\(/
);

assert.ok(
  !sources.overview.includes(
    'new Date(inst.due_at)'
  )
);

assert.ok(
  !sources.overview.includes(
    'new Date(i.due_at)'
  )
);

assert.ok(
  (
    sources.overview.match(
      /parseAssignmentDeadline\(inst\.due_at\)/g
    ) || []
  ).length >= 3
);

assert.match(
  sources.overview,
  /parseAssignmentDeadline\(i\.due_at\)/
);

assert.match(
  sources.overview,
  /weekFromNow\.setHours\(23, 59, 59, 999\)/
);

assert.match(
  sources.reporting,
  /parseAssignmentDeadline\(inst\.due_at\)/
);

assert.ok(
  !sources.reporting.includes(
    'new Date(inst.due_at)'
  )
);

assert.match(
  sources.reporting,
  /function formatAssignmentDate\(dateStr\) \{[\s\S]*?parseAssignmentDeadline\(dateStr\)/
);

assert.equal(
  (
    sources.reporting.match(
      /formatAssignmentDate\(inst\.due_at\)/g
    ) || []
  ).length,
  2,
  'Reporting due-date displays must use assignment DATE semantics'
);

assert.ok(
  !sources.reporting.includes(
    'formatDate(inst.due_at)'
  ),
  'Reporting must not display assignment DATE values through the generic timestamp formatter'
);

assert.match(
  sources.calendar,
  /parseAssignmentDeadline\(inst\.due_at\)/
);

assert.ok(
  !sources.calendar.includes(
    'new Date(inst.due_at)'
  )
);

const cacheContracts = [
  [
    'site/teacher/gradebook/index.html',
    '/web/tc-gradebook.js?v=20260902-class-drilldown',
  ],
  [
    'site/teacher/index.html',
    '/web/tc-overview.js?v=20260831-due-eod',
  ],
  [
    'site/teacher/reporting/index.html',
    '/web/tc-reporting.js?v=20260831-due-eod',
  ],
  [
    'site/teacher/calendar/index.html',
    '/web/tc-calendar.js?v=20260831-due-eod',
  ],
];

for (const [file, key] of cacheContracts) {
  assert.ok(
    read(file).includes(key),
    `${file} must load the due-date-fixed runtime`
  );
}

const pkg = JSON.parse(
  read('package.json')
);

const needle =
  'node tests/teacher-assignment-due-date-semantics.test.cjs';

const registrationCount =
  (
    pkg.scripts?.['test:unit'] || ''
  ).split(needle).length - 1;

assert.equal(
  registrationCount,
  1,
  'teacher due-date regression must be registered exactly once'
);

console.log(
  '✓ Teacher Gradebook missing-work deadline uses local end-of-day'
);
console.log(
  '✓ Teacher Overview deadline paths use local end-of-day'
);
console.log(
  '✓ Teacher Reporting on-time rate uses local end-of-day'
);
console.log(
  '✓ Teacher Reporting displays due dates on intended local day'
);
console.log(
  '✓ Teacher Calendar keeps assignment due dates on intended day'
);
console.log(
  '✓ first late local calendar day reports as 1 day overdue'
);
console.log(
  '✓ full timestamp semantics remain unchanged'
);
console.log(
  '✓ teacher runtime cache keys move with the fix'
);
console.log('');
console.log(
  'TEACHER ASSIGNMENT DUE-DATE SEMANTICS: PASS'
);
