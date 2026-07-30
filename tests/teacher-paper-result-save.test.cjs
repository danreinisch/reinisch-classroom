'use strict';

const assert =
  require('node:assert/strict');

const Module =
  require('node:module');

const path =
  require('node:path');

const fs =
  require('node:fs');

const endpointPath =
  path.resolve(
    __dirname,
    '../netlify/functions/teacher-paper-result-save.js'
  );

const TEACHER_ID =
  '11111111-1111-4111-8111-111111111111';

const CLASS_ID =
  '22222222-2222-4222-8222-222222222222';

const STUDENT_ID =
  '33333333-3333-4333-8333-333333333333';

const INSTANCE_ID =
  '44444444-4444-4444-8444-444444444444';

const SUBMISSION_ID =
  '55555555-5555-4555-8555-555555555555';

const ARCHIVE_ID =
  '66666666-6666-4666-8666-666666666666';

let authResult;
let fixtures;
let calls;

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

function bodyOf(options) {
  if (!options || !options.body) {
    return null;
  }

  return JSON.parse(options.body);
}

function reset() {
  authResult = {
    ok: true,
    user: {
      role: 'teacher',
      teacherId: TEACHER_ID,
    },
  };

  fixtures = {
    assignmentType: 'paper',
    assignmentOwned: true,
    studentActive: true,
    enrolled: true,
    instance: null,
    instanceConflict: false,
    submission: null,
    archive: null,
    scoreEarned: undefined,
    totalPossible: undefined,
  };

  calls = [];
}

async function restMock(
  url,
  options = {}
) {
  const method =
    options.method || 'GET';

  const body =
    bodyOf(options);

  calls.push({
    url,
    method,
    body,
  });

  if (
    url.startsWith(
      '/rest/v1/assignments?'
    )
  ) {
    const meta = {
      paper: true,
      student_code: 'S001',
      date_completed: '2026-04-10',
      notes: 'Paper evidence',
    };

    if (
      fixtures.scoreEarned !== undefined
    ) {
      meta.score_earned =
        fixtures.scoreEarned;

      meta.total_possible =
        fixtures.totalPossible;
    }

    return response(
      200,
      [
        {
          id: 901,
          title: 'Paper Evidence',
          type: fixtures.assignmentType,
          series: 'Language Arts 1 SC',
          page: 'https://example.test/paper.pdf',
          meta,
          class_id: CLASS_ID,
          school_year: 2025,
        },
      ]
    );
  }

  if (
    url.startsWith(
      '/rest/v1/classes?'
    )
  ) {
    return response(
      200,
      fixtures.assignmentOwned
        ? [
            {
              id: CLASS_ID,
              name: 'Language Arts 1 SC',
            },
          ]
        : []
    );
  }

  if (
    url.startsWith(
      '/rest/v1/students?'
    )
  ) {
    return response(
      200,
      fixtures.studentActive
        ? [
            {
              id: STUDENT_ID,
              code: 'S001',
              active: true,
            },
          ]
        : []
    );
  }

  if (
    url.startsWith(
      '/rest/v1/class_enrollments?'
    )
  ) {
    return response(
      200,
      fixtures.enrolled
        ? [
            {
              class_id: CLASS_ID,
              student_id: STUDENT_ID,
              active: true,
            },
          ]
        : []
    );
  }

  if (
    url.startsWith(
      '/rest/v1/assignment_instances?'
    ) &&
    method === 'GET'
  ) {
    return response(
      200,
      fixtures.instance
        ? [fixtures.instance]
        : []
    );
  }

  if (
    url ===
      '/rest/v1/assignment_instances' &&
    method === 'POST'
  ) {
    if (
      fixtures.instanceConflict
    ) {
      fixtures.instance = {
        id: INSTANCE_ID,
        assignment_id: 901,
        student_id: STUDENT_ID,
        status: 'Assigned',
        settings: {},
        school_year: 2025,
      };

      return response(
        409,
        {
          code: '23505',
        }
      );
    }

    fixtures.instance = {
      id: INSTANCE_ID,
      ...body,
    };

    return response(
      201,
      [fixtures.instance]
    );
  }

  if (
    url.startsWith(
      '/rest/v1/assignment_instances?'
    ) &&
    method === 'PATCH'
  ) {
    fixtures.instance = {
      ...(fixtures.instance || {
        id: INSTANCE_ID,
        assignment_id: 901,
        student_id: STUDENT_ID,
        settings: {},
        school_year: 2025,
      }),
      ...body,
    };

    return response(
      200,
      [fixtures.instance]
    );
  }

  if (
    url.startsWith(
      '/rest/v1/submissions?'
    ) &&
    method === 'GET'
  ) {
    return response(
      200,
      fixtures.submission
        ? [fixtures.submission]
        : []
    );
  }

  if (
    url ===
      '/rest/v1/submissions' &&
    method === 'POST'
  ) {
    fixtures.submission = {
      id: SUBMISSION_ID,
      ...body,
    };

    return response(
      201,
      [fixtures.submission]
    );
  }

  if (
    url.startsWith(
      '/rest/v1/submissions?'
    ) &&
    method === 'PATCH'
  ) {
    fixtures.submission = {
      ...fixtures.submission,
      ...body,
    };

    return response(
      200,
      [fixtures.submission]
    );
  }

  if (
    url.startsWith(
      '/rest/v1/submission_archives?'
    ) &&
    method === 'GET'
  ) {
    return response(
      200,
      fixtures.archive
        ? [fixtures.archive]
        : []
    );
  }

  if (
    url ===
      '/rest/v1/submission_archives' &&
    method === 'POST'
  ) {
    fixtures.archive = {
      id: ARCHIVE_ID,
      ...body,
    };

    return response(
      201,
      [fixtures.archive]
    );
  }

  throw new Error(
    `Unexpected REST call: ${method} ${url}`
  );
}

