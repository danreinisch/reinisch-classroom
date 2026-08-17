'use strict';

const assert =
  require('node:assert/strict');

const path =
  require('node:path');

const {
  pathToFileURL,
} = require('node:url');

async function run() {
  const utilsUrl =
    pathToFileURL(
      path.resolve(
        __dirname,
        '../site/web/goal-utils.js'
      )
    );

  utilsUrl.searchParams.set(
    'test',
    String(Date.now())
  );

  const {
    formatGoalValue,
    hasCriterionConflict,
    getAutomaticCriterionValue,
  } = await import(
    utilsUrl.href
  );

  console.log(
    'Running shared criterion-conflict semantics tests...\n'
  );

  const ordinary = {
    mastery: '3/5',
    target: '4/6',
    criterion_conflict: false,
  };

  const conflicted = {
    mastery: '3/5',
    target: '4/6',
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
    60,
    'ordinary goals retain mastery-first criterion behavior'
  );

  assert.strictEqual(
    getAutomaticCriterionValue(conflicted),
    null,
    'conflicted goals expose no automatic criterion'
  );

  assert.strictEqual(
    formatGoalValue(
      60,
      'x/y',
      ordinary
    ),
    '3/5',
    'ordinary fraction formatting must remain unchanged'
  );

  assert.strictEqual(
    formatGoalValue(
      60,
      'fraction',
      ordinary
    ),
    '3/5',
    'ordinary fraction alias must remain unchanged'
  );

  assert.strictEqual(
    formatGoalValue(
      60,
      'x/y',
      conflicted
    ),
    '60%',
    'conflicted fraction goal must not borrow Header Mastery denominator'
  );

  assert.strictEqual(
    formatGoalValue(
      60,
      'fraction',
      conflicted
    ),
    '60%',
    'conflicted fraction goal must not borrow Goal-Text Target denominator'
  );

  assert.strictEqual(
    formatGoalValue(
      72,
      'Percent',
      conflicted
    ),
    '72%',
    'ordinary percentage formatting remains available for raw evidence'
  );

  console.log(
    'PASS: explicit conflict semantics remain source-driven'
  );

  console.log(
    'PASS: conflicted fractions do not choose a denominator'
  );

  console.log(
    'PASS: raw percentage evidence remains displayable'
  );

  console.log(
    'PASS: ordinary fraction formatting remains unchanged'
  );

  console.log();
  console.log(
    'SHARED CRITERION-CONFLICT SEMANTICS: PASS'
  );
}

run().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
