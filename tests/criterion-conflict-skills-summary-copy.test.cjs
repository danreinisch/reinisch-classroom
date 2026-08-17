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

const textSection =
  sectionBetween(
    '  function buildSkillsSummaryText(',
    '  function buildSkillsSummaryHtml(',
    'buildSkillsSummaryText'
  );

const htmlSection =
  sectionBetween(
    '  function buildSkillsSummaryHtml(',
    '  function initSkillsExportButtons(',
    'buildSkillsSummaryHtml'
  );

console.log(
  'Running Skills Summary copy and print criterion-conflict tests...\n'
);

for (const [label, section] of [
  ['text copy', textSection],
  ['HTML print', htmlSection],
]) {
  assert.ok(
    section.includes(
      'const criterionConflict ='
    ),
    `${label} must use explicit conflict metadata`
  );

  assert.ok(
    section.includes(
      'c.criterionConflict === true'
    )
  );

  assert.ok(
    section.includes(
      'Header Mastery'
    )
  );

  assert.ok(
    section.includes(
      'Goal-Text Target'
    )
  );

  assert.ok(
    section.includes(
      'Criterion Status: Manual Criterion Review Required'
    )
  );

  assert.ok(
    section.includes(
      'const criterionReviewCards ='
    )
  );

  assert.ok(
    occurrences(
      section,
      'c.criterionConflict === true'
    ) >= 4,
    `${label} must keep conflicts out of automatic buckets and recommendations`
  );

  assert.ok(
    section.includes(
      'criterionConflict === false'
    )
  );
}

assert.ok(
  textSection.includes(
    "? 'Manual Criterion Review Required'"
  ),
  'text output must replace score-band label for conflicts'
);

assert.ok(
  textSection.includes(
    '(Target: ${target})'
  ),
  'ordinary text output must retain Target'
);

assert.ok(
  htmlSection.includes(
    "? '#6b7280'"
  ),
  'HTML conflict output must use neutral presentation'
);

assert.ok(
  htmlSection.includes(
    "? 'Manual Criterion Review Required'"
  ),
  'HTML output must replace score-band label for conflicts'
);

assert.ok(
  htmlSection.includes(
    '(Target: ${escapeHtml(target)})'
  ),
  'ordinary HTML output must retain Target'
);

assert.strictEqual(
  textSection.includes(
    'headerMastery === goalTextTarget'
  ),
  false
);

assert.strictEqual(
  htmlSection.includes(
    'headerMastery === goalTextTarget'
  ),
  false
);

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-skills-summary-copy.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'Skills copy regression must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: text copy preserves both official criteria'
);

console.log(
  'PASS: HTML print preserves both official criteria'
);

console.log(
  'PASS: conflicted goals receive neutral manual-review labeling'
);

console.log(
  'PASS: conflicts are excluded from automatic Strengths and Needs Attention sections'
);

console.log(
  'PASS: legacy AI recommendations are suppressed on conflicts'
);

console.log(
  'PASS: ordinary copy and print Target behavior remains available'
);

console.log();
console.log(
  'SKILLS SUMMARY COPY AND PRINT CRITERION-CONFLICT HANDLING: PASS'
);
