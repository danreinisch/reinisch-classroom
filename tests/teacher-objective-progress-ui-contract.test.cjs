'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root =
  path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

const adapter =
  read('site/web/data-adapter.js');

const students =
  read('site/web/tc-students.js');

const studentsIndex =
  read('site/teacher/students/index.html');

function functionSlice(
  source,
  functionName,
  nextFunctionName
) {
  const start =
    source.indexOf(
      `function ${functionName}`
    );

  assert(
    start >= 0,
    `expected function ${functionName}`
  );

  if (!nextFunctionName) {
    return source.slice(start);
  }

  const end =
    source.indexOf(
      `function ${nextFunctionName}`,
      start + 1
    );

  assert(
    end > start,
    `expected function ${nextFunctionName} after ${functionName}`
  );

  return source.slice(start, end);
}

/*
 * Signed browser transport.
 */
assert(
  adapter.includes(
    'listObjectiveProgress'
  ),
  '5C2 RED: data adapter must expose signed objective-progress reader'
);

assert(
  adapter.includes(
    '/.netlify/functions/teacher-objective-progress'
  ),
  'objective progress must travel through the signed Netlify boundary'
);

assert(
  adapter.includes(
    "credentials: 'include'"
  ) ||
    adapter.includes(
      'credentials: "include"'
    ) ||
    adapter.includes(
      "credentials: 'same-origin'"
    ) ||
    adapter.includes(
      'credentials: "same-origin"'
    ),
  'signed Teacher cookie must accompany objective-progress reads'
);

assert(
  !adapter.includes(
    '/rest/v1/goal_objectives'
  ) &&
    !adapter.includes(
      '/rest/v1/objective_data_points'
    ),
  'browser adapter must never read dormant objective tables directly'
);

/*
 * Teacher Center lazy enrichment.
 */
assert(
  students.includes(
    'objectiveProgressCache'
  ),
  '5C2 RED: Teacher Center needs a per-student/quarter objective cache'
);

assert(
  students.includes(
    'loadObjectiveProgressForStudent'
  ),
  'Teacher Center needs one lazy objective-progress loader'
);

assert(
  students.includes(
    'listObjectiveProgress'
  ),
  'lazy loader must use the signed data-adapter method'
);

assert(
  students.includes(
    'getQuarterDateRange'
  ),
  'browser must derive dates from the existing canonical quarter utility'
);

assert(
  students.includes(
    'selectedQuarter || getCurrentQuarter()'
  ),
  'objective enrichment must use selected quarter, with current-quarter fallback'
);

assert(
  students.includes(
    'deferOptionalEnrichment'
  ),
  'objective progress must respect the existing boot-enrichment deferral'
);

/*
 * No initial-load fanout.
 */
const loadDataStart =
  students.indexOf(
    'async function loadData'
  );

assert(
  loadDataStart >= 0,
  'Teacher Center loadData function must remain discoverable'
);

const loadDataEnd =
  students.indexOf(
    '\n  function ',
    loadDataStart + 1
  );

const loadData =
  students.slice(
    loadDataStart,
    loadDataEnd > loadDataStart
      ? loadDataEnd
      : undefined
  );

assert(
  !loadData.includes(
    'listObjectiveProgress'
  ),
  'initial Teacher Center load must not launch objective-progress fanout'
);

assert(
  students.includes(
    'Array.isArray(goal.objectives)'
  ) ||
    students.includes(
      'Array.isArray(g.objectives)'
    ),
  'browser must skip objective request when student has no canonical child objectives'
);

/*
 * Existing IEP Objectives box is enriched in place.
 */
const objectivesRenderer =
  functionSlice(
    students,
    'renderGoalObjectives',
    'renderGoalCard'
  );

assert(
  objectivesRenderer.includes(
    'percentage'
  ),
  'IEP Objectives renderer must display server-derived child percentages'
);

assert(
  objectivesRenderer.includes(
    'No Data'
  ),
  'child objective with no same-quarter evidence must display No Data'
);

assert(
  objectivesRenderer.includes(
    'objectives with data'
  ) ||
    objectivesRenderer.includes(
      'objectives_with_data'
    ),
  'objective box must display measured-child coverage'
);

assert(
  objectivesRenderer.includes(
    'parent'
  ) &&
    objectivesRenderer.includes(
      'fallback'
    ),
  'parent-only fallback must be clearly labeled rather than masquerading as child rollup'
);

assert(
  objectivesRenderer.includes(
    'evidence_count'
  ) ||
    objectivesRenderer.includes(
      'evidence'
    ),
  'Teacher objective row should show understandable evidence count/context'
);

/*
 * Dormant objective schema is not equivalent to No Data.
 * If server reports unavailable, existing Slice 4 definitions stay visible
 * without inventing zero-evidence percentages.
 */
assert(
  students.includes(
    'available'
  ) &&
    students.includes(
      'schema_unavailable'
    ),
  'Teacher Center must distinguish unavailable dormant schema from genuine No Data'
);

/*
 * Objective display must remain isolated from legacy parent semantics.
 */
assert(
  !objectivesRenderer.includes(
    'computeGoalAlertStatus'
  ),
  'objective percentages must not feed mastery/regression logic'
);

assert(
  !objectivesRenderer.includes(
    'renderQuarterlyAverages'
  ),
  'objective percentages must not replace legacy quarterly parent badges'
);

assert(
  !objectivesRenderer.includes(
    'buildTcDotGridChart'
  ),
  '5C2 must not resurrect the retired dot-grid for objective progress'
);

assert(
  !students.includes(
    '/rest/v1/goal_objectives'
  ) &&
    !students.includes(
      '/rest/v1/objective_data_points'
    ),
  'Teacher Center browser code must remain behind the signed server boundary'
);

/*
 * Parent refresh invalidates objective fallback cache so stale same-quarter
 * parent fallback does not remain visible after manual parent data changes.
 */
const reloadSlice =
  functionSlice(
    students,
    'reloadProgressEntries',
    'exportStudentProgressCsv'
  );

assert(
  reloadSlice.includes(
    'objectiveProgressCache.clear()'
  ),
  'parent progress refresh must invalidate objective fallback cache'
);

/*
 * Browser cache bust is required when tc-students.js changes.
 */
assert(
  !studentsIndex.includes(
    '/web/tc-students.js?v=202608231728'
  ),
  '5C2 must update the Teacher Students tc-students.js cache-bust token'
);

/*
 * No objective mutation path in Teacher Center.
 */
assert(
  !students.includes(
    'upsertObjective'
  ) &&
    !students.includes(
      'saveObjectiveProgress'
    ),
  '5C2 is read-only objective visibility, not manual objective entry'
);

console.log(
  '✓ Teacher Center objective progress UI/fanout contract'
);
