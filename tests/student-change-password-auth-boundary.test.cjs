'use strict';

const assert =
  require('assert');

process.env.SESSION_SECRET =
  'student-change-password-test-secret';

process.env.SUPABASE_URL =
  'https://example.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key';

const {
  createStudentSessionCookie,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const {
  handler,
} = require(
  '../netlify/functions/student-change-password'
);

function studentCookie(code) {
  return createStudentSessionCookie(
    code,
    process.env.SESSION_SECRET,
    {
      secure: false,
      maxAge: 3600,
    }
  ).split(';')[0];
}

function makeEvent({
  cookie = null,
  studentCode = 'S001',
  currentPassword = 'CurrentPassword123!',
  newPassword = 'NewPassword456!',
} = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      'content-type':
        'application/json',
      ...(cookie
        ? { cookie }
        : {}),
    },
    body:
      JSON.stringify({
        studentCode,
        currentPassword,
        newPassword,
      }),
  };
}

function bodyOf(response) {
  try {
    return JSON.parse(
      response.body ||
      '{}'
    );
  } catch {
    return {};
  }
}

(async () => {
  console.log(
    'Running student change-password auth boundary tests...\n'
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

    const missingSession =
      await handler(
        makeEvent({
          cookie: null,
          studentCode: 'S001',
        })
      );

    assert.strictEqual(
      missingSession.statusCode,
      401
    );

    assert.strictEqual(
      bodyOf(missingSession).error,
      'Unauthorized'
    );

    assert.strictEqual(
      fetchCalls,
      0
    );

    console.log(
      '✓ missing student session blocked before password RPC'
    );

    fetchCalls = 0;

    const crossStudent =
      await handler(
        makeEvent({
          cookie:
            studentCookie('S001'),
          studentCode:
            'S002',
        })
      );

    assert.strictEqual(
      crossStudent.statusCode,
      403
    );

    assert.strictEqual(
      bodyOf(crossStudent).error,
      'Forbidden'
    );

    assert.strictEqual(
      fetchCalls,
      0
    );

    console.log(
      '✓ S001 session cannot change S002 password'
    );

    fetchCalls = 0;

    const rpcCalls = [];

    global.fetch =
      async (url, options = {}) => {
        fetchCalls += 1;

        const body =
          options.body
            ? JSON.parse(
                options.body
              )
            : null;

        rpcCalls.push({
          url:
            String(url),
          body,
        });

        if (
          String(url).includes(
            '/rpc/verify_user_password'
          )
        ) {
          return {
            ok: true,
            status: 200,
            json:
              async () => [
                {
                  role:
                    'student',
                  student_id:
                    'test-student-id',
                },
              ],
            text:
              async () => '',
          };
        }

        return {
          ok: true,
          status: 200,
          json:
            async () => ({}),
          text:
            async () => '',
        };
      };

    const valid =
      await handler(
        makeEvent({
          cookie:
            studentCookie('S001'),
          studentCode:
            's001',
        })
      );

    assert.strictEqual(
      valid.statusCode,
      200
    );

    assert.strictEqual(
      bodyOf(valid).ok,
      true
    );

    assert.strictEqual(
      fetchCalls,
      3,
      'Expected verify + primary update + compatibility sync RPCs'
    );

    assert.ok(
      rpcCalls[0].url.includes(
        '/rpc/verify_user_password'
      )
    );

    assert.strictEqual(
      rpcCalls[0].body.p_username,
      'S001'
    );

    assert.ok(
      rpcCalls[1].url.includes(
        '/rpc/set_user_password'
      )
    );

    assert.strictEqual(
      rpcCalls[1].body.p_username,
      'S001'
    );

    assert.ok(
      rpcCalls[2].url.includes(
        '/rpc/set_student_password'
      )
    );

    assert.strictEqual(
      rpcCalls[2].body.p_code,
      'S001'
    );

    console.log(
      '✓ valid S001 session reaches password RPC path'
    );

    console.log(
      '✓ signed session identity is normalized and authoritative'
    );

    console.log('');
    console.log(
      'STUDENT CHANGE-PASSWORD AUTH BOUNDARY: PASS'
    );
  } finally {
    global.fetch =
      originalFetch;
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
