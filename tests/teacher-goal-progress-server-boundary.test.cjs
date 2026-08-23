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


const quarterViewCreateIndex =
  migration.search(
    /CREATE OR REPLACE VIEW\s+public\.goal_progress_quarter_avg\s+AS/i
  );

const quarterViewRevokeIndex =
  migration.search(
    /REVOKE ALL PRIVILEGES[\s\S]*?ON TABLE\s+public\.goal_progress_quarter_avg/i
  );

const quarterViewGrantIndex =
  migration.search(
    /GRANT SELECT[\s\S]*?ON TABLE\s+public\.goal_progress_quarter_avg[\s\S]*?TO service_role/i
  );

assert(
  quarterViewCreateIndex >= 0,
  'migration must restore the canonical quarterly aggregate view'
);

assert(
  /when extract\(month from gp\.date\) >= 7 then extract\(year from gp\.date\)[\s\S]*?else extract\(year from gp\.date\) - 1/i.test(
    migration
  ),
  'quarterly view must preserve the historical school-year calculation'
);

for (
  const [months, quarter] of [
    ['7, 8, 9', 'Q1'],
    ['10, 11, 12', 'Q2'],
    ['1, 2, 3', 'Q3'],
    ['4, 5, 6', 'Q4'],
  ]
) {
  assert(
    new RegExp(
      `when extract\\(month from gp\\.date\\) in \\(${months}\\) then '${quarter}'`,
      'i'
    ).test(migration),
    `quarterly view must preserve the historical ${quarter} mapping`
  );
}

assert(
  /round\(avg\(gp\.value\), 1\) as avg_value/i.test(
    migration
  ),
  'quarterly view must preserve historical average calculation'
);

assert(
  /count\(\*\) as measurement_count/i.test(
    migration
  ),
  'quarterly view must preserve measurement counts'
);

assert(
  /min\(gp\.date\) as first_date[\s\S]*?max\(gp\.date\) as last_date/i.test(
    migration
  ),
  'quarterly view must preserve first and last measurement dates'
);

assert(
  /group by gp\.goal_id, gp\.student_id, 3, 4/i.test(
    migration
  ),
  'quarterly view must group by the calculated school-year and quarter outputs'
);

assert(
  !/group by gp\.goal_id, gp\.student_id, school_year, quarter/i.test(
    migration
  ),
  'quarterly view must reject ambiguous alias grouping when school_year is also a physical column'
);

assert(
  quarterViewCreateIndex < quarterViewRevokeIndex,
  'quarterly view must be created before its browser privileges are revoked'
);

