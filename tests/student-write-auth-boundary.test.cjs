'use strict';

const assert =
  require('assert');

process.env.SESSION_SECRET =
  'student-write-boundary-test-secret';

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
  '../netlify/functions/student-submit-answer'
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
  cookie,
  studentCode,
  includeStudentCode = true,
}) {
  const body = {
    instance_id:
      'test-instance-id',
    answers: {
      '1_1': 'A',
    },
    submit: false,
  };

  if (includeStudentCode) {
    body.student_code =
      studentCode;
  }

  return {
    httpMethod: 'POST',
    headers: {
      'content-type':
        'application/json',
      ...(cookie
        ? { cookie }
        : {}),
    },
    queryStringParameters: {},
    body:
      JSON.stringify(body),
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
    'Running student write auth boundary tests...\n'
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
      '✓ missing student session blocked before write/data access'
    );

    fetchCalls = 0;

    const crossStudent =
      await handler(
        makeEvent({
          cookie:
            studentCookie(
              'S001'
            ),
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
      '✓ S001 session cannot submit as S002 before fetch'
    );

    fetchCalls = 0;

    global.fetch =
      async () => {
        fetchCalls += 1;

        throw new Error(
          'EXPECTED_POSITIVE_PATH_FETCH'
        );
      };

    await handler(
      makeEvent({
        cookie:
          studentCookie(
            'S001'
          ),
        studentCode:
          'S001',
      })
    );

    assert.ok(
      fetchCalls >= 1
    );

    console.log(
      '✓ valid S001 session reaches normal submission data path'
    );

    fetchCalls = 0;

    await handler(
      makeEvent({
        cookie:
          studentCookie(
            'S001'
          ),
        includeStudentCode:
          false,
      })
    );

    assert.ok(
      fetchCalls >= 1
    );

    console.log(
      '✓ authenticated cookie alone supplies authoritative student identity'
    );

    console.log('');
    console.log(
      'STUDENT WRITE AUTH BOUNDARY: PASS'
    );
  } finally {
    global.fetch =
      originalFetch;
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
