'use strict';

const assert =
  require('assert');

process.env.SESSION_SECRET =
  'student-reset-boundary-test-secret';

process.env.SUPABASE_URL =
  'https://example.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key';

const {
  sign,
} = require(
  '../netlify/functions/_lib/auth'
);

const {
  createStudentSessionCookie,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const {
  handler: resetHandler,
} = require(
  '../netlify/functions/student-reset-password'
);

const {
  handler: logoutHandler,
} = require(
  '../netlify/functions/student-logout'
);

function teacherCookie() {
  const token =
    sign(
      {
        role: 'teacher',
        username:
          'teacher_test',
      },
      process.env.SESSION_SECRET,
      {
        expSec: 3600,
      }
    );

  return `tc=${token}`;
}

function studentCookie() {
  return createStudentSessionCookie(
    'S001',
    process.env.SESSION_SECRET,
    {
      secure: false,
      maxAge: 3600,
    }
  ).split(';')[0];
}

function resetEvent(cookie) {
  return {
    httpMethod: 'POST',
    headers: {
      'content-type':
        'application/json',
      ...(cookie
        ? { cookie }
        : {}),
    },
    body: JSON.stringify({
      code: 'S001',
      password:
        'TeacherChosenPassword',
    }),
  };
}

(async () => {
  console.log(
    'Running student reset/logout boundary tests...\n'
  );

  const originalFetch =
    global.fetch;

  try {
    let fetchCalls = 0;

    global.fetch =
      async () => {
        fetchCalls += 1;

        throw new Error(
          'SECURITY TEST FAILURE: fetch reached'
        );
      };

    const publicReset =
      await resetHandler(
        resetEvent(null)
      );

    assert.strictEqual(
      publicReset.statusCode,
      401
    );

    assert.strictEqual(
      fetchCalls,
      0
    );

    console.log(
      '✓ unauthenticated password reset blocked before fetch'
    );

    fetchCalls = 0;

    const studentReset =
      await resetHandler(
        resetEvent(
          studentCookie()
        )
      );

    assert.strictEqual(
      studentReset.statusCode,
      401
    );

    assert.strictEqual(
      fetchCalls,
      0
    );

    console.log(
      '✓ student session cannot reset passwords'
    );

    fetchCalls = 0;
    let capturedBody = null;

    global.fetch =
      async (_url, options) => {
        fetchCalls += 1;

        capturedBody =
          JSON.parse(
            options.body
          );

        return {
          ok: true,
          status: 200,
          json:
            async () => ({}),
          text:
            async () => '',
        };
      };

    const teacherReset =
      await resetHandler(
        resetEvent(
          teacherCookie()
        )
      );

    assert.strictEqual(
      teacherReset.statusCode,
      200
    );

    assert.ok(
      fetchCalls >= 1
    );

    assert.strictEqual(
      capturedBody.p_code,
      'S001'
    );

    assert.strictEqual(
      capturedBody.p_password,
      'TeacherChosenPassword'
    );

    console.log(
      '✓ authenticated teacher can reset one student password'
    );

    const logout =
      await logoutHandler({
        httpMethod: 'POST',
        headers: {
          host:
            'localhost:8888',
        },
      });

    assert.strictEqual(
      logout.statusCode,
      200
    );

    const setCookie =
      logout.headers[
        'Set-Cookie'
      ];

    assert.match(
      setCookie,
      /^sc=/
    );

    assert.match(
      setCookie,
      /Max-Age=0/
    );

    assert.match(
      setCookie,
      /HttpOnly/
    );

    console.log(
      '✓ student logout expires signed HttpOnly sc cookie'
    );

    console.log('');
    console.log(
      'STUDENT RESET/LOGOUT BOUNDARY: PASS'
    );
  } finally {
    global.fetch =
      originalFetch;
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
