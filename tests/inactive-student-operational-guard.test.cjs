'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    'utf8'
  );
}

console.log(
  'Running inactive-student operational guard tests...\n'
);

const issueDraft = read(
  'netlify/functions/teacher-issue-draft.js'
);

assert.ok(
  issueDraft.includes(
    'students!inner(id,code,name,active,archived_at)'
  )
);

assert.ok(
  issueDraft.includes(
    '&active=eq.true' +
    '&students.active=eq.true' +
    '&students.archived_at=is.null'
  )
);

assert.strictEqual(
  (
    issueDraft.match(
      /&active=eq\.true&archived_at=is\.null/g
    ) || []
  ).length,
  4,
  'Every draft student lookup must exclude inactive or archived students'
);

console.log(
  '✓ teacher-issue-draft filters every issuance path'
);

const issueToStudent = read(
  'netlify/functions/teacher-issue-to-student.js'
);

assert.ok(
  issueToStudent.includes(
    'select=id,code,name,active,archived_at'
  )
);

assert.ok(
  issueToStudent.includes(
    'student.active === false'
  )
);

assert.ok(
  issueToStudent.includes(
    'Boolean(student.archived_at)'
  )
);

assert.ok(
  issueToStudent.indexOf(
    'const inactiveStudents'
  ) <
  issueToStudent.indexOf(
    '// Step 3: Build instance rows'
  )
);

console.log(
  '✓ teacher-issue-to-student rejects inactive or archived students'
);

const issueAssignment = read(
  'netlify/functions/teacher-issue-assignment.js'
);

assert.ok(
  issueAssignment.includes(
    'select=id,code,name,active,archived_at'
  )
);

assert.ok(
  issueAssignment.includes(
    'student.active === false'
  )
);

assert.ok(
  issueAssignment.includes(
    'Boolean(student.archived_at)'
  )
);

assert.ok(
  issueAssignment.indexOf(
    'const inactiveStudents'
  ) <
  issueAssignment.indexOf(
    '// Build instances to upsert'
  )
);

console.log(
  '✓ teacher-issue-assignment rejects inactive or archived students'
);

const instanceList = read(
  'netlify/functions/teacher-assignment-instances-list.js'
);

assert.ok(
  instanceList.includes(
    'students!inner(code,name,active,archived_at)'
  )
);

assert.ok(
  instanceList.includes(
    '&students.active=eq.true'
  )
);

assert.ok(
  instanceList.includes(
    '&students.archived_at=is.null'
  )
);

assert.ok(
  instanceList.includes(
    'student.active === false'
  )
);

assert.ok(
  instanceList.includes(
    'Boolean(student.archived_at)'
  )
);

console.log(
  '✓ active instance reader excludes inactive or archived students'
);

const submissions = read(
  'netlify/functions/teacher-submissions.js'
);

assert.ok(
  submissions.includes(
    'student.active === false'
  ),
  'Existing Teacher submissions guard must remain intact'
);

console.log(
  '✓ existing Teacher submissions guard remains intact'
);

console.log(
  '\nRC-YEAR-02A INACTIVE-STUDENT OPERATIONAL GUARD: PASS'
);
