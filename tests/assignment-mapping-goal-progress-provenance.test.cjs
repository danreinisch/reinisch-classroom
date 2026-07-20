'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'site',
    'web',
    'assignment-mapping-db.js'
  ),
  'utf8'
);

const start = source.indexOf(
  'export async function insertGoalProgress'
);

assert.ok(
  start >= 0,
  'insertGoalProgress function not found'
);

const end = source.indexOf(
  'export async function checkVersionLock',
  start
);

assert.ok(
  end > start,
  'Could not isolate insertGoalProgress function'
);

const block = source.slice(start, end);

assert.ok(
  block.includes(
    'assignment_instance_id: assignmentInstanceId'
  ),
  'Assignment rollup must attach exact instance provenance'
);

assert.ok(
  block.includes(
    'assignment_instance_id: rec.assignment_instance_id'
  ),
  'Validated progress payload must preserve provenance'
);

assert.ok(
  block.includes(
    'date: getSchoolLocalDate()'
  ),
  'Assignment rollup must use school-local date'
);

assert.ok(
  !block.includes(
    "new Date().toISOString().split('T')[0]"
  ),
  'Assignment rollup must not generate date-only evidence from UTC'
);

assert.ok(
  source.includes(
    "timeZone: 'America/Chicago'"
  ),
  'School-local date formatter must use America/Chicago'
);

console.log(
  '✓ assignment rollup preserves exact assignment-instance provenance'
);

console.log(
  '✓ assignment rollup preserves provenance through validProgressRecords'
);

console.log(
  '✓ assignment rollup uses America/Chicago school-local date'
);

console.log('');
console.log(
  'ASSIGNMENT MAPPING GOAL-PROGRESS PROVENANCE: PASS'
);
