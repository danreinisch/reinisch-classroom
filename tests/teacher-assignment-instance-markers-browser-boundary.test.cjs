'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
    'netlify/functions/teacher-assignment-instance-markers.js'
  );

const adapter =
  read(
    'site/web/data-adapter.js'
  );

const students =
  read(
    'site/web/tc-students.js'
  );

assert.ok(
  endpoint.includes(
    'requireTeacher'
  ),
  'marker endpoint must require Teacher Center auth'
);

assert.ok(
  endpoint.includes(
    'authResult.user.teacherId'
  ),
  'marker endpoint must use signed teacherId'
);

assert.ok(
  endpoint.includes(
    '?select=id,assignment_id,settings'
  ),
  'marker endpoint must resolve requested instance provenance'
);

assert.ok(
  endpoint.includes(
    '?select=id,class_id'
  ),
  'marker endpoint must resolve canonical assignment.class_id'
);

assert.ok(
  endpoint.includes(
    'teacher_id=eq.'
  ),
  'marker endpoint must authorize canonical class against signed teacher'
);

assert.ok(
  !endpoint.includes(
    'class_enrollments'
  ),
  'historical marker endpoint must not require active enrollment'
);

assert.ok(
  !endpoint.includes(
    'school_year=eq.'
  ),
  'historical marker endpoint must not impose school-year filtering'
);

assert.ok(
  !endpoint.includes(
    'is_teacher_of'
  ),
  'marker endpoint must not use legacy teacher helper'
);

assert.ok(
  !endpoint.includes(
    'lookupActiveTeacherId'
  ),
  'marker endpoint must not use single-teacher fallback'
);

assert.ok(
  !endpoint.includes(
    '.series'
  ),
  'marker endpoint must not infer ownership from series'
);

for (const [name, source] of [
  ['shared adapter', adapter],
  ['Teacher Center students', students],
]) {
  assert.ok(
    source.includes(
      "'/.netlify/functions/teacher-assignment-instance-markers'"
    ),
    `${name} must use marker endpoint`
  );
}

function directHits(text) {
  return (
    (
      text.match(
        /\.from\('assignment_instances'\)/g
      ) || []
    ).length +
    (
      text.match(
        /\.from\("assignment_instances"\)/g
      ) || []
    ).length
  );
}

assert.strictEqual(
  directHits(adapter),
  2,
  'shared adapter must retain only two live mutation assignment_instances accesses'
);

assert.strictEqual(
  directHits(students),
  0,
  'tc-students must contain no direct assignment_instances access'
);

console.log(
  '✓ signed teacher marker boundary is canonical-class scoped'
);

console.log(
  '✓ historical marker lookup has no active-enrollment/year gate'
);

console.log(
  '✓ both browser marker reads moved behind server boundary'
);

console.log(
  '✓ direct browser assignment_instances accesses reduced to 2'
);

console.log();
console.log(
  'RC-SEC-01I-D1B browser boundary tests PASS'
);
