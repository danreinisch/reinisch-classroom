'use strict';

const assert = require('assert');

process.env.SESSION_SECRET =
  'synthetic-teacher-login-session-secret';

process.env.SUPABASE_URL =
  'https://synthetic.invalid';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'synthetic-service-role-key';

const originalFetch = global.fetch;

function headerValue(headers, name) {
  const key = Object.keys(headers || {})
    .find(
      candidate =>
        candidate.toLowerCase() ===
        name.toLowerCase()
    );

  return key
    ? headers[key]
    : undefined;
}

async function run() {
  console.log(
    'Running teacher-login password boundary tests...\n'
  );

  const fetchCalls = [];

  global.fetch =
    async (url, options = {}) => {
      fetchCalls.push({
        url: String(url),
        options,
      });

      if (
        String(url).includes(
          '/rest/v1/rpc/verify_user_password'
        )
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return [
              {
                username:
                  'teacher_test',
                role:
                  'teacher',
                student_id:
                  null,
                user_id:
                  '00000000-0000-0000-0000-000000000111',
              },
            ];
          },
          async text() {
            return '';
          },
        };
      }

      if (
        String(url).includes(
          '/rest/v1/teacher?'
        )
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return [
              {
                id:
                  '00000000-0000-0000-0000-000000000222',
              },
            ];
          },
          async text() {
            return '';
          },
        };
      }

      throw new Error(
        `Unexpected fetch URL: ${url}`
      );
    };

  try {
    const endpointPath =
      require.resolve(
        '../netlify/functions/teacher-login'
      );

    const supaPath =
      require.resolve(
        '../netlify/functions/_lib/supa'
      );

    delete require.cache[endpointPath];
    delete require.cache[supaPath];

    const {
      handler,
    } = require(endpointPath);

    const response =
      await handler({
        httpMethod: 'POST',
        headers: {
          host:
            'reinischclassroom.com',
          origin:
            'https://reinischclassroom.com',
          'content-type':
            'application/json',
          'x-forwarded-for':
            '192.0.2.10',
        },
        body: JSON.stringify({
          username:
            'teacher_test',
          password:
            'SyntheticOnlyPassword',
        }),
      });

    assert.strictEqual(
      response.statusCode,
      200,
      `Expected successful synthetic teacher login, got ${response.statusCode}`
    );

    const body =
      JSON.parse(
        response.body ||
        '{}'
      );

    assert.strictEqual(
      body.ok,
      true
    );

    const setCookie =
      headerValue(
        response.headers,
        'Set-Cookie'
      );

    assert.ok(
      setCookie,
      'Teacher login must set a session cookie'
    );

    assert.match(
      setCookie,
      /^tc=/,
      'Teacher login must set the tc cookie'
    );

    assert.match(
      setCookie,
      /HttpOnly/i,
      'Teacher session cookie must be HttpOnly'
    );

    const verifyCall =
      fetchCalls.find(
        call =>
          call.url.includes(
            '/rest/v1/rpc/verify_user_password'
          )
      );

    assert.ok(
      verifyCall,
      'Teacher login must call verify_user_password'
    );

    assert.strictEqual(
      verifyCall.options.method,
      'POST'
    );

    assert.strictEqual(
      headerValue(
        verifyCall.options.headers,
        'apikey'
      ),
      'synthetic-service-role-key',
      'verify_user_password must use service-role apikey'
    );

    assert.strictEqual(
      headerValue(
        verifyCall.options.headers,
        'Authorization'
      ),
      'Bearer synthetic-service-role-key',
      'verify_user_password must use service-role bearer token'
    );

    const teacherLookup =
      fetchCalls.find(
        call =>
          call.url.includes(
            '/rest/v1/teacher?'
          )
      );

    assert.ok(
      teacherLookup,
      'Successful login must resolve an active teacher record'
    );

    assert.strictEqual(
      headerValue(
        teacherLookup.options.headers,
        'apikey'
      ),
      'synthetic-service-role-key'
    );

    assert.strictEqual(
      headerValue(
        teacherLookup.options.headers,
        'Authorization'
      ),
      'Bearer synthetic-service-role-key'
    );

    console.log(
      '✓ teacher login verifies credentials through service-role RPC'
    );

    console.log(
      '✓ successful teacher login creates signed HttpOnly tc session'
    );

    console.log(
      '✓ teacher lookup also remains server/service-role'
    );

    console.log('');
    console.log(
      'TEACHER LOGIN PASSWORD BOUNDARY: PASS'
    );
  } finally {
    global.fetch =
      originalFetch;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
