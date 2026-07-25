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

const markerMatches =
  adapter.match(/non_instructional !== true/g) || [];

assert.ok(
  markerMatches.length >= 2,
  'shared Teacher Center instance and submission readers must both exclude the marker'
);

assert.ok(
  adapter.includes(
    'student_id, settings, students!inner(code)'
  ),
  'Teacher Center submission join must retrieve instance settings'
);
console.log('✓ Teacher Center shared readers exclude non-instructional instances');

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
