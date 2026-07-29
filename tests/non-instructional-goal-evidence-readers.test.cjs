'use strict';

const assert = require('assert');
const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

console.log(
  'Running non-instructional goal-evidence reader contract test...\n'
);

const goalProgress =
  read('netlify/functions/student-goal-progress.js');

const goalDataPoints =
  read('netlify/functions/student-goal-data-points.js');

const teacherMarkers =
  read('netlify/functions/teacher-assignment-instance-markers.js');

const adapter =
  read('site/web/data-adapter.js');

const students =
  read('site/web/tc-students.js');

// Student Portal readers remain server-side and preserve their
// existing direct service-role marker resolution.
for (const [name, source] of [
  ['student goal-progress', goalProgress],
  ['student goal-data-points', goalDataPoints],
]) {
  assert.ok(
    source.includes('/rest/v1/assignment_instances'),
    `${name} must resolve assignment-instance marker state server-side`
  );

  assert.ok(
    source.includes('settings?.non_instructional === true'),
    `${name} must recognize explicit non_instructional=true`
  );

  assert.ok(
    source.includes('!row.assignment_instance_id'),
    `${name} must preserve manual/unlinked evidence`
  );
}

assert.ok(
  goalProgress.includes(
    'await filterInstructionalEvidenceRows(fallbackProgressRaw)'
  ),
  'student goal-progress fallback must exclude marked evidence'
);

assert.ok(
  goalProgress.includes(
    'await filterInstructionalEvidenceRows(progressRaw)'
  ),
  'student goal-progress primary path must exclude marked evidence'
);

assert.ok(
  goalDataPoints.includes(
    'await filterInstructionalEvidenceRows(rowsRaw)'
  ),
  'student goal-data-points must exclude marked evidence'
);

// Teacher browser readers must now resolve marker state only through
// the signed Teacher Center endpoint.
for (const [name, source] of [
  ['shared data adapter', adapter],
  ['Teacher Center students', students],
]) {
  assert.ok(
    source.includes(
      "'/.netlify/functions/teacher-assignment-instance-markers'"
    ),
    `${name} must use the signed Teacher marker boundary`
  );

  assert.ok(
    source.includes(
      'Assignment-instance marker lookup returned an incomplete result'
    ),
    `${name} must fail closed on incomplete marker results`
  );

  assert.ok(
    source.includes('!row.assignment_instance_id'),
    `${name} must preserve manual/unlinked evidence`
  );
}

const adapterHelperDefinitions =
  adapter.match(
    /async function filterInstructionalEvidenceRows\(rows\)/g
  ) || [];

assert.strictEqual(
  adapterHelperDefinitions.length,
  1,
  'adapter must define one shared server-backed instructional-evidence filter'
);

const adapterFilterCalls =
  adapter.match(
    /await filterInstructionalEvidenceRows\(/g
  ) || [];

assert.strictEqual(
  adapterFilterCalls.length,
  3,
  'shared adapter filter must cover goal-progress primary/fallback and goal-data-points'
);

const teacherFilters =
  students.match(
    /filterInstructionalProgressRows/g
  ) || [];

assert.ok(
  teacherFilters.length >= 3,
  'Teacher Center progress primary/fallback must remain covered'
);

assert.ok(
  teacherMarkers.includes(
    "requireTeacher"
  ),
  'Teacher marker endpoint must require a Teacher Center session'
);

assert.ok(
  teacherMarkers.includes(
    "row.settings.non_instructional === true"
  ),
  'Teacher marker endpoint must recognize explicit non_instructional=true'
);

console.log(
  '✓ marked assignment-linked goal progress excluded'
);

console.log(
  '✓ marked assignment-linked goal data points excluded'
);

console.log(
  '✓ manual/unlinked evidence preserved'
);

console.log(
  '✓ Teacher browser marker reads use signed server boundary'
);

console.log(
  '\nNON-INSTRUCTIONAL GOAL EVIDENCE READERS: PASS'
);
