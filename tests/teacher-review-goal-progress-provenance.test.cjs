'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const reviewSource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'site',
    'web',
    'tc-review.js'
  ),
  'utf8'
);

const adapterSource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'site',
    'web',
    'data-adapter.js'
  ),
  'utf8'
);

const triggerStart = reviewSource.indexOf(
  'async function triggerGoalProgressUpdates'
);

assert.ok(
  triggerStart >= 0,
  'triggerGoalProgressUpdates not found'
);

const triggerEnd = reviewSource.indexOf(
  '// Auto-finalize submissions',
  triggerStart
);

assert.ok(
  triggerEnd > triggerStart,
  'Could not isolate teacher-review goal progress block'
);

const triggerBlock = reviewSource.slice(
  triggerStart,
  triggerEnd
);

assert.ok(
  triggerBlock.includes(
    'assignment_instance_id: instance.id'
  ),
  'Teacher-reviewed assignment progress must retain assignment-instance provenance'
);

assert.ok(
  triggerBlock.includes(
    "source: 'assignment'"
  )
);

assert.ok(
  triggerBlock.includes(
    "collected_by: 'teacher'"
  )
);

assert.ok(
  triggerBlock.includes(
    'getSchoolLocalDate('
  ),
  'Teacher-review evidence must use school-local date formatting'
);

assert.ok(
  !triggerBlock.includes(
    "submitted_at.split('T')[0]"
  ),
  'Teacher-review evidence must not derive date by truncating a UTC timestamp'
);

assert.ok(
  !triggerBlock.includes(
    "new Date().toISOString().split('T')[0]"
  ),
  'Teacher-review evidence must not use UTC date-only generation'
);

const signatures = adapterSource.match(
  /async upsertGoalProgress\(\{[^}]*assignment_instance_id = null[^}]*\}\)/g
) || [];

assert.strictEqual(
  signatures.length,
  2,
  'Both local and remote upsertGoalProgress adapters must accept optional assignment_instance_id'
);

assert.ok(
  adapterSource.includes(
    'assignment_instance_id,'
  ),
  'Goal progress adapter payload must preserve assignment_instance_id'
);

console.log(
  '✓ teacher-reviewed assignment progress retains exact instance provenance'
);

console.log(
  '✓ manual/imported callers may omit provenance and remain NULL'
);

console.log(
  '✓ teacher-review evidence uses America/Chicago school-local dates'
);

console.log('');
console.log(
  'TEACHER REVIEW GOAL-PROGRESS PROVENANCE: PASS'
);
