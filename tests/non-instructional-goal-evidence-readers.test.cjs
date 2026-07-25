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

const adapterFilters =
  adapter.match(/filterInstructionalEvidenceRows/g) || [];

assert.ok(
  adapterFilters.length >= 5,
  'adapter must cover goal-progress primary/fallback and goal-data-points'
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
