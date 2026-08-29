'use strict';

const assert =
  require('assert');

const {
  BROWSER_OBJECTIVE_FIELDS,
  buildObjectiveRegistryPath,
  normalizeObjectiveRegistryRows,
  projectBrowserObjective,
  indexObjectiveRegistryRowsByParent,
  getBrowserObjectivesForParent,
} = require(
  '../netlify/functions/_lib/goal-objective-registry-reader'
);

console.log(
  'Running DB-backed objective registry reader tests...\n'
);

const rows = [
  {
    id: 'obj-2',
    student_id: 'student-069',
    parent_goal_id: 'goal-069-cg1',
    student_code: 'S069',
    parent_goal_code: 'S069.CG1',
    code: 'S069.CG1.O2',
    goal_area: 'Reading Comprehension',
    objective_number: 2,
    objective_text:
      'Identify main ideas and supporting details and make inferences in informational text.',
    baseline:
      'MAP Reading Informational Text RIT 218',
    objective_wording_criterion:
      'MAP Reading Informational Text RIT 222',
    mastery_field: '222',
    parent_goal_criterion:
      'Parent Reading goal target: MAP Reading RIT 220',
    dan_monitoring_role:
      'Primary',
    assignment_evidence_mode:
      'Informational-text comprehension probe',
    rc_objective_status:
      'Hold — transfer/local adoption & RC onboarding',
    source_qa_notes:
      'internal QA text',
    active: true,
  },
  {
    id: 'obj-1',
    student_id: 'student-069',
    parent_goal_id: 'goal-069-cg1',
    student_code: 'S069',
    parent_goal_code: 'S069.CG1',
    code: 'S069.CG1.O1',
    goal_area: 'Reading Comprehension',
    objective_number: 1,
    objective_text:
      'Determine the meaning of unfamiliar academic and domain-specific words and phrases using context clues, prefixes/suffixes, and reference tools.',
    baseline:
      'MAP Reading Vocabulary RIT 211',
    objective_wording_criterion:
      'MAP Reading Vocabulary RIT 216',
    mastery_field: '216',
    parent_goal_criterion:
      'Parent Reading goal target: MAP Reading RIT 220',
    dan_monitoring_role:
      'Primary',
    assignment_evidence_mode:
      'Reading/vocabulary probe',
    rc_objective_status:
      'Hold — transfer/local adoption & RC onboarding',
    source_qa_notes:
      'internal QA text',
    active: true,
  },
  {
    id: 'inactive',
    student_id: 'student-069',
    parent_goal_id: 'goal-069-cg1',
    student_code: 'S069',
    parent_goal_code: 'S069.CG1',
    code: 'S069.CG1.O3',
    goal_area: 'Reading Comprehension',
    objective_number: 3,
    objective_text:
      'Inactive test row',
    active: false,
  },
  {
    id: 'obj-s015',
    student_id: 'student-015',
    parent_goal_id: 'goal-015-cg3',
    student_code: 'S015',
    parent_goal_code: 'S015.CG3',
    code: 'S015.CG3.O1',
    goal_area: 'Life Skills Math Skills',
    objective_number: 1,
    objective_text:
      'Solve 2-step math problems',
    baseline: null,
    objective_wording_criterion:
      '50% accuracy',
    mastery_field: null,
    parent_goal_criterion:
      'Per objective',
    dan_monitoring_role:
      'Excluded — Math',
    assignment_evidence_mode:
      'No RC assignment evidence — Math excluded',
    rc_objective_status:
      'Captured — excluded from Dan-primary monitoring',
    source_qa_notes:
      'internal QA text',
    active: true,
  },
];

const normalized =
  normalizeObjectiveRegistryRows(
    rows
  );

assert.deepStrictEqual(
  normalized.map(
    row => row.code
  ),
  [
    'S015.CG3.O1',
    'S069.CG1.O1',
    'S069.CG1.O2',
  ],
  'active registry rows must be returned in stable student/parent/objective order'
);

console.log(
  '✓ active database rows normalize and sort deterministically'
);

const s069Only =
  normalizeObjectiveRegistryRows(
    rows,
    {
      studentCode:
        's069',
    }
  );

