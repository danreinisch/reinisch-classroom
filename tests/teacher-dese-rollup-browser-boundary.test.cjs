'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      relativePath
    ),
    'utf8'
  );
}

const files = {
  home:
    read('site/web/home-dashboard.js'),

  overview:
    read('site/web/tc-overview.js'),

  aiBuilder:
    read('site/web/tc-ai-builder.js'),

  students:
    read('site/web/tc-students.js'),
};

const endpoint =
  '/.netlify/functions/teacher-dese-rollups';

for (const [name, source] of Object.entries(files)) {
  assert.ok(
    source.includes(endpoint),
    `${name} must use authenticated teacher DESE endpoint`
  );
}

for (
  const [name, source]
  of Object.entries({
    home: files.home,
    overview: files.overview,
    aiBuilder: files.aiBuilder,
  })
) {
  assert.ok(
    !source.includes('all_students_dese_rollups'),
    `${name} must not call all_students_dese_rollups`
  );
}

assert.ok(
  !files.students.includes(
    "supabase.rpc('student_dese_rollups'"
  ),
  'tc-students must not invoke student_dese_rollups directly'
);

assert.ok(
  !files.students.includes(
    'fetchDeseRollupsFallback'
  ),
  'raw browser rollup fallback must be removed'
);

assert.ok(
  !files.home.includes(
    'hdCurrentSchoolYear'
  ),
  'Home Dashboard duplicate school-year helper must be removed'
);

assert.ok(
  !files.overview.includes(
    'spCurrentSchoolYear'
  ),
  'Overview duplicate school-year helper must be removed'
);

assert.ok(
  !files.aiBuilder.includes(
    'aibSpCurrentSchoolYear'
  ),
  'AI Builder duplicate school-year helper must be removed'
);

const evidenceStart =
  files.students.indexOf(
    'async function fetchAllEvidenceForStudent'
  );

const evidenceEnd =
  files.students.indexOf(
    'async function fetchDeseEvidenceItems',
    evidenceStart
  );

assert.ok(
  evidenceStart >= 0 &&
  evidenceEnd > evidenceStart,
  'detailed evidence functions must remain present'
);

const evidenceBlock =
  files.students.slice(
    evidenceStart,
    evidenceEnd
  );

assert.ok(
  evidenceBlock.includes(
    ".from('assignment_instances')"
  ),
  'T1 must not alter detailed DESE evidence transport'
);

console.log(
  '✓ all four DESE rollup consumers use signed teacher endpoint'
);

console.log(
  '✓ no browser all_students_dese_rollups calls remain'
);

console.log(
  '✓ no browser student_dese_rollups call remains'
);

console.log(
  '✓ raw client rollup fallback removed'
);

console.log(
  '✓ duplicate browser school-year calculations removed'
);

console.log(
  '✓ detailed evidence path intentionally unchanged for T2'
);

console.log();
console.log(
  'RC-SEC-01E-T1 browser-boundary tests PASS'
);
