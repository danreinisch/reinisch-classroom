'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

process.env.SESSION_SECRET =
  'password-status-test-secret';

process.env.SUPABASE_URL =
  'https://synthetic.invalid';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'synthetic-service-role-key';

const endpointPath =
  require.resolve(
    '../netlify/functions/teacher-student-password-statuses'
  );

const authPath =
  require.resolve(
    '../netlify/functions/_lib/auth'
  );

function bodyOf(response) {
  return JSON.parse(
    response.body ||
    '{}'
  );
}

async function run() {
  console.log(
    'Running teacher student-password-status boundary tests...\n'
  );

  const auth =
    require(authPath);

  const originalRequireTeacher =
    auth.requireTeacher;

  const originalFetch =
    global.fetch;

  try {
    let fetchCalls = 0;

    auth.requireTeacher =
      () => ({
        ok: false,
      });

    global.fetch =
      async () => {
        fetchCalls += 1;
        throw new Error(
          'SECURITY TEST FAILURE: Supabase fetch reached'
        );
      };

    delete require.cache[endpointPath];

    let {
      handler,
    } =
      require(endpointPath);

    const unauthorized =
      await handler({
        httpMethod: 'GET',
        headers: {},
        body: null,
      });

    assert.strictEqual(
      unauthorized.statusCode,
      401
    );

    assert.strictEqual(
      bodyOf(unauthorized).error,
      'Unauthorized'
    );

    assert.strictEqual(
      fetchCalls,
      0,
      'Unauthorized request must be blocked before Supabase'
    );

    console.log(
      '✓ unauthenticated request blocked before Supabase'
    );

    auth.requireTeacher =
      () => ({
        ok: true,
        user: {
          username: 'teacher_test',
          role: 'teacher',
        },
      });

    let capturedUrl = '';
    let capturedOptions = null;

    global.fetch =
      async (url, options = {}) => {
        fetchCalls += 1;
        capturedUrl =
          String(url);
        capturedOptions =
          options;

        return {
          ok: true,
          status: 200,
          async json() {
            return [
              {
                student_code: 'SYN001',
                is_default_password: true,
              },
              {
                student_code: 'SYN002',
                is_default_password: false,
              },
            ];
          },
        };
      };

    delete require.cache[endpointPath];

    ({
      handler,
    } =
      require(endpointPath));

    const authorized =
      await handler({
        httpMethod: 'GET',
        headers: {},
        body: null,
      });

    assert.strictEqual(
      authorized.statusCode,
      200
    );

    const authorizedBody =
      bodyOf(authorized);

    assert.strictEqual(
      authorizedBody.ok,
      true
    );

    assert.deepStrictEqual(
      authorizedBody.statuses,
      [
        {
          student_code: 'SYN001',
          is_default_password: true,
        },
        {
          student_code: 'SYN002',
          is_default_password: false,
        },
      ]
    );

    assert.ok(
      capturedUrl.endsWith(
        '/rest/v1/rpc/list_student_password_statuses'
      ),
      `Unexpected RPC URL: ${capturedUrl}`
    );

    assert.strictEqual(
      capturedOptions.method,
      'POST'
    );

    assert.strictEqual(
      capturedOptions.headers.apikey,
      'synthetic-service-role-key'
    );

    assert.strictEqual(
      capturedOptions.headers.Authorization,
      'Bearer synthetic-service-role-key'
    );

    console.log(
      '✓ authenticated request uses service-role password-status RPC'
    );

    console.log(
      '✓ password-status response preserves expected metadata only'
    );

    const settingsSource =
      fs.readFileSync(
        path.join(
          __dirname,
          '../site/web/tc-settings.js'
        ),
        'utf8'
      );

    assert.ok(
      settingsSource.includes(
        '/.netlify/functions/teacher-student-password-statuses'
      ),
      'Teacher Settings must use authenticated password-status endpoint'
    );

    assert.ok(
      !settingsSource.includes(
        'db.getStudentPasswordStatuses()'
      ),
      'Teacher Settings must not call browser password-status adapter'
    );

    console.log(
      '✓ Teacher Settings no longer calls browser password-status RPC adapter'
    );

    console.log('');
    console.log(
      'TEACHER PASSWORD-STATUS SERVER BOUNDARY: PASS'
    );
  } finally {
    auth.requireTeacher =
      originalRequireTeacher;

    global.fetch =
      originalFetch;

    delete require.cache[endpointPath];
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
