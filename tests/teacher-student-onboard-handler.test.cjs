'use strict';

const assert =
  require('node:assert/strict');

process.env.SUPABASE_URL =
  'https://synthetic.example';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'synthetic-service-role-key';

process.env.SESSION_SECRET =
  'synthetic-onboarding-session-secret';

const authPath =
  require.resolve(
    '../netlify/functions/_lib/auth'
  );

const realAuth =
  require(authPath);

require.cache[authPath].exports = {
  ...realAuth,

  requireTeacher() {
    return {
      ok:
        true,

      user: {
        username:
          'synthetic-teacher',
      },
    };
  },
};

delete require.cache[
  require.resolve(
    '../netlify/functions/teacher-student-onboard'
  )
];

const {
  handler,
} = require(
  '../netlify/functions/teacher-student-onboard'
);

function mockResponse(
  status,
  body = null
) {
  return {
    ok:
      status >= 200 &&
      status < 300,

    status,

    async json() {
      return body;
    },

    async text() {
      return typeof body ===
        'string'
        ? body
        : JSON.stringify(body);
    },
  };
}

function parseRequest(
  input,
  options = {}
) {
  const url =
    new URL(
      String(input)
    );

  let body = null;

  if (
    typeof options.body ===
      'string' &&
    options.body.length > 0
  ) {
    body =
      JSON.parse(
        options.body
      );
  }

  return {
    method:
      options.method ||
      'GET',

    path:
      url.pathname,

    search:
      url.search,

    body,
  };
}

function studentRow(
  state
) {
  if (!state) {
    return [];
  }

  return [{
    id:
      'student-existing',

    code:
      'S069',

    active:
      state ===
      'active',

    archived_at:
      state ===
      'archived'
        ? '2026-08-01T00:00:00Z'
        : null,
  }];
}

function loginRows(
  state
) {
  if (!state) {
    return [];
  }

  if (
    state ===
    'lowercase'
  ) {
    return [{
      id:
        'login-existing',
      username:
        's069',
      role:
        'student',
      student_id:
        'student-existing',
    }];
  }

  if (
    state ===
    'wrong-role'
  ) {
    return [{
      id:
        'login-existing',
      username:
        'S069',
      role:
        'teacher',
      student_id:
        null,
    }];
  }

  if (
    state ===
    'wrong-student'
  ) {
    return [{
      id:
        'login-existing',
      username:
        'S069',
      role:
        'student',
      student_id:
        'student-other',
    }];
  }

  return [{
    id:
      'login-existing',
    username:
      'S069',
    role:
      'student',
    student_id:
      'student-existing',
  }];
}

function makeBackend({
  existingStudent = null,
  existingLogin = null,
  failEnrollment = false,
} = {}) {
  const calls = [];

  async function fetchMock(
    input,
    options = {}
  ) {
    const call =
      parseRequest(
        input,
        options
      );

    calls.push(call);

    if (
      call.method === 'GET' &&
      call.path ===
        '/rest/v1/students'
    ) {
      return mockResponse(
        200,
        studentRow(
          existingStudent
        )
      );
    }

    if (
      call.method === 'GET' &&
      call.path ===
        '/rest/v1/app_users'
    ) {
      return mockResponse(
        200,
        loginRows(
          existingLogin
        )
      );
    }

    if (
      call.method === 'GET' &&
      call.path ===
        '/rest/v1/teacher'
    ) {
      return mockResponse(
        200,
        [{
          id:
            'teacher-1',
          username:
            'synthetic-teacher',
        }]
      );
    }

    if (
      call.method === 'GET' &&
      call.path ===
        '/rest/v1/classes'
    ) {
      return mockResponse(
        200,
        [{
          id:
            'class-1',
          code:
            'LA1',
          name:
            'Language Arts 1 SC',
          teacher_id:
            'teacher-1',
        }]
      );
    }

    if (
      call.method === 'POST' &&
      call.path ===
        '/rest/v1/students'
    ) {
      return mockResponse(
        201,
        [{
          id:
            'student-new',
          code:
            'S069',
          active:
            true,
          archived_at:
            null,
        }]
      );
    }

    if (
      call.method === 'POST' &&
      call.path ===
        '/rest/v1/rpc/set_user_password'
    ) {
      const studentId =
        existingStudent
          ? 'student-existing'
          : 'student-new';

      return mockResponse(
        200,
        {
          id:
            'login-new',
          username:
            's069',
          role:
            'student',
          student_id:
            studentId,
        }
      );
    }

    if (
      call.method === 'PATCH' &&
      call.path ===
        '/rest/v1/app_users'
    ) {
      return mockResponse(
        200,
        [{
          id:
            'login-new',
          username:
            'S069',
          role:
            'student',
          student_id:
            call.body.student_id,
        }]
      );
    }

    if (
      call.method === 'POST' &&
      call.path ===
        '/rest/v1/class_enrollments'
    ) {
      if (
        failEnrollment
      ) {
        return mockResponse(
          500,
          {
            error:
              'synthetic enrollment failure',
          }
        );
      }

      return mockResponse(
        201,
        [{
          class_id:
            'class-1',
          student_id:
            call.body[0].student_id,
          active:
            true,
        }]
      );
    }

    if (
      call.method === 'DELETE' &&
      (
        call.path ===
          '/rest/v1/app_users' ||
        call.path ===
          '/rest/v1/students'
      )
    ) {
      return mockResponse(
        204,
        null
      );
    }

    throw new Error(
      `Unexpected mocked request: ` +
      `${call.method} ${call.path}${call.search}`
    );
  }

  return {
    calls,
    fetchMock,
  };
}

