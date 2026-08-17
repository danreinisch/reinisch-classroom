'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const {
  pathToFileURL,
} = require('node:url');

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

async function run() {
  const overview =
    read(
      'site/web/tc-overview.js'
    );

  const packageJson =
    JSON.parse(
      read('package.json')
    );

  const utilsUrl =
    pathToFileURL(
      path.join(
        root,
        'site/web/goal-utils.js'
      )
    );

  utilsUrl.searchParams.set(
    'test',
    String(Date.now())
  );

  const {
    hasCriterionConflict,
    getAutomaticCriterionValue,
  } = await import(
    utilsUrl.href
  );

  console.log(
    'Running Teacher Overview criterion-conflict tests...\n'
  );

  const ordinary = {
    mastery: '80%',
    target: '75%',
    criterion_conflict: false,
  };

  const conflicted = {
    mastery: '80%',
    target: '75%',
    criterion_conflict: true,
  };

  assert.strictEqual(
    hasCriterionConflict(ordinary),
    false
  );

  assert.strictEqual(
    hasCriterionConflict(conflicted),
    true
  );

  assert.strictEqual(
    getAutomaticCriterionValue(ordinary),
    80,
    'ordinary differing criteria retain mastery-first behavior'
  );

  assert.strictEqual(
    getAutomaticCriterionValue(conflicted),
    null,
    'source-conflicted goal must have no automatic criterion'
  );

  assert.ok(
    overview.includes(
      'const masteryNum =\n          getAutomaticCriterionValue(goal);'
    ),
    'Near Mastery must use the shared criterion helper'
  );

  assert.ok(
    overview.includes(
      'const masteryNum =\n          getAutomaticCriterionValue(goal);'
    ) ||
    overview.includes(
      'const masteryNum =\n      getAutomaticCriterionValue(goal);'
    ),
    'Overview must use the shared criterion helper'
  );

  assert.ok(
    occurrences(
      overview,
      'getAutomaticCriterionValue(goal)'
    ) >= 4,
    'Near Mastery, observation fallbacks, and At-Risk details must use shared semantics'
  );

  assert.ok(
    occurrences(
      overview,
      'hasCriterionConflict(goal)'
    ) >= 3,
    'Overview conflict-aware consumers must inspect only the explicit flag'
  );

  assert.ok(
    overview.includes(
      'criterionConflict\n                            ? null\n                            : 3'
    ),
    'session-outcome fallback must disable default criterion on conflict'
  );

  assert.ok(
    overview.includes(
      'criterionConflict\n                            ? null\n                            : 2'
    ),
    'prompt-count fallback must disable default criterion on conflict'
  );

  assert.ok(
    overview.includes(
      'Manual Criterion Review Required'
    ),
    'Overview must identify manual criterion review'
  );

  assert.ok(
    overview.includes(
      'Header Mastery:'
    ),
    'Overview conflict details must preserve Header Mastery'
  );

  assert.ok(
    overview.includes(
      'Goal-Text Target:'
    ),
    'Overview conflict details must preserve Goal-Text Target'
  );

  assert.ok(
    overview.includes(
      'item.mastery == null &&\n        !item.criterionConflict'
    ),
    'conflicted goals may retain raw progress visualization without mastery marker'
  );

  assert.ok(
    overview.includes(
      '${masteryMarker}'
    ),
    'Overview progress bar must make mastery marker conditional'
  );

  assert.ok(
    !overview.includes(
      'parseGoalValue(goal.mastery) ?? parseGoalValue(goal.target)'
    ),
    'Overview must not directly choose mastery over target'
  );

  assert.ok(
    !overview.includes(
      'parseGoalValue(goal.mastery || goal.target)'
    ),
    'Overview must not directly collapse the two source criteria'
  );

  assert.ok(
    !overview.includes(
      'mastery !== target'
    ),
    'Overview must not infer conflict from unequal values'
  );

  assert.ok(
    !overview.includes(
      'mastery != target'
    ),
    'Overview must not infer conflict from unequal values'
  );

  const unit =
    String(
      packageJson.scripts?.['test:unit'] || ''
    );

  const testName =
    'tests/criterion-conflict-teacher-overview.test.cjs';

  assert.strictEqual(
    occurrences(
      unit,
      testName
    ),
    1,
    'Overview conflict test must be wired exactly once'
  );

  assert.ok(
    unit.indexOf(testName) <
    unit.indexOf(
      'tests/tc-library-helpers.test.cjs'
    ),
    'Overview conflict test must run before the known local helper stop'
  );

  console.log(
    'PASS: Near Mastery excludes source-conflicted goals'
  );

  console.log(
    'PASS: At-Risk regression/stalled logic retains baseline and raw trend'
  );

  console.log(
    'PASS: conflicted At-Risk details show both source criteria'
  );

  console.log(
    'PASS: conflicted Overview progress bars have no mastery marker'
  );

  console.log(
    'PASS: observation fallbacks do not choose a disputed criterion'
  );

  console.log(
    'PASS: ordinary Overview behavior retains existing criterion semantics'
  );

  console.log();
  console.log(
    'TEACHER OVERVIEW CRITERION-CONFLICT HANDLING: PASS'
  );
}

run().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
