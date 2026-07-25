'use strict';

const assert = require('assert');
const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

console.log('Running non-instructional goal-evidence reader contract test...\n');

const goalProgress =
  read('netlify/functions/student-goal-progress.js');
const goalDataPoints =
  read('netlify/functions/student-goal-data-points.js');
const adapter =
  read('site/web/data-adapter.js');
const students =
  read('site/web/tc-students.js');

for (const [name, source] of [
  ['student goal-progress', goalProgress],
  ['student goal-data-points', goalDataPoints],
  ['shared data adapter', adapter],
  ['Teacher Center students', students],
]) {
  assert.ok(
    source.includes("from('assignment_instances')") ||
      source.includes('/rest/v1/assignment_instances'),
    `${name} must resolve assignment-instance marker state`
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

const adapterHelperDefinitions =
  adapter.match(
    /async function filterInstructionalEvidenceRows\(supabase, rows\)/g
  ) || [];

assert.strictEqual(
  adapterHelperDefinitions.length,
  1,
  'adapter must define one shared instructional-evidence filter'
);

const adapterFilterCalls =
  adapter.match(
    /await filterInstructionalEvidenceRows\(supabase,/g
  ) || [];

assert.strictEqual(
  adapterFilterCalls.length,
  3,
  'shared adapter filter must cover goal-progress primary/fallback and goal-data-points'
);

assert.ok(
  adapter.includes('if (instanceError) throw instanceError;'),
  'adapter marker lookup must fail closed rather than expose unverified evidence'
);

assert.ok(
  goalProgress.includes('Assignment-instance marker lookup failed:'),
  'student goal-progress marker lookup must fail closed'
);

assert.ok(
  goalDataPoints.includes('Assignment-instance marker lookup failed:'),
  'student goal-data-points marker lookup must fail closed'
);

const teacherFilters =
  students.match(/filterInstructionalProgressRows/g) || [];

assert.ok(
  teacherFilters.length >= 3,
  'Teacher Center direct progress primary/fallback must be covered'
);

console.log('✓ marked assignment-linked goal progress excluded');
console.log('✓ marked assignment-linked goal data points excluded');
console.log('✓ manual/unlinked evidence preserved');
console.log('✓ Teacher Center direct progress reader covered');
console.log('\nNON-INSTRUCTIONAL GOAL EVIDENCE READERS: PASS');
