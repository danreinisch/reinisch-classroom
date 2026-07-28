'use strict';

const assert =
  require('assert');

const path =
  require('path');

process.env.SESSION_SECRET =
  'rc-sec-01g-test-secret';

const endpointPath =
  path.resolve(
    __dirname,
    '../netlify/functions/teacher-review-submission-answers.js'
  );

const authPath =
  require.resolve(
    '../netlify/functions/_lib/auth'
  );

const supaPath =
  require.resolve(
    '../netlify/functions/_lib/supa'
  );

const teacherId =
  '11111111-1111-4111-8111-111111111111';

const classId =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const studentId =
  '22222222-2222-4222-8222-222222222222';

const outsideStudentId =
  '33333333-3333-4333-8333-333333333333';

const submissionId =
  '44444444-4444-4444-8444-444444444444';

const instanceId =
  '55555555-5555-4555-8555-555555555555';

let authResult;
let restCalls;
let restHandler;

function response(status, body) {
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

  restHandler =
    async (url) => {
      if (
        url.startsWith(
          '/rest/v1/submissions?'
        )
      ) {
        return response(
          200,
          [{
            id: submissionId,
            instance_id: instanceId,
          }]
        );
      }

      if (
        url.startsWith(
          '/rest/v1/assignment_instances?'
        )
      ) {
        return response(
          200,
          [{
            id: instanceId,
            student_id: studentId,
          }]
        );
      }

      if (
        url.startsWith(
          '/rest/v1/classes?'
        )
      ) {
        return response(
          200,
          [{
            id: classId,
          }]
        );
      }

      if (
        url.startsWith(
          '/rest/v1/class_enrollments?'
        )
      ) {
        return response(
          200,
          [{
            student_id: studentId,
            active: true,
          }]
        );
      }

      if (
        url.startsWith(
          '/rest/v1/submission_answers?'
        )
      ) {
        return response(
          200,
          [{
            id:
              '66666666-6666-4666-8666-666666666666',
            submission_id:
              submissionId,
            assignment_item_id:
              701,
            raw_answer: {
              value: 'A',
            },
            is_correct:
              true,
            earned_points:
              2,
            max_points:
              2,
            teacher_note:
              'Nice work',
            scored_at:
              '2026-09-01T15:30:00.000Z',
            assignment_items: {
              id: 701,
              item_ref: 'Q1',
              answer_type: 'mcq',
              points: 2,
              meta: {
                question:
                  'Test question',
                correct: 'A',
              },
            },
          }]
        );
      }

      if (
        url.startsWith(
          '/rest/v1/assignment_item_mappings?'
        )
      ) {
        return response(
          200,
          [{
            item_id: 701,
            dese_codes: [
              '9-10.RL.1.A',
            ],
            goal_codes: [
              'READ-COMP',
            ],
            weight: 1.5,
          }]
        );
      }

      throw new Error(
        `Unexpected REST call: ${url}`
      );
    };

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      requireTeacher() {
        return authResult;
      },
    },
  };

  require.cache[supaPath] = {
    id: supaPath,
    filename: supaPath,
    loaded: true,
    exports: {
      SUPABASE_URL:
        'https://example.supabase.co',

      SUPABASE_SERVICE_ROLE_KEY:
        'service-role-test-key',

      async rest(url, init) {
        restCalls.push({
          url,
          init,
        });

        return restHandler(
          url,
          init
        );
      },
    },
  };

  delete require.cache[
    require.resolve(endpointPath)
  ];
}

function loadHandler() {
  return require(endpointPath)
    .handler;
}

function event(query = {}) {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: query,
  };
}

function body(result) {
  return JSON.parse(
    result.body
  );
}

async function test(
  name,
  fn
) {
  try {
    installMocks();

    await fn();

    console.log(
      `✓ ${name}`
    );
  } catch (err) {
    console.error(
      `✗ ${name}`
    );

    throw err;
  }
}

