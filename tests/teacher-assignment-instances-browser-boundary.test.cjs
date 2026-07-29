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
    'netlify/functions/teacher-assignment-instances-list.js'
  );

const endpoint =
  '/.netlify/functions/teacher-assignment-instances-list';

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
    'async listAssignmentInstances()'
  );

const secondReader =
  adapter.indexOf(
    'async listAssignmentInstances()',
    firstReader + 1
  );

const nextMethod =
  adapter.indexOf(
    'async upsertAssignmentInstance',
    secondReader
  );

assert.ok(
  firstReader >= 0,
  'local listAssignmentInstances implementation must remain'
);

assert.ok(
  secondReader > firstReader,
  'remote listAssignmentInstances implementation must remain'
);

assert.ok(
  nextMethod > secondReader,
  'remote listAssignmentInstances block must be identifiable'
);

const remoteReader =
  adapter.slice(
    secondReader,
    nextMethod
  );

assert.ok(
  remoteReader.includes(endpoint),
  'remote Teacher instance reader must use signed endpoint'
);

assert.ok(
  remoteReader.includes(
    "credentials: 'include'"
  ),
  'remote Teacher instance reader must send teacher session cookie'
);

assert.ok(
  !remoteReader.includes(
    ".from('assignment_instances')"
  ),
  'remote listAssignmentInstances must not query assignment_instances directly'
);

assert.ok(
  !remoteReader.includes(
    'getSupabase()'
  ),
  'remote listAssignmentInstances must not require browser Supabase'
);

assert.ok(
  endpointSource.includes(
    'teacherAuth.user.teacherId'
  ),
  'endpoint must authorize from signed teacherId'
);

assert.ok(
  endpointSource.includes(
    'teacher_id=eq.'
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
  endpointSource.includes(
    '?select=id,class_id'
  ),
  'endpoint must authorize assignments through canonical class_id'
);

assert.ok(
  endpointSource.includes(
    'row.settings.non_instructional === true'
  ),
  'endpoint must exclude non-instructional instances server-side'
);

assert.ok(
  endpointSource.includes(
    'getCurrentSchoolYear'
  ),
  'endpoint must preserve existing current-school-year contract'
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
  '✓ remote listAssignmentInstances uses signed endpoint'
);

console.log(
  '✓ browser direct assignment_instances SELECT removed from shared reader'
);

console.log(
  '✓ signed teacherId/class/enrollment authorization required'
);

console.log(
  '✓ legacy single-teacher and series ownership fallbacks absent'
);

console.log();
console.log(
  'RC-SEC-01I-T2 browser-boundary tests PASS'
);
