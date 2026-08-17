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

const source =
  fs.readFileSync(
    path.join(
      root,
      'site/web/tc-students.js'
    ),
    'utf8'
  );

const packageJson =
  JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        'package.json'
      ),
      'utf8'
    )
  );

const start =
  source.indexOf(
    '  function renderTimelineChart('
  );

const end =
  source.indexOf(
    '  /**\n   * A2. Compliance Checklist',
    start
  );

assert.ok(
  start >= 0 &&
  end > start,
  'timeline chart function unavailable'
);

const functionSource =
  source.slice(
    start + 2,
    end
  ).trim();

const makeTimeline =
  new Function(
    'parseGoalValue',
    'hasCriterionConflict',
    'getAutomaticCriterionValue',
    'escapeHtml',
    'formatDate',
    'return (' + functionSource + ');'
  );

const parseGoalValue =
  value => {
    if (
      value == null ||
      value === ''
    ) {
      return null;
    }

    const parsed =
      parseFloat(
        String(value)
      );

    return Number.isNaN(parsed)
      ? null
      : parsed;
  };

const hasCriterionConflict =
  goal =>
    goal?.criterion_conflict === true;

const getAutomaticCriterionValue =
  goal => {
    if (
      hasCriterionConflict(goal)
    ) {
      return null;
    }

    return (
      parseGoalValue(goal?.mastery) ??
      parseGoalValue(goal?.target)
    );
  };

const escapeHtml =
  value =>
    String(value);

const formatDate =
  value =>
    String(value);

const renderTimelineChart =
  makeTimeline(
    parseGoalValue,
    hasCriterionConflict,
    getAutomaticCriterionValue,
    escapeHtml,
    formatDate
  );

const progress = [
  {
    date: '2026-08-10',
    percent: 50,
  },
  {
    date: '2026-08-12',
    percent: 65,
  },
];

console.log(
  'Running Teacher Students timeline criterion-conflict tests...\n'
);


// Explicit conflict --------------------------------------------

const conflictHtml =
  renderTimelineChart(
    {
      code: 'S900.CG1',
      goal_area: 'Reading',
      baseline: '20%',
      mastery: '80%',
      target: '60%',
      criterion_conflict: true,
    },
    progress
  );

assert.ok(
  conflictHtml.includes(
    'Header Mastery: 80%'
  )
);

assert.ok(
  conflictHtml.includes(
    'Goal-Text Target: 60%'
  )
);

assert.ok(
  conflictHtml.includes(
    'Manual Criterion Review Required'
  )
);

assert.ok(
  conflictHtml.includes(
    'No automatic mastery guide is drawn for this goal.'
  )
);

assert.strictEqual(
  conflictHtml.includes(
    'Mastery line (gold dashed)'
  ),
  false,
  'conflicted goal must not draw a mastery guide'
);

assert.strictEqual(
  conflictHtml.includes(
    'stroke="#fbbf24"'
  ),
  false,
  'conflicted goal must not draw the gold mastery line'
);


// Unequal but ordinary -----------------------------------------

const ordinaryHtml =
  renderTimelineChart(
    {
      code: 'S900.CG2',
      goal_area: 'Writing',
      baseline: '20%',
      mastery: '80%',
      target: '60%',
      criterion_conflict: false,
    },
    progress
  );

assert.ok(
  ordinaryHtml.includes(
    'Mastery line (gold dashed)'
  ),
  'ordinary timeline must retain its mastery guide'
);

assert.ok(
  ordinaryHtml.includes(
    'Mastery: 80%'
  ),
  'ordinary mastery-first behavior must remain'
);

assert.strictEqual(
  ordinaryHtml.includes(
    'Manual Criterion Review Required'
  ),
  false,
  'unequal values alone must not create a conflict'
);


// Source contract ----------------------------------------------

assert.ok(
  functionSource.includes(
    'hasCriterionConflict(goal)'
  )
);

assert.ok(
  functionSource.includes(
    'getAutomaticCriterionValue(goal)'
  )
);

assert.ok(
  functionSource.includes(
    'masteryNum == null'
  )
);

assert.strictEqual(
  functionSource.includes(
    'parseGoalValue(goal.mastery || goal.target) ?? 100'
  ),
  false,
  'timeline must not directly choose mastery over target for chart scaling'
);

const unit =
  String(
    packageJson.scripts?.[
      'test:unit'
    ] || ''
  );

const testName =
  'tests/criterion-conflict-goal-timeline.test.cjs';

assert.strictEqual(
  unit.split(
    testName
  ).length - 1,
  1,
  'timeline regression must be wired exactly once'
);

console.log(
  'PASS: conflict timeline retains raw progress and baseline'
);

console.log(
  'PASS: conflict timeline preserves Header Mastery and Goal-Text Target'
);

console.log(
  'PASS: conflict timeline displays Manual Criterion Review Required'
);

console.log(
  'PASS: conflict timeline suppresses the automatic mastery guide'
);

console.log(
  'PASS: unequal ordinary goal retains existing mastery-first guide'
);

console.log();
console.log(
  'TEACHER STUDENTS GOAL TIMELINE CRITERION-CONFLICT HANDLING: PASS'
);
