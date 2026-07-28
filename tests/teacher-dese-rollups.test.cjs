'use strict';

const assert = require('assert');
const path = require('path');

const endpointPath =
  path.resolve(
    __dirname,
    '../netlify/functions/teacher-dese-rollups.js'
  );

const authPath =
  require.resolve(
    '../netlify/functions/_lib/auth'
  );

const supaPath =
  require.resolve(
    '../netlify/functions/_lib/supa'
  );

const httpPath =
  require.resolve(
    '../netlify/functions/_lib/http'
  );

const schoolYearPath =
  require.resolve(
    '../netlify/functions/_lib/school-year'
  );

const teacherId =
  '11111111-1111-4111-8111-111111111111';

const classId =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const student1Id =
  '22222222-2222-4222-8222-222222222222';

const student2Id =
  '33333333-3333-4333-8333-333333333333';

let authResult;
let restCalls;
let rpcCalls;
let restHandler;
let rpcHandler;
let yearCallCount;

function response(
  status,
  body
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
      return JSON.stringify(body);
    },
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

  restCalls = [];
  rpcCalls = [];
  yearCallCount = 0;

  restHandler =
    async (url) => {
      if (
        url.startsWith(
          '/rest/v1/classes?'
        )
      ) {
        return response(
          200,
          [
            {
              id: classId,
            },
          ]
        );
      }

      if (
        url.startsWith(
          '/rest/v1/class_enrollments?'
        )
      ) {
        return response(
          200,
          [
            {
              student_id: student1Id,
              active: true,
              students: {
                id: student1Id,
                code: 'S001',
                active: true,
              },
            },
            {
              student_id: student2Id,
              active: true,
              students: {
                id: student2Id,
                code: 'S002',
                active: true,
              },
            },
          ]
        );
      }

      throw new Error(
        `Unexpected REST URL: ${url}`
      );
    };

  rpcHandler =
    async (
      name,
      args
    ) => {
      assert.strictEqual(
        name,
        'student_dese_rollups'
      );

      return response(
        200,
        [
          {
            dese_code:
              args.p_student_id === student1Id
                ? '9-10.RL.1.A'
                : '9-10.RL.2.A',
            percent_correct:
              args.p_student_id === student1Id
                ? 75
                : 50,
            total_earned: 3,
            total_possible: 4,
            item_count: 2,
          },
        ]
      );
    };

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      requireTeacher:
        () => authResult,
    },
  };

  require.cache[supaPath] = {
    id: supaPath,
    filename: supaPath,
    loaded: true,
    exports: {
      SUPABASE_URL:
        'https://example.invalid',

      SUPABASE_SERVICE_ROLE_KEY:
        'test-service-role',

      rest:
        async (url, options) => {
          restCalls.push({
            url,
            options,
          });

          return restHandler(
            url,
            options
          );
        },

      rpc:
        async (name, args) => {
          rpcCalls.push({
            name,
            args,
          });

          return rpcHandler(
            name,
            args
          );
        },
    },
  };

  require.cache[httpPath] = {
    id: httpPath,
    filename: httpPath,
    loaded: true,
    exports: {
      generateRequestId:
        () => 'req-test',

      jsonResponse:
        (
          _event,
          statusCode,
          body,
          headers = {}
        ) => ({
          statusCode,
          headers,
          body:
            JSON.stringify(body),
        }),

      handleCorsPreFlight:
        () => ({
          statusCode: 204,
          body: '',
        }),
    },
  };

  require.cache[schoolYearPath] = {
    id: schoolYearPath,
    filename: schoolYearPath,
    loaded: true,
    exports: {
      getOperationalSchoolYear:
        () => {
          yearCallCount += 1;
          return 2026;
        },
    },
  };

  delete require.cache[endpointPath];
}

function event(
  queryStringParameters = {}
) {
  return {
    httpMethod: 'GET',
    headers: {
      cookie: 'tc=fake-signed-cookie',
    },
    queryStringParameters,
  };
}

function bodyOf(result) {
  return JSON.parse(
    result.body
  );
}

async function test(
  name,
  fn
) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

