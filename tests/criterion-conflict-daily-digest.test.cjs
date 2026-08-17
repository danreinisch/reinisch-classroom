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

const digest =
  read(
    'supabase/functions/daily-digest/index.ts'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

console.log(
  'Running Daily Digest criterion-conflict tests...\n'
);


// Transport / schema shape -------------------------------------

assert.ok(
  digest.includes(
    'criterion_conflict?: boolean | null;'
  ),
  'Daily Digest Goal shape must carry explicit conflict metadata'
);

assert.ok(
  digest.includes(
    '/rest/v1/goals?select=*'
  ),
  'Daily Digest must retain schema-flexible goals select=* transport'
);


// Explicit source-driven conflict semantics --------------------

assert.ok(
  digest.includes(
    'function hasCriterionConflict(goal: Goal): boolean'
  )
);

assert.ok(
  digest.includes(
    'return goal.criterion_conflict === true;'
  )
);

assert.ok(
  digest.includes(
    'function getAutomaticCriterionValue(goal: Goal): number | null'
  )
);

assert.ok(
  digest.includes(
    'if (hasCriterionConflict(goal))'
  )
);

assert.ok(
  digest.includes(
    'return parseGoalValue(goal.mastery) ?? parseGoalValue(goal.target);'
  ),
  'ordinary mastery-first behavior must remain'
);


// Regressing / stalled remain raw-evidence alerts --------------

assert.ok(
  digest.includes(
    'const baselineNum = parseGoalValue(goal.baseline);'
  )
);

assert.ok(
  digest.includes(
    'const masteryNum = getAutomaticCriterionValue(goal);'
  )
);

assert.ok(
  digest.includes(
    'if (currentNum < baselineNum)'
  ),
  'baseline regression must remain'
);

assert.ok(
  digest.includes(
    'if (rangeSpan <= STALLED_BAND) isStalled = true;'
  ),
  'raw stalled trend detection must remain'
);

assert.ok(
  digest.includes(
    '${buildCriterionDetail(goal)}'
  ),
  'trend alerts must use conflict-aware criterion detail'
);


// Conflict report labels ---------------------------------------

assert.ok(
  digest.includes(
    'Header Mastery: ${goal.mastery ?? "—"}'
  )
);

assert.ok(
  digest.includes(
    'Goal-Text Target: ${goal.target ?? "—"}'
  )
);

assert.ok(
  digest.includes(
    'Criterion Status: Manual Criterion Review Required'
  )
);


// Mastery reached must fail closed ------------------------------

const masterySectionStart =
  digest.indexOf(
    '// ── Section 4: Mastery reached'
  );

const quickStatsStart =
  digest.indexOf(
    '// ── Quick stats',
    masterySectionStart
  );

assert.ok(
  masterySectionStart >= 0 &&
  quickStatsStart > masterySectionStart,
  'Mastery Reached section unavailable'
);

const masterySection =
  digest.slice(
    masterySectionStart,
    quickStatsStart
  );

assert.ok(
  masterySection.includes(
    'const masteryNum = getAutomaticCriterionValue(goal);'
  ),
  'Mastery Reached must use fail-closed criterion semantics'
);

assert.ok(
  masterySection.includes(
    'if (masteryNum == null) continue;'
  )
);

assert.ok(
  masterySection.includes(
    'if (currentNum >= masteryNum)'
  ),
  'ordinary mastery detection must remain'
);

assert.strictEqual(
  masterySection.includes(
    'parseGoalValue(goal.mastery) ?? parseGoalValue(goal.target)'
  ),
  false,
  'Mastery Reached must not bypass the conflict guard'
);


// Ordinary output retained -------------------------------------

assert.ok(
  digest.includes(
    '"Mastery Reached"'
  )
);

assert.ok(
  digest.includes(
    '`Current: ${m.current}% ≥ Mastery: ${m.mastery}%`'
  )
);

assert.ok(
  digest.includes(
    'quickStats.masteryReached'
  )
);


// No inferred conflict from unequal values ---------------------

const bang =
  String.fromCharCode(33);

for (const forbidden of [
  'goal.mastery ' + bang + '== goal.target',
  'goal.target ' + bang + '== goal.mastery',
]) {
  assert.strictEqual(
    digest.includes(
      forbidden
    ),
    false,
    `Daily Digest must not infer criterion conflict from ${forbidden}`
  );
}


// Wiring --------------------------------------------------------

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-daily-digest.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'Daily Digest regression must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: Daily Digest receives explicit criterion-conflict metadata'
);

console.log(
  'PASS: regressing and stalled alerts retain raw baseline/trend semantics'
);

console.log(
  'PASS: conflict alert detail preserves Header Mastery and Goal-Text Target'
);

console.log(
  'PASS: conflict alert detail requires manual criterion review'
);

console.log(
  'PASS: conflict goals cannot enter Mastery Reached'
);

console.log(
  'PASS: ordinary Mastery Reached behavior remains available'
);

console.log();
console.log(
  'DAILY DIGEST CRITERION-CONFLICT HANDLING: PASS'
);
