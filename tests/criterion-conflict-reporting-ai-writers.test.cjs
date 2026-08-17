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

const narrative =
  read(
    'netlify/functions/teacher-ai-report-narrative.js'
  );

const summary =
  read(
    'netlify/functions/teacher-ai-report-summary.js'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

console.log(
  'Running Reporting AI writer criterion-conflict tests...\n'
);

for (const [label, source] of [
  ['quarterly narrative', narrative],
  ['executive summary', summary],
]) {
  assert.ok(
    source.includes(
      'g && g.criterion_conflict === true'
    ),
    `${label} must use only the explicit conflict flag`
  );

  assert.ok(
    source.includes(
      "Criterion Conflict: ' + (criterionConflict ? 'YES' : 'NO')"
    ),
    `${label} must expose the explicit flag to the model`
  );

  assert.ok(
    source.includes(
      'Header Mastery: '
    ),
    `${label} must preserve Header Mastery`
  );

  assert.ok(
    source.includes(
      'Goal-Text Target: '
    ),
    `${label} must preserve Goal-Text Target`
  );

  assert.ok(
    source.includes(
      'Criterion Status: Manual Criterion Review Required'
    ),
    `${label} must carry the manual-review status`
  );

  assert.ok(
    source.includes(
      'Do not select or infer either value as the controlling criterion.'
    ),
    `${label} system prompt must forbid selecting a criterion`
  );

  assert.ok(
    source.includes(
      'Manual Criterion Review Required'
    ),
    `${label} prompt must require manual review`
  );

  assert.ok(
    source.includes(
      "} else {\n      lines.push('  Target: '"
    ),
    `${label} ordinary goals must retain Target`
  );

  assert.ok(
    !source.includes(
      'mastery !== target'
    ),
    `${label} must not infer conflicts from unequal values`
  );

  assert.ok(
    !source.includes(
      'mastery != target'
    ),
    `${label} must not infer conflicts from unequal values`
  );
}

assert.ok(
  narrative.includes(
    'Do not describe a conflicted goal as met, mastered, on track, at target, near mastery'
  ),
  'narrative writer must suppress criterion-relative judgments'
);

assert.ok(
  summary.includes(
    'Do not classify a conflicted goal as met, mastered, on track, at target, near mastery'
  ),
  'executive summary must suppress criterion-relative classifications'
);

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-reporting-ai-writers.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'AI-writer conflict test must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: both AI writers preserve the explicit conflict flag'
);

console.log(
  'PASS: both AI writers receive Header Mastery and Goal-Text Target separately'
);

console.log(
  'PASS: conflicted goals cannot be assigned criterion-relative status'
);

console.log(
  'PASS: ordinary goals retain Target semantics'
);

console.log(
  'PASS: unequal values alone never create conflict'
);

console.log();
console.log(
  'REPORTING AI WRITER CRITERION-CONFLICT HANDLING: PASS'
);
