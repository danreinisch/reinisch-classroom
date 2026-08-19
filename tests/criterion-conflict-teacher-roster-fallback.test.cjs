'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const endpointPath =
  require.resolve(
    '../netlify/functions/teacher-roster-context'
  );

const authPath =
  require.resolve(
    '../netlify/functions/_lib/auth'
  );

const httpPath =
  require.resolve(
    '../netlify/functions/_lib/http'
  );

const supaPath =
  require.resolve(
    '../netlify/functions/_lib/supa'
  );

const root =
  path.resolve(
    __dirname,
    '..'
  );

const endpointSource =
  fs.readFileSync(
    endpointPath,
    'utf8'
  );

const packageJson =
  JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        'package.json'
      ),
      'utf8'
    )
  );


function response(
  status,
  data
) {
  return {
    ok:
      status >= 200 &&
      status < 300,

    status,

    async json() {
      return data;
    },
  };
}


function loadEndpoint(
  mode,
  restCalls
) {
  process.env.SESSION_SECRET =
    'synthetic-session-secret';

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      requireTeacher() {
        return {
          ok: true,
          user: {
            username: 'teacher',
          },
        };
      },
    },
  };

  require.cache[httpPath] = {
    id: httpPath,
    filename: httpPath,
    loaded: true,
    exports: {
      generateRequestId() {
        return 'criterion-fallback-test';
      },

      jsonResponse(
        _event,
        statusCode,
        body,
        headers = {}
      ) {
        return {
          statusCode,
          headers,
          body:
            JSON.stringify(body),
        };
      },

      handleCorsPreFlight() {
        return {
          statusCode: 204,
          body: '',
        };
      },
    },
  };

  require.cache[supaPath] = {
    id: supaPath,
    filename: supaPath,
    loaded: true,
    exports: {
      getSupabaseConfig() {
        return {
          url:
            'http://127.0.0.1:54321',
          key:
            'synthetic-service-key',
        };
      },

      async rest(
        requestPath
      ) {
        restCalls.push(
          requestPath
        );

        if (
          requestPath.startsWith(
            '/rest/v1/students'
          )
        ) {
          return response(
            200,
            [
              {
                id: 'student-1',
                code: 'S900',
                name: 'Synthetic Student',
                active: true,
              },
            ]
          );
        }

        if (
          requestPath.startsWith(
            '/rest/v1/goals'
          )
        ) {
          const enriched =
            requestPath.includes(
              'measurement_type'
            );

          if (
            mode ===
              'criterion-column-missing' &&
            enriched
          ) {
            return response(
              400,
              {
                code: '42703',
                message:
                  'column criterion_conflict does not exist',
              }
            );
          }

          if (
            mode ===
              'other-column-missing' &&
            enriched
          ) {
            return response(
              400,
              {
                code: '42703',
                message:
                  'column measurement_type does not exist',
              }
            );
          }

          return response(
            200,
            [
              {
                id: 'goal-1',
                student_id: 'student-1',
                code: 'S900.CG1',
                desc: 'Synthetic goal',
                target: '60%',
                status: 'Open',
                criterion_conflict: true,
                students: {
                  code: 'S900',
                },
              },
            ]
          );
        }

        if (
          requestPath.startsWith(
            '/rest/v1/class_enrollments'
          )
        ) {
          return response(
            200,
            []
          );
        }

        if (
          requestPath.startsWith(
            '/rest/v1/classes'
          )
        ) {
          return response(
            200,
            []
          );
        }

        return response(
          404,
          {
            error: 'synthetic not found',
          }
        );
      },

      async jsonRes(
        res
      ) {
        return {
          ok: res.ok,
          status: res.status,
          data:
            await res.json(),
        };
      },
    },
  };

  delete require.cache[
    endpointPath
  ];

  return require(
    endpointPath
  );
}


async function unrelatedSchemaFallbackCase() {
  const restCalls = [];

  const endpoint =
    loadEndpoint(
      'other-column-missing',
      restCalls
    );

  const result =
    await endpoint.handler({
      httpMethod: 'GET',
      headers: {},
    });

  assert.strictEqual(
    result.statusCode,
    200
  );

  const body =
    JSON.parse(
      result.body
    );

  assert.strictEqual(
    body.ok,
    true
  );

  assert.strictEqual(
    body.goals.length,
    1
  );

  assert.strictEqual(
    body.goals[0].criterion_conflict,
    true,
    'legacy fallback must preserve explicit conflict metadata'
  );

  const goalCalls =
    restCalls.filter(
      value =>
        value.startsWith(
          '/rest/v1/goals'
        )
    );

  assert.strictEqual(
    goalCalls.length,
    2,
    'unrelated schema drift should retain the established fallback'
  );

  assert.ok(
    goalCalls[1].includes(
      'criterion_conflict'
    ),
    'reduced fallback must still request criterion_conflict'
  );

  assert.strictEqual(
    goalCalls[1].includes(
      'measurement_type'
    ),
    false,
    'reduced fallback should omit the unrelated unavailable enriched field'
  );
}


async function missingCriterionColumnCase() {
  const restCalls = [];

  const endpoint =
    loadEndpoint(
      'criterion-column-missing',
      restCalls
    );

  const result =
    await endpoint.handler({
      httpMethod: 'GET',
      headers: {},
    });

  assert.strictEqual(
    result.statusCode,
    502,
    'missing safety metadata must fail closed'
  );

  const body =
    JSON.parse(
      result.body
    );

  assert.strictEqual(
    body.ok,
    false
  );

  const goalCalls =
    restCalls.filter(
      value =>
        value.startsWith(
          '/rest/v1/goals'
        )
    );

  assert.strictEqual(
    goalCalls.length,
    1,
    'missing criterion column must not trigger a target-only fallback'
  );
}


async function run() {
  console.log(
    'Running Teacher roster criterion fallback tests...\n'
  );

  await unrelatedSchemaFallbackCase();

  console.log(
    'PASS: unrelated schema drift retains compatibility fallback'
  );

  console.log(
    'PASS: reduced fallback preserves explicit criterion conflict'
  );

  await missingCriterionColumnCase();

  console.log(
    'PASS: missing criterion-conflict schema fails closed'
  );

  assert.ok(
    endpointSource.includes(
      'isCriterionConflictSchemaError'
    )
  );

  assert.ok(
    endpointSource.includes(
      "'criterion_conflict,'"
    )
  );

  assert.ok(
    endpointSource.includes(
      'goals criterion-conflict metadata unavailable'
    )
  );

  const unit =
    String(
      packageJson.scripts?.[
        'test:unit'
      ] || ''
    );

  const testName =
    'tests/criterion-conflict-teacher-roster-fallback.test.cjs';

  assert.strictEqual(
    unit.split(
      testName
    ).length - 1,
    1,
    'Teacher roster fallback regression must be wired exactly once'
  );

  console.log(
    'PASS: permanent fallback regression is wired'
  );

  console.log();
  console.log(
    'TEACHER ROSTER CRITERION FALLBACK: PASS'
  );
}


run().catch(
  error => {
    console.error(
      error
    );

    process.exitCode =
      1;
  }
);
