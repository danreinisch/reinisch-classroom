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
      'site/web/tc-archive.js'
    ),
    'utf8'
  );

const adapter =
  fs.readFileSync(
    path.join(
      root,
      'site/web/data-adapter.js'
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


function section(
  startNeedle,
  endNeedle
) {
  const start =
    source.indexOf(
      startNeedle
    );

  const end =
    source.indexOf(
      endNeedle,
      start
    );

  assert.ok(
    start >= 0 &&
    end > start,
    'Archive source section unavailable'
  );

  return source.slice(
    start,
    end
  );
}


const helperSource =
  section(
    '  function getArchiveCriterionDisplay(goal) {',
    '  /**\n   * Format date as YYYY-MM-DD'
  ).trim();

const getArchiveCriterionDisplay =
  new Function(
    'hasCriterionConflict',
    'return (' + helperSource + ');'
  )(
    goal =>
      goal?.criterion_conflict === true
  );


console.log(
  'Running Teacher Archive criterion-conflict tests...\n'
);


// Explicit conflict --------------------------------------------

const conflict =
  getArchiveCriterionDisplay({
    mastery: '80%',
    target: '60%',
    criterion_conflict: true,
  });

assert.strictEqual(
  conflict.isConflict,
  true
);

assert.strictEqual(
  conflict.masteryLabel,
  'Header Mastery'
);

assert.strictEqual(
  conflict.masteryValue,
  '80%'
);

assert.strictEqual(
  conflict.targetLabel,
  'Goal-Text Target'
);

assert.strictEqual(
  conflict.targetValue,
  '60%'
);

assert.strictEqual(
  conflict.status,
  'Manual Criterion Review Required'
);


// Unequal but ordinary -----------------------------------------

const ordinary =
  getArchiveCriterionDisplay({
    mastery: '80%',
    target: '60%',
    criterion_conflict: false,
  });

assert.strictEqual(
  ordinary.isConflict,
  false
);

assert.strictEqual(
  ordinary.masteryLabel,
  'Mastery'
);

assert.strictEqual(
  ordinary.masteryValue,
  '80%'
);

assert.strictEqual(
  ordinary.targetLabel,
  'Target'
);

assert.strictEqual(
  ordinary.targetValue,
  '60%'
);

assert.strictEqual(
  ordinary.status,
  ''
);


// Ordinary mastery fallback -----------------------------------

const ordinaryFallback =
  getArchiveCriterionDisplay({
    mastery: null,
    target: '75%',
    criterion_conflict: false,
  });

assert.strictEqual(
  ordinaryFallback.masteryValue,
  '75%',
  'ordinary Archive output must retain existing mastery-to-target fallback'
);


// Conflict never falls from mastery to target -----------------

const conflictMissingMastery =
  getArchiveCriterionDisplay({
    mastery: null,
    target: '60%',
    criterion_conflict: true,
  });

assert.strictEqual(
  conflictMissingMastery.masteryValue,
  'N/A'
);

assert.strictEqual(
  conflictMissingMastery.targetValue,
  '60%'
);


// Live Archive display ----------------------------------------

const goalsSection =
  section(
    '  async function renderGoalsTab(',
    '  async function renderGradebookTab('
  );

assert.ok(
  goalsSection.includes(
    'getArchiveCriterionDisplay'
  )
);

assert.ok(
  goalsSection.includes(
    'criterion.masteryLabel'
  )
);

assert.ok(
  goalsSection.includes(
    'criterion.targetLabel'
  )
);

assert.ok(
  goalsSection.includes(
    'Criterion Status:'
  )
);

assert.strictEqual(
  goalsSection.includes(
    "latest.mastery || latest.target"
  ),
  false,
  'live Archive display must not collapse conflicted criteria directly'
);


// DOCX ---------------------------------------------------------

const docxSection =
  section(
    '  async function handleExportDocx(',
    '  async function handleReactivate('
  );

assert.ok(
  docxSection.includes(
    'getArchiveCriterionDisplay(g)'
  )
);

assert.ok(
  docxSection.includes(
    'Header Mastery:'
  )
);

assert.ok(
  docxSection.includes(
    'Goal-Text Target:'
  )
);

assert.ok(
  docxSection.includes(
    'criterion.status'
  ),
  'DOCX must render the shared manual-review status'
);

assert.ok(
  helperSource.includes(
    'Manual Criterion Review Required'
  ),
  'shared Archive criterion helper must define the exact manual-review status'
);

assert.strictEqual(
  docxSection.includes(
    "g.mastery || g.target"
  ),
  false,
  'DOCX must not collapse conflicted criteria directly'
);


// Schema-flexible transport -----------------------------------

const remoteStart =
  adapter.indexOf(
    'const remote = {'
  );

assert.ok(
  remoteStart >= 0
);

const remote =
  adapter.slice(
    remoteStart
  );

const archiveReaderStart =
  remote.indexOf(
    'async getStudentArchiveData(studentCode)'
  );

assert.ok(
  archiveReaderStart >= 0
);

const archiveReaderEnd =
  remote.indexOf(
    'async reactivateStudent(',
    archiveReaderStart
  );

assert.ok(
  archiveReaderEnd > archiveReaderStart
);

const archiveReader =
  remote.slice(
    archiveReaderStart,
    archiveReaderEnd
  );

assert.ok(
  archiveReader.includes(
    ".from('goals')"
  )
);

assert.ok(
  archiveReader.includes(
    ".select('*')"
  ),
  'Archive goal transport must remain schema-flexible'
);


// Wiring -------------------------------------------------------

const unit =
  String(
    packageJson.scripts?.[
      'test:unit'
    ] || ''
  );

const testName =
  'tests/criterion-conflict-teacher-archive.test.cjs';

assert.strictEqual(
  unit.split(
    testName
  ).length - 1,
  1,
  'Archive regression must be wired exactly once'
);


console.log(
  'PASS: Archive transport remains schema-flexible'
);

console.log(
  'PASS: live Archive goals preserve explicit conflict semantics'
);

console.log(
  'PASS: Archive DOCX preserves Header Mastery and Goal-Text Target'
);

console.log(
  'PASS: Archive DOCX identifies Manual Criterion Review Required'
);

console.log(
  'PASS: unequal ordinary goals retain existing Archive behavior'
);

console.log();
console.log(
  'TEACHER ARCHIVE CRITERION-CONFLICT HANDLING: PASS'
);
