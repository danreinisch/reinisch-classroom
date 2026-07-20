'use strict';

const assert = require('assert');

process.env.SESSION_SECRET =
  'student-read-boundary-test-secret';

process.env.SUPABASE_URL =
  'https://example.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key';

const {
  createStudentSessionCookie,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const targets = [
  {
    name: 'student-profile',
    path: '../netlify/functions/student-profile',
    params: { code: 'S002' },
  },
  {
    name: 'student-goals',
    path: '../netlify/functions/student-goals',
    params: { code: 'S002' },
  },
  {
    name: 'student-assignments',
    path: '../netlify/functions/student-assignments',
    params: { code: 'S002' },
  },
  {
    name: 'student-submissions',
    path: '../netlify/functions/student-submissions',
    params: { code: 'S002' },
  },
  {
    name: 'student-goal-progress',
    path: '../netlify/functions/student-goal-progress',
    params: { code: 'S002' },
  },
  {
    name: 'student-goal-data-points',
    path: '../netlify/functions/student-goal-data-points',
    params: { code: 'S002' },
  },
  {
    name: 'student-submission-details',
    path: '../netlify/functions/student-submission-details',
    params: {
      code: 'S002',
      instance_id: 'test-instance',
    },
  },
];

function cookieHeaderFor(code) {
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
  params,
  cookie,
}) {
  return {
    httpMethod: 'GET',
    headers: cookie
      ? { cookie }
      : {},
    queryStringParameters: params,
  };
}

function parseBody(response) {
  try {
    return JSON.parse(response.body || '{}');
  } catch {
    return {};
  }
}

(async () => {
  console.log(
    'Running student read auth boundary tests...\n'
  );

  const originalFetch = global.fetch;

  try {
    for (const target of targets) {
      const resolved =
        require.resolve(target.path);

      delete require.cache[resolved];

      const {
        handler,
      } = require(target.path);

      let fetchCalls = 0;

      global.fetch = async () => {
        fetchCalls += 1;

        throw new Error(
          'SECURITY TEST FAILURE: ' +
          'Supabase/network fetch was reached'
        );
      };

      const noSession =
        await handler(
          makeEvent({
            params: target.params,
            cookie: null,
          })
        );

      const noSessionBody =
        parseBody(noSession);

      assert.strictEqual(
        noSession.statusCode,
        401,
        `${target.name}: no session must return 401`
      );

      assert.strictEqual(
        noSessionBody.error,
        'Unauthorized',
        `${target.name}: expected Unauthorized`
      );

      assert.strictEqual(
        fetchCalls,
        0,
        `${target.name}: unauthorized request reached fetch`
      );

      console.log(
        `✓ ${target.name}: missing session blocked before fetch`
      );

      fetchCalls = 0;

      const crossStudent =
        await handler(
          makeEvent({
            params: target.params,
            cookie: cookieHeaderFor('S001'),
          })
        );

      const crossStudentBody =
        parseBody(crossStudent);

      assert.strictEqual(
        crossStudent.statusCode,
        403,
        `${target.name}: cross-student access must return 403`
      );

      assert.strictEqual(
        crossStudentBody.error,
        'Forbidden',
        `${target.name}: expected Forbidden`
      );

      assert.strictEqual(
        fetchCalls,
        0,
        `${target.name}: cross-student request reached fetch`
      );

      console.log(
        `✓ ${target.name}: S001 cannot request S002 before fetch`
      );

      fetchCalls = 0;

      global.fetch = async () => {
        fetchCalls += 1;
        throw new Error(
          'EXPECTED_POSITIVE_PATH_FETCH'
        );
      };

      await handler(
        makeEvent({
          params: {
            ...target.params,
            code: 'S001',
          },
          cookie: cookieHeaderFor('S001'),
        })
      );

      assert.ok(
        fetchCalls >= 1,
        `${target.name}: valid S001 session did not reach fetch`
      );

      console.log(
        `✓ ${target.name}: valid S001 session reaches data layer`
      );
    }

    console.log('');
    console.log('==========================================');
    console.log('STUDENT READ AUTH BOUNDARY: PASS');
    console.log('==========================================');
    console.log('7 read endpoints require a signed student session.');
    console.log('Missing sessions return 401 before Supabase access.');
    console.log('Cross-student requests return 403 before Supabase access.');
  } finally {
    global.fetch = originalFetch;
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
