'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running Manual Objective Evidence server contract...\n'
);

const repoRoot =
  path.join(__dirname, '..');

const helperRel =
  'netlify/functions/_lib/' +
  'objective-manual-evidence-writer.js';

const endpointRel =
  'netlify/functions/' +
  'teacher-manual-objective-evidence.js';

const helperPath =
  path.join(
    repoRoot,
    helperRel
  );

const endpointPath =
  path.join(
    repoRoot,
    endpointRel
  );

const packagePath =
  path.join(
    repoRoot,
    'package.json'
  );

/* ========================================================================== */
/* Foundation must exist                                                      */
/* ========================================================================== */

assert.ok(
  fs.existsSync(helperPath),
  '5D1 RED: manual objective writer helper is not implemented yet'
);

assert.ok(
  fs.existsSync(endpointPath),
  '5D1 RED: signed manual objective evidence endpoint is not implemented yet'
);

const helperSource =
  fs.readFileSync(
    helperPath,
    'utf8'
  );

const endpointSource =
  fs.readFileSync(
    endpointPath,
    'utf8'
  );

const {
  MANUAL_OBJECTIVE_EVIDENCE_TYPES,
  normalizeManualObjectiveRequest,
  schoolYearFromObjectiveDate,
  buildManualObjectiveEvidenceRow,
  projectManualObjectiveEvidenceResult,
} = require(helperPath);

/* ========================================================================== */
/* Browser-facing identity contract                                           */
/* ========================================================================== */

assert.deepStrictEqual(
  MANUAL_OBJECTIVE_EVIDENCE_TYPES,
  [
    'binder',
    'manual_probe',
  ],
  '5D1 keeps manual/binder evidence vocabulary intentionally narrow'
);

const validInput =
  normalizeManualObjectiveRequest({
    student_code:
      ' s015 ',
    parent_goal_code:
      ' s015.cg1 ',
    objective_code:
      ' s015.cg1.o2 ',
    date:
      '2026-08-25',
    objective_earned:
      3,
    objective_max:
      5,
    evidence_type:
      'binder',
    support_level:
      ' verbal prompt ',
    notes:
      ' Used guided binder notes. ',
  });

assert.deepStrictEqual(
  validInput,
  {
    student_code:
      'S015',
    parent_goal_code:
      'S015.CG1',
    objective_code:
      'S015.CG1.O2',
    date:
      '2026-08-25',
    objective_earned:
      3,
    objective_max:
      5,
    evidence_type:
      'binder',
    support_level:
      'verbal prompt',
    notes:
      'Used guided binder notes.',
  },
  'browser request must normalize only public objective codes and manual evidence fields'
);

console.log(
  '✓ browser identity uses student + parent + objective codes'
);

/* ========================================================================== */
/* Caller may NEVER supply canonical/internal identity                        */
/* ========================================================================== */

const forbiddenCallerFields = [
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
];

for (
  const forbidden
  of forbiddenCallerFields
) {
  assert.throws(
    () =>
      normalizeManualObjectiveRequest({
        student_code:
          'S015',
        parent_goal_code:
          'S015.CG1',
        objective_code:
          'S015.CG1.O2',
        date:
          '2026-08-25',
        objective_earned:
          1,
        objective_max:
          2,
        evidence_type:
          'binder',
        [forbidden]:
          'caller-controlled-value',
      }),
    /forbidden|caller|identity|server/i,
    `browser must not control ${forbidden}`
  );
}

console.log(
  '✓ browser cannot supply UUIDs, provenance, source, or school year'
);

/* ========================================================================== */
/* Manual objective math is independent from academics                        */
/* ========================================================================== */

assert.throws(
  () =>
    normalizeManualObjectiveRequest({
      student_code:
        'S015',
      parent_goal_code:
        'S015.CG1',
      objective_code:
        'S015.CG1.O2',
      date:
        '2026-08-25',
      objective_earned:
        null,
      objective_max:
        5,
      evidence_type:
        'binder',
    }),
  /earned|required|number/i,
  'No Data must not silently become zero'
);

assert.throws(
  () =>
    normalizeManualObjectiveRequest({
      student_code:
        'S015',
      parent_goal_code:
        'S015.CG1',
      objective_code:
        'S015.CG1.O2',
      date:
        '2026-08-25',
      objective_earned:
        6,
      objective_max:
        5,
      evidence_type:
        'binder',
    }),
  /earned|max|range/i,
  'objective earned cannot exceed objective max'
);

