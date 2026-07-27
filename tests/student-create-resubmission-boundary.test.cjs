'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

process.env.SESSION_SECRET =
  'synthetic-resubmission-boundary-secret';

process.env.SUPABASE_URL =
  'https://synthetic.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'synthetic-service-role-key';

const {
  createStudentSessionCookie,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const {
  handler,
} = require(
  '../netlify/functions/student-create-resubmission'
);

const INSTANCE_ID =
  '11111111-1111-4111-8111-111111111111';

const OTHER_INSTANCE_ID =
  '22222222-2222-4222-8222-222222222222';

const ORIGINAL_ID =
  '33333333-3333-4333-8333-333333333333';

const NEW_SUBMISSION_ID =
  '44444444-4444-4444-8444-444444444444';

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
  instanceId = INSTANCE_ID,
  originalId = ORIGINAL_ID,
  answers = {},
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
    body: JSON.stringify({
      instance_id:
        instanceId,
      original_submission_id:
        originalId,
      answers,
    }),
  };
}

function response(
  data,
  status = 200
) {
  const text =
    JSON.stringify(data);

  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    json:
      async () => data,
    text:
      async () => text,
  };
}

function bodyOf(res) {
  return JSON.parse(
    res.body || '{}'
  );
}

(async () => {
  console.log(
    'Running student create-resubmission boundary tests...\n'
  );

  const originalFetch =
    global.fetch;

  const calls = [];

  let responder =
    async () => {
      throw new Error(
        'No responder configured'
      );
    };

  global.fetch =
    async (
      url,
      options = {}
    ) => {
      const call = {
        url: String(url),
        method:
          options.method ||
          'GET',
        headers:
          options.headers ||
          {},
        body:
          options.body,
      };

      calls.push(call);

      return responder(
        call
      );
    };

  try {
    // 1. Missing signed session:
    // no data access at all.
    calls.length = 0;

    responder =
      async () => {
        throw new Error(
          'SECURITY FAILURE: fetch reached'
        );
      };

    const missingSession =
      await handler(
        makeEvent()
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
      calls.length,
      0,
      'Missing session must be rejected before Supabase access'
    );

    console.log(
      '✓ missing student session blocked before data access'
    );

    // 2. S001 cannot use an instance
    // owned by another student.
    calls.length = 0;

    responder =
      async (call) => {
        if (
          call.url.includes(
            '/rest/v1/students?'
          )
        ) {
          return response([
            {
              id: 'student-s001',
              code: 'S001',
            },
          ]);
        }

        if (
          call.url.includes(
            '/rest/v1/assignment_instances?'
          )
        ) {
          return response([
            {
              id: INSTANCE_ID,
              student_id:
                'student-s002',
              resubmission_count: 0,
            },
          ]);
        }

        throw new Error(
          'SECURITY FAILURE: ownership rejection did not stop request'
        );
      };

    const crossStudent =
      await handler(
        makeEvent({
          cookie:
            studentCookie(
              'S001'
            ),
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
      calls.filter(
        call =>
          call.url.includes(
            '/rpc/create_resubmission'
          )
      ).length,
      0
    );

    console.log(
      '✓ S001 cannot resubmit S002 assignment instance'
    );

    // 3. Even for S001's instance,
    // the original submission must
    // belong to that same instance.
    calls.length = 0;

    responder =
      async (call) => {
        if (
          call.url.includes(
            '/rest/v1/students?'
          )
        ) {
          return response([
            {
              id: 'student-s001',
              code: 'S001',
            },
          ]);
        }

        if (
          call.url.includes(
            '/rest/v1/assignment_instances?'
          )
        ) {
          return response([
            {
              id: INSTANCE_ID,
              student_id:
                'student-s001',
              resubmission_count: 0,
            },
          ]);
        }

        if (
          call.url.includes(
            '/rest/v1/submissions?'
          )
        ) {
          return response([
            {
              id: ORIGINAL_ID,
              instance_id:
                OTHER_INSTANCE_ID,
            },
          ]);
        }

        throw new Error(
          'SECURITY FAILURE: mismatched original reached mutation path'
        );
      };

    const mismatchedOriginal =
      await handler(
        makeEvent({
          cookie:
            studentCookie(
              'S001'
            ),
        })
      );

    assert.strictEqual(
      mismatchedOriginal.statusCode,
      403
    );

    assert.strictEqual(
      calls.filter(
        call =>
          call.url.includes(
            '/rpc/create_resubmission'
          )
      ).length,
      0
    );

    console.log(
      '✓ original submission must belong to requested assignment instance'
    );

    // 4. Valid owner + matching
    // original reaches service-role RPC.
    calls.length = 0;

    responder =
      async (call) => {
        if (
          call.url.includes(
            '/rest/v1/students?'
          )
        ) {
          return response([
            {
              id: 'student-s001',
              code: 'S001',
            },
          ]);
        }

        if (
          call.url.includes(
            '/rest/v1/assignment_instances?'
          )
        ) {
          return response([
            {
              id: INSTANCE_ID,
              student_id:
                'student-s001',
              resubmission_count: 0,
            },
          ]);
        }

        if (
          call.url.includes(
            '/rest/v1/submissions?'
          )
        ) {
          return response([
            {
              id: ORIGINAL_ID,
              instance_id:
                INSTANCE_ID,
            },
          ]);
        }

        if (
          call.url.includes(
            '/rest/v1/rpc/create_resubmission'
          )
        ) {
          return response(
            NEW_SUBMISSION_ID
          );
        }

        throw new Error(
          `Unexpected fetch: ${call.method} ${call.url}`
        );
      };

    const valid =
      await handler(
        makeEvent({
          cookie:
            studentCookie(
              'S001'
            ),
          answers: {
            q1: 'synthetic',
          },
        })
      );

    assert.strictEqual(
      valid.statusCode,
      200
    );

    assert.deepStrictEqual(
      bodyOf(valid),
      {
        ok: true,
        submission_id:
          NEW_SUBMISSION_ID,
      }
    );

    const rpcCall =
      calls.find(
        call =>
          call.url.includes(
            '/rest/v1/rpc/create_resubmission'
          )
      );

    assert.ok(
      rpcCall,
      'Valid owner must reach create_resubmission RPC'
    );

    assert.strictEqual(
      rpcCall.method,
      'POST'
    );

    assert.strictEqual(
      rpcCall.headers.apikey,
      process.env
        .SUPABASE_SERVICE_ROLE_KEY
    );

    assert.strictEqual(
      rpcCall.headers.Authorization,
      'Bearer ' +
        process.env
          .SUPABASE_SERVICE_ROLE_KEY
    );

    assert.deepStrictEqual(
      JSON.parse(
        rpcCall.body
      ),
      {
        p_instance_id:
          INSTANCE_ID,
        p_original_submission_id:
          ORIGINAL_ID,
        p_answers: {
          q1: 'synthetic',
        },
      }
    );

    console.log(
      '✓ valid owner reaches create_resubmission only through service role'
    );

    // 5. Browser adapter itself must no
    // longer contain a direct RPC call.
    const adapterSource =
      fs.readFileSync(
        path.join(
          __dirname,
          '..',
          'site',
          'web',
          'data-adapter.js'
        ),
        'utf8'
      );

    assert.ok(
      !adapterSource.includes(
        ".rpc('create_resubmission'"
      ),
      'Browser adapter must not directly execute create_resubmission'
    );

    assert.ok(
      adapterSource.includes(
        '/.netlify/functions/student-create-resubmission'
      ),
      'Browser adapter must use authenticated Netlify boundary'
    );

    assert.ok(
      adapterSource.includes(
        "credentials: 'include'"
      ),
      'Browser request must include signed student session cookie'
    );

    console.log(
      '✓ browser direct create_resubmission RPC removed'
    );

    console.log(
      '\nAll student create-resubmission boundary tests passed.'
    );
  } finally {
    global.fetch =
      originalFetch;
  }
})().catch((error) => {
  console.error(
    '\nTEST FAILURE:',
    error
  );

  process.exitCode = 1;
});
