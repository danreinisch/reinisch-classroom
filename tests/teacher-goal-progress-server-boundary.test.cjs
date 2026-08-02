const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root =
  path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

const endpoint =
  read(
    'netlify/functions/teacher-goal-progress.js'
  );

const adapter =
  read(
    'site/web/data-adapter.js'
  );

const students =
  read(
    'site/web/tc-students.js'
  );

const mapping =
  read(
    'site/web/assignment-mapping-db.js'
  );

const migration =
  read(
    'supabase/migrations/' +
    '20260802004500_goal_progress_server_only.sql'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

assert(
  endpoint.includes('requireTeacher'),
  'endpoint must require signed teacher authentication'
);

assert(
  endpoint.includes(
    'SUPABASE_SERVICE_ROLE_KEY'
  ),
  'endpoint must use service-role database access'
);

for (
  const action of [
    'list',
    'insert',
    'insert_batch',
    'quarter_averages',
  ]
) {
  assert(
    endpoint.includes(
      `action === '${action}'`
    ),
    `endpoint must support ${action}`
  );
}

assert(
  endpoint.includes(
    '/rest/v1/goal_progress'
  ),
  'endpoint must own canonical goal_progress access'
);

assert(
  endpoint.includes(
    'goal_progress_quarter_avg'
  ),
  'endpoint must own quarterly aggregate access'
);

assert(
  adapter.includes(
    '/.netlify/functions/teacher-goal-progress'
  ),
  'adapter must use teacher goal-progress endpoint'
);

assert(
  adapter.includes(
    "credentials: 'include'"
  ),
  'adapter must include signed teacher cookie'
);

assert(
  students.includes(
    'db.listGoalProgress({'
  ),
  'Students tab must use shared adapter for reads'
);

assert(
  students.includes(
    'await db.upsertGoalProgress({'
  ),
  'Students tab must use shared adapter for writes'
);

const browserSource =
  [
    adapter,
    students,
    mapping,
  ].join('\n');

assert(
  !/\.from\(['"]goal_progress['"]\)/.test(
    browserSource
  ),
  'published teacher browser code must have no direct goal_progress access'
);

assert(
  !/\.from\(['"]goal_progress_quarter_avg['"]\)/.test(
    browserSource
  ),
  'published teacher browser code must have no direct quarterly-view access'
);

assert(
  /ADD COLUMN IF NOT EXISTS notes text/i.test(
    migration
  ),
  'migration must preserve intended teacher notes'
);

assert(
  /DROP POLICY IF EXISTS\s+"Allow all access to goal_progress"/i.test(
    migration
  ),
  'migration must remove unrestricted policy'
);

for (
  const role of [
    'PUBLIC',
    'anon',
    'authenticated',
  ]
) {
  assert(
    new RegExp(
      'REVOKE ALL PRIVILEGES[\\s\\S]*?' +
      'goal_progress[\\s\\S]*?' +
      `FROM ${role}`,
      role === 'PUBLIC'
        ? 'i'
        : ''
    ).test(migration),
    `migration must revoke goal_progress from ${role}`
  );
}

assert(
  /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*?goal_progress[\s\S]*?TO service_role/i.test(
    migration
  ),
  'service role must retain goal_progress access'
);

assert(
  /REVOKE ALL PRIVILEGES[\s\S]*?goal_progress_quarter_avg[\s\S]*?FROM anon/i.test(
    migration
  ),
  'quarterly view must be revoked from anon'
);

assert(
  /GRANT SELECT[\s\S]*?goal_progress_quarter_avg[\s\S]*?TO service_role/i.test(
    migration
  ),
  'service role must retain quarterly-view access'
);

assert(
  packageJson.scripts['test:unit'].includes(
    'tests/teacher-goal-progress-server-boundary.test.cjs'
  ),
  'boundary test must be registered in test:unit'
);

process.env.SUPABASE_URL =
  'https://example.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key';

process.env.SESSION_SECRET =
  'teacher-goal-progress-test-secret';

const endpointPath =
  path.join(
    root,
    'netlify/functions/teacher-goal-progress.js'
  );

delete require.cache[
  require.resolve(endpointPath)
];

const {
  handler,
} = require(endpointPath);

const {
  sign,
} = require(
  path.join(
    root,
    'netlify/functions/_lib/auth.js'
  )
);

const teacherToken =
  sign(
    {
      role: 'teacher',
      teacherId:
        '11111111-1111-4111-8111-111111111111',
    },
    process.env.SESSION_SECRET
  );

function eventFor(body, authenticated = true) {
  const headers = {
    'content-type': 'application/json',
  };

  if (authenticated) {
    headers.cookie =
      `tc=${teacherToken}`;
  }

  return {
    httpMethod: 'POST',
    headers,
    body: JSON.stringify(body),
  };
}

function mockResponse(status, data) {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    async text() {
      return data === null ||
        data === undefined
        ? ''
        : JSON.stringify(data);
    },
  };
}

async function run() {
  let calls = [];

  global.fetch =
    async (url, init = {}) => {
      calls.push({
        url: String(url),
        init,
      });

      throw new Error(
        'Unexpected database access'
      );
    };

  const unauthorized =
    await handler(
      eventFor(
        {
          action: 'list',
        },
        false
      )
    );

  assert.strictEqual(
    unauthorized.statusCode,
    401,
    'unauthenticated request must fail closed'
  );

  assert.strictEqual(
    calls.length,
    0,
    'unauthenticated request must stop before database access'
  );

  console.log(
    '✓ unauthenticated request rejected before database access'
  );

  calls = [];

  const nullValueResponse =
    await handler(
      eventFor({
        action: 'insert',
        student_code: 'S001',
        goal_code: 'READ.1',
        date: '2026-08-01',
        value: null,
        source: 'manual',
      })
    );

  assert.strictEqual(
    nullValueResponse.statusCode,
    400,
    'null measurement must not be converted into a false zero'
  );

  assert.strictEqual(
    calls.length,
    0,
    'invalid null measurement must stop before database access'
  );

  console.log(
    '✓ null measurement rejected before database access'
  );

  calls = [];

  const progressRow = {
    id:
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    date: '2026-08-01',
    value: 80,
    source: 'manual',
    collected_by: 'teacher',
    notes: 'Prompted once',
    created_at:
      '2026-08-01T12:00:00.000Z',
    assignment_instance_id: null,
    goal_id:
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    student_id:
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    class_id:
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    school_year: 2026,
  };

  global.fetch =
    async (url, init = {}) => {
      const target = String(url);

      calls.push({
        url: target,
        init,
      });

      if (
        target.includes(
          '/rest/v1/goal_progress?'
        )
      ) {
        return mockResponse(
          200,
          [progressRow]
        );
      }

      if (
        target.includes(
          '/rest/v1/students?'
        )
      ) {
        return mockResponse(
          200,
          [{
            id: progressRow.student_id,
            code: 'S001',
            name: 'Student S001',
            class_id:
              progressRow.class_id,
          }]
        );
      }

      if (
        target.includes(
          '/rest/v1/goals?'
        )
      ) {
        return mockResponse(
          200,
          [{
            id: progressRow.goal_id,
            code: 'READ.1',
            desc: 'Reading goal',
            goal_area: 'Reading',
            student_id:
              progressRow.student_id,
          }]
        );
      }

      if (
        target.includes(
          '/rest/v1/classes?'
        )
      ) {
        return mockResponse(
          200,
          [{
            id: progressRow.class_id,
            code: 'LA1',
            name: 'Language Arts 1 SC',
          }]
        );
      }

      throw new Error(
        `Unexpected list URL: ${target}`
      );
    };

  const listResponse =
    await handler(
      eventFor({
        action: 'list',
        include_all_years: true,
      })
    );

  assert.strictEqual(
    listResponse.statusCode,
    200
  );

  const listBody =
    JSON.parse(
      listResponse.body
    );

  assert.strictEqual(
    listBody.ok,
    true
  );

  assert.strictEqual(
    listBody.progress.length,
    1
  );

  assert.strictEqual(
    listBody.progress[0].student_code,
    'S001'
  );

  assert.strictEqual(
    listBody.progress[0].goal_code,
    'READ.1'
  );

  assert.strictEqual(
    listBody.progress[0].notes,
    'Prompted once'
  );

  console.log(
    '✓ signed list returns flattened teacher progress'
  );

  calls = [];
  let insertedPayload = null;

  global.fetch =
    async (url, init = {}) => {
      const target = String(url);

      calls.push({
        url: target,
        init,
      });

      if (
        target.includes(
          '/rest/v1/students?'
        )
      ) {
        return mockResponse(
          200,
          [{
            id: progressRow.student_id,
            code: 'S001',
            name: 'Student S001',
            class_id:
              progressRow.class_id,
          }]
        );
      }

      if (
        target.includes(
          '/rest/v1/goals?'
        )
      ) {
        return mockResponse(
          200,
          [{
            id: progressRow.goal_id,
            code: 'READ.1',
            student_id:
              progressRow.student_id,
          }]
        );
      }

      if (
        target.endsWith(
          '/rest/v1/goal_progress'
        ) &&
        init.method === 'POST'
      ) {
        insertedPayload =
          JSON.parse(init.body);

        return mockResponse(
          201,
          [{
            id: progressRow.id,
            ...insertedPayload[0],
          }]
        );
      }

      throw new Error(
        `Unexpected insert URL: ${target}`
      );
    };

  const insertResponse =
    await handler(
      eventFor({
        action: 'insert',
        student_code: 's001',
        goal_code: 'read.1',
        date: '2026-08-01',
        value: 75,
        source: 'manual',
        collected_by: 'teacher',
        notes: 'Independent response',
      })
    );

  assert.strictEqual(
    insertResponse.statusCode,
    200
  );

  assert(
    Array.isArray(insertedPayload),
    'insert must send an array payload'
  );

  assert.strictEqual(
    insertedPayload[0].student_id,
    progressRow.student_id
  );

  assert.strictEqual(
    insertedPayload[0].goal_id,
    progressRow.goal_id
  );

  assert.strictEqual(
    insertedPayload[0].school_year,
    2026
  );

  assert.strictEqual(
    insertedPayload[0].notes,
    'Independent response'
  );

  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      insertedPayload[0],
      'student_code'
    ),
    false,
    'browser student code must be resolved server-side'
  );

  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      insertedPayload[0],
      'goal_code'
    ),
    false,
    'browser goal code must be resolved server-side'
  );

  console.log(
    '✓ signed insert derives canonical IDs and school year server-side'
  );

  insertedPayload = null;

  const nonPercentResponse =
    await handler(
      eventFor({
        action: 'insert',
        student_code: 'S001',
        goal_code: 'READ.1',
        date: '2026-08-01',
        value: 145,
        source: 'spedtrack_import',
        collected_by: 'teacher',
      })
    );

  assert.strictEqual(
    nonPercentResponse.statusCode,
    200,
    'finite non-percent measurements must remain valid'
  );

  assert.strictEqual(
    insertedPayload[0].value,
    145,
    'frequency, duration, and rate values must not be capped at 100'
  );

  assert.strictEqual(
    insertedPayload[0].source,
    'spedtrack_import',
    'existing source provenance must remain unchanged'
  );

  console.log(
    '✓ non-percent measurements and source provenance are preserved'
  );

  calls = [];

  const assignmentInstanceId =
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  let batchPayload = null;

  global.fetch =
    async (url, init = {}) => {
      const target = String(url);

      calls.push({
        url: target,
        init,
      });

      if (
        target.includes(
          '/rest/v1/assignment_instances?'
        )
      ) {
        return mockResponse(
          200,
          [{
            id: assignmentInstanceId,
            student_id:
              progressRow.student_id,
          }]
        );
      }

      if (
        target.includes(
          '/rest/v1/goals?'
        )
      ) {
        return mockResponse(
          200,
          [{
            id: progressRow.goal_id,
            code: 'READ.1',
            student_id:
              progressRow.student_id,
          }]
        );
      }

      if (
        target.endsWith(
          '/rest/v1/goal_progress'
        ) &&
        init.method === 'POST'
      ) {
        batchPayload =
          JSON.parse(init.body);

        return mockResponse(
          201,
          batchPayload.map(
            (row, index) => ({
              id:
                index === 0
                  ? progressRow.id
                  : undefined,
              ...row,
            })
          )
        );
      }

      throw new Error(
        `Unexpected batch URL: ${target}`
      );
    };

  const batchResponse =
    await handler(
      eventFor({
        action: 'insert_batch',
        student_id:
          progressRow.student_id,
        assignment_instance_id:
          assignmentInstanceId,
        goal_rollups: [{
          goal_code: 'READ.1',
          percent_correct: 88,
        }],
      })
    );

  assert.strictEqual(
    batchResponse.statusCode,
    200
  );

  const batchBody =
    JSON.parse(
      batchResponse.body
    );

  assert.strictEqual(
    batchBody.inserted_count,
    1
  );

  assert(
    Array.isArray(batchPayload),
    'batch action must insert an array payload'
  );

  assert.strictEqual(
    batchPayload[0].student_id,
    progressRow.student_id
  );

  assert.strictEqual(
    batchPayload[0].goal_id,
    progressRow.goal_id
  );

  assert.strictEqual(
    batchPayload[0].assignment_instance_id,
    assignmentInstanceId
  );

  assert.strictEqual(
    batchPayload[0].source,
    'assignment'
  );

  assert.strictEqual(
    batchPayload[0].collected_by,
    'system'
  );

  assert.strictEqual(
    batchPayload[0].value,
    88
  );

  console.log(
    '✓ assignment rollup batch retains canonical provenance'
  );

  calls = [];

  global.fetch =
    async (url, init = {}) => {
      const target = String(url);

      calls.push({
        url: target,
        init,
      });

      if (
        target.includes(
          '/rest/v1/goal_progress_quarter_avg?'
        )
      ) {
        return mockResponse(
          200,
          [{
            student_id:
              progressRow.student_id,
            goal_id:
              progressRow.goal_id,
            school_year: 2026,
            quarter: 'Q1',
            avg_value: 77.5,
          }]
        );
      }

      throw new Error(
        `Unexpected quarter URL: ${target}`
      );
    };

  const quarterResponse =
    await handler(
      eventFor({
        action: 'quarter_averages',
        year: 2026,
      })
    );

  assert.strictEqual(
    quarterResponse.statusCode,
    200
  );

  const quarterBody =
    JSON.parse(
      quarterResponse.body
    );

  assert.strictEqual(
    quarterBody.averages.length,
    1
  );

  assert.strictEqual(
    quarterBody.averages[0].avg_value,
    77.5
  );

  console.log(
    '✓ quarterly aggregate is served through signed boundary'
  );

  console.log(
    'TEACHER GOAL-PROGRESS SERVER BOUNDARY: PASS'
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
