'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const vm =
  require('node:vm');

const root =
  path.resolve(
    __dirname,
    '..'
  );

const portal =
  fs.readFileSync(
    path.join(
      root,
      'site/web/student-portal-init.js'
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

function sliceBetween(
  startMarker,
  endMarker,
  label
) {
  const start =
    portal.indexOf(
      startMarker
    );

  const end =
    portal.indexOf(
      endMarker,
      start
    );

  assert.ok(
    start >= 0,
    `${label}: start marker missing`
  );

  assert.ok(
    end > start,
    `${label}: end marker missing`
  );

  return portal.slice(
    start,
    end
  );
}

const formatSource =
  sliceBetween(
    '  function formatProgressValue(',
    '\n\n  /**\n   * Compute a SPED-friendly status',
    'formatProgressValue'
  );

const statusSource =
  sliceBetween(
    '  function computeGoalStatus(',
    '\n\n  /**\n   * Compute trend direction',
    'computeGoalStatus'
  );

const bannerSource =
  sliceBetween(
    '  function buildStatusBannerHtml(',
    '\n\n  /**\n   * Build the summary stats row',
    'buildStatusBannerHtml'
  );

const statsSource =
  sliceBetween(
    '  function buildStatsRowHtml(',
    '\n\n  /**\n   * Build an inline SVG line chart',
    'buildStatsRowHtml'
  );

const sandbox = {
  escapeHtml(value) {
    return String(value);
  },
};

vm.runInNewContext(
  [
    formatSource,
    statusSource,
    bannerSource,
    statsSource,
    'this.helpers = {',
    '  buildStatusBannerHtml,',
    '  buildStatsRowHtml,',
    '};',
  ].join('\n'),
  sandbox
);

const {
  buildStatusBannerHtml,
  buildStatsRowHtml,
} = sandbox.helpers;

console.log(
  'Running Student Portal criterion-conflict tests...\n'
);

const conflictBanner =
  buildStatusBannerHtml(
    85,
    75,
    40,
    'percent',
    true
  );

assert.ok(
  conflictBanner.includes(
    'Manual Criterion Review Required'
  ),
  'conflicted goal must display the manual-review label'
);

assert.ok(
  conflictBanner.includes(
    'Latest score: 85%'
  ),
  'conflicted goal may still display raw progress'
);

for (const forbidden of [
  'you met your goal',
  'On Track!',
  'Almost There',
  'Keep Practicing',
  'Needs Support',
]) {
  assert.ok(
    !conflictBanner.includes(
      forbidden
    ),
    `conflicted banner must suppress: ${forbidden}`
  );
}

const ordinaryBanner =
  buildStatusBannerHtml(
    85,
    75,
    40,
    'percent',
    false
  );

assert.ok(
  ordinaryBanner.includes(
    'On Track!'
  ),
  'ordinary goals must retain existing automatic status behavior'
);

assert.ok(
  ordinaryBanner.includes(
    'you met your goal'
  ),
  'ordinary goals must retain the existing success sentence'
);

const trend = {
  arrow: 'up',
  label: 'Improving',
  cssClass: 'trend-up',
};

const conflictStats =
  buildStatsRowHtml(
    85,
    82,
    75,
    trend,
    'percent',
    true
  );

assert.ok(
  conflictStats.includes(
    'Latest'
  ),
  'conflicted stats may show latest progress'
);

assert.ok(
  conflictStats.includes(
    'Avg This Quarter'
  ),
  'conflicted stats may show the quarter average'
);

assert.ok(
  conflictStats.includes(
    'Trend'
  ),
  'conflicted stats may show trend'
);

assert.ok(
  !conflictStats.includes(
    '>Target<'
  ),
  'conflicted stats must not present one controlling target'
);

const ordinaryStats =
  buildStatsRowHtml(
    85,
    82,
    75,
    trend,
    'percent',
    false
  );

assert.ok(
  ordinaryStats.includes(
    '>Target<'
  ),
  'ordinary goals must retain their target statistic'
);

assert.match(
  portal,
  /const criterionConflict\s*=\s*goal\.criterion_conflict === true;/,
  'goal card must use only the explicit conflict flag'
);

assert.ok(
  portal.includes(
    "'Header Mastery:'"
  ),
  'conflicted goals must label Header Mastery accurately'
);

assert.ok(
  portal.includes(
    "'Goal-Text Target:'"
  ),
  'conflicted goals must label Goal-Text Target accurately'
);

assert.match(
  portal,
  /const target\s*=\s*criterionConflict\s*\?\s*null\s*:/,
  'conflicted chart must suppress the target line and mastery zone'
);

assert.ok(
  portal.includes(
    'criterionReviewHtml'
  ),
  'manual-review notice must remain visible even without progress data'
);

assert.ok(
  !portal.includes(
    'mastery !== target'
  ),
  'Student Portal must not infer conflict from unequal values'
);

assert.ok(
  !portal.includes(
    'mastery != target'
  ),
  'Student Portal must not infer conflict from unequal values'
);

const unit =
  String(
    packageJson.scripts?.['test:unit'] || ''
  );

const testName =
  'tests/criterion-conflict-student-portal.test.cjs';

assert.strictEqual(
  unit.split(testName).length - 1,
  1,
  'Student Portal conflict test must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  ),
  'Student Portal conflict test must run before the known local helper stop'
);

console.log(
  'PASS: conflicted goals show both official criterion labels'
);

console.log(
  'PASS: conflicted goals suppress automatic mastery judgments'
);

console.log(
  'PASS: raw progress and trend remain visible'
);

console.log(
  'PASS: chart target line and mastery zone are suppressed'
);

console.log(
  'PASS: ordinary goal behavior remains unchanged'
);

console.log(
  '\nSTUDENT PORTAL CRITERION-CONFLICT HANDLING: PASS'
);