function onboardingEvent() {
  return {
    httpMethod:
      'POST',

    headers:
      {},

    body:
      JSON.stringify({
        code:
          'S069',

        primary_case_manager:
          'Synthetic Teacher',

        class_names: [
          'Language Arts 1 SC',
        ],
      }),
  };
}

function parseHandlerBody(
  response
) {
  return JSON.parse(
    response.body
  );
}

function writes(
  backend
) {
  return backend.calls.filter(
    call =>
      call.method !==
      'GET'
  );
}

async function newStudentCase() {
  const backend =
    makeBackend();

  global.fetch =
    backend.fetchMock;

  const result =
    await handler(
      onboardingEvent()
    );

  assert.equal(
    result.statusCode,
    200
  );

  const body =
    parseHandlerBody(
      result
    );

  assert.equal(
    body.student.code,
    'S069'
  );

  assert.equal(
    body.student_created,
    true
  );

  assert.equal(
    body.login_created,
    true
  );

  assert.equal(
    body.enrollment_count,
    1
  );

  assert.equal(
    JSON.stringify(body)
      .includes('password'),
    false
  );

  const firstWrite =
    backend.calls.findIndex(
      call =>
        call.method !==
        'GET'
    );

  assert.ok(
    firstWrite >= 4
  );

  assert.ok(
    backend.calls
      .slice(
        0,
        firstWrite
      )
      .every(
        call =>
          call.method ===
          'GET'
      )
  );

  const studentWrite =
    backend.calls.find(
      call =>
        call.method === 'POST' &&
        call.path ===
          '/rest/v1/students'
    );

  assert.ok(
    studentWrite
  );

  assert.equal(
    'password' in
      studentWrite.body,
    false
  );

  assert.equal(
    'password_hash' in
      studentWrite.body,
    false
  );

  const loginWrite =
    backend.calls.find(
      call =>
        call.method === 'POST' &&
        call.path ===
          '/rest/v1/rpc/set_user_password'
    );

  assert.ok(
    loginWrite
  );

  assert.equal(
    loginWrite.body.p_username,
    'S069'
  );

  assert.equal(
    loginWrite.body.p_role,
    'student'
  );

  const loginPatch =
    backend.calls.find(
      call =>
        call.method === 'PATCH' &&
        call.path ===
          '/rest/v1/app_users'
    );

  assert.ok(
    loginPatch
  );

  assert.equal(
    'password' in
      loginPatch.body,
    false
  );

  assert.equal(
    'password_hash' in
      loginPatch.body,
    false
  );

  const enrollment =
    backend.calls.find(
      call =>
        call.method === 'POST' &&
        call.path ===
          '/rest/v1/class_enrollments'
    );

  assert.ok(
    enrollment
  );

  assert.deepStrictEqual(
    enrollment.body,
    [{
      class_id:
        'class-1',
      student_id:
        'student-new',
      active:
        true,
    }]
  );

  console.log(
    '✓ new student creates student + login + authoritative enrollment'
  );
}

async function repairMissingLoginCase() {
  const backend =
    makeBackend({
      existingStudent:
        'active',
    });

  global.fetch =
    backend.fetchMock;

  const result =
    await handler(
      onboardingEvent()
    );

  assert.equal(
    result.statusCode,
    200
  );

  const body =
    parseHandlerBody(
      result
    );

  assert.equal(
    body.student_created,
    false
  );

  assert.equal(
    body.login_created,
    true
  );

  assert.equal(
    backend.calls.some(
      call =>
        call.method === 'POST' &&
        call.path ===
          '/rest/v1/students'
    ),
    false
  );

  assert.equal(
    backend.calls.some(
      call =>
        call.method === 'POST' &&
        call.path ===
          '/rest/v1/rpc/set_user_password'
    ),
    true
  );

  console.log(
    '✓ active existing student can receive a missing login without rewriting student'
  );
}