assert(
  quarterViewRevokeIndex < quarterViewGrantIndex,
  'quarterly view browser revocation must precede its service-role grant'
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

const teacherId =
  '11111111-1111-4111-8111-111111111111';

const teacherToken =
  sign(
    {
      role: 'teacher',
      teacherId,
    },
    process.env.SESSION_SECRET
  );

const invalidTeacherToken =
  sign(
    {
      role: 'teacher',
      teacherId: 'not-a-uuid',
    },
    process.env.SESSION_SECRET
  );

function eventFor(
  body,
  authenticated = true,
  token = teacherToken,
) {
  const headers = {
    'content-type': 'application/json',
  };

  if (authenticated) {
    headers.cookie =
      `tc=${token}`;
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
    async json() {
      return data;
    },
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

  const assignmentInstanceId =
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  const assignmentId =
    '42';

  const foreignStudentId =
    'ffffffff-ffff-4fff-8fff-ffffffffffff';

  const foreignClassId =
    '99999999-9999-4999-8999-999999999999';

  const secondOwnedClassId =
    '88888888-8888-4888-8888-888888888888';

  const activeStudentRow = {
    id: progressRow.student_id,
    code: 'S001',
    name: 'Student S001',
    class_id: progressRow.class_id,
    active: true,
    archived_at: null,
  };

  const activeGoalRow = {
    id: progressRow.goal_id,
    code: 'READ.1',
    student_id: progressRow.student_id,
    status: 'Open',
    active: true,
  };

  const ownedClassRow = {
    id: progressRow.class_id,
    code: 'LA1',
    name: 'Language Arts 1 SC',
    teacher_id: teacherId,
  };

  function makeWriteFetch({
    studentRows = [activeStudentRow],
    goalRows = [activeGoalRow],
    enrollmentRows = [{
      class_id: progressRow.class_id,
    }],
    classRows = [ownedClassRow],
    instanceRows = [{
      id: assignmentInstanceId,
      student_id: progressRow.student_id,
      assignment_id: assignmentId,
    }],
    assignmentRows = [{
      id: assignmentId,
      class_id: progressRow.class_id,
    }],
    existingProgressRows = [],
    allowWrite = true,
    capturePayload = null,
  } = {}) {
    return async (url, init = {}) => {
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
          studentRows
        );
      }

      if (
        target.includes(
          '/rest/v1/goals?'
        )
      ) {
        return mockResponse(
          200,
          goalRows
        );
      }

      if (
        target.includes(
          '/rest/v1/class_enrollments?'
        )
      ) {
        return mockResponse(
          200,
          enrollmentRows
        );
      }

      if (
        target.includes(
          '/rest/v1/assignment_instances?'
        )
      ) {
        return mockResponse(
          200,
          instanceRows
        );
      }

      if (
        target.includes(
          '/rest/v1/assignments?'
        )
      ) {
        return mockResponse(
          200,
          assignmentRows
        );
      }

      if (
        target.includes(
          '/rest/v1/classes?'
        )
      ) {
        return mockResponse(
          200,
          classRows
        );
      }

      if (
        target.includes(
          '/rest/v1/goal_progress?'
        ) &&
        (
          !init.method ||
          init.method === 'GET'
        )
      ) {
        return mockResponse(
          200,
          existingProgressRows
        );
      }

      if (
        target.includes(
          '/rest/v1/goal_progress?'
        ) &&
        init.method === 'PATCH'
      ) {
        if (!allowWrite) {
          throw new Error(
            'Unauthorized canonical write attempted'
          );
        }

        const payload =
          JSON.parse(init.body);

        if (capturePayload) {
          capturePayload(payload);
        }

        return mockResponse(
          200,
          [{
            id:
              existingProgressRows[0]?.id ||
              progressRow.id,
            ...payload,
          }]
        );
      }

      if (
        target.endsWith(
          '/rest/v1/goal_progress'
        ) &&
        init.method === 'POST'
      ) {
        if (!allowWrite) {
          throw new Error(
            'Unauthorized canonical write attempted'
          );
        }

        const payload =
          JSON.parse(init.body);

        if (capturePayload) {
          capturePayload(payload);
        }

        const rows =
          Array.isArray(payload)
            ? payload
            : [payload];

        return mockResponse(
          201,
          rows.map(
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
        `Unexpected write URL: ${target}`
      );
    };
  }

  function hasCanonicalWrite() {
    return calls.some(call =>
      call.url.includes(
        '/rest/v1/goal_progress'
      ) &&
      (
        call.init.method === 'POST' ||
        call.init.method === 'PATCH'
      )
    );
  }

  const listStudentRow = {
    id: progressRow.student_id,
    code: 'S001',
    name: 'Student S001',
    class_id: progressRow.class_id,
  };

  const listGoalRow = {
    id: progressRow.goal_id,
    code: 'READ.1',
    desc: 'Reading goal',
    goal_area: 'Reading',
    student_id: progressRow.student_id,
  };

  const listClassRow = {
    id: progressRow.class_id,
    code: 'LA1',
    name: 'Language Arts 1 SC',
  };

  function makeListFetch({
    progressRows = [progressRow],
    studentRows = [listStudentRow],
    goalRows = [listGoalRow],
    classRows = [listClassRow],
    ownedClassRows = [ownedClassRow],
    instanceRows = [{
      id: assignmentInstanceId,
      student_id: progressRow.student_id,
      assignment_id: assignmentId,
    }],
    assignmentRows = [{
      id: assignmentId,
      class_id: progressRow.class_id,
    }],
  } = {}) {
    return async (url, init = {}) => {
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
          progressRows
        );
      }

      if (
        target.includes(
          '/rest/v1/students?'
        )
      ) {
        return mockResponse(
          200,
          studentRows
        );
      }

      if (
        target.includes(
          '/rest/v1/goals?'
        )
      ) {
        return mockResponse(
          200,
          goalRows
        );
      }

      if (
        target.includes(
          '/rest/v1/assignment_instances?'
        )
      ) {
        return mockResponse(
          200,
          instanceRows
        );
      }

      if (
        target.includes(
          '/rest/v1/assignments?'
        )
      ) {
        return mockResponse(
          200,
          assignmentRows
        );
      }

      if (
        target.includes(
          '/rest/v1/classes?'
        )
      ) {
        return mockResponse(
          200,
          target.includes(
            'teacher_id=eq.'
          )
            ? ownedClassRows
            : classRows
        );
      }

      throw new Error(
        `Unexpected list URL: ${target}`
      );
    };
  }

  global.fetch =
    makeListFetch();

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

  const initialProgressRead =
    calls.find(call =>
      call.url.includes(
        '/rest/v1/goal_progress?'
      )
    );

  assert.ok(
    initialProgressRead,
    'signed list must issue a canonical progress read'
  );

  const initialProgressUrl =
    decodeURIComponent(
      initialProgressRead.url
    );

  assert.ok(
    initialProgressUrl.includes(
      `or=(class_id.in.("${progressRow.class_id}"),class_id.is.null)`
    ),
    'all-years canonical query must scope candidates to owned classes plus legacy NULL-class rows'
  );

  assert.ok(
    initialProgressUrl.includes(
      'limit=10000'
    ),
    'canonical query must reserve candidate space before caller limit enforcement'
  );

  console.log(
    '✓ signed list returns flattened teacher progress'
  );

  console.log(
    '✓ all-years canonical query is ownership-scoped before result limiting'
  );

  calls = [];

  global.fetch =
    makeListFetch({
      progressRows: [
        progressRow,
        {
          ...progressRow,
          id:
            '77777777-7777-4777-8777-777777777777',
          date: '2026-08-02',
        },
      ],
    });

  const limitedCurrentYearResponse =
    await handler(
      eventFor({
        action: 'list',
        school_year: 2026,
        limit: 1,
      })
    );

  assert.strictEqual(
    limitedCurrentYearResponse.statusCode,
    200
  );

  const limitedCurrentYearBody =
    JSON.parse(
      limitedCurrentYearResponse.body
    );

  assert.strictEqual(
    limitedCurrentYearBody.progress.length,
    1,
    'caller-requested limit must be enforced after authorization'
  );

  const limitedProgressRead =
    calls.find(call =>
      call.url.includes(
        '/rest/v1/goal_progress?'
      )
    );

  assert.ok(
    limitedProgressRead,
    'current-year list must issue a canonical progress read'
  );

  const limitedProgressUrl =
    decodeURIComponent(
      limitedProgressRead.url
    );

  assert.ok(
    limitedProgressUrl.includes(
      `and=(or(school_year.eq.2026,school_year.is.null),or(class_id.in.("${progressRow.class_id}"),class_id.is.null))`
    ),
    'current-year canonical query must combine school-year and ownership boundaries'
  );

  assert.ok(
    limitedProgressUrl.includes(
      'limit=10000'
    ),
    'small caller limits must not truncate candidate rows before authorization'
  );

  console.log(
    '✓ current-year ownership scope precedes caller-requested result limit'
  );

  calls = [];

  global.fetch =
    async (url, init = {}) => {
      calls.push({
        url: String(url),
        init,
      });

      throw new Error(
        'Invalid teacher identity reached database'
      );
    };

  const invalidTeacherList =
    await handler(
      eventFor(
        {
          action: 'list',
        },
        true,
        invalidTeacherToken,
      )
    );

  assert.strictEqual(
    invalidTeacherList.statusCode,
    403,
    'signed list without a valid teacherId must fail closed'
  );

  assert.strictEqual(
    calls.length,
    0,
    'invalid signed teacherId must stop before database access'
  );

  console.log(
    '✓ list requires a valid signed teacher identity'
  );

  calls = [];

  const historicalProgressRow = {
    ...progressRow,
    date: '2025-09-15',
    school_year: 2025,
  };

  global.fetch =
    makeListFetch({
      progressRows: [
        historicalProgressRow,
      ],
      studentRows: [{
        ...listStudentRow,
        active: false,
        archived_at:
          '2026-06-01T00:00:00.000Z',
      }],
      goalRows: [{
        ...listGoalRow,
        active: false,
        status: 'archived',
      }],
    });

  const historicalResponse =
    await handler(
      eventFor({
        action: 'list',
        student_codes: ['S001'],
        include_all_years: true,
        sort_desc: true,
      })
    );

  assert.strictEqual(
    historicalResponse.statusCode,
    200
  );

  const historicalBody =
    JSON.parse(
      historicalResponse.body
    );

  assert.strictEqual(
    historicalBody.progress.length,
    1,
    'owned historical evidence must remain readable after student/goal archival'
  );

  assert.strictEqual(
    historicalBody.progress[0].school_year,
    2025,
    'include_all_years must preserve owned historical evidence'
  );

  console.log(
    '✓ archived student/goal history remains readable through owned class provenance'
  );

  calls = [];

  const foreignProgressRow = {
    ...progressRow,
    class_id: foreignClassId,
  };

  global.fetch =
    makeListFetch({
      progressRows: [
        foreignProgressRow,
      ],
      classRows: [{
        id: foreignClassId,
        code: 'FOREIGN',
        name: 'Foreign Language Arts',
      }],
    });

  const foreignClassList =
    await handler(
      eventFor({
        action: 'list',
        class_codes: [
          'Foreign Language Arts',
        ],
        include_all_years: true,
      })
    );

  assert.strictEqual(
    foreignClassList.statusCode,
    200
  );

  assert.strictEqual(
    JSON.parse(
      foreignClassList.body
    ).progress.length,
    0,
    'foreign class evidence must be indistinguishable from no authorized result'
  );

  console.log(
    '✓ foreign class filter cannot disclose foreign canonical evidence'
  );

  calls = [];

  const legacyAssignmentRow = {
    ...progressRow,
    class_id: null,
    assignment_instance_id:
      assignmentInstanceId,
  };

  global.fetch =
    makeListFetch({
      progressRows: [
        legacyAssignmentRow,
      ],
      classRows: [],
    });

  const legacyOwnedResponse =
    await handler(
      eventFor({
        action: 'list',
        include_all_years: true,
      })
    );

  assert.strictEqual(
    legacyOwnedResponse.statusCode,
    200
  );

  const legacyOwnedBody =
    JSON.parse(
      legacyOwnedResponse.body
    );

  assert.strictEqual(
    legacyOwnedBody.progress.length,
    1,
    'NULL class historical evidence may be recovered from owned assignment provenance'
  );

  assert.strictEqual(
    legacyOwnedBody.progress[0].class_id,
    null,
    'read authorization must not rewrite historical canonical class provenance'
  );

  const assignmentLookup =
    calls.find(call =>
      call.url.includes(
        '/rest/v1/assignments?'
      )
    );

  assert.ok(
    assignmentLookup,
    'legacy provenance must resolve the canonical assignment'
  );

  assert.ok(
    decodeURIComponent(
      assignmentLookup.url
    ).includes(
      `id=in.(${assignmentId})`
    ),
    'bigint assignment lookup must use numeric in.(...) batching'
  );

  console.log(
    '✓ NULL-class history is recovered only through owned assignment provenance'
  );

  console.log(
    '✓ historical bigint assignment lookup uses numeric batching'
  );

  calls = [];

  global.fetch =
    makeListFetch({
      progressRows: [
        legacyAssignmentRow,
      ],
      classRows: [],
      assignmentRows: [{
        id: assignmentId,
        class_id: foreignClassId,
      }],
    });

  const foreignLegacyResponse =
    await handler(
      eventFor({
        action: 'list',
        include_all_years: true,
      })
    );

  assert.strictEqual(
    foreignLegacyResponse.statusCode,
    200
  );

  assert.strictEqual(
    JSON.parse(
      foreignLegacyResponse.body
    ).progress.length,
    0,
    'legacy assignment provenance through a foreign class must fail closed'
  );

  console.log(
    '✓ NULL-class history cannot be rescued through a foreign assignment class'
  );

  calls = [];

  global.fetch =
    makeListFetch({
      progressRows: [
        legacyAssignmentRow,
      ],
      classRows: [],
      instanceRows: [{
        id: assignmentInstanceId,
        student_id: foreignStudentId,
        assignment_id: assignmentId,
      }],
    });

  const mismatchedLegacyResponse =
    await handler(
      eventFor({
        action: 'list',
        include_all_years: true,
      })
    );

  assert.strictEqual(
    mismatchedLegacyResponse.statusCode,
    200
  );

  assert.strictEqual(
    JSON.parse(
      mismatchedLegacyResponse.body
    ).progress.length,
    0,
    'legacy assignment provenance must belong to the progress student'
  );

  console.log(
    '✓ NULL-class assignment provenance requires matching student ownership'
  );

  calls = [];

  const unprovableLegacyRow = {
    ...progressRow,
    class_id: null,
    assignment_instance_id: null,
  };

  global.fetch =
    makeListFetch({
      progressRows: [
        unprovableLegacyRow,
      ],
      classRows: [],
    });

  const unprovableLegacyResponse =
    await handler(
      eventFor({
        action: 'list',
        include_all_years: true,
      })
    );

  assert.strictEqual(
    unprovableLegacyResponse.statusCode,
    200
  );

  assert.strictEqual(
    JSON.parse(
      unprovableLegacyResponse.body
    ).progress.length,
    0,
    'historical rows without class or assignment provenance must fail closed'
  );

  console.log(
    '✓ unverifiable historical evidence is excluded rather than guessed'
  );

  calls = [];
  let insertedPayload = null;

  global.fetch =
    makeWriteFetch({
      capturePayload(payload) {
        insertedPayload = payload;
      },
    });

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
    insertedPayload[0].class_id,
    progressRow.class_id,
    'manual evidence must use an actively enrolled teacher-owned class'
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

  global.fetch =
    makeWriteFetch({
      studentRows: [],
      allowWrite: false,
    });

  const inactiveStudentResponse =
    await handler(
      eventFor({
        action: 'insert',
        student_code: 'S001',
        goal_code: 'READ.1',
        date: '2026-08-01',
        value: 70,
      })
    );

  assert.strictEqual(
    inactiveStudentResponse.statusCode,
    404,
    'inactive or archived student must fail closed'
  );

  assert.strictEqual(
    hasCanonicalWrite(),
    false,
    'inactive or archived student must never reach canonical write'
  );

  assert(
    calls.some(call =>
      call.url.includes('/rest/v1/students?') &&
      call.url.includes('active=eq.true') &&
      call.url.includes('archived_at=is.null')
    ),
    'student write lookup must require active non-archived status'
  );

  console.log(
    '✓ inactive or archived student cannot receive manual evidence'
  );

  calls = [];

  global.fetch =
    makeWriteFetch({
      goalRows: [],
      allowWrite: false,
    });

  const inactiveGoalResponse =
    await handler(
      eventFor({
        action: 'insert',
        student_code: 'S001',
        goal_code: 'READ.1',
        date: '2026-08-01',
        value: 70,
      })
    );

  assert.strictEqual(
    inactiveGoalResponse.statusCode,
    404,
    'inactive or unavailable goal must fail closed'
  );

  assert.strictEqual(
    hasCanonicalWrite(),
    false,
    'inactive goal must never reach canonical write'
  );

  assert(
    calls.some(call =>
      call.url.includes('/rest/v1/goals?') &&
      call.url.includes('active=eq.true')
    ),
    'goal write lookup must require active goals'
  );

  console.log(
    '✓ inactive or foreign goal cannot receive manual evidence'
  );

  calls = [];

  global.fetch =
    makeWriteFetch({
      enrollmentRows: [],
      allowWrite: false,
    });

  const noEnrollmentResponse =
    await handler(
      eventFor({
        action: 'insert',
        student_code: 'S001',
        goal_code: 'READ.1',
        date: '2026-08-01',
        value: 70,
      })
    );

  assert.strictEqual(
    noEnrollmentResponse.statusCode,
    403,
    'manual evidence must require active teacher-owned enrollment'
  );

  assert.strictEqual(
    hasCanonicalWrite(),
    false
  );

  console.log(
    '✓ manual evidence requires active teacher-owned enrollment'
  );

  calls = [];

  global.fetch =
    makeWriteFetch({
      allowWrite: false,
    });

  const foreignClassResponse =
    await handler(
      eventFor({
        action: 'insert',
        student_code: 'S001',
        goal_code: 'READ.1',
        class_code: 'FOREIGN-CLASS',
        date: '2026-08-01',
        value: 70,
      })
    );

  assert.strictEqual(
    foreignClassResponse.statusCode,
    403,
    'foreign requested class must fail closed'
  );

  assert.strictEqual(
    hasCanonicalWrite(),
    false
  );

  console.log(
    '✓ foreign requested class cannot receive manual evidence'
  );

  calls = [];
  insertedPayload = null;

  global.fetch =
    makeWriteFetch({
      studentRows: [{
        ...activeStudentRow,
        class_id: foreignClassId,
      }],
      capturePayload(payload) {
        insertedPayload = payload;
      },
    });

  const soleClassFallbackResponse =
    await handler(
      eventFor({
        action: 'insert',
        student_code: 'S001',
        goal_code: 'READ.1',
        date: '2026-08-01',
        value: 71,
      })
    );

  assert.strictEqual(
    soleClassFallbackResponse.statusCode,
    200,
    'exactly one authorized class may serve as the sole fallback'
  );

  assert.strictEqual(
    insertedPayload[0].class_id,
    progressRow.class_id,
    'sole authorized class must become canonical class_id'
  );

  console.log(
    '✓ sole authorized class remains a deterministic fallback'
  );

  calls = [];

  global.fetch =
    makeWriteFetch({
      studentRows: [{
        ...activeStudentRow,
        class_id: foreignClassId,
      }],
      enrollmentRows: [
        {
          class_id: progressRow.class_id,
        },
        {
          class_id: secondOwnedClassId,
        },
      ],
      classRows: [
        ownedClassRow,
        {
          id: secondOwnedClassId,
          code: 'LA2',
          name: 'Language Arts 2 SC',
          teacher_id: teacherId,
        },
      ],
      allowWrite: false,
    });

  const ambiguousClassResponse =
    await handler(
      eventFor({
        action: 'insert',
        student_code: 'S001',
        goal_code: 'READ.1',
        date: '2026-08-01',
        value: 72,
      })
    );

  assert.strictEqual(
    ambiguousClassResponse.statusCode,
    403,
    'multiple authorized classes without an explicit/default match must fail closed'
  );

  assert.strictEqual(
    hasCanonicalWrite(),
    false,
    'ambiguous class context must never reach canonical write'
  );

  console.log(
    '✓ ambiguous multi-class context fails closed without guessing'
  );

  calls = [];

  global.fetch =
    makeWriteFetch({
      instanceRows: [{
        id: assignmentInstanceId,
        student_id: foreignStudentId,
        assignment_id: assignmentId,
      }],
      allowWrite: false,
    });

  const mismatchedInstanceResponse =
    await handler(
      eventFor({
        action: 'insert_batch',
        student_id:
          progressRow.student_id,
        assignment_instance_id:
          assignmentInstanceId,
        goal_rollups: [{
          goal_code: 'READ.1',
          percent_correct: 80,
        }],
      })
    );

  assert.strictEqual(
    mismatchedInstanceResponse.statusCode,
    403,
    'instance/student mismatch must fail closed'
  );

  assert.strictEqual(
    hasCanonicalWrite(),
    false
  );

  console.log(
    '✓ assignment instance/student mismatch cannot write evidence'
  );

  calls = [];

  global.fetch =
    makeWriteFetch({
      assignmentRows: [{
        id: assignmentId,
        class_id: foreignClassId,
      }],
      classRows: [],
      allowWrite: false,
    });

  const foreignAssignmentResponse =
    await handler(
      eventFor({
        action: 'insert_batch',
        student_id:
          progressRow.student_id,
        assignment_instance_id:
          assignmentInstanceId,
        goal_rollups: [{
          goal_code: 'READ.1',
          percent_correct: 80,
        }],
      })
    );

  assert.strictEqual(
    foreignAssignmentResponse.statusCode,
    403,
    'assignment class outside signed teacher ownership must fail closed'
  );

  assert.strictEqual(
    hasCanonicalWrite(),
    false
  );

  console.log(
    '✓ assignment evidence must traverse a teacher-owned assignment class'
  );

  calls = [];

  global.fetch =
    makeWriteFetch({
      enrollmentRows: [],
      allowWrite: false,
    });

  const batchNoEnrollmentResponse =
    await handler(
      eventFor({
        action: 'insert_batch',
        student_id:
          progressRow.student_id,
        assignment_instance_id:
          assignmentInstanceId,
        goal_rollups: [{
          goal_code: 'READ.1',
          percent_correct: 80,
        }],
      })
    );

  assert.strictEqual(
    batchNoEnrollmentResponse.statusCode,
    403,
    'assignment evidence must require active enrollment in assignment class'
  );

  assert.strictEqual(
    hasCanonicalWrite(),
    false
  );

  console.log(
    '✓ assignment evidence requires active enrolled teacher-owned class'
  );

  calls = [];

  global.fetch =
    makeWriteFetch({
      goalRows: [],
      allowWrite: false,
    });

  const batchInactiveGoalResponse =
    await handler(
      eventFor({
        action: 'insert_batch',
        student_id:
          progressRow.student_id,
        assignment_instance_id:
          assignmentInstanceId,
        goal_rollups: [{
          goal_code: 'READ.1',
          percent_correct: 80,
        }],
      })
    );

  assert.strictEqual(
    batchInactiveGoalResponse.statusCode,
    200,
    'unavailable assignment goal may be safely skipped'
  );

  const batchInactiveGoalBody =
    JSON.parse(
      batchInactiveGoalResponse.body
    );

  assert.strictEqual(
    batchInactiveGoalBody.inserted_count,
    0
  );

  assert.strictEqual(
    hasCanonicalWrite(),
    false,
    'inactive or foreign assignment goal must never be written'
  );

  console.log(
    '✓ inactive or foreign assignment goal is safely skipped without write'
  );

  calls = [];

  let batchPayload = null;

  global.fetch =
    makeWriteFetch({
      capturePayload(payload) {
        batchPayload = payload;
      },
    });

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
    batchPayload &&
    !Array.isArray(batchPayload),
    'batch action must reconcile one canonical parent checkpoint payload'
  );

  assert.strictEqual(
    batchPayload.student_id,
    progressRow.student_id
  );

  assert.strictEqual(
    batchPayload.goal_id,
    progressRow.goal_id
  );

  assert.strictEqual(
    batchPayload.assignment_instance_id,
    assignmentInstanceId
  );

  assert.strictEqual(
    batchPayload.source,
    'assignment'
  );

  assert.strictEqual(
    batchPayload.collected_by,
    'system'
  );

  assert.strictEqual(
    batchPayload.value,
    88
  );

  assert.strictEqual(
    batchPayload.class_id,
    progressRow.class_id,
    'assignment evidence must derive canonical teacher-owned class'
  );

  assert.strictEqual(
    batchPayload.school_year,
    2026,
    'assignment evidence must preserve canonical school year'
  );

  const batchIdentityLookup =
    calls.find(call =>
      call.url.includes(
        '/rest/v1/goal_progress?'
      ) &&
      (
        !call.init.method ||
        call.init.method === 'GET'
      )
    );

  assert.ok(
    batchIdentityLookup,
    'assignment batch must check the stable parent checkpoint identity before writing'
  );

  assert.ok(
    decodeURIComponent(
      batchIdentityLookup.url
    ).includes(
      `assignment_instance_id=eq.${assignmentInstanceId}`
    ),
    'checkpoint identity lookup must include assignment instance'
  );

  assert.ok(
    decodeURIComponent(
      batchIdentityLookup.url
    ).includes(
      `goal_id=eq.${progressRow.goal_id}`
    ),
    'checkpoint identity lookup must include parent goal'
  );

  assert.ok(
    calls.some(call =>
      call.url.endsWith(
        '/rest/v1/goal_progress'
      ) &&
      call.init.method === 'POST'
    ),
    'missing checkpoint identity must insert one canonical row'
  );

  console.log(
    '✓ assignment rollup batch retains canonical provenance'
  );


  calls = [];

  let reconciledBatchPayload = null;

  global.fetch =
    makeWriteFetch({
      existingProgressRows: [{
        id: progressRow.id,
        created_at:
          '2026-08-23T12:00:00.000Z',
      }],
      capturePayload(payload) {
        reconciledBatchPayload = payload;
      },
    });

  const reconciledBatchResponse =
    await handler(
      eventFor({
        action: 'insert_batch',
        student_id:
          progressRow.student_id,
        assignment_instance_id:
          assignmentInstanceId,
        goal_rollups: [{
          goal_code: 'READ.1',
          percent_correct: 91,
        }],
      })
    );

  assert.strictEqual(
    reconciledBatchResponse.statusCode,
    200
  );

  assert(
    reconciledBatchPayload &&
    !Array.isArray(
      reconciledBatchPayload
    ),
    'existing assignment checkpoint must reconcile one row payload'
  );

  assert.strictEqual(
    reconciledBatchPayload.value,
    91
  );

  const existingIdentityLookup =
    calls.find(call =>
      call.url.includes(
        '/rest/v1/goal_progress?'
      ) &&
      (
        !call.init.method ||
        call.init.method === 'GET'
      )
    );

  assert.ok(
    existingIdentityLookup,
    'rescore must look up the existing parent checkpoint identity'
  );

  assert.ok(
    calls.some(call =>
      call.url.includes(
        '/rest/v1/goal_progress?'
      ) &&
      call.init.method === 'PATCH'
    ),
    'rescore must PATCH the existing checkpoint identity'
  );

  assert.strictEqual(
    calls.some(call =>
      call.url.endsWith(
        '/rest/v1/goal_progress'
      ) &&
      call.init.method === 'POST'
    ),
    false,
    'rescore must not append a second parent checkpoint'
  );

  console.log(
    '✓ assignment rescore reconciles existing checkpoint without append'
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
