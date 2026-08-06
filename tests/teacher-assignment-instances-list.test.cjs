'use strict';

const assert =
  require('assert');

const path =
  require('path');

process.env.SESSION_SECRET =
  'rc-sec-01i-t2-test-secret';

const endpointPath =
  path.resolve(
    __dirname,
    '../netlify/functions/teacher-assignment-instances-list.js'
  );

const authPath =
  require.resolve(
    '../netlify/functions/_lib/auth'
  );

const supaPath =
  require.resolve(
    '../netlify/functions/_lib/supa'
  );

const schoolYearPath =
  require.resolve(
    '../netlify/functions/_lib/school-year'
  );

const teacherId =
  '11111111-1111-4111-8111-111111111111';

const classA =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const classB =
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const classOutside =
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const studentA =
  '22222222-2222-4222-8222-222222222222';

const studentB =
  '33333333-3333-4333-8333-333333333333';

const studentC =
  '44444444-4444-4444-8444-444444444444';

const instanceA =
  '55555555-5555-4555-8555-555555555555';

const instanceWrongClass =
  '66666666-6666-4666-8666-666666666666';

const instanceNonInstructional =
  '77777777-7777-4777-8777-777777777777';

const instanceOutside =
  '88888888-8888-4888-8888-888888888888';

let authResult;
let restCalls;
let fixtures;

function response(status, body) {
  return {
    ok:
      status >= 200 &&
      status < 300,

    status,

    async json() {
      return body;
    },

    async text() {
      return JSON.stringify(body);
    },
  };
}

function freshFixtures() {
  return {
    classes: [
      { id: classA },
      { id: classB },
    ],

    assignments: [
      {
        id: 101,
        class_id: classA,
      },
      {
        id: 102,
        class_id: classB,
      },

      // Defense-in-depth fixture: query mocks return it even though
      // the class is not teacher-owned.
      {
        id: 999,
        class_id: classOutside,
      },
    ],

    enrollments: [
      {
        class_id: classA,
        student_id: studentA,
        active: true,
      },
      {
        class_id: classB,
        student_id: studentB,
        active: true,
      },
      {
        class_id: classA,
        student_id: studentC,
        active: true,
      },
    ],

    instances: [
      {
        id: instanceA,
        assignment_id: 101,
        student_id: studentA,
        assigned_at:
          '2026-09-01T13:00:00.000Z',
        due_at:
          '2026-09-05T13:00:00.000Z',
        status: 'Assigned',
        settings: {
          retry_config: {
            max_attempts: 2,
          },
        },
        school_year: 2026,
        students: {
          code: 'S001',
          name: 'Synthetic One',
          active: true,
        },
      },

      // Assignment belongs to class B, but student A is enrolled only
      // in class A. Must never authorize.
      {
        id: instanceWrongClass,
        assignment_id: 102,
        student_id: studentA,
        assigned_at:
          '2026-09-01T13:10:00.000Z',
        due_at: null,
        status: 'Assigned',
        settings: {},
        school_year: 2026,
        students: {
          code: 'S001',
          name: 'Synthetic One',
          active: true,
        },
      },

      // Correct same-class enrollment but explicitly test-only evidence.
      {
        id: instanceNonInstructional,
        assignment_id: 102,
        student_id: studentB,
        assigned_at:
          '2026-09-01T13:20:00.000Z',
        due_at: null,
        status: 'Submitted',
        settings: {
          non_instructional: true,
        },
        school_year: 2026,
        students: {
          code: 'S002',
          name: 'Synthetic Two',
          active: true,
        },
      },

      // Assignment from an outside class. Must remain excluded even if
      // the mocked REST response contains it.
      {
        id: instanceOutside,
        assignment_id: 999,
        student_id: studentC,
        assigned_at:
          '2026-09-01T13:30:00.000Z',
        due_at: null,
        status: 'Assigned',
        settings: {},
        school_year: 2026,
        students: {
          code: 'S003',
          name: 'Synthetic Three',
          active: true,
        },
      },
    ],
  };
}