assert.throws(
  () =>
    normalizeManualObjectiveRequest({
      student_code:
        'S015',
      parent_goal_code:
        'S015.CG1',
      objective_code:
        'S015.CG1.O2',
      date:
        '2026-08-25',
      objective_earned:
        0,
      objective_max:
        0,
      evidence_type:
        'binder',
    }),
  /max|greater|positive/i,
  'objective max must be greater than zero'
);

const measuredZero =
  normalizeManualObjectiveRequest({
    student_code:
      'S015',
    parent_goal_code:
      'S015.CG1',
    objective_code:
      'S015.CG1.O2',
    date:
      '2026-08-25',
    objective_earned:
      0,
    objective_max:
      5,
    evidence_type:
      'binder',
  });

assert.strictEqual(
  measuredZero.objective_earned,
  0,
  'measured 0 must remain real objective evidence'
);

console.log(
  '✓ measured 0 is evidence while missing measurement is rejected'
);

/* ========================================================================== */
/* Manual evidence vocabulary stays separate from Observation Tray work       */
/* ========================================================================== */

assert.throws(
  () =>
    normalizeManualObjectiveRequest({
      student_code:
        'S015',
      parent_goal_code:
        'S015.CG1',
      objective_code:
        'S015.CG1.O2',
      date:
        '2026-08-25',
      objective_earned:
        1,
      objective_max:
        2,
      evidence_type:
        'observation',
    }),
  /evidence.type|binder|manual.probe/i,
  '5D1 must not absorb the separate Observation Tray workflow'
);

console.log(
  '✓ 5D1 does not retrofit Observation Tray semantics'
);

/* ========================================================================== */
/* School-year provenance is server-derived from the evidence date            */
/* ========================================================================== */

assert.strictEqual(
  schoolYearFromObjectiveDate(
    '2026-08-25'
  ),
  '2026',
  'August 2026 belongs to operational school year 2026'
);

assert.strictEqual(
  schoolYearFromObjectiveDate(
    '2027-01-05'
  ),
  '2026',
  'January 2027 remains in school year 2026'
);

assert.strictEqual(
  schoolYearFromObjectiveDate(
    '2027-07-15'
  ),
  '2026',
  'July 2027 remains in school year 2026'
);

assert.throws(
  () =>
    schoolYearFromObjectiveDate(
      'not-a-date'
    ),
  /date|school year/i,
  'invalid dates must fail closed'
);

console.log(
  '✓ school year is derived server-side from evidence date'
);

/* ========================================================================== */
/* DB row contract: manual means truly unlinked                               */
/* ========================================================================== */

const objectiveId =
  '11111111-1111-4111-8111-111111111111';

const studentId =
  '22222222-2222-4222-8222-222222222222';

const row =
  buildManualObjectiveEvidenceRow({
    input:
      validInput,
    objectiveId,
    studentId,
    schoolYear:
      '2026',
  });

assert.deepStrictEqual(
  row,
  {
    objective_id:
      objectiveId,
    student_id:
      studentId,

    assignment_instance_id:
      null,
    item_id:
      null,

    objective_earned:
      3,
    objective_max:
      5,

    question_text:
      null,
    choices:
      null,
    student_answer:
      null,
    correct_answer:
      null,
    is_correct:
      null,
    component_label:
      null,

    support_level:
      'verbal prompt',
    evidence_type:
      'binder',

    source:
      'manual',
    notes:
      'Used guided binder notes.',

    date:
      '2026-08-25',
    school_year:
      '2026',
  },
  'manual objective evidence must preserve only canonical manual provenance'
);

for (
  const academicField
  of [
    'earned_points',
    'max_points',
    'score',
    'score_total',
    'submission_id',
    'assignment_id',
  ]
) {
  assert.ok(
    !Object.prototype.hasOwnProperty.call(
      row,
      academicField
    ),
    `manual objective evidence must not contain ${academicField}`
  );
}

console.log(
  '✓ manual objective row is unlinked and academically independent'
);

/* ========================================================================== */
/* Browser-safe save response                                                 */
/* ========================================================================== */

const projected =
  projectManualObjectiveEvidenceResult({
    input:
      validInput,
    row,
  });

assert.deepStrictEqual(
  projected,
  {
    student_code:
      'S015',
    parent_goal_code:
      'S015.CG1',
    objective_code:
      'S015.CG1.O2',
    date:
      '2026-08-25',
    objective_earned:
      3,
    objective_max:
      5,
    percentage:
      60,
    evidence_type:
      'binder',
    support_level:
      'verbal prompt',
  },
  'save response should explain the saved measurement without exposing internal IDs'
);

const projectedText =
  JSON.stringify(projected);

