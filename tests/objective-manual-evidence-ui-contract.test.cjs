'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running Manual Objective Evidence Teacher UI contract...\n'
);

const root =
  path.join(__dirname, '..');

function read(relative) {
  return fs.readFileSync(
    path.join(
      root,
      relative
    ),
    'utf8'
  );
}

const adapter =
  read(
    'site/web/data-adapter.js'
  );

const students =
  read(
    'site/web/tc-students.js'
  );

const rosterContext =
  read(
    'netlify/functions/teacher-roster-context.js'
  );

const html =
  read(
    'site/teacher/students/index.html'
  );

const pkg =
  JSON.parse(
    read(
      'package.json'
    )
  );

/* ========================================================================== */
/* Signed adapter boundary                                                     */
/* ========================================================================== */

assert.ok(
  adapter.includes(
    'async saveManualObjectiveEvidence('
  ),
  '5D2 RED: signed manual objective adapter method is not implemented yet'
);

function methodBlock(
  source,
  marker
) {
  const start =
    source.indexOf(marker);

  assert.ok(
    start >= 0,
    `Missing method marker: ${marker}`
  );

  const next =
    source.indexOf(
      '\n  async ',
      start + marker.length
    );

  return source.slice(
    start,
    next >= 0
      ? next
      : source.length
  );
}

const adapterBlock =
  methodBlock(
    adapter,
    'async saveManualObjectiveEvidence('
  );

assert.ok(
  adapterBlock.includes(
    '/.netlify/functions/teacher-manual-objective-evidence'
  ),
  '5D2 adapter must use the dedicated signed 5D1 endpoint'
);

