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

const reporting =
  fs.readFileSync(
    path.join(
      root,
      'site/web/tc-reporting.js'
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

function sectionBetween(
  startMarker,
  endMarker,
  label
) {
  const start =
    reporting.indexOf(startMarker);

  const end =
    reporting.indexOf(
      endMarker,
      start
    );

  assert.ok(
    start >= 0 &&
    end > start,
    `${label} section unavailable`
  );

  return reporting.slice(
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

console.log(
  'Running Reporting AI criterion-conflict payload tests...\n'
);

const sections = [
  {
    label: 'report narrative',
    source: sectionBetween(
      '  async function handleGenerateNarrative(',
      '  async function handleGenerateExecutiveSummary(',
      'report narrative'
    ),
  },
  {
    label: 'executive summary',
    source: sectionBetween(
      '  async function handleGenerateExecutiveSummary(',
      '  async function handleAnalyzeTrends(',
      'executive summary'
    ),
  },
  {
    label: 'trend analysis',
    source: sectionBetween(
      '  async function handleAnalyzeTrends(',
      '  async function handleDraftComplianceNotes(',
      'trend analysis'
    ),
  },
  {
    label: 'compliance notes',
    source: sectionBetween(
      '  async function handleDraftComplianceNotes(',
      '  async function renderTab1(',
      'compliance notes'
    ),
  },
];

for (const entry of sections) {
  const source =
    entry.source;

  assert.ok(
    source.includes(
      'hasCriterionConflict(goal)'
    ),
    `${entry.label} must use the explicit conflict flag`
  );

  assert.ok(
    source.includes(
      'criterion_conflict: criterionConflict'
    ),
    `${entry.label} must transport criterion_conflict`
  );

  assert.ok(
    source.includes(
      'header_mastery: String(goal.mastery ?? \'\')'
    ),
    `${entry.label} must transport Header Mastery separately`
  );

  assert.ok(
    source.includes(
      'goal_text_target: String(goal.target ?? \'\')'
    ),
    `${entry.label} must transport Goal-Text Target separately`
  );

  assert.ok(
    source.includes(
      "criterionConflict\n            ? ''"
    ) ||
    source.includes(
      "criterionConflict\n              ? ''"
    ),
    `${entry.label} must blank legacy target on conflict`
  );

  assert.ok(
    source.includes(
      "String(goal.mastery || goal.target || '')"
    ),
    `${entry.label} must retain ordinary mastery-first target behavior`
  );

  assert.ok(
    !source.includes(
      "target: String(goal.mastery || goal.target || '')"
    ),
    `${entry.label} must not unconditionally collapse criteria`
  );
}

assert.ok(
  !reporting.includes(
    'mastery !== target'
  ),
  'Reporting must not infer conflict from unequal values'
);

assert.ok(
  !reporting.includes(
    'mastery != target'
  ),
  'Reporting must not infer conflict from unequal values'
);

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-reporting-ai-payload.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'Reporting AI payload test must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: all four Reporting AI payloads carry the explicit conflict flag'
);

console.log(
  'PASS: Header Mastery and Goal-Text Target remain separate'
);

console.log(
  'PASS: flagged goals expose no legacy generic target'
);

console.log(
  'PASS: ordinary goal payload target behavior remains unchanged'
);

console.log(
  'PASS: unequal values alone never imply conflict'
);

console.log();
console.log(
  'REPORTING AI CRITERION-CONFLICT PAYLOAD TRANSPORT: PASS'
);