(async () => {
  console.log(
    '--- teacher-review-submission-answers tests ---'
  );

  await test(
    'unauthenticated request returns 401 before Supabase access',
    async () => {
      authResult = {
        ok: false,
      };

      const result =
        await loadHandler()(
          event({
            submission_id:
              submissionId,
          })
        );

      assert.strictEqual(
        result.statusCode,
        401
      );

      assert.strictEqual(
        restCalls.length,
        0
      );
    }
  );

  await test(
    'verified session without teacherId returns 403 before Supabase access',
    async () => {
      authResult = {
        ok: true,
        user: {
          role: 'teacher',
          username:
            'teacher_test',
          teacherId: null,
        },
      };

      const result =
        await loadHandler()(
          event({
            submission_id:
              submissionId,
          })
        );

      assert.strictEqual(
        result.statusCode,
        403
      );

      assert.strictEqual(
        restCalls.length,
        0
      );
    }
  );

  await test(
    'invalid submission_id returns 400 before Supabase access',
    async () => {
      const result =
        await loadHandler()(
          event({
            submission_id:
              'not-a-uuid',
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
    }
  );

  await test(
    'owned submission returns exact flattened Review answer shape',
    async () => {
      const result =
        await loadHandler()(
          event({
            submission_id:
              submissionId,
          })
        );

      assert.strictEqual(
        result.statusCode,
        200
      );

      const payload =
        body(result);

      assert.deepStrictEqual(
        payload.answers,
        [{
          id:
            '66666666-6666-4666-8666-666666666666',
          submission_id:
            submissionId,
          item_id:
            701,
          raw_answer: {
            value: 'A',
          },
          is_correct:
            true,
          earned_points:
            2,
          max_points:
            2,
          teacher_note:
            'Nice work',
          scored_at:
            '2026-09-01T15:30:00.000Z',
          item_ref:
            'Q1',
          answer_type:
            'mcq',
          points:
            2,
          meta: {
            question:
              'Test question',
            correct:
              'A',
          },
          dese_codes: [
            '9-10.RL.1.A',
          ],
          goal_codes: [
            'READ-COMP',
          ],
          weight:
            1.5,
        }]
      );

      assert.ok(
        restCalls.some(
          ({ url }) =>
            url.includes(
              `teacher_id=eq.${teacherId}`
            )
        ),
        'class lookup must scope by signed teacherId'
      );

      assert.ok(
        restCalls.some(
          ({ url }) =>
            url.startsWith(
              '/rest/v1/submission_answers?'
            )
        ),
        'owned submission must reach answer read'
      );
    }
  );

  await test(
    'outside-teacher submission returns 404 before answer read',
    async () => {
      restHandler =
        async (url) => {
          if (
            url.startsWith(
              '/rest/v1/submissions?'
            )
          ) {
            return response(
              200,
              [{
                id: submissionId,
                instance_id:
                  instanceId,
              }]
            );
          }

          if (
            url.startsWith(
              '/rest/v1/assignment_instances?'
            )
          ) {
            return response(
              200,
              [{
                id:
                  instanceId,
                student_id:
                  outsideStudentId,
              }]
            );
          }

          if (
            url.startsWith(
              '/rest/v1/classes?'
            )
          ) {
            return response(
              200,
              [{
                id: classId,
              }]
            );
          }

          if (
            url.startsWith(
              '/rest/v1/class_enrollments?'
            )
          ) {
            return response(
              200,
              []
            );
          }

          throw new Error(
            `Answer read must not occur: ${url}`
          );
        };

      const result =
        await loadHandler()(
          event({
            submission_id:
              submissionId,
          })
        );

      assert.strictEqual(
        result.statusCode,
        404
      );

      assert.ok(
        !restCalls.some(
          ({ url }) =>
            url.startsWith(
              '/rest/v1/submission_answers?'
            )
        ),
        'outside submission must not reach submission_answers'
      );
    }
  );

  console.log();
  console.log(
    'RC-SEC-01G endpoint tests PASS'
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