const originalLoad =
  Module._load;

process.env.SESSION_SECRET =
  'test-session-secret';

Module._load =
  function patchedLoad(
    request,
    parent,
    isMain
  ) {
    if (
      request === './_lib/http'
    ) {
      return {
        generateRequestId() {
          return 'req-test';
        },
        jsonResponse(
          event,
          statusCode,
          payload,
          headers = {}
        ) {
          return {
            statusCode,
            headers,
            body:
              JSON.stringify(
                payload
              ),
          };
        },
        handleCorsPreFlight() {
          return {
            statusCode: 204,
            headers: {},
            body: '',
          };
        },
      };
    }

    if (
      request === './_lib/auth'
    ) {
      return {
        requireTeacher() {
          return authResult;
        },
      };
    }

    if (
      request === './_lib/supa'
    ) {
      return {
        rest: restMock,
        SUPABASE_URL:
          'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY:
          'service-role-test',
      };
    }

    if (
      request === './_lib/school-year'
    ) {
      return {
        getCurrentSchoolYear() {
          return 2025;
        },
      };
    }

    return originalLoad.call(
      this,
      request,
      parent,
      isMain
    );
  };

delete require.cache[
  require.resolve(endpointPath)
];

const {
  handler,
} = require(endpointPath);

Module._load =
  originalLoad;

function event(body = {}) {
  return {
    httpMethod: 'POST',
    headers: {},
    body:
      JSON.stringify(body),
  };
}

function parsed(result) {
  return {
    statusCode:
      result.statusCode,
    body:
      JSON.parse(
        result.body
      ),
  };
}

function mutations() {
  return calls.filter(
    call =>
      call.method === 'POST' ||
      call.method === 'PATCH' ||
      call.method === 'DELETE'
  );
}

async function run(
  name,
  fn
) {
  reset();

  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(
      `not ok - ${name}`
    );
    throw error;
  }
}

