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
    reporting.indexOf(
      startMarker
    );

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
  'Running Reporting criterion-conflict display tests...\n'
);

const iep =
  sectionBetween(
    '  function renderIEPProgressTemplate(',
    '  function renderParentSummaryTemplate(',
    'IEP report'
  );

const parent =
  sectionBetween(
    '  function renderParentSummaryTemplate(',
    '  function renderAdminSummaryTemplate(',
    'Parent Summary'
  );

const admin =
  sectionBetween(
    '  function renderAdminSummaryTemplate(',
    '  function generateSpedTrackText(',
    'Admin Summary'
  );

assert.ok(
  iep.includes(
    'manualReviewCount'
  ),
  'IEP summary must count manual-review goals separately'
);

assert.ok(
  iep.includes(
    '"manual-review"'
  ),
  'IEP conflict must have a manual-review status option'
);

assert.ok(
  iep.includes(
    'Manual Criterion Review Required'
  ),
  'IEP conflict must visibly require manual review'
);

assert.ok(
  iep.includes(
    'Header Mastery:'
  ) &&
  iep.includes(
    'Goal-Text Target:'
  ),
  'IEP report must show both official criteria'
);

assert.ok(
  iep.includes(
    'criterionConflict\n            ? "manual-review"'
  ),
  'IEP conflict must not default to adequate'
);

assert.ok(
  parent.includes(
    'if (criterionConflict)'
  ),
  'Parent Summary must gate automatic criterion judgment'
);

assert.ok(
  parent.includes(
    '"Manual Criterion Review Required"'
  ),
  'Parent Summary conflict must show manual review'
);

assert.ok(
  parent.includes(
    'Header Mastery:'
  ) &&
  parent.includes(
    'Goal-Text Target:'
  ),
  'Parent Summary must show both official criteria'
);

assert.ok(
  parent.includes(
    'if (criterionConflict) return'
  ),
  'cached parent AI note must be suppressed for a source conflict'
);

assert.ok(
  admin.includes(
    'if (criterionConflict)'
  ),
  'Admin Summary must gate criterion judgment'
);

assert.ok(
  admin.includes(
    '"Manual Criterion Review Required"'
  ),
  'Admin Summary conflict must not be marked At Target'
);

assert.ok(
  admin.includes(
    'Header Mastery:'
  ) &&
  admin.includes(
    'Goal-Text Target:'
  ),
  'Admin Summary must show both official criteria'
);

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
  'tests/criterion-conflict-reporting-display.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'Reporting display test must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  ),
  'Reporting display test must run before the known helper stop'
);

console.log(
  'PASS: IEP report defaults conflicts to manual review'
);

console.log(
  'PASS: Teacher may still make an intentional manual status selection'
);

console.log(
  'PASS: Parent Summary suppresses target-relative judgment'
);

console.log(
  'PASS: Parent cached AI note is suppressed on conflict'
);

console.log(
  'PASS: Admin Summary suppresses At Target judgment'
);

console.log(
  'PASS: all three report templates preserve both source criteria'
);

console.log();
console.log(
  'REPORTING CRITERION-CONFLICT DISPLAY: PASS'
);
