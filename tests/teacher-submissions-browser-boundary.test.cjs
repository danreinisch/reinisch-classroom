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

const endpointSource =
  read(
    'netlify/functions/teacher-submissions.js'
  );

const endpoint =
  '/.netlify/functions/teacher-submissions';

// Security absence checks must inspect executable source rather than comments.
// The endpoint's documentation intentionally names legacy mechanisms that it
// refuses to use.
const endpointCodeOnly =
  endpointSource
    .split('\n')
    .filter(
      (line) =>
        !line.trim().startsWith('//')
    )
    .join('\n');

const firstReader =
  adapter.indexOf(
    'async listSubmissions(filters = {})'
  );

const secondReader =
  adapter.indexOf(
    'async listSubmissions(filters = {})',
    firstReader + 1
  );

const nextMethod =
  adapter.indexOf(
    'async getLatestSubmission',
    secondReader
  );

assert.ok(
  firstReader >= 0,
  'local listSubmissions implementation must remain'
);

assert.ok(
  secondReader > firstReader,
  'remote listSubmissions implementation must remain'
);

assert.ok(
  nextMethod > secondReader,
  'remote listSubmissions block must be identifiable'
);

const remoteReader =
  adapter.slice(
    secondReader,
    nextMethod
  );

assert.ok(
  remoteReader.includes(endpoint),
  'remote Teacher submission reader must use signed endpoint'
);

assert.ok(
  remoteReader.includes(
    "credentials: 'include'"
  ),
  'remote Teacher submission reader must send teacher session cookie'
);

assert.ok(
  remoteReader.includes(
    'filters.student_code || filters.studentCode'
  ),
  'remote reader must preserve both student filter spellings'
);

assert.ok(
  !remoteReader.includes(
    ".from('submissions')"
  ),
  'remote listSubmissions must not query submissions directly'
);

assert.ok(
  !remoteReader.includes(
    'getSupabase()'
  ),
  'remote listSubmissions must not require browser Supabase'
);

assert.ok(
  endpointSource.includes(
    'teacherAuth.user.teacherId'
  ),
  'endpoint must authorize from signed teacherId'
);

assert.ok(
  endpointSource.includes(
    "teacher_id=eq."
  ),
  'endpoint must scope classes by canonical teacher_id'
);

assert.ok(
  endpointSource.includes(
    "'/rest/v1/class_enrollments'"
  ),
  'endpoint must verify class enrollment'
);

assert.ok(
  endpointSource.includes(
    '&active=eq.true'
  ),
  'endpoint must require active enrollment'
);

assert.ok(
  !endpointCodeOnly.includes(
    'lookupActiveTeacherId'
  ),
  'endpoint must not use single-teacher fallback'
);

assert.ok(
  !endpointCodeOnly.includes(
    'is_teacher_of'
  ),
  'endpoint must not use legacy teacher-of authorization'
);

assert.ok(
  !endpointCodeOnly.includes(
    '.series'
  ),
  'endpoint must not infer ownership from assignment series'
);

console.log(
  '✓ remote listSubmissions uses signed teacher endpoint'
);

console.log(
  '✓ browser Supabase submission SELECT removed from shared reader'
);

console.log(
  '✓ signed teacherId/class/enrollment authorization required'
);

console.log(
  '✓ legacy single-teacher and series ownership fallbacks absent'
);

console.log();
console.log(
  'RC-SEC-01I-T1 browser-boundary tests PASS'
);