async function run() {
  const originalSessionSecret =
    process.env.SESSION_SECRET;

  process.env.SESSION_SECRET =
    'unit-test-secret';

  try {
    installMocks();

    const {
      handler,
    } = require(endpointPath);

    await test(
      'blocks unauthorized request before Supabase access',
      async () => {
        authResult = {
          ok: false,
        };

        restCalls.length = 0;
        rpcCalls.length = 0;

        const result =
          await handler(
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

        assert.strictEqual(
          rpcCalls.length,
          0
        );
      }
    );

    await test(
      'rejects verified session without teacherId before Supabase access',
      async () => {
        authResult = {
          ok: true,
          user: {
            role: 'teacher',
            username: 'teacher_test',
          },
        };

        restCalls.length = 0;
        rpcCalls.length = 0;

        const result =
          await handler(
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

        assert.strictEqual(
          rpcCalls.length,
          0
        );
      }
    );

    await test(
      'all-student mode uses owned active enrollments and operational year',
      async () => {
        authResult = {
          ok: true,
          user: {
            role: 'teacher',
            username: 'teacher_test',
            teacherId,
          },
        };

        restCalls.length = 0;
        rpcCalls.length = 0;
        yearCallCount = 0;

        const result =
          await handler(
            event({
              school_year: '2025',
            })
          );

        assert.strictEqual(
          result.statusCode,
          200
        );

        const payload =
          bodyOf(result);

        assert.strictEqual(
          payload.ok,
          true
        );

        assert.strictEqual(
          payload.school_year,
          2026,
          'browser-supplied school_year must not override server year'
        );

        assert.strictEqual(
          yearCallCount,
          1
        );

        assert.strictEqual(
          rpcCalls.length,
          2
        );

        for (
          const call
          of rpcCalls
        ) {
          assert.strictEqual(
            call.name,
            'student_dese_rollups'
          );

          assert.strictEqual(
            call.args.p_school_year,
            2026
          );
        }

        assert.deepStrictEqual(
          payload.rows.map(
            (row) =>
              row.student_code
          ).sort(),
          [
            'S001',
            'S002',
          ]
        );

        assert.ok(
          restCalls[0].url.includes(
            `teacher_id=eq.${teacherId}`
          ),
          'class query must scope by signed teacherId'
        );
      }
    );

    await test(
      'per-student mode returns only a student in teacher-owned enrollment set',
      async () => {
        restCalls.length = 0;
        rpcCalls.length = 0;

        const result =
          await handler(
            event({
              student_code: 'S001',
            })
          );

        assert.strictEqual(
          result.statusCode,
          200
        );

        const payload =
          bodyOf(result);

        assert.strictEqual(
          payload.rows.length,
          1
        );

        assert.strictEqual(
          payload.rows[0].student_code,
          'S001'
        );

        assert.strictEqual(
          rpcCalls.length,
          1
        );

        assert.strictEqual(
          rpcCalls[0].args.p_student_id,
          student1Id
        );
      }
    );

    await test(
      'student outside teacher-owned enrollment set is denied without rollup RPC',
      async () => {
        restCalls.length = 0;
        rpcCalls.length = 0;

        const result =
          await handler(
            event({
              student_code: 'S999',
            })
          );

        assert.strictEqual(
          result.statusCode,
          404
        );

        assert.strictEqual(
          rpcCalls.length,
          0
        );
      }
    );

    await test(
      'invalid student code is rejected before database access',
      async () => {
        restCalls.length = 0;
        rpcCalls.length = 0;

        const result =
          await handler(
            event({
              student_code:
                '../../students',
            })
          );

        assert.strictEqual(
          result.statusCode,
          400
        );

        assert.strictEqual(
          restCalls.length,
          0
        );

        assert.strictEqual(
          rpcCalls.length,
          0
        );
      }
    );

    console.log();
    console.log(
      'RC-SEC-01E-T1 endpoint tests PASS'
    );
  } finally {
    if (
      originalSessionSecret === undefined
    ) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET =
        originalSessionSecret;
    }
  }
}

run().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
