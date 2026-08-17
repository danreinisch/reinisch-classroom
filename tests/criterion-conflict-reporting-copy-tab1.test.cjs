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

function section(
  source,
  startMarker,
  endMarker,
  label
) {
  const start =
    source.indexOf(
      startMarker
    );

  const end =
    source.indexOf(
      endMarker,
      start
    );

  assert.ok(
    start >= 0 &&
    end > start,
    `${label} unavailable`
  );

  return source.slice(
    start,
    end
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
  } = await import(
    utilsUrl.href
  );

  const spedSource =
    section(
      reporting,
      '  function generateSpedTrackText(',
      '  function buildTab1EmailBodyText(',
      'generateSpedTrackText'
    );

  const emailSource =
    section(
      reporting,
      '  function buildTab1EmailBodyText(',
      '  function showToast(',
      'buildTab1EmailBodyText'
    );

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
  };

  const conflictGoal = {
    ...ordinaryGoal,
    code: 'SYN01.CG2',
    desc: 'Synthetic conflicted goal',
    criterion_conflict: true,
  };

  const student = {
    code: 'SYN01',
    name: 'Synthetic Student',
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
    studentsData: [
      student,
    ],
    tab1State: {
      quarter: 'Q1',
      studentCode: 'SYN01',
    },

    formatGoalValue,
    hasCriterionConflict,

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

    getGoalDataPoints() {
      return [];
    },

    getPeriodLabel() {
      return 'Q1';
    },

    getQuarterLabel() {
      return 'Q1';
    },

    getDateRangeForPeriod() {
      return {
        start: new Date(
          '2026-08-01T00:00:00'
        ),
        end: new Date(
          '2026-10-17T00:00:00'
        ),
      };
    },

    getPreviousQuarterRange() {
      return null;
    },

    formatDate() {
      return 'Aug 17, 2026';
    },

    formatDateYYYYMMDD(value) {
      if (!value) {
        return '2026-08-17';
      }

      return new Date(value)
        .toISOString()
        .slice(0, 10);
    },

    buildRichProgressNarrative(
      _student,
      goal
    ) {
      if (
        hasCriterionConflict(goal)
      ) {
        return {
          status:
            'Manual Criterion Review Required',
          narrative:
            'Synthetic neutral conflict narrative.',
        };
      }

      return {
        status:
          'Goal Met',
        narrative:
          'Synthetic ordinary narrative.',
      };
    },
  };

  vm.runInNewContext(
    [
      spedSource,
      emailSource,
      'this.generateSpedTrackText = generateSpedTrackText;',
      'this.buildTab1EmailBodyText = buildTab1EmailBodyText;',
    ].join('\n'),
    sandbox
  );

  console.log(
    'Running Reporting Tab 1 copy-out conflict tests...\n'
  );

  const ordinarySped =
    sandbox.generateSpedTrackText(
      ordinaryGoal.code,
      student.code,
      {
        start: new Date(
          '2026-08-01T00:00:00'
        ),
        end: new Date(
          '2026-10-17T00:00:00'
        ),
      }
    );

  assert.ok(
    ordinarySped.includes(
      'Baseline: 40% | Current: 85% | Target: 75%'
    ),
    'ordinary SpedTrack format must remain unchanged'
  );

  assert.ok(
    !ordinarySped.includes(
      'Header Mastery:'
    ),
    'ordinary SpedTrack output must not gain conflict labels'
  );

  const conflictSped =
    sandbox.generateSpedTrackText(
      conflictGoal.code,
      student.code,
      {
        start: new Date(
          '2026-08-01T00:00:00'
        ),
        end: new Date(
          '2026-10-17T00:00:00'
        ),
      }
    );

  assert.ok(
    conflictSped.includes(
      'Header Mastery: 80%'
    )
  );

  assert.ok(
    conflictSped.includes(
      'Goal-Text Target: 75%'
    )
  );

  assert.ok(
    conflictSped.includes(
      'Criterion Status: Manual Criterion Review Required'
    )
  );

  assert.ok(
    conflictSped.includes(
      'Status: Manual Criterion Review Required'
    )
  );

  assert.ok(
    !conflictSped.includes(
      '| Target: 75%'
    ),
    'conflicted SpedTrack output must not collapse to generic Target'
  );

  const ordinaryParentEmail =
    sandbox.buildTab1EmailBodyText(
      student,
      [ordinaryGoal],
      {},
      true
    );

  assert.ok(
    ordinaryParentEmail.includes(
      'Progress: On track  |  Status: Goal Met'
    ),
    'ordinary parent email behavior must remain unchanged'
  );

  const conflictParentEmail =
    sandbox.buildTab1EmailBodyText(
      student,
      [conflictGoal],
      {},
      true
    );

  assert.ok(
    conflictParentEmail.includes(
      'Header Mastery: 80%'
    )
  );

  assert.ok(
    conflictParentEmail.includes(
      'Goal-Text Target: 75%'
    )
  );

  assert.ok(
    conflictParentEmail.includes(
      'Criterion Status: Manual Criterion Review Required'
    )
  );

  assert.ok(
    conflictParentEmail.includes(
      'Progress: Data collected  |  Status: Manual Criterion Review Required'
    )
  );

  for (const forbidden of [
    'Progress: On track',
    'Progress: Making progress',
    'Progress: Needs support',
  ]) {
    assert.ok(
      !conflictParentEmail.includes(
        forbidden
      ),
      `conflict parent copy must suppress: ${forbidden}`
    );
  }

  const conflictAdminEmail =
    sandbox.buildTab1EmailBodyText(
      student,
      [conflictGoal],
      {},
      false
    );

  assert.ok(
    conflictAdminEmail.includes(
      'Progress: 85%  |  Status: Manual Criterion Review Required'
    ),
    'admin copy may preserve raw current evidence'
  );

  assert.ok(
    reporting.includes(
      'const criterionLines ='
    ),
    'SpedTrack conflict structure must exist in source'
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
    'tests/criterion-conflict-reporting-copy-tab1.test.cjs';

  assert.strictEqual(
    occurrences(
      unit,
      testName
    ),
    1,
    'Tab 1 copy regression test must be wired exactly once'
  );

  assert.ok(
    unit.indexOf(testName) <
    unit.indexOf(
      'tests/tc-library-helpers.test.cjs'
    )
  );

  console.log(
    'PASS: ordinary SpedTrack output remains unchanged'
  );

  console.log(
    'PASS: conflicted SpedTrack output preserves both source criteria'
  );

  console.log(
    'PASS: conflicted parent email suppresses fixed-threshold judgment'
  );

  console.log(
    'PASS: conflicted admin email retains raw evidence and manual status'
  );

  console.log();
  console.log(
    'REPORTING TAB 1 COPY-OUT CRITERION-CONFLICT HANDLING: PASS'
  );
}

run().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
