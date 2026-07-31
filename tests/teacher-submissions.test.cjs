'use strict';

const assert =
  require('assert');

const path =
  require('path');

process.env.SESSION_SECRET =
  'rc-sec-01i-t1-test-secret';

const endpointPath =
  path.resolve(
    __dirname,
    '../netlify/functions/teacher-submissions.js'
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

const studentA =
  '22222222-2222-4222-8222-222222222222';

const studentB =
  '33333333-3333-4333-8333-333333333333';

const instanceA =
  '44444444-4444-4444-8444-444444444444';

const instanceWrongClass =
  '55555555-5555-4555-8555-555555555555';

const instanceNonInstructional =
  '66666666-6666-4666-8666-666666666666';

const instanceManual =
  '12121212-1212-4121-8121-121212121212';

const submissionManual =
  '13131313-1313-4131-8131-131313131313';

const submissionA =
  '77777777-7777-4777-8777-777777777777';

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
    ],

    instances: [
      {
        id: instanceA,
        assignment_id: 101,
        student_id: studentA,
        settings: {},
        students: {
          code: 'S001',
          active: true,
        },
      },

      // Same student, different owned class, but no active enrollment
      // in that specific class. Must not authorize.
      {
        id: instanceWrongClass,
        assignment_id: 102,
        student_id: studentA,
        settings: {},
        students: {
          code: 'S001',
          active: true,
        },
      },

      // Correct class enrollment, but system-test evidence.
      {
        id: instanceNonInstructional,
        assignment_id: 102,
        student_id: studentB,
        settings: {
          non_instructional: true,
        },
        students: {
          code: 'S002',
          active: true,
        },
      },
    ],

    submissions: [
      {
        id: submissionA,
        instance_id: instanceA,
        answers: {
          Q1: 'A',
        },
        score_total: 100,
        submitted_at:
          '2026-09-01T14:00:00.000Z',
        review_status: 'submitted',
        school_year: 2026,
      },

      {
        id:
          '88888888-8888-4888-8888-888888888888',
        instance_id:
          instanceWrongClass,
        answers: {
          Q1: 'B',
        },
        submitted_at:
          '2026-09-01T14:01:00.000Z',
        school_year: 2026,
      },

      {
        id:
          '99999999-9999-4999-8999-999999999999',
        instance_id:
          instanceNonInstructional,
        answers: {
          Q1: 'C',
        },
        submitted_at:
          '2026-09-01T14:02:00.000Z',
        school_year: 2026,
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

        if (
          url.startsWith(
            '/rest/v1/submissions?'
          )
        ) {
          return response(
            200,
            fixtures.submissions
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

function event(query = {}) {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: query,
  };
}

function body(result) {
  return JSON.parse(
    result.body
  );
}

async function run() {
  // 1. Unauthenticated request fails before DB access.
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

  // 3. Canonical class + same-class active enrollment is required.
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
    payload.submissions.map(
      (row) => row.id
    ),
    [submissionA]
  );

  assert.strictEqual(
    payload.submissions[0]
      .assignment_instances
      .students
      .code,
    'S001'
  );

  console.log(
    '✓ teacher/class/same-class active-enrollment chain enforced'
  );

  // 4. non_instructional instances never reach returned evidence.
  installMocks();

  fixtures.enrollments.push({
    class_id: classB,
    student_id: studentB,
    active: true,
  });

  result =
    await loadHandler()(
      event({
        student_code: 'S002',
      })
    );

  payload =
    body(result);

  assert.deepStrictEqual(
    payload.submissions,
    []
  );

  assert.ok(
    !restCalls.some(
      (call) =>
        call.url.startsWith(
          '/rest/v1/submissions?'
        )
    ),
    'no submission query should run when all matching instances are non-instructional'
  );

  console.log(
    '✓ non-instructional instances excluded before submission read'
  );

  // 4B. Canonical MANUAL assignments never enter Review.
  installMocks();

  fixtures.assignments.push({
    id: 103,
    class_id: classA,
    meta: {
      manual: true,
    },
  });

  fixtures.instances.push({
    id: instanceManual,
    assignment_id: 103,
    student_id: studentA,
    settings: {},
    students: {
      code: 'S001',
      active: true,
    },
  });

  fixtures.submissions.push({
    id: submissionManual,
    instance_id: instanceManual,
    answers: {},
    score_manual: 40,
    score_total: 80,
    submitted_at:
      '2026-09-01T14:03:00.000Z',
    review_status: 'reviewed',
    school_year: 2026,
  });

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
    payload.submissions.map(
      (row) => row.id
    ),
    [submissionA],
    'MANUAL grade must not be returned to Teacher Review'
  );

  const manualSubmissionCall =
    restCalls.find(
      (call) =>
        call.url.startsWith(
          '/rest/v1/submissions?'
        )
    );

  assert.ok(
    manualSubmissionCall,
    'normal submission query should still run'
  );

  assert.ok(
    !manualSubmissionCall.url.includes(
      instanceManual
    ),
    'MANUAL instance must be excluded before submission read'
  );

  console.log(
    '✓ canonical MANUAL assignments excluded before submission read'
  );

  // 5. snake_case student filter works.
  installMocks();

  result =
    await loadHandler()(
      event({
        student_code: 's001',
      })
    );

  payload =
    body(result);

  assert.deepStrictEqual(
    payload.submissions.map(
      (row) => row.id
    ),
    [submissionA]
  );

  console.log(
    '✓ student_code filter preserved'
  );

  // 6. Existing camelCase callers remain compatible.
  installMocks();

  result =
    await loadHandler()(
      event({
        studentCode: 's001',
      })
    );

  payload =
    body(result);

  assert.deepStrictEqual(
    payload.submissions.map(
      (row) => row.id
    ),
    [submissionA]
  );

  console.log(
    '✓ studentCode compatibility preserved'
  );

  // 7. Unowned/outside student filter cannot broaden result.
  installMocks();

  result =
    await loadHandler()(
      event({
        student_code: 'S999',
      })
    );

  payload =
    body(result);

  assert.deepStrictEqual(
    payload.submissions,
    []
  );

  assert.ok(
    !restCalls.some(
      (call) =>
        call.url.startsWith(
          '/rest/v1/submissions?'
        )
    )
  );

  console.log(
    '✓ outside student filter cannot broaden authorization'
  );

  // 8. instance_id is constrained by the same authorization chain.
  installMocks();

  result =
    await loadHandler()(
      event({
        instance_id:
          instanceWrongClass,
      })
    );

  payload =
    body(result);

  assert.deepStrictEqual(
    payload.submissions,
    []
  );

  console.log(
    '✓ instance_id cannot cross same-class enrollment boundary'
  );

  // 9. excludeFinalized remains part of the server query contract.
  installMocks();

  result =
    await loadHandler()(
      event({
        exclude_finalized:
          'true',
      })
    );

  assert.strictEqual(
    result.statusCode,
    200
  );

  const submissionCall =
    restCalls.find(
      (call) =>
        call.url.startsWith(
          '/rest/v1/submissions?'
        )
    );

  assert.ok(
    submissionCall,
    'submission query must run'
  );

  assert.ok(
    submissionCall.url.includes(
      'review_status=neq.finalized'
    ),
    'exclude finalized filter must be forwarded server-side'
  );

  console.log(
    '✓ excludeFinalized contract preserved'
  );

  // 10. Existing school-year contract remains unchanged.
  assert.ok(
    submissionCall.url.includes(
      'school_year.eq.2026'
    )
  );

  assert.ok(
    submissionCall.url.includes(
      'school_year.is.null'
    )
  );

  console.log(
    '✓ existing school-year/null compatibility preserved'
  );

  console.log();
  console.log(
    'RC-SEC-01I-T1 teacher-submissions endpoint tests PASS'
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
