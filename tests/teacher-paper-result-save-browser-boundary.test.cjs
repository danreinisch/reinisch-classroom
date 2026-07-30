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

const library =
  read('site/web/tc-library.js');

const adapter =
  read('site/web/data-adapter.js');

const review =
  read('site/web/tc-review.js');

const reviewSave =
  read(
    'netlify/functions/teacher-review-save.js'
  );

const endpoint =
  read(
    'netlify/functions/teacher-paper-result-save.js'
  );

const paperAnchor =
  library.indexOf(
    "console.log('[tc-library] Paper assignment created:'"
  );

assert.notEqual(
  paperAnchor,
  -1,
  'PAPER creation anchor must exist'
);

const remoteStart =
  library.lastIndexOf(
    'if (isRemote) {',
    paperAnchor
  );

const localStart =
  library.indexOf(
    '// ── Local mode ──',
    paperAnchor
  );

assert.notEqual(
  remoteStart,
  -1,
  'remote PAPER region must exist'
);

assert.notEqual(
  localStart,
  -1,
  'local PAPER region must exist'
);

const remoteRegion =
  library.slice(
    remoteStart,
    localStart
  );

const localRegion =
  library.slice(
    localStart
  );

assert.match(
  remoteRegion,
  /db\.savePaperResult\(/
);

for (
  const forbidden of [
    'db.createSubmissionArchive(',
    'db.upsertAssignmentInstance(',
    'db.addSubmission(',
  ]
) {
  assert.equal(
    remoteRegion.includes(
      forbidden
    ),
    false,
    `remote Library must not call ${forbidden}`
  );
}

for (
  const preserved of [
    'db.createSubmissionArchive(',
    'db.upsertAssignmentInstance(',
    'db.addSubmission(',
  ]
) {
  assert.equal(
    localRegion.includes(
      preserved
    ),
    true,
    `local Library must preserve ${preserved}`
  );
}

assert.match(
  adapter,
  /async savePaperResult\(\{ assignment_id, student_code \}\)/
);

assert.match(
  adapter,
  /teacher-paper-result-save/
);

assert.match(
  adapter,
  /credentials:\s*'include'/
);

assert.match(
  review,
  /function isPaperSubmission\(submission\)/
);

assert.match(
  review,
  /assignment\?\.type === 'paper'/
);

assert.match(
  review,
  /const paperEvidenceReadOnly = isPaperSubmission\(submission\)/
);

assert.match(
  review,
  /Scanned paper evidence is read-only in Teacher Review/
);

const paperExcludedBulkSelections =
  review.match(
    /s => s\.review_status === 'reviewed' && !isPaperSubmission\(s\)/g
  ) || [];

assert.equal(
  paperExcludedBulkSelections.length,
  3,
  'PAPER must be excluded from reviewed batch count, finalize-all, and revert-all'
);

assert.match(
  reviewSave,
  /\?select=id,class_id,type/
);

assert.match(
  reviewSave,
  /assignment\.type === 'paper'/
);

assert.match(
  reviewSave,
  /Paper evidence is read-only in Teacher Review/
);

for (
  const forbidden of [
    'process_' + 'submission',
    'goal_' + 'progress',
    'goal_' + 'data_points',
    'assignment_' + 'goal_rollups',
    'is_' + 'teacher_of',
    'lookupActive' + 'TeacherId',
  ]
) {
  assert.equal(
    endpoint.includes(
      forbidden
    ),
    false,
    `signed PAPER boundary must not contain ${forbidden}`
  );
}

const count =
  (text, needle) =>
    text.split(needle).length - 1;

assert.equal(
  count(
    library,
    'db.savePaperResult('
  ),
  1
);

assert.equal(
  count(
    library,
    'db.createSubmissionArchive('
  ),
  1
);

assert.equal(
  count(
    library,
    'db.upsertAssignmentInstance('
  ),
  1
);

assert.equal(
  count(
    library,
    'db.addSubmission('
  ),
  1
);

console.log(
  'PASS: PAPER uses signed canonical result boundary and remains read-only in Teacher Review'
);
