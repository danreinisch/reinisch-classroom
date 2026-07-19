'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running student-submit goal-progress provenance tests...\n'
);

const source = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'netlify',
    'functions',
    'student-submit-answer.js'
  ),
  'utf8'
);

const gpStart = source.indexOf(
  'fetch(`${SUPABASE_URL}/rest/v1/goal_progress`'
);

assert.ok(
  gpStart >= 0,
  'goal_progress POST block not found'
);

const gpEnd = source.indexOf(
  'if (!gpRes.ok)',
  gpStart
);

assert.ok(
  gpEnd > gpStart,
  'goal_progress POST block end not found'
);

const gpBlock = source.slice(
  gpStart,
  gpEnd
);

assert.ok(
  gpBlock.includes(
    'assignment_instance_id: instance_id'
  ),
  'assignment-generated goal_progress must retain assignment provenance'
);

assert.ok(
  gpBlock.includes("source: 'assignment'")
);

assert.ok(
  gpBlock.includes("collected_by: 'auto'")
);

assert.ok(
  gpBlock.includes('school_year: schoolYear')
);

console.log(
  '✓ goal_progress retains assignment_instance_id provenance'
);

const dpStart = source.indexOf(
  'const dataPointRows = []'
);

const dpEnd = source.indexOf(
  'fetch(`${SUPABASE_URL}/rest/v1/goal_data_points`',
  dpStart
);

assert.ok(
  dpStart >= 0 &&
  dpEnd > dpStart,
  'goal_data_points block not found'
);

const dpBlock = source.slice(
  dpStart,
  dpEnd
);

assert.ok(
  dpBlock.includes(
    'assignment_instance_id: instance_id'
  ),
  'goal_data_points must retain assignment-instance provenance'
);

console.log(
  '✓ goal_data_points retains assignment_instance_id provenance'
);

console.log('');
console.log(
  'STUDENT SUBMIT GOAL-PROGRESS PROVENANCE: PASS'
);
