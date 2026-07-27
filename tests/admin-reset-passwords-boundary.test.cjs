'use strict';

const assert = require('assert');

process.env.SESSION_SECRET =
  'synthetic-admin-reset-session-secret';

process.env.SUPABASE_URL =
  'https://synthetic.invalid';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'synthetic-service-role-key';

const {
  sign,
} = require(
  '../netlify/functions/_lib/auth'
);

const endpointPath =
  require.resolve(
    '../netlify/functions/admin-reset-passwords'
  );

const originalFetch =
  global.fetch;

function bodyOf(response) {
  return JSON.parse(
    response.body ||
    '{}'
  );
}

function teacherCookie() {
  const token =
    sign(
      {
        role:
          'teacher',
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

function eventFor(cookie) {
  return {
    httpMethod:
      'POST',
    headers: {
      'content-type':
        'application/json',
      ...(cookie
        ? {
            cookie,
          }
        : {}),
    },
    body:
      '{}',
  };
}

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
    'Running admin reset-password boundary tests...\n'
  );

  let fetchCalls = 0;

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
  } = require(endpointPath);

  const unauthorized =
    await handler(
      eventFor(null)
    );

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
    'Unauthenticated reset must be blocked before Supabase'
  );

  console.log(
    '✓ unauthenticated reset-all request blocked before Supabase'
  );

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
          return 7;
        },
        async text() {
          return '';
        },
      };
    };

  delete require.cache[endpointPath];

  ({
    handler,
  } = require(endpointPath));

  const authorized =
    await handler(
      eventFor(
        teacherCookie()
      )
    );

  assert.strictEqual(
    authorized.statusCode,
    200
  );

  const authorizedBody =
    bodyOf(
      authorized
    );

  assert.strictEqual(
    authorizedBody.ok,
    true
  );

  assert.strictEqual(
    authorizedBody.reset_count,
    7
  );

  assert.ok(
    capturedUrl.endsWith(
      '/rest/v1/rpc/reset_all_student_passwords'
    ),
    `Unexpected RPC URL: ${capturedUrl}`
  );

  assert.strictEqual(
    capturedOptions.method,
    'POST'
  );

  assert.strictEqual(
    headerValue(
      capturedOptions.headers,
      'apikey'
    ),
    'synthetic-service-role-key'
  );

  assert.strictEqual(
    headerValue(
      capturedOptions.headers,
      'Authorization'
    ),
    'Bearer synthetic-service-role-key'
  );

  assert.deepStrictEqual(
    JSON.parse(
      capturedOptions.body
    ),
    {}
  );

  console.log(
    '✓ authenticated teacher reaches reset-all RPC'
  );

  console.log(
    '✓ reset-all RPC uses service-role credentials'
  );

  console.log('');
  console.log(
    'ADMIN RESET-PASSWORD BOUNDARY: PASS'
  );
}

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch =
      originalFetch;

    delete require.cache[
      endpointPath
    ];
  });
