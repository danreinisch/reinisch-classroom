'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(
    path.join(__dirname, '..', rel),
    'utf8'
  );
}

console.log('Running non-instructional core-reader contract test...\n');

const studentAssignments =
  read('netlify/functions/student-assignments.js');

assert.ok(
  studentAssignments.includes(
    'inst?.settings?.non_instructional !== true'
  ),
  'student assignments must exclude explicitly non-instructional instances'
);
console.log('✓ student assignment reader excludes non-instructional instances');

const studentSubmissions =
  read('netlify/functions/student-submissions.js');

assert.ok(
  studentSubmissions.includes(
    'student_id,settings,assignments'
  ),
  'student submission join must retrieve instance settings'
);

assert.ok(
  studentSubmissions.includes(
    'instance?.settings?.non_instructional !== true'
  ),
  'student submission history must exclude non-instructional instances'
);
console.log('✓ student submission/grade reader excludes non-instructional instances');

const adapter = read('site/web/data-adapter.js');

assert.ok(
  adapter.includes(
    'inst => inst?.settings?.non_instructional !== true'
  ),
  'Teacher Center instance reader must exclude explicitly non-instructional instances'
);

assert.ok(
  adapter.includes(
    "'/.netlify/functions/teacher-submissions'"
  ),
  'Teacher Center submission reader must use the signed server boundary'
);

const teacherSubmissions =
  read('netlify/functions/teacher-submissions.js');

assert.ok(
  teacherSubmissions.includes(
    '?select=id,assignment_id,student_id,settings,students!inner(code,active)'
  ),
  'Teacher submission boundary must retrieve assignment-instance marker state'
);

assert.ok(
  teacherSubmissions.includes(
    'row.settings.non_instructional === true'
  ),
  'Teacher submission boundary must exclude explicitly non-instructional instances'
);

console.log('✓ Teacher Center instance reader excludes non-instructional instances');
console.log('✓ Teacher submission boundary excludes non-instructional instances server-side');

const ungraded =
  read('netlify/functions/teacher-ungraded-count.js');

assert.ok(
  ungraded.includes('select=id'),
  'ungraded reader should use a lightweight count query'
);

assert.ok(
  ungraded.includes(
    'or=(settings->>non_instructional.is.null,settings->>non_instructional.neq.true)'
  ),
  'ungraded reader must exclude explicit non-instructional=true at query time'
);

assert.ok(
  ungraded.includes("'Prefer': 'count=exact'"),
  'ungraded reader must retain exact server-side counting'
);

assert.ok(
  ungraded.includes("'Range': '0-0'"),
  'ungraded reader must not fetch every matching row'
);

console.log('✓ ungraded reader excludes non-instructional instances server-side');

console.log('\nNON-INSTRUCTIONAL CORE READERS: PASS');
