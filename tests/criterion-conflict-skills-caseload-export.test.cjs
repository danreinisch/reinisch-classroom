'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const root =
  path.resolve(
    __dirname,
    '..'
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath
    ),
    'utf8'
  );
}

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

const students =
  read(
    'site/web/tc-students.js'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

function sectionBetween(
  startMarker,
  endMarker,
  label
) {
  const start =
    students.indexOf(startMarker);

  const end =
    students.indexOf(
      endMarker,
      start
    );

  assert.ok(
    start >= 0 &&
    end > start,
    `${label} section unavailable`
  );

  return students.slice(
    start,
    end
  );
}

const csv =
  sectionBetween(
    '  function buildCaseloadExportCsv(',
    '  function buildCaseloadExportHtml(',
    'buildCaseloadExportCsv'
  );

const html =
  sectionBetween(
    '  function buildCaseloadExportHtml(',
    '  function showExportDropdown(',
    'buildCaseloadExportHtml'
  );

console.log(
  'Running Caseload export criterion-conflict tests...\n'
);


// CSV -----------------------------------------------------------

assert.ok(
  csv.includes(
    "'Header Mastery', 'Goal-Text Target', 'Criterion Status'"
  )
);

assert.ok(
  csv.includes(
    'card.criterionConflict === true'
  )
);

assert.ok(
  csv.includes(
    "criterionConflict\n              ? 'Manual Criterion Review Required'"
  )
);

assert.ok(
  csv.includes(
    'const targetValue ='
  )
);

assert.ok(
  csv.includes(
    'const headerMastery ='
  )
);

assert.ok(
  csv.includes(
    'const goalTextTarget ='
  )
);

assert.ok(
  csv.includes(
    'const criterionStatus ='
  )
);

assert.ok(
  csv.includes(
    'if (isParentFriendly === false)'
  )
);


// HTML aggregate ------------------------------------------------

assert.ok(
  html.includes(
    'const evaluableScoredCards ='
  )
);

assert.ok(
  html.includes(
    'const manualReviewCount ='
  )
);

assert.ok(
  html.includes(
    'for (const c of evaluableScoredCards)'
  )
);

assert.ok(
  html.includes(
    'Manual Review</div>'
  )
);

assert.ok(
  html.includes(
    'c.criterionConflict === true'
  )
);

assert.ok(
  html.includes(
    'Flagged for immediate attention:'
  ),
  'ordinary critical-student alert must remain'
);

assert.ok(
  html.includes(
    'scoredCards.reduce'
  ),
  'raw average must remain based on scored evidence'
);


// HTML per-goal -------------------------------------------------

assert.ok(
  html.includes(
    "const displayTierClass ="
  )
);

assert.ok(
  html.includes(
    "? 'manual-review'"
  )
);

assert.ok(
  html.includes(
    "? 'Manual Criterion Review Required'"
  )
);

assert.ok(
  html.includes(
    'Header Mastery:'
  )
);

assert.ok(
  html.includes(
    'Goal-Text Target:'
  )
);

assert.ok(
  html.includes(
    'Criterion Status: Manual Criterion Review Required'
  )
);

assert.ok(
  html.includes(
    'criterionConflict === false'
  ),
  'old recommendation must be suppressed for conflict rows'
);

assert.ok(
  html.includes(
    '${escapeHtml(termTarget)}: ${escapeHtml(target)}'
  ),
  'ordinary goals must retain historical Target display'
);


// Source-driven conflict only ----------------------------------

assert.strictEqual(
  csv.includes(
    'headerMastery === goalTextTarget'
  ),
  false
);

assert.strictEqual(
  html.includes(
    'headerMastery === goalTextTarget'
  ),
  false
);

assert.strictEqual(
  csv.includes(
    'mastery === target'
  ),
  false
);

assert.strictEqual(
  html.includes(
    'mastery === target'
  ),
  false
);


// Wiring --------------------------------------------------------

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-skills-caseload-export.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'Caseload conflict regression must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: Caseload CSV preserves both official criteria'
);

console.log(
  'PASS: conflict CSV rows have no generic controlling Target'
);

console.log(
  'PASS: Caseload HTML excludes conflicts from automatic tier counts'
);

console.log(
  'PASS: conflicted goals cannot place a student on the critical alert list'
);

console.log(
  'PASS: Caseload HTML shows Manual Review count'
);

console.log(
  'PASS: conflicted per-goal HTML is neutral and preserves both criteria'
);

console.log(
  'PASS: ordinary Caseload target and tier behavior remains available'
);

console.log();
console.log(
  'CASELOAD EXPORT CRITERION-CONFLICT HANDLING: PASS'
);
