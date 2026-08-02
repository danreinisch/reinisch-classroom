const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root =
  path.resolve(__dirname, '..');

const source =
  fs.readFileSync(
    path.join(
      root,
      'site/web/assignment-mapping-db.js'
    ),
    'utf8'
  );

const start =
  source.indexOf(
    'export async function insertGoalProgress'
  );

assert(
  start >= 0,
  'insertGoalProgress export must remain available'
);

const end =
  source.indexOf(
    '\n/**\n * Check if assignment is version-locked',
    start
  );

assert(
  end > start,
  'insertGoalProgress function must be isolatable'
);

const method =
  source.slice(start, end);

assert(
  method.includes(
    '/.netlify/functions/teacher-goal-progress'
  ),
  'assignment rollups must use signed teacher endpoint'
);

assert(
  method.includes("credentials: 'include'"),
  'assignment rollups must include the signed teacher cookie'
);

assert(
  method.includes("action: 'insert_batch'"),
  'assignment rollups must select insert_batch action'
);

assert(
  method.includes(
    'assignment_instance_id: assignmentInstanceId'
  ),
  'assignment-instance provenance must cross the server boundary'
);

assert(
  method.includes(
    'student_id: studentId'
  ),
  'student scope must cross the server boundary'
);

assert(
  method.includes(
    'goal_rollups:'
  ),
  'goal-level rollups must cross the server boundary'
);

assert(
  !method.includes(".from('goal_progress')"),
  'assignment helper must not access goal_progress directly'
);

console.log(
  'ASSIGNMENT MAPPING GOAL-PROGRESS PROVENANCE: PASS'
);
