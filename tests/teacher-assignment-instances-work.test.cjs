'use strict';

const assert =
  require('assert');

const path =
  require('path');

process.env.SESSION_SECRET =
  'rc-sec-01i-t2w-test-secret';

const endpointPath =
  path.resolve(
    __dirname,
    '../netlify/functions/teacher-assignment-instances.js'
  );

const authPath =
  require.resolve(
    '../netlify/functions/_lib/auth'
  );

const supaPath =
  require.resolve(
    '../netlify/functions/_lib/supa'
  );

const teacherId =
  '11111111-1111-4111-8111-111111111111';

const classId =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const studentA =
  '22222222-2222-4222-8222-222222222222';

const studentB =
  '33333333-3333-4333-8333-333333333333';

const instanceA =
  '44444444-4444-4444-8444-444444444444';

const instanceB =
  '55555555-5555-4555-8555-555555555555';

let authResult;
let fixtures;
let restCalls;

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
    assignments: [
      {
        id: 168,
        class_id: classId,
      },
    ],

    classes: [
      {
        id: classId,
      },
    ],

    enrollments: [
      {
        student_id: studentA,
        active: true,
      },
    ],

    instances: [
      {
        id: instanceA,
        student_id: studentA,
        status: 'Submitted',
        assigned_at:
          '2026-09-01T13:00:00.000Z',
        students: {
          code: 'S001',
          name: 'Synthetic One',
        },
      },
      {
        id: instanceB,
        student_id: studentB,
        status: 'Assigned',
        assigned_at:
          '2026-09-01T14:00:00.000Z',
        students: {
          code: 'S002',
          name: 'Synthetic Two',
        },
      },
    ],

    fail:
      null,
  };
}

function installMocks() {
  authResult = {
    ok: true,
    user: {
      username:
        'teacher_test',
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

      async rest(url) {
        restCalls.push(url);

        if (
          fixtures.fail &&
          url.startsWith(
            fixtures.fail
          )
        ) {
          return response(
            500,
            {
              error:
                'synthetic failure',
            }
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

  delete require.cache[
    require.resolve(endpointPath)
  ];
}

function loadHandler() {
  return require(
    endpointPath
  ).handler;
}

function event(assignmentId = '168') {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {
      assignment_id:
        assignmentId,
    },
  };
}

function body(result) {
  return JSON.parse(
    result.body
  );
}

function hasCall(prefix) {
  return restCalls.some(
    (url) =>
      url.startsWith(prefix)
  );
}

async function run() {
  // 1. Unauthenticated access fails before DB reads.
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
    '✓ unauthenticated Work instance read fails closed'
  );

  // 2. Signed session without canonical teacherId fails closed.
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

  // 3. Preserve assignment_id validation.
  installMocks();

  result =
    await loadHandler()(
      event('not-a-number')
    );

  assert.strictEqual(
    result.statusCode,
    400
  );

  assert.strictEqual(
    restCalls.length,
    0
  );

  console.log(
    '✓ assignment_id validation preserved'
  );

  // 4. Canonical assignment/class ownership and same-class
  // active enrollment determine which instances are visible.
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
    payload.instances,
    [
      {
        instance_id:
          instanceA,
        student_id:
          studentA,
        student_code:
          'S001',
        student_name:
          'Synthetic One',
        status:
          'Submitted',
        assigned_at:
          '2026-09-01T13:00:00.000Z',
      },
    ]
  );

  const assignmentCall =
    restCalls.find(
      (url) =>
        url.startsWith(
          '/rest/v1/assignments?'
        )
    );

  const classCall =
    restCalls.find(
      (url) =>
        url.startsWith(
          '/rest/v1/classes?'
        )
    );

  const enrollmentCall =
    restCalls.find(
      (url) =>
        url.startsWith(
          '/rest/v1/class_enrollments?'
        )
    );

  assert.ok(
    assignmentCall.includes(
      'select=id,class_id'
    )
  );

  assert.ok(
    assignmentCall.includes(
      'id=eq.168'
    )
  );

  assert.ok(
    classCall.includes(
      `id=eq.${classId}`
    )
  );

  assert.ok(
    classCall.includes(
      `teacher_id=eq.${teacherId}`
    )
  );

  assert.ok(
    enrollmentCall.includes(
      `class_id=eq.${classId}`
    )
  );

  assert.ok(
    enrollmentCall.includes(
      'active=eq.true'
    )
  );

  console.log(
    '✓ canonical assignment/class/same-class enrollment chain enforced'
  );

  // 5. An assignment outside the signed teacher's classes is forbidden
  // before enrollment or instance data is read.
  installMocks();

  fixtures.classes = [];

  result =
    await loadHandler()(
      event()
    );

  assert.strictEqual(
    result.statusCode,
    403
  );

  assert.strictEqual(
    hasCall(
      '/rest/v1/class_enrollments?'
    ),
    false
  );

  assert.strictEqual(
    hasCall(
      '/rest/v1/assignment_instances?'
    ),
    false
  );

  console.log(
    '✓ cross-teacher assignment cannot reach instance data'
  );

  // 6. Ownership-query failure fails closed.
  installMocks();

  fixtures.fail =
    '/rest/v1/classes?';

  result =
    await loadHandler()(
      event()
    );

  assert.strictEqual(
    result.statusCode,
    500
  );

  assert.strictEqual(
    hasCall(
      '/rest/v1/assignment_instances?'
    ),
    false
  );

  console.log(
    '✓ ownership-query failure cannot proceed to instance data'
  );

  // 7. No active enrollment means an empty authorized result,
  // and there is no reason to query assignment instances.
  installMocks();

  fixtures.enrollments = [];

  result =
    await loadHandler()(
      event()
    );

  payload =
    body(result);

  assert.strictEqual(
    result.statusCode,
    200
  );

  assert.deepStrictEqual(
    payload.instances,
    []
  );

  assert.strictEqual(
    hasCall(
      '/rest/v1/assignment_instances?'
    ),
    false
  );

  console.log(
    '✓ no active same-class enrollment returns empty result'
  );

  // 8. Preserve Work modal response fallback behavior.
  installMocks();

  fixtures.instances = [
    {
      id:
        instanceA,
      student_id:
        studentA,
      status:
        null,
      assigned_at:
        null,
      students: {
        code:
          'S009',
        name:
          null,
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
    [
      {
        instance_id:
          instanceA,
        student_id:
          studentA,
        student_code:
          'S009',
        student_name:
          'S009',
        status:
          'Assigned',
        assigned_at:
          null,
      },
    ]
  );

  console.log(
    '✓ Work modal response/fallback contract preserved'
  );

  // 9. Missing assignment retains 404 behavior.
  installMocks();

  fixtures.assignments = [];

  result =
    await loadHandler()(
      event()
    );

  assert.strictEqual(
    result.statusCode,
    404
  );

  assert.strictEqual(
    hasCall(
      '/rest/v1/classes?'
    ),
    false
  );

  console.log(
    '✓ missing assignment remains 404'
  );

  console.log();
  console.log(
    'RC-SEC-01I-T2W Work endpoint tests PASS'
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