(async () => {
  await run(
    'unauthenticated request stops before Supabase',
    async () => {
      authResult = {
        ok: false,
        statusCode: 401,
      };

      const result =
        parsed(
          await handler(
            event({
              assignmentId: 901,
              studentCode: 'S001',
            })
          )
        );

      assert.equal(
        result.statusCode,
        401
      );

      assert.equal(
        calls.length,
        0
      );
    }
  );

  await run(
    'only canonical PAPER assignment is accepted',
    async () => {
      fixtures.assignmentType = 'html';

      const result =
        parsed(
          await handler(
            event({
              assignmentId: 901,
              studentCode: 'S001',
            })
          )
        );

      assert.equal(
        result.statusCode,
        404
      );

      assert.equal(
        mutations().length,
        0
      );
    }
  );

  await run(
    'teacher must own exact assignment class',
    async () => {
      fixtures.assignmentOwned =
        false;

      const result =
        parsed(
          await handler(
            event({
              assignmentId: 901,
              studentCode: 'S001',
            })
          )
        );

      assert.equal(
        result.statusCode,
        404
      );

      assert.equal(
        mutations().length,
        0
      );
    }
  );

  await run(
    'student must be active',
    async () => {
      fixtures.studentActive =
        false;

      const result =
        parsed(
          await handler(
            event({
              assignmentId: 901,
              studentCode: 'S001',
            })
          )
        );

      assert.equal(
        result.statusCode,
        404
      );

      assert.equal(
        mutations().length,
        0
      );
    }
  );

  await run(
    'same-class active enrollment is required',
    async () => {
      fixtures.enrolled =
        false;

      const result =
        parsed(
          await handler(
            event({
              assignmentId: 901,
              studentCode: 'S001',
            })
          )
        );

      assert.equal(
        result.statusCode,
        404
      );

      assert.equal(
        mutations().length,
        0
      );
    }
  );

  await run(
    'unscored PAPER creates reviewed canonical chain',
    async () => {
      const result =
        parsed(
          await handler(
            event({
              assignmentId: 901,
              studentCode: 'S001',
            })
          )
        );

      assert.equal(
        result.statusCode,
        200
      );

      assert.equal(
        result.body.instance.status,
        'Reviewed'
      );

      assert.equal(
        result.body.submission.review_status,
        'reviewed'
      );

      assert.equal(
        result.body.submission.score_total,
        null
      );

      assert.equal(
        result.body.archive.submission_id,
        SUBMISSION_ID
      );

      assert.equal(
        result.body.archive.student_id,
        STUDENT_ID
      );

      assert.equal(
        String(
          result.body.archive.assignment_id
        ),
        '901'
      );
    }
  );

  await run(
    'score zero remains zero',
    async () => {
      fixtures.scoreEarned = 0;
      fixtures.totalPossible = 10;

      const result =
        parsed(
          await handler(
            event({
              assignmentId: 901,
              studentCode: 'S001',
            })
          )
        );

      assert.equal(
        result.statusCode,
        200
      );

      assert.equal(
        result.body.submission.score_manual,
        0
      );

      assert.equal(
        result.body.submission.score_total,
        0
      );

      assert.equal(
        result.body.archive.score_total,
        0
      );
    }
  );

  await run(
    'retry reuses canonical submission and archive',
    async () => {
      fixtures.instance = {
        id: INSTANCE_ID,
        assignment_id: 901,
        student_id: STUDENT_ID,
        status: 'Reviewed',
        settings: {},
        school_year: 2025,
      };

      fixtures.submission = {
        id: SUBMISSION_ID,
        instance_id: INSTANCE_ID,
        answers: {},
        score_auto: null,
        score_manual: null,
        score_total: null,
        feedback: 'Paper evidence',
        submitted_at:
          '2026-04-10T00:00:00.000Z',
        review_status: 'reviewed',
        school_year: 2025,
      };

      fixtures.archive = {
        id: ARCHIVE_ID,
        submission_id: SUBMISSION_ID,
        student_id: STUDENT_ID,
        assignment_id: '901',
      };

      const result =
        parsed(
          await handler(
            event({
              assignmentId: 901,
              studentCode: 'S001',
            })
          )
        );

      assert.equal(
        result.statusCode,
        200
      );

      assert.equal(
        result.body.created.archive,
        false
      );

      const archiveCreates =
        calls.filter(
          call =>
            call.method === 'POST' &&
            call.url ===
              '/rest/v1/submission_archives'
        );

      assert.equal(
        archiveCreates.length,
        0
      );
    }
  );

  await run(
    'instance-create race reuses canonical instance',
    async () => {
      fixtures.instanceConflict =
        true;

      const result =
        parsed(
          await handler(
            event({
              assignmentId: 901,
              studentCode: 'S001',
            })
          )
        );

      assert.equal(
        result.statusCode,
        200
      );

      assert.equal(
        result.body.instance.id,
        INSTANCE_ID
      );

      assert.equal(
        result.body.instance.status,
        'Reviewed'
      );
    }
  );

  const source =
    fs.readFileSync(
      endpointPath,
      'utf8'
    );

  for (
    const forbidden of [
      'process_' + 'submission',
      'goal_' + 'progress',
      'goal_' + 'data_points',
      'assignment_' + 'goal_rollups',
      'is_' + 'teacher_of',
      'lookupActive' + 'TeacherId',
    ]
  ) {
    assert.equal(
      source.includes(
        forbidden
      ),
      false,
      `endpoint must not contain ${forbidden}`
    );
  }

  console.log(
    'ok - forbidden side-effect/source tripwires'
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
