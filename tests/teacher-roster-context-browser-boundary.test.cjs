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
    'netlify/functions/teacher-roster-context.js'
  );

const endpoint =
  '/.netlify/functions/teacher-roster-context';

const remoteStart =
  adapter.indexOf(
    'const remote = {'
  );

assert.ok(
  remoteStart >= 0,
  'remote adapter must remain identifiable'
);

function remoteMethod(
  methodStart,
  nextMethod
) {
  const start =
    adapter.indexOf(
      methodStart,
      remoteStart
    );

  const end =
    adapter.indexOf(
      nextMethod,
      start
    );

  assert.ok(
    start >= 0,
    `${methodStart} must remain`
  );

  assert.ok(
    end > start,
    `${methodStart} block must be identifiable`
  );

  return adapter.slice(
    start,
    end
  );
}

const studentsReader =
  remoteMethod(
    '  async listStudents() {',
    '  async upsertStudent('
  );

const goalsReader =
  remoteMethod(
    '  async listGoalsAll() {',
    '  async addProgress('
  );

const enrollmentReader =
  remoteMethod(
    '  async listClassEnrollments() {',
    '  async upsertClass('
  );

assert.ok(
  adapter.includes(endpoint),
  'adapter must use the signed roster-context endpoint'
);

assert.ok(
  adapter.includes(
    "credentials: 'include'"
  ),
  'adapter must send the teacher session cookie'
);

for (const [
  label,
  block,
] of [
  ['listStudents', studentsReader],
  ['listGoalsAll', goalsReader],
  ['listClassEnrollments', enrollmentReader],
]) {
  assert.ok(
    block.includes(
      'fetchTeacherRosterContext()'
    ),
    `${label} must use the shared signed reader`
  );

  assert.ok(
    !block.includes(
      'getSupabase()'
    ),
    `${label} must not require browser Supabase`
  );
}

assert.ok(
  !studentsReader.includes(
    ".from('students')"
  ),
  'listStudents must not query students directly'
);

assert.ok(
  !goalsReader.includes(
    ".from('goals')"
  ),
  'listGoalsAll must not query goals directly'
);

assert.ok(
  !enrollmentReader.includes(
    ".from('class_enrollments')"
  ),
  'listClassEnrollments must not query class_enrollments directly'
);

assert.ok(
  endpointSource.includes(
    'requireTeacher('
  ),
  'server endpoint must require a signed teacher session'
);

assert.ok(
  endpointSource.includes(
    "'/rest/v1/students'"
  ),
  'server endpoint must read students server-side'
);

assert.ok(
  endpointSource.includes(
    "'/rest/v1/goals'"
  ),
  'server endpoint must read goals server-side'
);

assert.ok(
  endpointSource.includes(
    "'/rest/v1/class_enrollments'"
  ),
  'server endpoint must read enrollments server-side'
);

assert.ok(
  endpointSource.includes(
    "'Cache-Control': 'no-store'"
  ),
  'server response must not be cached'
);

assert.ok(
  !endpointSource.includes(
    'SUPABASE_SERVICE_ROLE_KEY'
  ),
  'endpoint source must use the server helper rather than expose a key'
);

assert.ok(
  !adapter.includes(
    'synthetic-service-key'
  ),
  'browser adapter must contain no test service key'
);

console.log(
  '✓ three broad Teacher readers use one signed endpoint'
);

console.log(
  '✓ direct browser reads removed from the three target methods'
);

console.log(
  '✓ teacher cookie and no-store boundary preserved'
);

console.log(
  '✓ service-role credential remains server-side'
);

console.log();
console.log(
  'RC-SEC-01D1 browser-boundary tests PASS'
);