assert.deepStrictEqual(
  s069Only.map(
    row => row.code
  ),
  [
    'S069.CG1.O1',
    'S069.CG1.O2',
  ],
  'student-scoped normalization must not cross student identity'
);

console.log(
  '✓ student boundary is enforced'
);

const index =
  indexObjectiveRegistryRowsByParent(
    rows
  );

const s069 =
  getBrowserObjectivesForParent(
    index,
    'S069.CG1',
    'S069'
  );

assert.deepStrictEqual(
  s069.map(
    row => row.code
  ),
  [
    'S069.CG1.O1',
    'S069.CG1.O2',
  ],
  'parent lookup must preserve official objective order'
);

assert.deepStrictEqual(
  Object.keys(
    s069[0]
  ),
  [...BROWSER_OBJECTIVE_FIELDS],
  'browser projection must preserve the established objective field shape'
);

for (const forbidden of [
  'id',
  'student_id',
  'parent_goal_id',
  'dan_monitoring_role',
  'assignment_evidence_mode',
  'rc_objective_status',
  'source_qa_notes',
  'active',
]) {
  assert.ok(
    !Object.prototype
      .hasOwnProperty.call(
        s069[0],
        forbidden
      ),
    `browser projection must exclude ${forbidden}`
  );
}

console.log(
  '✓ browser projection excludes UUID/internal monitoring/status/QA metadata'
);

assert.deepStrictEqual(
  getBrowserObjectivesForParent(
    index,
    'S069.CG1',
    'S015'
  ),
  [],
  'wrong student must never receive another student objective'
);

assert.deepStrictEqual(
  getBrowserObjectivesForParent(
    index,
    'S999.CG1',
    'S999'
  ),
  [],
  'unknown parent must remain a harmless empty result'
);

console.log(
  '✓ jointly scoped parent/student lookup is fail-safe'
);

const firstProjection =
  projectBrowserObjective(
    rows[1]
  );

firstProjection.objective_text =
  'MUTATED TEST VALUE';

const secondProjection =
  projectBrowserObjective(
    rows[1]
  );

assert.notStrictEqual(
  secondProjection.objective_text,
  'MUTATED TEST VALUE',
  'browser callers must receive fresh projection objects'
);

console.log(
  '✓ projection callers cannot mutate source registry rows'
);

assert.throws(
  () =>
    normalizeObjectiveRegistryRows([
      {
        ...rows[1],
        objective_number: 2,
      },
    ]),
  /OBJECTIVE_REGISTRY_NUMBER_MISMATCH/,
  'objective code/number mismatch must fail loudly'
);

assert.throws(
  () =>
    normalizeObjectiveRegistryRows([
      rows[1],
      {
        ...rows[1],
        id: 'duplicate-code',
      },
    ]),
  /OBJECTIVE_REGISTRY_DUPLICATE_CODE/,
  'duplicate active objective code must fail loudly'
);

console.log(
  '✓ malformed and duplicate active registry identity fails loudly'
);

const studentPath =
  buildObjectiveRegistryPath({
    studentId:
      'student 069',
  });

assert.ok(
  studentPath.startsWith(
    '/rest/v1/goal_objectives?select='
  ),
  'registry reader must target the server-only goal_objectives table'
);

assert.ok(
  studentPath.includes(
    '&active=eq.true'
  ),
  'registry reader must request active objective rows only'
);

assert.ok(
  studentPath.includes(
    '&student_id=eq.student%20069'
  ),
  'student id filter must be URL encoded'
);

assert.ok(
  studentPath.includes(
    '&order=student_code.asc,parent_goal_code.asc,objective_number.asc,code.asc'
  ),
  'registry reader order must be deterministic'
);

const parentPath =
  buildObjectiveRegistryPath({
    parentGoalIds: [
      'goal-a',
      'goal-b',
    ],
  });

assert.ok(
  parentPath.includes(
    '&parent_goal_id=in.(goal-a,goal-b)'
  ),
  'parent-goal UUID filtering must be supported for objective-progress reads'
);

console.log(
  '✓ query builder supports student-scoped and parent-scoped server reads'
);

console.log('');
console.log(
  'DB-BACKED OBJECTIVE REGISTRY READER: PASS'
);
