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

function sectionBetween(
  startMarker,
  endMarker,
  label
) {
  const start =
    students.indexOf(startMarker);

  const end =
    students.indexOf(
      endMarker,
      start
    );

  assert.ok(
    start >= 0 &&
    end > start,
    `${label} section unavailable`
  );

  return students.slice(
    start,
    end
  );
}

const renderCard =
  sectionBetween(
    '  function renderSkillCard(',
    '  async function renderSkillsSummaryTab(',
    'renderSkillCard'
  );

const renderTab =
  sectionBetween(
    '  async function renderSkillsSummaryTab(',
    '  function injectCachedNarratives(',
    'renderSkillsSummaryTab'
  );

console.log(
  'Running live Skills Summary criterion-conflict display tests...\n'
);

assert.ok(
  renderCard.includes(
    "card.criterionConflict === true"
  )
);

assert.ok(
  renderCard.includes(
    'Header Mastery:'
  )
);

assert.ok(
  renderCard.includes(
    'Goal-Text Target:'
  )
);

assert.ok(
  renderCard.includes(
    'Criterion Status: Manual Criterion Review Required'
  )
);

assert.ok(
  renderCard.includes(
    'criterionConflict === false'
  ),
  'mastery callout must be disabled for conflict cards'
);

assert.ok(
  renderCard.includes(
    'This goal appears mastered'
  ),
  'ordinary mastery callout must remain available'
);

assert.ok(
  renderCard.includes(
    '<span>Target: ${card.target}%</span>'
  ),
  'ordinary IEP Target display must remain'
);

assert.ok(
  renderTab.includes(
    'const criterionReviewCards ='
  )
);

assert.ok(
  renderTab.includes(
    'Manual Criterion Review Required:'
  )
);

assert.ok(
  occurrences(
    renderTab,
    "c.criterionConflict === true"
  ) >= 3,
  'conflicts must have a review bucket and be excluded from both automatic buckets'
);

assert.ok(
  renderTab.includes(
    'Strengths:'
  )
);

assert.ok(
  renderTab.includes(
    'Needs Attention:'
  )
);

assert.strictEqual(
  renderCard.includes(
    'headerMastery != goalTextTarget'
  ),
  false
);

assert.strictEqual(
  renderTab.includes(
    'headerMastery != goalTextTarget'
  ),
  false
);

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-skills-summary-display.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'live-Skills regression must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: live conflict card shows both official criteria'
);

console.log(
  'PASS: live conflict card requires manual criterion review'
);

console.log(
  'PASS: conflict card cannot trigger mastery callout'
);

console.log(
  'PASS: conflict cards are excluded from automatic Strengths/Needs Attention buckets'
);

console.log(
  'PASS: ordinary live Skills behavior remains available'
);

console.log();
console.log(
  'LIVE SKILLS SUMMARY CRITERION-CONFLICT DISPLAY: PASS'
);
