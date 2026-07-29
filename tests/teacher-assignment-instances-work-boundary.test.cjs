'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      relativePath
    ),
    'utf8'
  );
}

const endpoint =
  read(
    'netlify/functions/teacher-assignment-instances.js'
  );

const work =
  read(
    'site/web/tc-work.js'
  );

const codeOnly =
  endpoint
    .split('\n')
    .filter(
      (line) =>
        !line.trim().startsWith('//')
    )
    .join('\n');

assert.ok(
  work.includes(
    '/.netlify/functions/teacher-assignment-instances?assignment_id='
  ),
  'Work Manage Students must retain the existing endpoint URL'
);

assert.ok(
  work.includes(
    "credentials: 'same-origin'"
  ),
  'Work Manage Students must retain teacher-session credentials'
);

assert.ok(
  endpoint.includes(
    'authResult.user.teacherId'
  ),
  'Work endpoint must authorize from signed teacherId'
);

assert.ok(
  endpoint.includes(
    '?select=id,class_id'
  ),
  'Work endpoint must resolve canonical assignment.class_id'
);

assert.ok(
  endpoint.includes(
    'teacher_id=eq.'
  ),
  'Work endpoint must verify exact class teacher ownership'
);

assert.ok(
  endpoint.includes(
    "'/rest/v1/class_enrollments'"
  ),
  'Work endpoint must verify class enrollment'
);

assert.ok(
  endpoint.includes(
    '&active=eq.true'
  ),
  'Work endpoint must require active enrollment'
);

for (const forbidden of [
  'lookupActiveTeacherId',
  'assignmentRow.series',
  'assignment.series',
  'name=eq.',
  'ownership check will be unscoped',
  'skipping ownership check',
  'proceeding',
]) {
  assert.ok(
    !codeOnly.includes(forbidden),
    `Work endpoint must not retain legacy authorization pattern: ${forbidden}`
  );
}

assert.ok(
  endpoint.includes(
    'instance_id:'
  ),
  'Work endpoint must retain instance_id response field'
);

assert.ok(
  endpoint.includes(
    "row.status || 'Assigned'"
  ),
  'Work endpoint must retain status fallback contract'
);

assert.ok(
  endpoint.includes(
    'row.assigned_at || null'
  ),
  'Work endpoint must retain assigned_at fallback contract'
);

console.log(
  '✓ tc-work endpoint URL and cookie behavior unchanged'
);

console.log(
  '✓ signed teacherId → assignment.class_id → class ownership enforced'
);

console.log(
  '✓ active same-class enrollment required'
);

console.log(
  '✓ legacy fail-open/single-teacher/series authorization removed'
);

console.log(
  '✓ Work response compatibility contract retained'
);

console.log();
console.log(
  'RC-SEC-01I-T2W Work boundary tests PASS'
);
