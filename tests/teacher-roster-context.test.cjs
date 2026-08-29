'use strict';

const assert =
  require('assert');

const path =
  require('path');

const root =
  path.resolve(__dirname, '..');

const endpointPath =
  path.join(
    root,
    'netlify/functions/teacher-roster-context.js'
  );

const authPath =
  path.join(
    root,
    'netlify/functions/_lib/auth.js'
  );

const httpPath =
  path.join(
    root,
    'netlify/functions/_lib/http.js'
  );

const supaPath =
  path.join(
    root,
    'netlify/functions/_lib/supa.js'
  );

function response(status, data) {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    async json() {
      return data;
    },
    async text() {
      return JSON.stringify(data);
    },
  };
}

function loadEndpoint({
  authorized,
  restCalls,
}) {
  for (const modulePath of [
    endpointPath,
    authPath,
    httpPath,
    supaPath,
  ]) {
    delete require.cache[
      require.resolve(modulePath)
    ];
  }

  process.env.SESSION_SECRET =
    'rc-sec-01d1-test-secret';

  require.cache[
    require.resolve(authPath)
  ] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      requireTeacher() {
        if (!authorized) {
          return {
            ok: false,
            res: {
              statusCode: 401,
            },
          };
        }

        return {
          ok: true,
          user: {
            username: 'teacher_local',
            role: 'teacher',
          },
        };
      },
    },
  };

  require.cache[
    require.resolve(httpPath)
  ] = {
    id: httpPath,
    filename: httpPath,
    loaded: true,
    exports: {
      generateRequestId() {
        return 'test-request';
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

  require.cache[
    require.resolve(supaPath)
  ] = {
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
      async rest(requestPath) {
        restCalls.push(requestPath);

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
                code: 'E2E01',
                name: 'Synthetic One',
                class_id: 'class-1',
                iep_due: null,
                eval_due: null,
                primary_case_manager: null,
                archived_at: null,
                active: true,
              },
              {
                id: 'student-2',
                code: 'E2E99',
                name: 'Synthetic Ninety Nine',
                class_id: null,
                iep_due: null,
                eval_due: null,
                primary_case_manager: null,
                archived_at: null,
                active: false,
              },
            ]
          );
        }

        if (
          requestPath.startsWith(
            '/rest/v1/goals'
          )
        ) {
          return response(
            200,
            [
              {
                id: 'goal-1',
                student_id: 'student-1',
                code: 'G1',
                desc: 'Synthetic goal',
                target: 80,
                status: 'Open',
                measurement_type: 'percent',
                data_collector: 'Teacher',
                data_collector_email: null,
                class_context: 'ELA',
                goal_area: 'Reading',
                baseline: '40%',
                mastery: '80%',
                criterion_conflict: true,
                case_manager: 'Teacher',
                version: 1,
                observation_config: null,
                notes: null,
                addressed_in_class: true,
                individual_delivery: false,
                students: {
                  code: 'E2E01',
                },
              },
            ]
          );
        }

        if (
          requestPath.startsWith(
            '/rest/v1/goal_objectives'
          )
        ) {
          return response(
            200,
            []
          );
        }

        if (
          requestPath.startsWith(
            '/rest/v1/class_enrollments'
          )
        ) {
          return response(
            200,
            [
              {
                class_id: 'class-1',
                student_id: 'student-1',
                students: {
                  code: 'E2E01',
                  name: 'Synthetic One',
                },
                classes: {
                  id: 'class-1',
                  code: 'LA1',
                  name: 'Language Arts 1 SC',
                },
              },
            ]
          );
        }

        if (
          requestPath.startsWith(
            '/rest/v1/classes'
          )
        ) {
          return response(
            200,
            [
              {
                id: 'class-1',
                code: 'LA1',
                name: 'Language Arts 1 SC',
              },
            ]
          );
        }

        return response(
          404,
          {
            error: 'not found',
          }
        );
      },
      async jsonRes(res) {
        return {
          ok: res.ok,
          status: res.status,
          data:
            await res.json(),
        };
      },
    },
  };

  return require(endpointPath);
}

async function run() {
  {
    const restCalls = [];

    const endpoint =
      loadEndpoint({
        authorized: false,
        restCalls,
      });

    const result =
      await endpoint.handler({
        httpMethod: 'GET',
        headers: {},
      });

    assert.strictEqual(
      result.statusCode,
      401,
      'missing teacher session must return 401'
    );

    assert.strictEqual(
      restCalls.length,
      0,
      'unauthorized request must not contact Supabase'
    );
  }

  {
    const restCalls = [];

    const endpoint =
      loadEndpoint({
        authorized: true,
        restCalls,
      });

    const result =
      await endpoint.handler({
        httpMethod: 'GET',
        headers: {
          cookie: 'tc=synthetic',
        },
      });

    assert.strictEqual(
      result.statusCode,
      200,
      'valid teacher session must return 200'
    );

    const body =
      JSON.parse(result.body);

    assert.strictEqual(
      body.ok,
      true
    );

    assert.deepStrictEqual(
      body.students.map(
        (student) => student.code
      ),
      ['E2E01', 'E2E99']
    );

    assert.deepStrictEqual(
      body.goals,
      [
        {
          id: 'goal-1',
          student_code: 'E2E01',
          code: 'G1',
          desc: 'Synthetic goal',
          target: 80,
          status: 'Open',
          student_id: 'student-1',
          measurement_type: 'percent',
          data_collector: 'Teacher',
          data_collector_email: null,
          class_context: 'ELA',
          goal_area: 'Reading',
          baseline: '40%',
          mastery: '80%',
          criterion_conflict: true,
          case_manager: 'Teacher',
          version: 1,
          observation_config: null,
          notes: null,
          addressed_in_class: true,
          individual_delivery: false,
        },
      ]
    );

    const goalRead =
      restCalls.find(
        requestPath =>
          requestPath.startsWith(
            '/rest/v1/goals'
          )
      );

    assert.ok(
      goalRead &&
      goalRead.includes(
        'criterion_conflict'
      ),
      'signed roster context must select criterion_conflict'
    );

    assert.ok(
      goalRead.includes(
        'addressed_in_class'
      ),
      'signed roster context must select addressed_in_class for manual-evidence UI permission'
    );

    assert.ok(
      goalRead.includes(
        'individual_delivery'
      ),
      'signed roster context must select individual_delivery for manual-evidence UI permission'
    );

    const objectiveRegistryReads =
      restCalls.filter(
        requestPath =>
          requestPath.startsWith(
            '/rest/v1/goal_objectives'
          )
      );

    assert.strictEqual(
      objectiveRegistryReads.length,
      1,
      'signed roster context must perform exactly one live objective-registry read'
    );

    assert.strictEqual(
      body.class_enrollments.length,
      1
    );

    assert.strictEqual(
      body.classes.length,
      1
    );

    assert.strictEqual(
      restCalls.length,
      5,
      'signed endpoint must perform the five bounded roster/objective reads'
    );

    assert.strictEqual(
      result.headers['Cache-Control'],
      'no-store'
    );
  }

  console.log(
    '✓ unauthorized roster-context request fails closed'
  );

  console.log(
    '✓ signed teacher receives synthetic roster context'
  );

  console.log(
    '✓ response preserves students, goals, enrollments, and classes'
  );

  console.log();
  console.log(
    'RC-SEC-01D1 endpoint tests PASS'
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
