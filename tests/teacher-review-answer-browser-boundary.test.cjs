'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

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

const adapter =
  read(
    'site/web/data-adapter.js'
  );

const review =
  read(
    'site/web/tc-review.js'
  );

const reviewHtml =
  read(
    'site/teacher/review/index.html'
  );

const endpoint =
  '/.netlify/functions/teacher-review-submission-answers';

const firstReader =
  adapter.indexOf(
    'async listSubmissionAnswers(submissionId)'
  );

const secondReader =
  adapter.indexOf(
    'async listSubmissionAnswers(submissionId)',
    firstReader + 1
  );

const nextMethod =
  adapter.indexOf(
    'async updateSubmissionAnswer',
    secondReader
  );

assert.ok(
  firstReader >= 0,
  'local listSubmissionAnswers implementation must remain'
);

assert.ok(
  secondReader > firstReader,
  'remote listSubmissionAnswers implementation must remain'
);

assert.ok(
  nextMethod > secondReader,
  'remote answer-reader block must be identifiable'
);

const remoteReader =
  adapter.slice(
    secondReader,
    nextMethod
  );

assert.ok(
  remoteReader.includes(
    endpoint
  ),
  'remote Review answer reader must use signed teacher endpoint'
);

assert.ok(
  remoteReader.includes(
    "credentials: 'include'"
  ),
  'remote Review answer reader must send teacher session cookie'
);

assert.ok(
  !remoteReader.includes(
    ".from('submission_answers')"
  ),
  'remote Review answer reader must not query submission_answers directly'
);

assert.ok(
  !adapter.includes(
    ".from('submission_answers')"
  ),
  'data-adapter must contain no direct Supabase submission_answers reader'
);

assert.ok(
  !review.includes(
    "table: 'submission_answers'"
  ),
  'Teacher Review must not subscribe directly to submission_answers'
);

assert.ok(
  review.includes(
    "table: 'submissions'"
  ),
  'existing submissions reload signal must remain'
);

assert.ok(
  review.includes(
    "/web/data-adapter.js?v=2026082401"
  ),
  'Teacher Review must request the versioned data-adapter'
);

assert.ok(
  reviewHtml.includes(
    '/web/tc-review.js?v=2026082401'
  ),
  'Teacher Review HTML must cache-bust the changed Review module'
);

console.log(
  '✓ remote Review answers use signed teacher endpoint'
);

console.log(
  '✓ browser direct submission_answers reader removed'
);

console.log(
  '✓ dead submission_answers realtime listener removed'
);

console.log(
  '✓ submissions reload listener preserved'
);

console.log(
  '✓ Review module and data-adapter cache-busted'
);

console.log();
console.log(
  'RC-SEC-01G browser-boundary tests PASS'
);