assert.match(
  adapterBlock,
  /method\s*:\s*['"]POST['"]/,
  'manual objective adapter must POST'
);

assert.match(
  adapterBlock,
  /credentials\s*:\s*['"]include['"]/,
  'manual objective adapter must include the signed Teacher cookie'
);

assert.match(
  adapterBlock,
  /cache\s*:\s*['"]no-store['"]/,
  'manual objective adapter must bypass stale HTTP caching'
);

for (
  const requiredField
  of [
    'student_code',
    'parent_goal_code',
    'objective_code',
    'date',
    'objective_earned',
    'objective_max',
    'evidence_type',
    'support_level',
    'notes',
  ]
) {
  assert.ok(
    adapterBlock.includes(
      requiredField
    ),
    `manual objective adapter must transport ${requiredField}`
  );
}

for (
  const forbiddenField
  of [
    'objective_id',
    'student_id',
    'parent_goal_id',
    'goal_id',
    'class_id',
    'assignment_instance_id',
    'item_id',
    'school_year',
    'source',
    'created_at',
    'collected_by',
  ]
) {
  assert.ok(
    !adapterBlock.includes(
      forbiddenField
    ),
    `browser adapter must never transport server-owned ${forbiddenField}`
  );
}

assert.strictEqual(
  (
    adapter.match(
      /\/\.netlify\/functions\/teacher-manual-objective-evidence/g
    ) || []
  ).length,
  1,
  '5D2 must have one canonical browser reference to the manual objective endpoint'
);

console.log(
  '✓ manual objective writes use one signed adapter boundary'
);

/* ========================================================================== */
/* Dedicated Teacher UI components                                             */
/* ========================================================================== */

assert.ok(
  students.includes(
    'function buildManualObjectiveEvidenceForm('
  ),
  '5D2 must isolate manual objective entry markup in a dedicated builder'
);

assert.ok(
  students.includes(
    'async function handleManualObjectiveEvidenceSave('
  ),
  '5D2 must isolate the manual objective save workflow'
);

assert.ok(
  students.includes(
    'db.saveManualObjectiveEvidence({'
  ),
  'Teacher UI must save only through the signed data adapter'
);

assert.ok(
  !students.includes(
    '/.netlify/functions/teacher-manual-objective-evidence'
  ),
  'Teacher UI must not bypass the shared data adapter'
);

assert.ok(
  !students.includes(
    'objective_data_points'
  ),
  'Teacher browser must never directly address the objective evidence table'
);

console.log(
  '✓ Teacher UI uses a dedicated builder/handler and never bypasses the adapter'
);

/* ========================================================================== */
/* Dormant-safe activation behavior                                            */
/* ========================================================================== */

for (
  const marker
  of [
    'parentAddressedInClass = null',
    'parentIndividualDelivery = null',
    'parentAddressedInClass === true',
    'parentIndividualDelivery === false',
  ]
) {
  assert.ok(
    students.includes(marker),
    `manual evidence UI permission gate must include ${marker}`
  );
}

assert.match(
  students,
  /const canRecordManualEvidence\s*=\s*[\s\S]{0,260}stateAvailable[\s\S]{0,260}parentAddressedInClass\s*===\s*true[\s\S]{0,260}parentIndividualDelivery\s*===\s*false/,
  'manual entry requires signed objective availability plus explicit in-class, non-individual parent delivery'
);

assert.match(
  students,
  /renderGoalObjectives\([\s\S]{0,420}goal\.addressed_in_class,[\s\S]{0,120}goal\.individual_delivery/,
  'parent delivery flags must be passed into the objective renderer'
);

assert.match(
  rosterContext,
  /addressed_in_class:\s*goal\.addressed_in_class\s*===\s*true/,
  'Teacher roster transport must expose a fail-closed addressed_in_class boolean'
);

assert.match(
  rosterContext,
  /individual_delivery:\s*goal\.individual_delivery\s*===\s*true/,
  'Teacher roster transport must expose a fail-closed individual_delivery boolean'
);

assert.match(
  students,
  /canRecordManualEvidence\s*\?[\s\S]{0,800}buildManualObjectiveEvidenceForm/,
  'manual evidence form must render only after the explicit permission gate passes'
);

assert.ok(
  students.includes(
    'Objective progress is unavailable right now. Official objective wording remains visible.'
  ),
  'existing dormant objective wording must remain intact'
);

console.log(
  '✓ manual write control requires signed objective availability plus eligible parent delivery'
);

/* ========================================================================== */
/* Per-objective identity                                                      */
/* ========================================================================== */

const builderStart =
  students.indexOf(
    'function buildManualObjectiveEvidenceForm('
  );

const handlerStart =
  students.indexOf(
    'async function handleManualObjectiveEvidenceSave('
  );

assert.ok(
  builderStart >= 0 &&
  handlerStart > builderStart,
  'manual objective builder/handler order must be identifiable'
);

const builderBlock =
  students.slice(
    builderStart,
    handlerStart
  );

for (
  const identityMarker
  of [
    'student_code',
    'parent_goal_code',
    'objective_code',
  ]
) {
  assert.ok(
    builderBlock.includes(
      identityMarker
    ),
    `manual entry builder must preserve public ${identityMarker} identity`
  );
}

for (
  const forbiddenIdentity
  of [
    'objective_id',
    'student_id',
    'parent_goal_id',
    'assignment_instance_id',
    'item_id',
  ]
) {
  assert.ok(
    !builderBlock.includes(
      forbiddenIdentity
    ),
    `manual entry builder must not carry ${forbiddenIdentity}`
  );
}

console.log(
  '✓ each entry form carries public student/parent/objective codes only'
);

/* ========================================================================== */
/* Teacher-friendly manual/binder form                                         */
/* ========================================================================== */

for (
  const marker
  of [
    'Record Evidence',
    'Binder',
    'Manual probe',
    'Earned',
    'Out of',
    'Date',
    'Support / prompting',
    'Optional note',
    'binder',
    'manual_probe',
    'objective_earned',
    'objective_max',
    'evidence_type',
    'support_level',
    'notes',
  ]
) {
  assert.ok(
    builderBlock.includes(
      marker
    ),
    `manual objective form must include: ${marker}`
  );
}

assert.match(
  builderBlock,
  /type=["']number["'][\s\S]{0,240}objective_earned/,
  'objective earned must use a numeric input'
);

assert.match(
  builderBlock,
  /type=["']number["'][\s\S]{0,240}objective_max/,
  'objective max must use a numeric input'
);

assert.match(
  builderBlock,
  /type=["']date["']/,
  'manual objective evidence must have an explicit date input'
);

console.log(
  '✓ manual/binder form captures date, independent earned/max, context, and notes'
);

/* ========================================================================== */
/* Save handler                                                                */
/* ========================================================================== */

const nextFunction =
  students.indexOf(
    '\n  function ',
    handlerStart + 20
  );

const nextAsyncFunction =
  students.indexOf(
    '\n  async function ',
    handlerStart + 20
  );

const handlerEndCandidates =
  [
    nextFunction,
    nextAsyncFunction,
  ].filter(
    value =>
      value > handlerStart
  );

const handlerEnd =
  handlerEndCandidates.length > 0
    ? Math.min(
        ...handlerEndCandidates
      )
    : students.length;

const handlerBlock =
  students.slice(
    handlerStart,
    handlerEnd
  );

for (
  const field
  of [
    'student_code',
    'parent_goal_code',
    'objective_code',
    'date',
    'objective_earned',
    'objective_max',
    'evidence_type',
    'support_level',
    'notes',
  ]
) {
  assert.ok(
    handlerBlock.includes(
      field
    ),
    `save handler must send ${field}`
  );
}

for (
  const forbidden
  of [
    'objective_id',
    'student_id',
    'parent_goal_id',
    'goal_id',
    'class_id',
    'assignment_instance_id',
    'item_id',
    'school_year',
    'source',
    'collected_by',
  ]
) {
  assert.ok(
    !handlerBlock.includes(
      forbidden
    ),
    `save handler must not send server-owned ${forbidden}`
  );
}

assert.ok(
  !handlerBlock.includes(
    'upsertGoalProgress'
  ),
  'manual objective save must never mutate parent goal progress'
);

assert.ok(
  !handlerBlock.includes(
    'teacher-sync-observations'
  ),
  '5D2 must remain separate from the Observation Tray'
);

assert.ok(
  !handlerBlock.includes(
    'localStorage'
  ),
  'IEP objective evidence must never be persisted in browser localStorage'
);

assert.ok(
  handlerBlock.includes(
    'objectiveProgressCache.clear()'
  ),
  'successful manual save must invalidate objective progress cache'
);

assert.ok(
  handlerBlock.includes(
    'renderExpandedDetail(studentCode)'
  ),
  'successful manual save must refresh the current Teacher Student detail'
);

assert.match(
  handlerBlock,
  /available\s*===\s*false|available\s*!==\s*true/,
  'server unavailable response must not be treated as a successful save'
);

console.log(
  '✓ save workflow stays objective-only and refreshes signed progress after save'
);

/* ========================================================================== */
/* No automatic/manual write during rendering                                 */
/* ========================================================================== */

const renderStart =
  students.indexOf(
    'function renderGoalObjectives('
  );

assert.ok(
  renderStart >= 0,
  'existing child-objective renderer must remain present'
);

const renderEnd =
  students.indexOf(
    '\n  function ',
    renderStart + 30
  );

const renderBlock =
  students.slice(
    renderStart,
    renderEnd > renderStart
      ? renderEnd
      : students.length
  );

assert.ok(
  !renderBlock.includes(
    'db.saveManualObjectiveEvidence({'
  ),
  'rendering an objective must never write evidence automatically'
);

assert.ok(
  renderBlock.includes(
    'buildManualObjectiveEvidenceForm'
  ),
  'objective row renderer must attach the entry form declaratively'
);

console.log(
  '✓ rendering objectives cannot create evidence'
);

/* ========================================================================== */
/* Student-facing and Observation workflows remain untouched                  */
/* ========================================================================== */

assert.ok(
  !students.includes(
    'saveObservation(goal'
  ) ||
  !handlerBlock.includes(
    'saveObservation(goal'
  ),
  'manual objective handler must not invoke Observation Tray save behavior'
);

assert.ok(
  !html.includes(
    'teacher-manual-objective-evidence'
  ),
  'Teacher HTML must never address the server mutation directly'
);

console.log(
  '✓ Observation Tray and direct HTML/server coupling remain separate'
);

/* ========================================================================== */
/* Styling / cache-bust contract                                               */
/* ========================================================================== */

for (
  const cssMarker
  of [
    '.st-objective-manual-entry',
    '.st-objective-manual-form',
    '.st-objective-manual-actions',
    '.st-objective-manual-status',
  ]
) {
  assert.ok(
    html.includes(
      cssMarker
    ),
    `Teacher Students HTML must style ${cssMarker}`
  );
}

assert.ok(
  /\/web\/tc-students\.js\?v=[^"'<>]+/.test(
    html
  ),
  'Teacher Students page must publish a versioned tc-students cache key'
);

console.log(
  '✓ 5D2 UI styling and production cache-bust are permanent'
);

/* ========================================================================== */
/* Permanent test registration                                                */
/* ========================================================================== */

assert.ok(
  pkg.scripts['test:unit']
    .includes(
      'tests/objective-manual-evidence-ui-contract.test.cjs'
    ),
  '5D2 contract must be permanently registered in test:unit'
);

console.log(
  '✓ 5D2 UI contract is permanently registered'
);

/* ========================================================================== */
/* Browser write-surface guard                                                */
/* ========================================================================== */

for (
  const forbiddenBrowserMarker
  of [
    'sync_goal_objective_registry',
    "from('objective_data_points')",
    'from("objective_data_points")',
    "from('goal_objectives')",
    'from("goal_objectives")',
  ]
) {
  assert.ok(
    !students.includes(
      forbiddenBrowserMarker
    ),
    `Teacher UI must not contain ${forbiddenBrowserMarker}`
  );
}

console.log(
  '✓ Teacher browser cannot activate or directly mutate objective storage'
);

console.log('');
console.log(
  'MANUAL OBJECTIVE EVIDENCE TEACHER UI CONTRACT: PASS'
);
