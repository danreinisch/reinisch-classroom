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

assert.ok(
  source.includes(
    "require('./_lib/assignment-evidence-reconciliation')"
  ),
  'student submission must use shared assignment evidence reconciliation'
);

const gpStart = source.indexOf(
  'reconcileAssignmentGoalProgress({'
);

assert.ok(
  gpStart >= 0,
  'goal_progress reconciliation block not found'
);

const gpEnd = source.indexOf(
  '// Insert per-question data points',
  gpStart
);

assert.ok(
  gpEnd > gpStart,
  'goal_progress reconciliation block end not found'
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
  gpBlock.includes(
    "source: 'assignment'"
  )
);

assert.ok(
  gpBlock.includes(
    "collected_by: 'auto'"
  )
);

assert.ok(
  gpBlock.includes(
    'school_year: schoolYear'
  )
);

assert.ok(
  !source.includes(
    'fetch(`${SUPABASE_URL}/rest/v1/goal_progress`'
  ),
  'student assignment progress must no longer append directly'
);

console.log(
  '✓ goal_progress reconciles with assignment_instance_id provenance'
);

const dpStart = source.indexOf(
  'const dataPointRows = []'
);

const dpEnd = source.indexOf(
  'reconcileAssignmentGoalDataPoints({',
  dpStart
);

assert.ok(
  dpStart >= 0 &&
  dpEnd > dpStart,
  'goal_data_points construction block not found'
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

assert.ok(
  dpBlock.includes(
    'item_id: item.id'
  ),
  'goal_data_points must retain assignment-item provenance'
);

assert.ok(
  !source.includes(
    'fetch(`${SUPABASE_URL}/rest/v1/goal_data_points`'
  ),
  'student item evidence must no longer append directly'
);

console.log(
  '✓ goal_data_points reconcile by assignment + item provenance'
);

console.log('');
console.log(
  'STUDENT SUBMIT GOAL-PROGRESS PROVENANCE: PASS'
);
