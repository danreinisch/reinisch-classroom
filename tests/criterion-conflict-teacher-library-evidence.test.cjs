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

const library =
  read(
    'site/web/tc-library.js'
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
    library.indexOf(startMarker);

  const end =
    library.indexOf(
      endMarker,
      start
    );

  assert.ok(
    start >= 0 &&
    end > start,
    `${label} section unavailable`
  );

  return library.slice(
    start,
    end
  );
}

const dark =
  sectionBetween(
    '  function _buildLibraryEvidenceHtml(',
    '  function _libFormatDate(',
    'dark Library Evidence'
  );

const printSafe =
  sectionBetween(
    '  function _buildLibraryEvidenceHtmlPrintSafe(',
    '  async function _generateLibraryEvidenceZip(',
    'print-safe Library Evidence'
  );

const zipGoals =
  sectionBetween(
    '  function _buildLibraryGoalsHtml(',
    '  // ── Export',
    'ZIP Library goals'
  );

console.log(
  'Running Teacher Library criterion-conflict tests...\n'
);

assert.ok(
  library.includes(
    'formatGoalValue, hasCriterionConflict'
  ),
  'Library must import the shared explicit conflict helper'
);

for (const [label, section] of [
  ['dark report', dark],
  ['print report', printSafe],
  ['ZIP goals report', zipGoals],
]) {
  assert.ok(
    section.includes(
      'hasCriterionConflict(goal)'
    ),
    `${label} must use explicit source conflict metadata`
  );

  assert.ok(
    section.includes(
      'Manual Criterion Review Required'
    ),
    `${label} must identify manual criterion review`
  );

  assert.ok(
    section.includes(
      'Header Mastery:'
    ),
    `${label} must preserve Header Mastery`
  );

  assert.ok(
    section.includes(
      'Goal-Text Target:'
    ),
    `${label} must preserve Goal-Text Target`
  );

  assert.ok(
    section.includes(
      'formatGoalValue('
    ),
    `${label} must retain raw progress formatting`
  );

  assert.ok(
    section.includes(
      'parseFloat(avg) >= 80'
    ),
    `${label} must retain ordinary parent status behavior`
  );

  assert.ok(
    section.includes(
      'parseFloat(avg) >= 60'
    ),
    `${label} must retain ordinary parent status behavior`
  );
}

assert.ok(
  dark.indexOf(
    'criterionConflict'
  ) <
  dark.indexOf(
    'parseFloat(avg) >= 80'
  ),
  'dark report must branch on explicit conflict before parent status'
);

assert.ok(
  printSafe.indexOf(
    'criterionConflict'
  ) <
  printSafe.indexOf(
    'parseFloat(avg) >= 80'
  ),
  'print report must branch on explicit conflict before parent status'
);

assert.ok(
  zipGoals.indexOf(
    'criterionConflict'
  ) <
  zipGoals.indexOf(
    'parseFloat(avg) >= 80'
  ),
  'ZIP report must branch on explicit conflict before parent status'
);

const forbiddenInference = [
  'mastery === target',
  'target === mastery',
  'mastery != target',
  'target != mastery',
];

for (const section of [
  dark,
  printSafe,
  zipGoals,
]) {
  for (const forbidden of forbiddenInference) {
    assert.strictEqual(
      section.includes(
        forbidden
      ),
      false,
      `Library must not infer conflict from ${forbidden}`
    );
  }
}

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-teacher-library-evidence.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'Library conflict regression must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: dark Library Evidence report preserves both source criteria'
);

console.log(
  'PASS: print/PDF Library Evidence report preserves both source criteria'
);

console.log(
  'PASS: ZIP goals report preserves both source criteria'
);

console.log(
  'PASS: conflicted parent reports suppress fixed-threshold status'
);

console.log(
  'PASS: conflicted reports retain raw progress plus manual review'
);

console.log(
  'PASS: ordinary Library Evidence behavior remains available'
);

console.log();
console.log(
  'TEACHER LIBRARY CRITERION-CONFLICT HANDLING: PASS'
);
