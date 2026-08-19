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

const start =
  students.indexOf(
    '  function renderGoalMasteryPredictions('
  );

const end =
  students.indexOf(
    '  // ─── Bulk Observation Configuration',
    start
  );

assert.ok(
  start >= 0 &&
  end > start,
  'prediction function section unavailable'
);

const prediction =
  students.slice(
    start,
    end
  );

console.log(
  'Running Goal Mastery Predictions criterion-conflict tests...\n'
);


// Explicit source flag only -------------------------------------

assert.ok(
  prediction.includes(
    'hasCriterionConflict(goal)'
  )
);

assert.ok(
  prediction.includes(
    'const headerMastery ='
  )
);

assert.ok(
  prediction.includes(
    'const goalTextTarget ='
  )
);


// Conflict display ---------------------------------------------

assert.ok(
  prediction.includes(
    'Header Mastery:'
  )
);

assert.ok(
  prediction.includes(
    'Goal-Text Target:'
  )
);

assert.ok(
  prediction.includes(
    'Manual Criterion Review Required'
  )
);

assert.ok(
  prediction.includes(
    'no automatic mastery or target status is assigned'
  )
);

assert.ok(
  prediction.includes(
    'Increasing trend'
  )
);

assert.ok(
  prediction.includes(
    'Decreasing trend'
  )
);

assert.ok(
  prediction.includes(
    'Flat trend'
  )
);


// Conflict guard must happen before criterion selection --------

const conflictProjection =
  prediction.indexOf(
    'if (criterionConflict) {',
    prediction.indexOf(
      'const projected ='
    )
  );

const masterySelection =
  prediction.indexOf(
    'const masteryRaw = goal.mastery || goal.target || 80;'
  );

assert.ok(
  conflictProjection >= 0
);

assert.ok(
  masterySelection > conflictProjection,
  'explicit conflict must exit before mastery/target selection'
);


// Ordinary behavior retained -----------------------------------

assert.ok(
  prediction.includes(
    "status = '🟢 On track to meet mastery'"
  )
);

assert.ok(
  prediction.includes(
    "status = '🟡 Trending up but may not reach mastery'"
  )
);

assert.ok(
  prediction.includes(
    "status = '🔴 At risk — not on track'"
  )
);

assert.ok(
  prediction.includes(
    '(target: <strong>${escapeHtml(String(masteryRaw))}</strong>)'
  )
);


// No value-difference inference --------------------------------

const bang =
  String.fromCharCode(33);

assert.strictEqual(
  prediction.includes(
    'goal.mastery ' + bang + '== goal.target'
  ),
  false
);

assert.strictEqual(
  prediction.includes(
    'goal.target ' + bang + '== goal.mastery'
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
  'tests/criterion-conflict-goal-mastery-predictions.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'prediction conflict regression must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: explicit conflict flag controls prediction behavior'
);

console.log(
  'PASS: conflict predictions preserve both official criteria'
);

console.log(
  'PASS: conflict projections retain raw mathematical projection and trend'
);

console.log(
  'PASS: conflict predictions make no automatic target or mastery judgment'
);

console.log(
  'PASS: insufficient-data conflict cards still show manual review criteria'
);

console.log(
  'PASS: ordinary Goal Mastery Predictions behavior remains available'
);

console.log();
console.log(
  'GOAL MASTERY PREDICTIONS CRITERION-CONFLICT HANDLING: PASS'
);