async function reuseExistingLoginCase() {
  const backend =
    makeBackend({
      existingStudent:
        'active',
      existingLogin:
        'valid',
    });

  global.fetch =
    backend.fetchMock;

  const result =
    await handler(
      onboardingEvent()
    );

  assert.equal(
    result.statusCode,
    200
  );

  const body =
    parseHandlerBody(
      result
    );

  assert.equal(
    body.student_created,
    false
  );

  assert.equal(
    body.login_created,
    false
  );

  assert.equal(
    backend.calls.some(
      call =>
        call.path ===
          '/rest/v1/rpc/set_user_password'
    ),
    false
  );

  assert.equal(
    backend.calls.some(
      call =>
        call.method === 'PATCH' &&
        call.path ===
          '/rest/v1/app_users'
    ),
    false
  );

  assert.equal(
    backend.calls.some(
      call =>
        call.method === 'POST' &&
        call.path ===
          '/rest/v1/class_enrollments'
    ),
    true
  );

  console.log(
    '✓ valid existing login is reused with zero password/account mutation'
  );
}

async function inactiveStudentCase() {
  const backend =
    makeBackend({
      existingStudent:
        'archived',
    });

  global.fetch =
    backend.fetchMock;

  const result =
    await handler(
      onboardingEvent()
    );

  assert.equal(
    result.statusCode,
    409
  );

  assert.equal(
    writes(backend).length,
    0
  );

  console.log(
    '✓ archived/inactive student fails closed before writes'
  );
}

async function orphanLoginCase() {
  const backend =
    makeBackend({
      existingLogin:
        'valid',
    });

  global.fetch =
    backend.fetchMock;

  const result =
    await handler(
      onboardingEvent()
    );

  assert.equal(
    result.statusCode,
    409
  );

  assert.equal(
    writes(backend).length,
    0
  );

  console.log(
    '✓ orphan login fails closed before writes'
  );
}

async function malformedExistingLoginCase() {
  for (
    const existingLogin
    of [
      'lowercase',
      'wrong-role',
      'wrong-student',
    ]
  ) {
    const backend =
      makeBackend({
        existingStudent:
          'active',
        existingLogin,
      });

    global.fetch =
      backend.fetchMock;

    const result =
      await handler(
        onboardingEvent()
      );

    assert.equal(
      result.statusCode,
      409
    );

    assert.equal(
      writes(backend).length,
      0
    );
  }

  console.log(
    '✓ malformed existing login states fail closed without password mutation'
  );
}

async function newStudentRollbackCase() {
  const backend =
    makeBackend({
      failEnrollment:
        true,
    });

  global.fetch =
    backend.fetchMock;

  const result =
    await handler(
      onboardingEvent()
    );

  assert.equal(
    result.statusCode,
    502
  );

  const deletes =
    backend.calls.filter(
      call =>
        call.method ===
        'DELETE'
    );

  assert.equal(
    deletes.length,
    2
  );

  assert.equal(
    deletes[0].path,
    '/rest/v1/app_users'
  );

  assert.equal(
    deletes[1].path,
    '/rest/v1/students'
  );

  console.log(
    '✓ new student failure rolls back new login + new student'
  );
}

async function repairedStudentRollbackCase() {
  const backend =
    makeBackend({
      existingStudent:
        'active',
      failEnrollment:
        true,
    });

  global.fetch =
    backend.fetchMock;

  const result =
    await handler(
      onboardingEvent()
    );

  assert.equal(
    result.statusCode,
    502
  );

  const deletes =
    backend.calls.filter(
      call =>
        call.method ===
        'DELETE'
    );

  assert.equal(
    deletes.length,
    1
  );

  assert.equal(
    deletes[0].path,
    '/rest/v1/app_users'
  );

  assert.equal(
    backend.calls.some(
      call =>
        call.method === 'DELETE' &&
        call.path ===
          '/rest/v1/students'
    ),
    false
  );

  console.log(
    '✓ partial-repair failure removes only the newly created login'
  );
}

(async () => {
  const originalFetch =
    global.fetch;

  try {
    console.log(
      'Running mocked Teacher Student onboarding transaction QA...\n'
    );

    await newStudentCase();
    await repairMissingLoginCase();
    await reuseExistingLoginCase();
    await inactiveStudentCase();
    await orphanLoginCase();
    await malformedExistingLoginCase();
    await newStudentRollbackCase();
    await repairedStudentRollbackCase();

    console.log('');
    console.log(
      'TEACHER STUDENT ONBOARDING HANDLER QA: PASS'
    );
  } finally {
    global.fetch =
      originalFetch;
  }
})().catch(
  error => {
    console.error(
      error.stack ||
      error
    );

    process.exit(1);
  }
);