function installMocks() {
  authResult = {
    ok: true,
    user: {
      role: 'teacher',
      username: 'teacher_test',
      teacherId,
    },
  };

  fixtures =
    freshFixtures();

  restCalls = [];

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      requireTeacher() {
        return authResult;
      },
    },
  };

  require.cache[supaPath] = {
    id: supaPath,
    filename: supaPath,
    loaded: true,
    exports: {
      SUPABASE_URL:
        'https://example.supabase.co',

      SUPABASE_SERVICE_ROLE_KEY:
        'service-role-test-key',

      async rest(url, init) {
        restCalls.push({
          url,
          init,
        });

        if (
          url.startsWith(
            '/rest/v1/classes?'
          )
        ) {
          return response(
            200,
            fixtures.classes
          );
        }

        if (
          url.startsWith(
            '/rest/v1/assignments?'
          )
        ) {
          return response(
            200,
            fixtures.assignments
          );
        }

        if (
          url.startsWith(
            '/rest/v1/class_enrollments?'
          )
        ) {
          return response(
            200,
            fixtures.enrollments
          );
        }

        if (
          url.startsWith(
            '/rest/v1/assignment_instances?'
          )
        ) {
          return response(
            200,
            fixtures.instances
          );
        }

        throw new Error(
          `Unexpected REST call: ${url}`
        );
      },
    },
  };

  require.cache[schoolYearPath] = {
    id: schoolYearPath,
    filename: schoolYearPath,
    loaded: true,
    exports: {
      getCurrentSchoolYear() {
        return 2026;
      },
    },
  };

  delete require.cache[
    require.resolve(endpointPath)
  ];
}

function loadHandler() {
  return require(endpointPath)
    .handler;
}

function event() {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {},
  };
}

function body(result) {
  return JSON.parse(
    result.body
  );
}

