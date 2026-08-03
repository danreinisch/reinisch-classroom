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
  2,
  'shared adapter filter must cover signed goal progress and goal-data-points'
);

assert.ok(
  adapter.includes(
    '/.netlify/functions/teacher-goal-progress'
  ),
  'Teacher Center goal-progress reads must use the signed server boundary'
);

assert.ok(
  adapter.includes(
    'return await filterInstructionalEvidenceRows('
  ),
  'signed goal-progress results must retain non-instructional evidence filtering'
);

assert.ok(
  !/\.from\(['"]goal_progress['"]\)/.test(adapter),
  'shared adapter must not read goal_progress directly from the browser'
);

assert.ok(
  students.includes(
    'db.listGoalProgress({'
  ),
  'Teacher Center Students must use the shared signed progress reader'
);

assert.ok(
  !/\.from\(['"]goal_progress['"]\)/.test(students),
  'Teacher Center Students must not read goal_progress directly'
);

const loadProgressStart =
  students.indexOf(
    '  async function loadProgressEntries('
  );

assert.ok(
  loadProgressStart >= 0,
  'Teacher Center progress reader must remain defined'
);

const loadProgressEnd =
  students.indexOf(
    '\n  function buildProgressLookupMap()',
    loadProgressStart
  );

assert.ok(
  loadProgressEnd > loadProgressStart,
  'Teacher Center progress reader must be isolatable'
);

const loadProgressMethod =
  students.slice(
    loadProgressStart,
    loadProgressEnd
  );

assert.ok(
  loadProgressMethod.includes(
    'db.listGoalProgress({'
  ),
  'Teacher Center remote progress must use the signed shared reader'
);

assert.ok(
  loadProgressMethod.includes(
    "localStorage.getItem(\n          'rc_goal_progress_v1'"
  ),
  'Teacher Center local progress fallback must remain available'
);

assert.ok(
  loadProgressMethod.includes(
    'return filterInstructionalProgressRows('
  ),
  'Teacher Center local progress fallback must exclude non-instructional evidence'
);

assert.ok(
  loadProgressMethod.includes(
    'Array.isArray(parsed)'
  ),
  'Teacher Center local progress fallback must reject malformed stored values'
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
