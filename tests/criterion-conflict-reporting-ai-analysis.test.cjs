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

const trends =
  read(
    'netlify/functions/teacher-ai-analyze-trends.js'
  );

const compliance =
  read(
    'netlify/functions/teacher-ai-compliance-notes.js'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

console.log(
  'Running Reporting AI Trends/Compliance criterion-conflict tests...\n'
);

for (const [label, source] of [
  ['trend analysis', trends],
  ['compliance notes', compliance],
]) {
  assert.ok(
    source.includes(
      'g && g.criterion_conflict === true'
    ),
    `${label} must use only the explicit source flag`
  );

  assert.ok(
    source.includes(
      "Criterion Conflict: ' + (criterionConflict ? 'YES' : 'NO')"
    ),
    `${label} must expose the explicit conflict flag`
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
    `${label} must preserve manual-review status`
  );

  assert.ok(
    source.includes(
      'Do not select or infer either value as the controlling criterion.'
    ),
    `${label} must forbid automatic criterion selection`
  );

  assert.ok(
    source.includes(
      "} else {\n      lines.push('  Target: '"
    ) ||
    source.includes(
      "} else {\n        lines.push('  Target: '"
    ),
    `${label} must retain Target for ordinary goals`
  );

  assert.ok(
    !source.includes(
      'mastery !== target'
    ),
    `${label} must not infer conflict from unequal values`
  );

  assert.ok(
    !source.includes(
      'mastery != target'
    ),
    `${label} must not infer conflict from unequal values`
  );
}

assert.strictEqual(
  occurrences(
    trends,
    "criterionGuidance + ' ' +"
  ),
  2,
  'trend guidance must apply to both parent and admin prompts'
);

assert.ok(
  trends.includes(
    'For ordinary goals, describe which goals are on track to meet their target'
  ),
  'parent trend prompt must limit target judgment to ordinary goals'
);

assert.ok(
  trends.includes(
    'For ordinary goals, identify which goals are on track to meet targets'
  ),
  'admin trend prompt must limit target judgment to ordinary goals'
);

assert.ok(
  trends.includes(
    'do not make a criterion-relative risk or success judgment'
  ),
  'trend prompt must suppress target-relative conflict judgment'
);

assert.ok(
  compliance.toLowerCase().includes(
    'for ordinary goals, briefly note current status relative to the target.'
  ),
  'compliance prompt must restrict target-relative status to ordinary goals'
);

assert.ok(
  compliance.includes(
    'The existence of a criterion conflict by itself is not evidence of a service-delivery or data-collection compliance failure.'
  ),
  'criterion conflict must not automatically become a compliance violation'
);

assert.ok(
  compliance.includes(
    'Flag compliance concerns only when supported by the supplied compliance evidence.'
  ),
  'compliance concerns must remain evidence-grounded'
);

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-reporting-ai-analysis.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'Trends/Compliance conflict test must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: Trend Analysis preserves both official criteria'
);

console.log(
  'PASS: conflicted trends cannot be classified against either criterion'
);

console.log(
  'PASS: Compliance Notes preserve both official criteria'
);

console.log(
  'PASS: criterion conflict alone cannot become a compliance violation'
);

console.log(
  'PASS: ordinary goal target semantics remain available'
);

console.log();
console.log(
  'REPORTING AI TRENDS/COMPLIANCE CRITERION-CONFLICT HANDLING: PASS'
);
