'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root =
  path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(
    path.join(root, rel),
    'utf8'
  );
}

console.log(
  'Running goal objective visibility contract tests...\n'
);

/* -------------------------------------------------------------------------- */
/* Canonical read-only catalog                                                 */
/* -------------------------------------------------------------------------- */

const catalogPath =
  path.join(
    root,
    'netlify',
    'functions',
    '_lib',
    'goal-objective-catalog.js'
  );

assert.ok(
  fs.existsSync(catalogPath),
  'Slice 4 must add one server-side canonical objective catalog'
);

const catalogSource =
  read(
    'netlify/functions/_lib/goal-objective-catalog.js'
  );

assert.ok(
  catalogSource.includes(
    'S008.CG2.O1'
  ),
  'catalog must contain canonical child objective codes'
);

assert.ok(
  catalogSource.includes(
    'S065.CG2.O3'
  ),
  'catalog must include the complete canonical objective range'
);

assert.ok(
  catalogSource.includes(
    'parent_goal_code'
  ),
  'catalog must retain controlling parent identity'
);

assert.ok(
  catalogSource.includes(
    'objective_text'
  ),
  'catalog must retain official objective wording'
);

assert.ok(
  catalogSource.includes(
    'objective_number'
  ),
  'catalog must preserve official objective order'
);

assert.ok(
  catalogSource.includes(
    'getObjectivesForParentGoal'
  ),
  'catalog must expose a parent-scoped read helper'
);

assert.ok(
  !catalogSource.includes(
    'objective_data_points'
  ),
  'visibility catalog must contain no objective scoring/evidence behavior'
);

console.log(
  '✓ canonical objectives are exposed through one server-side read-only catalog'
);

/* -------------------------------------------------------------------------- */
/* Migration replay remains non-activating                                    */
/* -------------------------------------------------------------------------- */

const migration =
  read(
    'supabase/migrations/20260823012500_goal_objective_registry.sql'
  );

assert.ok(
  migration.includes(
    'sync_goal_objective_registry()'
  ),
  'existing dormant registry migration must remain present'
);

assert.ok(
  !/SELECT\s+(?:public\.)?sync_goal_objective_registry\s*\(/i.test(
    migration
  ),
  'migration replay must not auto-activate the objective registry'
);

console.log(
  '✓ migration replay remains non-activating'
);

/* -------------------------------------------------------------------------- */
/* Teacher signed transport                                                    */
/* -------------------------------------------------------------------------- */

const teacherReader =
  read(
    'netlify/functions/teacher-roster-context.js'
  );

assert.ok(
  teacherReader.includes(
    "require('./_lib/goal-objective-registry-reader')"
  ),
  'teacher roster reader must use the server-only production objective registry reader'
);

assert.ok(
  !teacherReader.includes(
    "require('./_lib/goal-objective-catalog')"
  ),
  'teacher roster reader must no longer depend on the stale static objective catalog'
);

assert.ok(
  teacherReader.includes(
    'buildObjectiveRegistryPath'
  ),
  'teacher roster reader must read the active production objective registry'
);

assert.ok(
  teacherReader.includes(
    'indexObjectiveRegistryRowsByParent'
  ),
  'teacher roster reader must index registry rows by student + parent identity'
);

assert.ok(
  teacherReader.includes(
    'getBrowserObjectivesForParent'
  ),
  'teacher roster reader must expose only the established browser-safe objective projection'
);

assert.ok(
  teacherReader.includes(
    'objectives:'
  ),
  'teacher goal payload must attach child objectives to the parent goal'
);

console.log(
  '✓ Teacher Center signed goal transport reads parent-scoped objectives from production registry'
);

/* -------------------------------------------------------------------------- */
/* Student signed transport                                                    */
/* -------------------------------------------------------------------------- */

const studentReader =
  read(
    'netlify/functions/student-goals.js'
  );

assert.ok(
  studentReader.includes(
    "require('./_lib/goal-objective-registry-reader')"
  ),
  'student goals endpoint must use the server-only production objective registry reader'
);

assert.ok(
  !studentReader.includes(
    "require('./_lib/goal-objective-catalog')"
  ),
  'student goals endpoint must no longer depend on the stale static objective catalog'
);

assert.ok(
  studentReader.includes(
    'buildObjectiveRegistryPath'
  ),
  'student endpoint must perform a student-scoped production registry read'
);

assert.ok(
  studentReader.includes(
    'indexObjectiveRegistryRowsByParent'
  ),
  'student endpoint must index registry rows by signed student + parent identity'
);

assert.ok(
  studentReader.includes(
    'getBrowserObjectivesForParent'
  ),
  'student endpoint must expose only the established browser-safe objective projection'
);

assert.ok(
  studentReader.includes(
    'objectives'
  ),
  'student goal payload must attach child objectives to the parent goal'
);

console.log(
  '✓ Student Portal signed goal transport reads applicable objectives from production registry'
);

/* -------------------------------------------------------------------------- */
/* Teacher Center rendering                                                    */
/* -------------------------------------------------------------------------- */

const teacherUi =
  read(
    'site/web/tc-students.js'
  );

assert.ok(
  teacherUi.includes(
    'renderGoalObjectives'
  ),
  'Teacher Center goal cards must have a dedicated read-only objective renderer'
);

assert.ok(
  teacherUi.includes(
    'goal.objectives'
  ),
  'Teacher Center renderer must consume objectives from the existing goal payload'
);

assert.ok(
  teacherUi.includes(
    'IEP Objective'
  ) ||
  teacherUi.includes(
    'Objectives'
  ),
  'Teacher Center must visibly label child objectives'
);

console.log(
  '✓ Teacher Center parent goal cards expose child objectives read-only'
);

/* -------------------------------------------------------------------------- */
/* Student Portal rendering                                                    */
/* -------------------------------------------------------------------------- */

const studentUi =
  read(
    'site/web/student-portal-init.js'
  );

assert.ok(
  studentUi.includes(
    'renderGoalObjectives'
  ),
  'Student Portal goal cards must have a dedicated read-only objective renderer'
);

assert.ok(
  studentUi.includes(
    'goal.objectives'
  ),
  'Student Portal renderer must consume objectives from the signed goal payload'
);

assert.ok(
  studentUi.includes(
    'IEP Objective'
  ) ||
  studentUi.includes(
    'Objectives'
  ),
  'Student Portal must visibly label child objectives'
);

console.log(
  '✓ Student Portal parent goal cards expose applicable objectives read-only'
);

/* -------------------------------------------------------------------------- */
/* Hard Slice 4 boundaries                                                     */
/* -------------------------------------------------------------------------- */

for (
  const [label, source] of [
    ['catalog', catalogSource],
    ['teacher reader', teacherReader],
    ['student reader', studentReader],
    ['teacher UI', teacherUi],
    ['student UI', studentUi],
  ]
) {
  assert.ok(
    !source.includes(
      'objective_data_points'
    ),
    `${label} must not introduce objective evidence storage`
  );

  assert.ok(
    !source.includes(
      'assignment_item_objectives'
    ),
    `${label} must not turn visibility into assignment-objective scoring`
  );
}

assert.ok(
  !teacherUi.includes(
    'upsertObjective'
  ),
  'Teacher Center visibility must remain read-only'
);

assert.ok(
  !studentUi.includes(
    'upsertObjective'
  ),
  'Student Portal visibility must remain read-only'
);

console.log(
  '✓ Slice 4 remains visibility-only with no scoring or objective writes'
);

console.log('');
console.log(
  'GOAL OBJECTIVE VISIBILITY CONTRACT: PASS'
);
