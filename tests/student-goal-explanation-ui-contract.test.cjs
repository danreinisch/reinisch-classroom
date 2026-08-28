'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const ROOT =
  path.join(
    __dirname,
    '..'
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    'utf8'
  );
}

const studentUi =
  read(
    'site/web/student-portal-init.js'
  );

const studentHtml =
  read(
    'site/student/index.html'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

console.log(
  'Running Student Goal Explanation UI contract...'
);


/* -------------------------------------------------------------------------- */
/* Date-only evidence must remain on its recorded calendar date                */
/* -------------------------------------------------------------------------- */

const formatDateMatch =
  studentUi.match(
    /function formatDate\(dateStr\) \{[\s\S]*?\n {2}\}/
  );

assert.ok(
  formatDateMatch,
  'Student Portal formatDate helper must remain discoverable'
);

const formatDateForTest =
  new Function(
    `return (${formatDateMatch[0]});`
  )();

const originalTz =
  process.env.TZ;

try {
  process.env.TZ =
    'America/Chicago';

  assert.strictEqual(
    formatDateForTest(
      '2026-08-27'
    ),
    'Aug 27, 2026',
    'date-only objective evidence must not drift to Aug 26 in Central Time'
  );

  assert.strictEqual(
    formatDateForTest(
      '2026-08-27T00:00:00.000Z'
    ),
    'Aug 26, 2026',
    'full UTC timestamps must retain normal instant/timezone semantics'
  );

  assert.strictEqual(
    formatDateForTest(
      'not-a-date'
    ),
    'N/A',
    'invalid display dates must retain the existing fallback'
  );
} finally {
  if (
    originalTz === undefined
  ) {
    delete process.env.TZ;
  } else {
    process.env.TZ =
      originalTz;
  }
}

assert.match(
  formatDateMatch[0],
  /T00:00:00/,
  'date-only display must use an explicit local-midnight parse'
);

console.log(
  '✓ date-only evidence stays on its recorded calendar date without changing timestamp semantics'
);


/* -------------------------------------------------------------------------- */
/* One authoritative quarter-scoped explanation request                       */
/* -------------------------------------------------------------------------- */

const explanationEndpointMatches =
  studentUi.match(
    /\/\.netlify\/functions\/student-goal-explanations/g
  ) || [];

assert.strictEqual(
  explanationEndpointMatches.length,
  1,
  '5C3B must make one browser request to the Student Goal Explanation endpoint'
);

assert.ok(
  studentUi.includes(
    'loadStudentGoalExplanations'
  ),
  '5C3B must use one explicit Student goal-explanation loader'
);

assert.match(
  studentUi,
  /quarterUtils\s*\.\s*getCurrentQuarter\s*\(\s*\)/,
  '5C3B must derive the active quarter from existing quarter-utils'
);

assert.match(
  studentUi,
  /quarterUtils\s*\.\s*getQuarterDateRange\s*\(/,
  '5C3B must derive start/end from existing quarter-utils'
);

assert.ok(
  studentUi.includes(
    'formatQuarterDateForApi'
  ),
  '5C3B must convert the authorized quarter range to explicit API dates'
);

for (
  const field of [
    'quarter',
    'start',
    'end',
  ]
) {
  assert.ok(
    studentUi.includes(field),
    `5C3B request must include ${field}`
  );
}

console.log(
  '✓ one explicit quarter-scoped explanation request'
);


/* -------------------------------------------------------------------------- */
/* Old raw Student goal evidence path retires from this browser workflow       */
/* -------------------------------------------------------------------------- */

assert.ok(
  !studentUi.includes(
    '/.netlify/functions/student-goal-data-points?'
  ),
  '5C3B Goals UI must stop fetching raw goal_data_points'
);

assert.ok(
  !studentUi.includes(
    '/.netlify/functions/student-goal-progress?'
  ),
  '5C3B Goals UI must stop computing Student goal percentages from raw goal_progress'
);

console.log(
  '✓ old raw Student progress/evidence fetches retire from the Goals UI'
);


/* -------------------------------------------------------------------------- */
/* Goal cards consume explanation-by-code                                     */
/* -------------------------------------------------------------------------- */

assert.match(
  studentUi,
  /function\s+renderGoalCard\s*\(\s*goal\s*,\s*explanationMap\s*,\s*explanationState/,
  'renderGoalCard must consume the browser-safe explanation map rather than raw evidence maps'
);

assert.ok(
  studentUi.includes(
    'goal_code'
  ),
  '5C3B must join explanation rows to official goals by goal code'
);

assert.ok(
  studentUi.includes(
    'buildGoalExplanationHtml'
  ),
  '5C3B must have one dedicated explanation renderer'
);

console.log(
  '✓ goal cards consume 5C3A explanations by goal code'
);


/* -------------------------------------------------------------------------- */
/* Summary -> Calculation -> Evidence                                         */
/* -------------------------------------------------------------------------- */

for (
  const label of [
    'Summary',
    'How this number was calculated',
    'Evidence behind the number',
  ]
) {
  assert.ok(
    studentUi.includes(label),
    `Student explanation UI must visibly include "${label}"`
  );
}

for (
  const calculationKind of [
    'quarter_checkpoint_mean',
    'objective_equal_weight_mean',
    'same_quarter_parent_fallback',
  ]
) {
  assert.ok(
    studentUi.includes(
      calculationKind
    ),
    `5C3B must explicitly handle ${calculationKind}`
  );
}

console.log(
  '✓ explanation follows Summary -> Calculation -> Evidence'
);


/* -------------------------------------------------------------------------- */
/* Current-quarter percentage is authoritative                               */
/* -------------------------------------------------------------------------- */

assert.ok(
  studentUi.includes(
    'formatExplanationPercent'
  ),
  '5C3B must use one explicit explanation-percent formatter'
);

assert.match(
  studentUi,
  /function\s+formatExplanationPercent[\s\S]{0,500}value\s*==\s*null/,
  'percentage formatting must distinguish null/No Data from measured 0%'
);

assert.ok(
  studentUi.includes(
    'This Quarter'
  ),
  'active-quarter progress must be the primary Student progress number'
);

assert.ok(
  studentUi.includes(
    'No Data'
  ),
  'No Data must be visibly distinct from 0%'
);

console.log(
  '✓ measured 0% and No Data remain distinct'
);


/* -------------------------------------------------------------------------- */
/* Dormant/unavailable stays distinct                                         */
/* -------------------------------------------------------------------------- */

assert.ok(
  studentUi.includes(
    'objective_status'
  ),
  '5C3B must consume objective availability state'
);

assert.ok(
  studentUi.includes(
    'Objective progress unavailable'
  ),
  'dormant objective progress must not be labeled No Data'
);

assert.ok(
  studentUi.includes(
    'Progress details temporarily unavailable'
  ),
  'endpoint failure must degrade safely while goal wording remains visible'
);

console.log(
  '✓ dormant/unavailable is distinct from No Data'
);


/* -------------------------------------------------------------------------- */
/* Objective-aware explanation                                                */
/* -------------------------------------------------------------------------- */

assert.ok(
  studentUi.includes(
    'objectiveProgress'
  ),
  'official child objectives must receive their matching explanation progress'
);

assert.ok(
  studentUi.includes(
    'objective_earned'
  ),
  'child objective explanation must use objective earned values'
);

assert.ok(
  studentUi.includes(
    'objective_max'
  ),
  'child objective explanation must use objective maximum values'
);

assert.ok(
  studentUi.includes(
    'IEP objective score'
  ),
  'Student UI must clearly label objective scoring as IEP evidence'
);

assert.ok(
  studentUi.includes(
    'objectives measured this quarter'
  ),
  'parent rollup coverage must remain visible'
);

console.log(
  '✓ parent and child objective calculations remain explainable'
);


/* -------------------------------------------------------------------------- */
/* Exact participating evidence only                                          */
/* -------------------------------------------------------------------------- */

assert.ok(
  studentUi.includes(
    'buildGoalEvidenceHtml'
  ),
  '5C3B must use one student-safe evidence renderer'
);

assert.ok(
  studentUi.includes(
    'GOAL_EVIDENCE_PREVIEW_LIMIT'
  ),
  'evidence catalog must have an explicit preview limit'
);

assert.match(
  studentUi,
  /GOAL_EVIDENCE_PREVIEW_LIMIT\s*=\s*3/,
  'evidence catalog must initially show three items'
);

assert.ok(
  studentUi.includes(
    'Show all'
  ),
  'evidence catalog must offer Show all when additional evidence exists'
);

assert.ok(
  studentUi.includes(
    'Teacher progress check'
  ),
  'manual/unlinked checkpoint must remain explainable without invented question causation'
);

console.log(
  '✓ evidence catalog is concise and provenance-aware'
);


/* -------------------------------------------------------------------------- */
/* Answer-release boundary                                                    */
/* -------------------------------------------------------------------------- */

assert.ok(
  studentUi.includes(
    'answer_review_available'
  ),
  '5C3B evidence renderer must consume the server release flag'
);

assert.match(
  studentUi,
  /answer_review_available\s*===\s*true/,
  'reviewed answer fields must require explicit released state'
);

for (
  const label of [
    'Your answer',
    'Correct answer',
    'Reviewed item score',
  ]
) {
  assert.ok(
    studentUi.includes(label),
    `released evidence UI must support "${label}"`
  );
}

assert.match(
  studentUi,
  /correct_answer\s*!=\s*null|correct_answer\s*!==\s*null/,
  'open-ended work must not manufacture a correct-answer display'
);

console.log(
  '✓ Submitted vs Graded/Reviewed answer release remains explicit'
);


/* -------------------------------------------------------------------------- */
/* Academic and IEP evidence stay visibly separate                            */
/* -------------------------------------------------------------------------- */

assert.ok(
  studentUi.includes(
    'Reviewed item score'
  ),
  'reviewed academic/item score needs a distinct label'
);

assert.ok(
  studentUi.includes(
    'IEP objective score'
  ),
  'objective evidence needs a distinct label'
);

console.log(
  '✓ academic/item scoring and IEP-objective scoring stay visibly separate'
);


/* -------------------------------------------------------------------------- */
/* Teacher-scored writing evidence remains understandable                     */
/* -------------------------------------------------------------------------- */

assert.ok(
  studentUi.includes(
    'component_label'
  ),
  'teacher-scored objective evidence must consume the server-projected component label'
);

assert.ok(
  studentUi.includes(
    'Teacher-scored component'
  ),
  'teacher-scored writing evidence must visibly identify the scored component'
);

assert.ok(
  studentUi.includes(
    'evidence_type'
  ),
  'Student evidence UI should retain safe evidence-type context when available'
);

assert.ok(
  studentUi.includes(
    'support_level'
  ),
  'Student evidence UI should retain safe support-level context when available'
);

assert.ok(
  studentHtml.includes(
    '.st-goal-evidence-meta'
  ),
  'Student Portal must style secondary evidence metadata separately from the work itself'
);

console.log(
  '✓ teacher-scored writing components and safe evidence metadata are labeled'
);


/* -------------------------------------------------------------------------- */
/* Dashboard remains a snapshot while explanation stays accessible            */
/* -------------------------------------------------------------------------- */

assert.match(
  studentUi,
  /containerSuffix\s*===\s*['"]dash['"]/,
  'renderGoalCard must explicitly recognize Dashboard snapshot rendering'
);

assert.ok(
  studentUi.includes(
    'isDashboardSnapshot'
  ),
  'Dashboard explanation collapse state must be explicit'
);

assert.match(
  studentUi,
  /aria-expanded="\$\{isDashboardSnapshot\s*\?\s*['"]false['"]\s*:\s*['"]true['"]\}"/,
  'Dashboard goal progress must start collapsed while Goals-tab progress stays expanded'
);

assert.match(
  studentUi,
  /isDashboardSnapshot\s*\?\s*['"]View Progress['"]\s*:\s*['"]Hide Progress['"]/,
  'Dashboard snapshot must preserve an obvious way to open the full explanation'
);

console.log(
  '✓ Dashboard stays compact without sacrificing explainability'
);


/* -------------------------------------------------------------------------- */
/* Old chart/catalog is no longer the goal explanation                        */
/* -------------------------------------------------------------------------- */

const dotGridInvocations =
  studentUi.match(
    /\bbuildDotGridChart\s*\(/g
  ) || [];

assert.strictEqual(
  dotGridInvocations.length,
  1,
  'buildDotGridChart may remain as dormant legacy code, but renderGoalCard must no longer call it'
);

const progressSvgInvocations =
  studentUi.match(
    /\bbuildProgressSVG\s*\(/g
  ) || [];

assert.strictEqual(
  progressSvgInvocations.length,
  1,
  'buildProgressSVG may remain as dormant legacy code, but renderGoalCard must no longer call it'
);

console.log(
  '✓ chart-centric goal explanation is retired without requiring a rewrite'
);


/* -------------------------------------------------------------------------- */
/* No browser fanout                                                          */
/* -------------------------------------------------------------------------- */

assert.strictEqual(
  explanationEndpointMatches.length,
  1,
  'one explanation request must cover all applicable goals/objectives'
);

assert.ok(
  !studentUi.includes(
    'student-goal-explanations?goal'
  ),
  'browser must not request explanations per goal'
);

assert.ok(
  !studentUi.includes(
    'student-goal-explanations?objective'
  ),
  'browser must not request explanations per objective'
);

console.log(
  '✓ no per-goal or per-objective explanation fanout'
);


/* -------------------------------------------------------------------------- */
/* Student Portal cache bust                                                  */
/* -------------------------------------------------------------------------- */

const scriptRefs = [
  ...studentHtml.matchAll(
    /\/web\/student-portal-init\.js\?v=([^"'<>]+)/g
  ),
];

assert.strictEqual(
  scriptRefs.length,
  1,
  'Student Portal must have exactly one student-portal-init.js cache-key reference'
);

assert.notStrictEqual(
  scriptRefs[0][1],
  '202608231728',
  '5C3B must bump the production Student Portal JS cache key'
);

console.log(
  '✓ Student Portal cache key must move with 5C3B'
);


/* -------------------------------------------------------------------------- */
/* Permanent registration                                                     */
/* -------------------------------------------------------------------------- */

assert.ok(
  packageJson
    ?.scripts
    ?.['test:unit']
    ?.includes(
      'student-goal-explanation-ui-contract.test.cjs'
    ),
  '5C3B UI contract must be permanently registered in test:unit'
);

console.log(
  '✓ 5C3B UI contract is permanently registered'
);


/* -------------------------------------------------------------------------- */
/* Hard boundaries                                                            */
/* -------------------------------------------------------------------------- */

for (
  const forbidden of [
    'sync_goal_objective_registry(',
    'upsertObjective',
    'objective_data_points',
    'assignment_item_objectives',
  ]
) {
  assert.ok(
    !studentUi.includes(forbidden),
    `Student Portal UI must not introduce browser-side objective storage/write behavior: ${forbidden}`
  );
}

console.log(
  '✓ 5C3B remains read-only and does not activate objective storage'
);

console.log('');
console.log(
  'STUDENT GOAL EXPLANATION UI CONTRACT: PASS'
);
