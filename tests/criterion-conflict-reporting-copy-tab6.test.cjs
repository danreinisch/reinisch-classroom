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

function occurrences(
  source,
  needle
) {
  return (
    source.split(needle).length -
    1
  );
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

  const start =
    reporting.indexOf(
      '  function buildEvidenceEmailBodyText('
    );

  const end =
    reporting.indexOf(
      '  function generateTab6Preview(',
      start
    );

  assert.ok(
    start >= 0 &&
    end > start,
    'Tab 6 Evidence email function could not be isolated'
  );

  const fnSource =
    reporting.slice(
      start,
      end
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
    formatGoalValue,
    hasCriterionConflict,
    isGoalActive,
  } = await import(
    utilsUrl.href
  );

  const student = {
    code: 'SYN01',
    name: 'Synthetic Student',
  };

  const ordinaryGoal = {
    code: 'SYN01.CG1',
    student_code: 'SYN01',
    goal_area: 'Reading',
    desc: 'Synthetic ordinary goal',
    baseline: '40%',
    mastery: '80%',
    target: '75%',
    criterion_conflict: false,
    measurement_type: 'Percent',
    active: true,
  };

  const conflictGoal = {
    ...ordinaryGoal,
    code: 'SYN01.CG2',
    desc: 'Synthetic conflicted goal',
    criterion_conflict: true,
  };

  const progress = {
    'SYN01.CG1': {
      average: 85,
      count: 4,
      values: [80, 84, 86, 90],
      entries: [],
    },
    'SYN01.CG2': {
      average: 85,
      count: 4,
      values: [80, 84, 86, 90],
      entries: [],
    },
  };

  const sandbox = {
    goalsData: [
      ordinaryGoal,
      conflictGoal,
    ],

    instancesData: [],
    submissionsData: [],

    tab6State: {
      dateRange: 'Q1',
    },

    formatGoalValue,
    hasCriterionConflict,
    isGoalActive,

    getTab6PeriodLabel() {
      return 'Q1';
    },

    getPreviousQuarterRange() {
      return null;
    },

    getCurrentQuarter() {
      return 'Q1';
    },

    getGoalProgressForQuarter(
      goalCode
    ) {
      return (
        progress[goalCode] || {
          average: null,
          count: 0,
          values: [],
          entries: [],
        }
      );
    },
  };

  vm.runInNewContext(
    [
      fnSource,
      'this.buildEvidenceEmailBodyText = buildEvidenceEmailBodyText;',
    ].join('\n'),
    sandbox
  );

  console.log(
    'Running Reporting Tab 6 Evidence-email conflict tests...\n'
  );

  const ordinaryOnlyGoals =
    sandbox.goalsData;

  sandbox.goalsData = [
    ordinaryGoal,
  ];

  const ordinaryParent =
    sandbox.buildEvidenceEmailBodyText(
      student,
      {
        start: '2026-08-01',
        end: '2026-10-17',
      },
      true
    );

  assert.ok(
    ordinaryParent.includes(
      'Progress: On track  |  Trend: New data'
    ),
    'ordinary parent Evidence email must retain existing friendly status'
  );

  assert.ok(
    ordinaryParent.includes(
      'Goals on track: 1 of 1'
    ),
    'ordinary aggregate must retain historical format'
  );

  assert.ok(
    !ordinaryParent.includes(
      'Manual Criterion Review Required'
    )
  );

  sandbox.goalsData =
    ordinaryOnlyGoals;

  const conflictParent =
    sandbox.buildEvidenceEmailBodyText(
      student,
      {
        start: '2026-08-01',
        end: '2026-10-17',
      },
      true
    );

  assert.ok(
    conflictParent.includes(
      'Header Mastery: 80%'
    )
  );

  assert.ok(
    conflictParent.includes(
      'Goal-Text Target: 75%'
    )
  );

  assert.ok(
    conflictParent.includes(
      'Criterion Status: Manual Criterion Review Required'
    )
  );

  assert.ok(
    conflictParent.includes(
      'Progress: Data collected  |  Trend: New data'
    ),
    'parent Evidence email must retain raw collection/trend without target judgment'
  );

  assert.ok(
    !conflictParent.includes(
      'Progress: On track'
    ) ||
    conflictParent.indexOf(
      'Progress: On track'
    ) <
    conflictParent.indexOf(
      'SYN01.CG2'
    ),
    'conflicted goal itself must not be labeled On track'
  );

  assert.ok(
    conflictParent.includes(
      'Goals on track: 1 of 1 evaluable goals'
    ),
    'conflict must be excluded from the on-track denominator'
  );

  assert.ok(
    conflictParent.includes(
      'Goals requiring manual criterion review: 1'
    )
  );

  assert.ok(
    !conflictParent.includes(
      'Goals on track: 2 of 2'
    ),
    'conflict must never be classified by the fixed aggregate threshold'
  );

  const conflictAdmin =
    sandbox.buildEvidenceEmailBodyText(
      student,
      {
        start: '2026-08-01',
        end: '2026-10-17',
      },
      false
    );

  assert.ok(
    conflictAdmin.includes(
      'Progress: 85%  |  Trend: New data'
    ),
    'admin Evidence email may preserve raw current evidence'
  );

  assert.ok(
    conflictAdmin.includes(
      'Header Mastery: 80%'
    )
  );

  assert.ok(
    conflictAdmin.includes(
      'Goal-Text Target: 75%'
    )
  );

  assert.ok(
    fnSource.includes(
      'evaluableGoals'
    )
  );

  assert.ok(
    fnSource.includes(
      'manualReviewGoals'
    )
  );

  assert.ok(
    !reporting.includes(
      'mastery !== target'
    )
  );

  assert.ok(
    !reporting.includes(
      'mastery != target'
    )
  );

  const unit =
    String(
      packageJson.scripts?.['test:unit'] ||
      ''
    );

  const testName =
    'tests/criterion-conflict-reporting-copy-tab6.test.cjs';

  assert.strictEqual(
    occurrences(
      unit,
      testName
    ),
    1,
    'Tab 6 copy regression test must be wired exactly once'
  );

  assert.ok(
    unit.indexOf(testName) <
    unit.indexOf(
      'tests/tc-library-helpers.test.cjs'
    )
  );

  console.log(
    'PASS: ordinary Evidence-email behavior remains unchanged'
  );

  console.log(
    'PASS: conflicted Evidence email preserves both source criteria'
  );

  console.log(
    'PASS: parent Evidence email suppresses fixed-threshold conflict judgment'
  );

  console.log(
    'PASS: admin Evidence email preserves raw evidence'
  );

  console.log(
    'PASS: conflicted goals are excluded from Goals-on-track denominator'
  );

  console.log();
  console.log(
    'REPORTING TAB 6 COPY-OUT CRITERION-CONFLICT HANDLING: PASS'
  );
}

run().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