async function run() {
  // 1. Unauthenticated requests fail before any DB read.
  installMocks();

  authResult = {
    ok: false,
  };

  let result =
    await loadHandler()(
      event()
    );

  assert.strictEqual(
    result.statusCode,
    401
  );

  assert.strictEqual(
    restCalls.length,
    0
  );

  console.log(
    '✓ unauthenticated request fails closed'
  );

  // 2. A teacher session without canonical teacherId also fails closed.
  installMocks();

  authResult.user.teacherId =
    undefined;

  result =
    await loadHandler()(
      event()
    );

  assert.strictEqual(
    result.statusCode,
    403
  );

  assert.strictEqual(
    restCalls.length,
    0
  );

  console.log(
    '✓ missing signed teacherId fails closed'
  );

  // 3. Exact teacher/class/assignment/same-class enrollment chain.
  installMocks();

  result =
    await loadHandler()(
      event()
    );

  assert.strictEqual(
    result.statusCode,
    200
  );

  let payload =
    body(result);

  assert.strictEqual(
    payload.ok,
    true
  );

  assert.deepStrictEqual(
    payload.instances.map(
      (row) => row.id
    ),
    [instanceA]
  );

  assert.deepStrictEqual(
    payload.instances[0],
    {
      id: instanceA,
      assignment_id: 101,
      student_id: studentA,
      student_code: 'S001',
      student_name: 'Synthetic One',
      assigned_at:
        '2026-09-01T13:00:00.000Z',
      due_at:
        '2026-09-05T13:00:00.000Z',
      status: 'Assigned',
      settings: {
        retry_config: {
          max_attempts: 2,
        },
      },
      school_year: 2026,
    }
  );

  console.log(
    '✓ canonical class and same-class active enrollment enforced'
  );

  // 4. Explicit non-instructional instances never reach the response.
  installMocks();

  fixtures.instances =
    [
      fixtures.instances.find(
        (row) =>
          row.id ===
          instanceNonInstructional
      ),
    ];

  result =
    await loadHandler()(
      event()
    );

  payload =
    body(result);

  assert.deepStrictEqual(
    payload.instances,
    []
  );

  console.log(
    '✓ non-instructional instances excluded server-side'
  );

  // 5. Preserve student-code ordering and response field contract.
  installMocks();

  fixtures.instances.push({
    id:
      '99999999-9999-4999-8999-999999999999',
    assignment_id: 101,
    student_id: studentC,
    assigned_at:
      '2026-09-01T12:00:00.000Z',
    due_at: null,
    status: 'In Progress',
    settings: {},
    school_year: null,
    students: {
      code: 'S000',
      name: 'Synthetic Zero',
      active: true,
    },
  });

  result =
    await loadHandler()(
      event()
    );

  payload =
    body(result);

  assert.deepStrictEqual(
    payload.instances.map(
      (row) => row.student_code
    ),
    ['S000', 'S001']
  );

  const zeroRow =
    payload.instances.find(
      (row) =>
        row.id ===
        '99999999-9999-4999-8999-999999999999'
    );

  assert.ok(
    zeroRow,
    'Active synthetic row must remain visible'
  );

  assert.strictEqual(
    zeroRow.student_name,
    'Synthetic Zero'
  );

  assert.strictEqual(
    zeroRow.due_at,
    null
  );

  assert.deepStrictEqual(
    zeroRow.settings,
    {}
  );

  console.log(
    '✓ shared-reader field and student-code ordering contract preserved'
  );

  // 6. Exclude inactive or archived students even when a stale
  // active enrollment remains in the class-enrollment table.
  installMocks();

  fixtures.instances = [
    {
      id:
        '99999999-9999-4999-8999-999999999999',
      assignment_id: 101,
      student_id: studentC,
      assigned_at:
        '2026-09-01T15:00:00.000Z',
      due_at: null,
      status: 'Assigned',
      settings: {},
      school_year: 2026,
      students: {
        code: 'S003',
        name: 'Synthetic Three',
        active: false,
        archived_at: null,
      },
    },
    {
      id:
        '88888888-8888-4888-8888-888888888888',
      assignment_id: 101,
      student_id: studentA,
      assigned_at:
        '2026-09-01T15:05:00.000Z',
      due_at: null,
      status: 'Assigned',
      settings: {},
      school_year: 2026,
      students: {
        code: 'S004',
        name: 'Synthetic Archived',
        active: true,
        archived_at:
          '2026-07-31T12:00:00.000Z',
      },
    },
  ];

  result =
    await loadHandler()(
      event()
    );

  payload =
    body(result);

  assert.deepStrictEqual(
    payload.instances,
    []
  );

  console.log(
    '✓ inactive and archived students excluded despite stale active enrollments'
  );

  // 7. Preserve current-school-year/NULL and 5000-row query contract.
  const instanceCall =
    restCalls.find(
      (call) =>
        call.url.startsWith(
          '/rest/v1/assignment_instances?'
        )
    );

  assert.ok(
    instanceCall,
    'assignment-instance query must run'
  );

  assert.ok(
    instanceCall.url.includes(
      'school_year.eq.2026'
    )
  );

  assert.ok(
    instanceCall.url.includes(
      'school_year.is.null'
    )
  );

  assert.ok(
    instanceCall.url.includes(
      'limit=5000'
    )
  );

  assert.ok(
    instanceCall.url.includes(
      'students!inner(code,name,active,archived_at)'
    ),
    'Assignment-instance query must load student operational state'
  );

  assert.ok(
    instanceCall.url.includes(
      'students.active=eq.true'
    ),
    'Assignment-instance query must require active students'
  );

  assert.ok(
    instanceCall.url.includes(
      'students.archived_at=is.null'
    ),
    'Assignment-instance query must exclude archived students'
  );

  console.log(
    '✓ school-year/NULL, active-student, archive, and query-limit contracts preserved'
  );

  // 8. Query failures fail closed rather than returning unscoped data.
  installMocks();

  require.cache[supaPath].exports.rest =
    async (url) => {
      restCalls.push({ url });

      if (
        url.startsWith(
          '/rest/v1/classes?'
        )
      ) {
        return response(
          500,
          {
            error: 'synthetic failure',
          }
        );
      }

      throw new Error(
        `Unexpected REST call: ${url}`
      );
    };

  delete require.cache[
    require.resolve(endpointPath)
  ];

  result =
    await loadHandler()(
      event()
    );

  assert.strictEqual(
    result.statusCode,
    500
  );

  payload =
    body(result);

  assert.strictEqual(
    payload.ok,
    false
  );

  assert.strictEqual(
    restCalls.length,
    1
  );

  console.log(
    '✓ authorization-query failure fails closed'
  );

  console.log();
  console.log(
    'RC-SEC-01I-T2 teacher-assignment-instances-list endpoint tests PASS'
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