for (
  const secretKey
  of [
    'objective_id',
    'student_id',
    'parent_goal_id',
    'goal_id',
    'class_id',
    'assignment_instance_id',
    'item_id',
    'school_year',
    'created_at',
    'notes',
  ]
) {
  assert.ok(
    !projectedText.includes(
      `"${secretKey}"`
    ),
    `browser-safe save response must exclude ${secretKey}`
  );
}

console.log(
  '✓ save response exposes no internal identity or teacher note'
);

/* ========================================================================== */
/* Signed endpoint architecture                                               */
/* ========================================================================== */

assert.match(
  endpointSource,
  /requireTeacher/,
  'manual objective evidence endpoint must require signed Teacher authentication'
);

assert.match(
  endpointSource,
  /getObjectivesForParentGoal/,
  'server must preflight student + parent + objective against canonical source catalog'
);

assert.match(
  endpointSource,
  /goal_objectives/,
  'server must resolve normalized DB objective identity'
);

assert.match(
  endpointSource,
  /objective_data_points/,
  'server must own objective evidence mutation'
);

assert.match(
  endpointSource,
  /schema_unavailable/,
  'dormant objective schema must fail explicitly as unavailable'
);

assert.match(
  endpointSource,
  /active=eq\.true|active.*eq\.true/i,
  'server must require active canonical records'
);

assert.match(
  endpointSource,
  /class_enrollments/,
  'server must verify active class enrollment'
);

assert.match(
  endpointSource,
  /teacher_id/,
  'server must verify teacher-owned class context'
);

assert.match(
  endpointSource,
  /archived_at/,
  'server must reject archived students'
);

console.log(
  '✓ server owns auth, enrollment, parent, and objective resolution'
);

/* ========================================================================== */
/* Endpoint is a narrow POST-only manual writer                               */
/* ========================================================================== */

assert.match(
  endpointSource,
  /httpMethod[\s\S]*POST/,
  'manual objective endpoint must explicitly enforce POST semantics'
);

assert.match(
  endpointSource,
  /OPTIONS/,
  'manual objective endpoint must support CORS preflight'
);

for (
  const forbiddenRestPath
  of [
    '/rest/v1/goal_progress',
    '/rest/v1/goal_data_points',
    '/rest/v1/submissions',
    '/rest/v1/submission_answers',
    '/rest/v1/assignment_instances',
    '/rest/v1/assignment_items',
    '/rest/v1/assignment_item_objectives',
  ]
) {
  assert.ok(
    !endpointSource.includes(
      forbiddenRestPath
    ),
    `manual objective endpoint must not access ${forbiddenRestPath}`
  );
}

assert.ok(
  !endpointSource.includes(
    'sync_goal_objective_registry'
  ),
  '5D1 must never activate the objective registry'
);

assert.ok(
  !endpointSource.includes(
    'objective-auto-evidence-writer'
  ),
  'manual evidence must not reuse the assignment auto writer'
);

assert.ok(
  !endpointSource.includes(
    'objective-review-evidence-writer'
  ),
  'manual evidence must not reuse the assignment Review writer'
);

console.log(
  '✓ manual writer cannot mutate parent, assignment, submission, or activation paths'
);

/* ========================================================================== */
/* Source-level DB provenance                                                  */
/* ========================================================================== */

assert.match(
  helperSource,
  /source[\s\S]*manual/,
  'manual evidence helper must force source=manual'
);

assert.match(
  helperSource,
  /assignment_instance_id[\s\S]*null/,
  'manual evidence helper must force NULL assignment instance'
);

assert.match(
  helperSource,
  /item_id[\s\S]*null/,
  'manual evidence helper must force NULL item provenance'
);

assert.doesNotMatch(
  helperSource,
  /\bearned_points\b/,
  'manual objective helper must never use academic earned_points'
);

assert.doesNotMatch(
  helperSource,
  /\bmax_points\b/,
  'manual objective helper must never use academic max_points'
);

console.log(
  '✓ helper permanently separates IEP objective measurement from academics'
);

/* ========================================================================== */
/* Permanent registration                                                     */
/* ========================================================================== */

const packageJson =
  JSON.parse(
    fs.readFileSync(
      packagePath,
      'utf8'
    )
  );

assert.ok(
  packageJson.scripts['test:unit']
    .includes(
      'tests/objective-manual-evidence-contract.test.cjs'
    ),
  '5D1 contract must be permanently registered in test:unit'
);

console.log(
  '✓ 5D1 contract is permanently registered'
);

console.log('');
console.log(
  'MANUAL OBJECTIVE EVIDENCE SERVER CONTRACT: PASS'
);
