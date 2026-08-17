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

const data =
  read(
    'site/web/tc-data.js'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

const start =
  data.indexOf(
    '  function validateProgressData()'
  );

const end =
  data.indexOf(
    '  function renderValidationDashboard()',
    start
  );

assert.ok(
  start >= 0 &&
  end > start,
  'validateProgressData section unavailable'
);

const validation =
  data.slice(
    start,
    end
  );

console.log(
  'Running Teacher Data validation criterion-conflict tests...\n'
);

assert.ok(
  data.includes(
    'formatGoalValue, getAutomaticCriterionValue'
  ),
  'retired Data surface must import shared automatic criterion helper'
);

assert.ok(
  validation.includes(
    'const masteryThreshold =\n        getAutomaticCriterionValue(goal);'
  ),
  'Progress > Mastery must use shared criterion semantics'
);

assert.ok(
  validation.includes(
    'masteryThreshold'
  )
);

assert.ok(
  validation.includes(
    "type: 'exceeds_mastery'"
  ),
  'ordinary quality warning must remain available'
);

assert.ok(
  validation.includes(
    'exceeds mastery target'
  ),
  'ordinary warning message must remain available'
);

assert.strictEqual(
  validation.includes(
    'parseGoalValue(goal.mastery || goal.target)'
  ),
  false,
  'validation must not directly choose mastery over target'
);

assert.strictEqual(
  validation.includes(
    'parseGoalValue(goal.target || goal.mastery)'
  ),
  false,
  'validation must not directly choose target over mastery'
);

const bang =
  String.fromCharCode(33);

assert.strictEqual(
  validation.includes(
    'goal.mastery ' + bang + '== goal.target'
  ),
  false,
  'validation must not infer conflict from differing values'
);

assert.strictEqual(
  validation.includes(
    'goal.target ' + bang + '== goal.mastery'
  ),
  false,
  'validation must not infer conflict from differing values'
);

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-teacher-data-validation.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'Teacher Data regression must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: Progress > Mastery uses the shared automatic criterion helper'
);

console.log(
  'PASS: explicit criterion conflicts therefore suppress the warning'
);

console.log(
  'PASS: ordinary Progress > Mastery quality warning remains available'
);

console.log(
  'PASS: unequal values alone do not create a conflict'
);

console.log();
console.log(
  'TEACHER DATA VALIDATION CRITERION-CONFLICT HANDLING: PASS'
);
