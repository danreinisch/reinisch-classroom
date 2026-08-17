'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const vm =
  require('node:vm');

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
  const reporting =
    read(
      'site/web/tc-reporting.js'
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
    parseGoalValue,
    formatGoalValue,
    hasCriterionConflict,
  } = await import(
    utilsUrl.href
  );

  const start =
    reporting.indexOf(
      '  function buildRichProgressNarrative('
    );

  const end =
    reporting.indexOf(
      '\n  /**\n   * Generate narrative for goal progress',
      start
    );

  assert.ok(
    start >= 0 &&
    end > start,
    'actual Reporting narrative function could not be isolated'
  );

  const fnSource =
    reporting.slice(
      start,
      end
    );

  const sandbox = {
    parseGoalValue,
    formatGoalValue,
    hasCriterionConflict,
    parseObservationNotes() {
      return null;
    },
  };

  vm.runInNewContext(
    [
      fnSource,
      'this.buildRichProgressNarrative = buildRichProgressNarrative;',
    ].join('\n'),
    sandbox
  );

  const buildRichProgressNarrative =
    sandbox.buildRichProgressNarrative;

  console.log(
    'Running Reporting criterion-conflict core tests...\n'
  );

  const student = {
    code: 'SYN01',
    name: 'Synthetic Student',
  };

  const ordinaryGoal = {
    code: 'SYN01.CG1',
    goal_area: 'Reading',
    baseline: '40%',
    mastery: '80%',
    target: '75%',
    criterion_conflict: false,
    measurement_type: 'Percent',
  };

  const conflictGoal = {
    ...ordinaryGoal,
    code: 'SYN01.CG2',
    criterion_conflict: true,
  };

  const progress = {
    average: 85,
    count: 4,
    values: [80, 84, 86, 90],
    entries: [],
  };

  const previous = {
    average: 70,
    count: 4,
    values: [68, 70, 71, 71],
    entries: [],
  };

  const ordinary =
    buildRichProgressNarrative(
      student,
      ordinaryGoal,
      progress,
      previous,
      'Q1'
    );

  assert.strictEqual(
    ordinary.status,
    'Goal Met',
    'ordinary goals must retain existing status behavior'
  );

  const conflicted =
    buildRichProgressNarrative(
      student,
      conflictGoal,
      progress,
      previous,
      'Q1'
    );

  assert.strictEqual(
    conflicted.status,
    'Manual Criterion Review Required'
  );

  assert.ok(
    conflicted.narrative.includes(
      'Header Mastery: 80%'
    ),
    'conflict narrative must preserve Header Mastery'
  );

  assert.ok(
    conflicted.narrative.includes(
      'Goal-Text Target: 75%'
    ),
    'conflict narrative must preserve Goal-Text Target'
  );

  assert.ok(
    conflicted.narrative.includes(
      'Manual Criterion Review Required'
    ),
    'conflict narrative must identify manual review'
  );

  assert.ok(
    conflicted.narrative.includes(
      'average of 85%'
    ),
    'raw progress must remain reportable'
  );

  assert.ok(
    conflicted.narrative.includes(
      'Baseline: 40%'
    ),
    'baseline must remain reportable'
  );

  assert.ok(
    conflicted.narrative.includes(
      'higher than the previous-period average'
    ),
    'raw trend comparison must remain reportable'
  );

  for (const forbidden of [
    'has met the target',
    'has demonstrated mastery',
    'Making Adequate Progress',
    'Progressing but Not Sufficient',
    'Not Making Progress',
    'on track to meet',
  ]) {
    assert.ok(
      !conflicted.narrative.includes(
        forbidden
      ),
      `conflict narrative must suppress: ${forbidden}`
    );
  }

  const noData =
    buildRichProgressNarrative(
      student,
      conflictGoal,
      {
        average: null,
        count: 0,
        values: [],
        entries: [],
      },
      null,
      'Q1'
    );

  assert.strictEqual(
    noData.status,
    'Manual Criterion Review Required'
  );

  assert.ok(
    noData.narrative.includes(
      'No performance data was collected'
    )
  );

  assert.ok(
    noData.narrative.includes(
      'Header Mastery: 80%'
    )
  );

  assert.ok(
    noData.narrative.includes(
      'Goal-Text Target: 75%'
    )
  );

  const obsConflict = {
    ...conflictGoal,
    code: 'SYN01.CG3',
    measurement_type: 'Observation',
  };

  const observation =
    buildRichProgressNarrative(
      student,
      obsConflict,
      {
        average: 50,
        count: 3,
        values: [50, 50, 50],
        entries: [],
      },
      null,
      'Q1'
    );

  assert.strictEqual(
    observation.status,
    'Manual Criterion Review Required'
  );

  assert.ok(
    observation.narrative.includes(
      '3 observation data points were recorded'
    ),
    'observation evidence may be reported without a criterion judgment'
  );

  assert.ok(
    reporting.includes(
      'if (hasCriterionConflict(goal))'
    ),
    'actual Reporting source must gate conflicts explicitly'
  );

  assert.ok(
    !reporting.includes(
      'mastery !== target'
    ),
    'Reporting must not infer conflicts from unequal values'
  );

  assert.ok(
    !reporting.includes(
      'mastery != target'
    ),
    'Reporting must not infer conflicts from unequal values'
  );

  const unit =
    String(
      packageJson.scripts?.['test:unit'] || ''
    );

  const testName =
    'tests/criterion-conflict-reporting-core.test.cjs';

  assert.strictEqual(
    occurrences(
      unit,
      testName
    ),
    1,
    'Reporting conflict test must be wired exactly once'
  );

  assert.ok(
    unit.indexOf(testName) <
    unit.indexOf(
      'tests/tc-library-helpers.test.cjs'
    ),
    'Reporting conflict test must run before the known local helper stop'
  );

  console.log(
    'PASS: conflicted reporting status requires manual review'
  );

  console.log(
    'PASS: both official criteria remain in the narrative'
  );

  console.log(
    'PASS: raw progress, baseline, and trend remain reportable'
  );

  console.log(
    'PASS: target-based conclusions are suppressed'
  );

  console.log(
    'PASS: ordinary Reporting narrative behavior remains unchanged'
  );

  console.log(
    'PASS: Reporting conflict regression test is wired to test:unit'
  );

  console.log();
  console.log(
    'REPORTING CRITERION-CONFLICT CORE: PASS'
  );
}

run().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
