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
  const students =
    read(
      'site/web/tc-students.js'
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
    'Running Teacher Students criterion-conflict tests...\n'
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
    'ordinary differing values retain mastery-first behavior'
  );

  assert.strictEqual(
    getAutomaticCriterionValue(conflicted),
    null,
    'source conflict must have no automatic criterion'
  );

  assert.ok(
    students.includes(
      'getAutomaticCriterionValue(goal)'
    ),
    'Teacher judgment paths must use the shared criterion helper'
  );

  assert.ok(
    students.includes(
      "'Header Mastery'"
    ),
    'Progress view must label Header Mastery'
  );

  assert.ok(
    students.includes(
      "'Goal-Text Target'"
    ),
    'Progress view must label Goal-Text Target'
  );

  assert.ok(
    students.includes(
      '<span class="st-metric-label">Header Mastery:</span>'
    ),
    'conflicted main goal card must show Header Mastery'
  );

  assert.ok(
    students.includes(
      '<span class="st-metric-label">Goal-Text Target:</span>'
    ),
    'conflicted main goal card must show Goal-Text Target'
  );

  assert.ok(
    occurrences(
      students,
      'Manual Criterion Review Required'
    ) >= 3,
    'Teacher views must identify manual review'
  );

  assert.ok(
    students.includes(
      'hasCriterionConflict(oldGoal)'
    ),
    'replacement workflow must inspect the explicit conflict flag'
  );

  assert.ok(
    students.includes(
      "? (oldGoal.baseline || '')"
    ),
    'conflicted replacement must preserve baseline instead of choosing a criterion'
  );

  assert.ok(
    students.includes(
      "form.querySelector('[name=\"mastery\"]').value"
    ),
    'replacement modal must preserve Header Mastery for a conflicted goal'
  );

  assert.ok(
    students.includes(
      '<span class="st-metric-label">Target:</span>'
    ),
    'ordinary main goal card Target display must remain'
  );

  assert.ok(
    students.includes(
      ": 'Mastery';"
    ),
    'ordinary progress stats must retain Mastery label'
  );

  assert.ok(
    students.includes(
      ": 'Target';"
    ),
    'ordinary progress stats must retain Target label'
  );

  assert.ok(
    !students.includes(
      'mastery !== target'
    ),
    'Teacher Students must not infer conflict from unequal values'
  );

  assert.ok(
    !students.includes(
      'mastery != target'
    ),
    'Teacher Students must not infer conflict from unequal values'
  );

  const unit =
    String(
      packageJson.scripts?.['test:unit'] || ''
    );

  const testName =
    'tests/criterion-conflict-teacher-students.test.cjs';

  assert.strictEqual(
    occurrences(
      unit,
      testName
    ),
    1,
    'Teacher Students test must be wired exactly once'
  );

  assert.ok(
    unit.indexOf(testName) <
    unit.indexOf(
      'tests/tc-library-helpers.test.cjs'
    ),
    'Teacher Students test must run before the known local helper stop'
  );

  console.log(
    'PASS: conflicted Teacher goals have no automatic criterion'
  );

  console.log(
    'PASS: Teacher views show both source criteria with accurate labels'
  );

  console.log(
    'PASS: Teacher views identify manual criterion review'
  );

  console.log(
    'PASS: ordinary Teacher goal labels remain unchanged'
  );

  console.log(
    'PASS: goal replacement does not choose a disputed criterion'
  );

  console.log(
    'PASS: Teacher Students regression test is wired to test:unit'
  );

  console.log();
  console.log(
    'TEACHER STUDENTS CRITERION-CONFLICT HANDLING: PASS'
  );
}

run().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
