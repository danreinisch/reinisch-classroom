'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const endpointPath =
  path.resolve(
    __dirname,
    '../netlify/functions/teacher-gradebook-save-score.js'
  );

const TEACHER_ID =
  '11111111-1111-4111-8111-111111111111';

const CLASS_ID =
  '22222222-2222-4222-8222-222222222222';

const STUDENT_ID =
  '33333333-3333-4333-8333-333333333333';

const INSTANCE_ID =
  '44444444-4444-4444-8444-444444444444';

const NEW_INSTANCE_ID =
  '55555555-5555-4555-8555-555555555555';

const ANSWERED_SUBMISSION_ID =
  '66666666-6666-4666-8666-666666666666';

const EMPTY_SUBMISSION_ID =
  '77777777-7777-4777-8777-777777777777';

const NEW_SUBMISSION_ID =
  '88888888-8888-4888-8888-888888888888';

let authResult;
let fixtures;
let calls;

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
    async text() {
      return JSON.stringify(data);
    },
  };
}

function resetFixtures() {
  authResult = {
    ok: true,
    user: {
      role: 'teacher',
      teacherId: TEACHER_ID,
    },
  };

  calls = [];

  fixtures = {
    assignmentExists: true,
    teacherOwnsClass: true,
    studentExists: true,
    enrollmentActive: true,
    instanceCreateConflict: false,
    instance: {
      id: INSTANCE_ID,
      assignment_id: 101,
      student_id: STUDENT_ID,
      status: 'Assigned',
      settings: {},
      school_year: 2025,
    },
    submissions: [],
  };
}

function parseBody(options) {
  if (
    !options ||
    !options.body
  ) {
    return null;
  }

  return JSON.parse(
    options.body
  );
}

async function restMock(
  url,
  options = {}
) {
  const method =
    options.method || 'GET';

  calls.push({
    url,
    method,
    body:
      parseBody(options),
  });

  if (
    url.startsWith(
      '/rest/v1/assignments?'
    )
  ) {
    return response(
      200,
      fixtures.assignmentExists
        ? [
            {
              id: 101,
              class_id: CLASS_ID,
              school_year: 2025,
            },
          ]
        : []
    );
  }

  if (
    url.startsWith(
      '/rest/v1/classes?'
    )
  ) {
    return response(
      200,
      fixtures.teacherOwnsClass
        ? [{ id: CLASS_ID }]
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
      fixtures.studentExists
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
      fixtures.enrollmentActive
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
    const body =
      parseBody(options);

    if (
      fixtures.instanceCreateConflict
    ) {
      fixtures.instance = {
        id: NEW_INSTANCE_ID,
        ...body,
      };

      return response(
        409,
        {
          code: '23505',
          message:
            'duplicate key value violates unique constraint',
        }
      );
    }

    fixtures.instance = {
      id: NEW_INSTANCE_ID,
      ...body,
    };

    return response(
      201,
      [fixtures.instance]
    );
  }

  if (
    url.startsWith(
      '/rest/v1/assignment_instances?id=eq.'
    ) &&
    method === 'PATCH'
  ) {
    const body =
      parseBody(options);

    fixtures.instance = {
      ...fixtures.instance,
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
      fixtures.submissions
    );
  }

  if (
    url.startsWith(
      '/rest/v1/submissions?id=eq.'
    ) &&
    method === 'PATCH'
  ) {
    const submissionId =
      decodeURIComponent(
        url
          .split('id=eq.')[1]
          .split('&')[0]
      );

    const index =
      fixtures.submissions.findIndex(
        (item) =>
          item.id === submissionId
      );

    assert.ok(
      index >= 0,
      'PATCH must target an existing submission'
    );

    const body =
      parseBody(options);

    fixtures.submissions[index] = {
      ...fixtures.submissions[index],
      ...body,
    };

    return response(
      200,
      [fixtures.submissions[index]]
    );
  }

  if (
    url === '/rest/v1/submissions' &&
    method === 'POST'
  ) {
    const body =
      parseBody(options);

    const created = {
      id: NEW_SUBMISSION_ID,
      submitted_at:
        '2026-07-29T20:00:00.000Z',
      review_status: 'pending',
      submission_type: 'initial',
      source_type: 'portal',
      ...body,
    };

    fixtures.submissions.push(
      created
    );

    return response(
      201,
      [created]
    );
  }

  throw new Error(
    `Unexpected REST call: ${method} ${url}`
  );
}

const originalLoad =
  Module._load;

Module._load =
  function patchedLoad(
    request,
    parent,
    isMain
  ) {
    if (
      parent &&
      parent.filename === endpointPath
    ) {
      if (
        request === './_lib/http'
      ) {
        return {
          generateRequestId:
            () => 'gradebook-test',
          jsonResponse:
            (
              _event,
              statusCode,
              data,
              headers
            ) => ({
              statusCode,
              headers,
              body:
                JSON.stringify(data),
            }),
          handleCorsPreFlight:
            () => ({
              statusCode: 204,
              body: '',
            }),
        };
      }

      if (
        request === './_lib/auth'
      ) {
        return {
          requireTeacher:
            () => authResult,
        };
      }

      if (
        request === './_lib/supa'
      ) {
        return {
          rest:
            restMock,
          SUPABASE_URL:
            'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY:
            'test-service-role',
        };
      }

      if (
        request === './_lib/school-year'
      ) {
        return {
          getCurrentSchoolYear:
            () => 2025,
        };
      }
    }

    return originalLoad(
      request,
      parent,
      isMain
    );
  };

process.env.SESSION_SECRET =
  'test-session-secret';

delete require.cache[endpointPath];

const {
  handler,
} = require(endpointPath);

const endpointSource =
  require('node:fs').readFileSync(
    endpointPath,
    'utf8'
  );

assert.equal(
  endpointSource.includes(
    '/rest/v1/rpc/process_submission'
  ),
  false,
  'signed Gradebook writer must not contain stale process_submission RPC'
);

Module._load =
  originalLoad;

function event(body) {
  return {
    httpMethod: 'POST',
    headers: {},
    body:
      JSON.stringify(body),
  };
}

function payload(result) {
  return JSON.parse(
    result.body
  );
}

async function run() {
  let passed = 0;

  resetFixtures();

  authResult = {
    ok: false,
  };

  let result =
    await handler(
      event({
        assignmentId: 101,
        studentCode: 'S001',
        score: 80,
      })
    );

  assert.equal(
    result.statusCode,
    401
  );

  assert.equal(
    calls.length,
    0
  );

  console.log(
    'OK unauthenticated request stops before Supabase'
  );

  passed++;

  resetFixtures();

  result =
    await handler(
      event({
        assignmentId:
          'MANUAL_NOT_CANONICAL',
        studentCode: 'S001',
        score: 80,
      })
    );

  assert.equal(
    result.statusCode,
    400
  );

  assert.equal(
    calls.length,
    0
  );

  console.log(
    'OK non-canonical MANUAL_* assignment IDs are rejected'
  );

  passed++;

  resetFixtures();

  fixtures.teacherOwnsClass =
    false;

  result =
    await handler(
      event({
        assignmentId: 101,
        studentCode: 'S001',
        score: 80,
      })
    );

  assert.equal(
    result.statusCode,
    404
  );

  assert.equal(
    calls.some(
      (call) =>
        call.method !== 'GET'
    ),
    false
  );

  console.log(
    'OK another teacher class fails before mutation'
  );

  passed++;

  resetFixtures();

  fixtures.enrollmentActive =
    false;

  result =
    await handler(
      event({
        assignmentId: 101,
        studentCode: 'S001',
        score: 80,
      })
    );

  assert.equal(
    result.statusCode,
    404
  );

  assert.equal(
    calls.some(
      (call) =>
        call.method !== 'GET'
    ),
    false
  );

  console.log(
    'OK same-class active enrollment is mandatory'
  );

  passed++;

  resetFixtures();

  fixtures.instance.settings = {
    non_instructional: true,
  };

  result =
    await handler(
      event({
        assignmentId: 101,
        studentCode: 'S001',
        score: 80,
      })
    );

  assert.equal(
    result.statusCode,
    404
  );

  assert.equal(
    calls.some(
      (call) =>
        call.method !== 'GET'
    ),
    false
  );

  console.log(
    'OK non-instructional instance fails closed'
  );

  passed++;

  resetFixtures();

  fixtures.submissions = [
    {
      id: EMPTY_SUBMISSION_ID,
      instance_id: INSTANCE_ID,
      answers: {},
      score_total: null,
      submitted_at:
        '2026-03-10T12:00:00.000Z',
      review_status: 'pending',
      submission_type: 'resubmission',
      original_submission_id:
        ANSWERED_SUBMISSION_ID,
      feedback: 'keep me',
      school_year: 2025,
    },
    {
      id: ANSWERED_SUBMISSION_ID,
      instance_id: INSTANCE_ID,
      answers: {
        q1: 'A',
      },
      score_total: 50,
      submitted_at:
        '2026-02-10T12:00:00.000Z',
      review_status: 'finalized',
      submission_type: 'initial',
      original_submission_id: null,
      feedback: 'preserve me',
      school_year: 2025,
    },
  ];

  const originalSubmittedAt =
    fixtures.submissions[1]
      .submitted_at;

  result =
    await handler(
      event({
        assignmentId: 101,
        studentCode: 'S001',
        score: 0,
      })
    );

  assert.equal(
    result.statusCode,
    200
  );

  const updatedPayload =
    payload(result);

  assert.equal(
    updatedPayload.submission.id,
    ANSWERED_SUBMISSION_ID,
    'answered work must beat newer empty shell'
  );

  assert.equal(
    updatedPayload.submission.score_total,
    0,
    'score zero must remain numeric zero'
  );

  assert.equal(
    updatedPayload.submission.submitted_at,
    originalSubmittedAt,
    'teacher grade edit must preserve submitted_at'
  );

  assert.equal(
    updatedPayload.submission.review_status,
    'finalized'
  );

  assert.equal(
    updatedPayload.submission.feedback,
    'preserve me'
  );

  assert.deepEqual(
    updatedPayload.submission.answers,
    {
      q1: 'A',
    }
  );

  const submissionPatches =
    calls.filter(
      (call) =>
        call.method === 'PATCH' &&
        call.url.startsWith(
          '/rest/v1/submissions?id=eq.'
        )
    );

  assert.equal(
    submissionPatches.length,
    1
  );

  assert.deepEqual(
    submissionPatches[0].body,
    {
      score_total: 0,
    },
    'existing grade edit must PATCH score_total only'
  );

  assert.equal(
    calls.filter(
      (call) =>
        call.method === 'POST' &&
        call.url ===
          '/rest/v1/submissions'
    ).length,
    0,
    'existing grade must not manufacture a duplicate submission'
  );

  assert.equal(
    calls.filter(
      (call) =>
        call.url ===
          '/rest/v1/rpc/process_submission'
    ).length,
    0,
    'Gradebook save must never invoke stale process_submission RPC'
  );

  assert.equal(
    fixtures.instance.status,
    'Submitted'
  );

  console.log(
    'OK existing answered submission is updated without duplicate or timestamp rewrite'
  );

  passed++;

  resetFixtures();

  fixtures.instance =
    null;

  fixtures.submissions =
    [];

  result =
    await handler(
      event({
        assignmentId: 101,
        studentCode: 'S001',
        score: 75,
      })
    );

  assert.equal(
    result.statusCode,
    200
  );

  const createdPayload =
    payload(result);

  assert.equal(
    createdPayload.created_instance,
    true
  );

  assert.equal(
    createdPayload.created_submission,
    true
  );

  assert.equal(
    createdPayload.submission.score_total,
    75
  );

  assert.deepEqual(
    createdPayload.submission.answers,
    {}
  );

  assert.equal(
    createdPayload.submission.school_year,
    2025
  );

  assert.equal(
    createdPayload.instance.status,
    'Submitted'
  );

  const instanceCreate =
    calls.find(
      (call) =>
        call.method === 'POST' &&
        call.url ===
          '/rest/v1/assignment_instances'
    );

  assert.ok(
    instanceCreate
  );

  assert.deepEqual(
    instanceCreate.body,
    {
      assignment_id: 101,
      student_id: STUDENT_ID,
      status: 'Assigned',
      settings: {},
      school_year: 2025,
    }
  );

  const submissionCreate =
    calls.find(
      (call) =>
        call.method === 'POST' &&
        call.url ===
          '/rest/v1/submissions'
    );

  assert.ok(
    submissionCreate
  );

  assert.deepEqual(
    submissionCreate.body,
    {
      instance_id:
        NEW_INSTANCE_ID,
      answers: {},
      score_total: 75,
      school_year: 2025,
    }
  );

  console.log(
    'OK missing instance/submission are created canonically'
  );

  passed++;

  resetFixtures();

  fixtures.instance =
    null;

  fixtures.instanceCreateConflict =
    true;

  fixtures.submissions =
    [];

  result =
    await handler(
      event({
        assignmentId: 101,
        studentCode: 'S001',
        score: 65,
      })
    );

  assert.equal(
    result.statusCode,
    200
  );

  const racePayload =
    payload(result);

  assert.equal(
    racePayload.created_instance,
    false,
    'request losing instance-create race must reuse canonical row'
  );

  assert.equal(
    racePayload.created_submission,
    true
  );

  assert.equal(
    racePayload.instance.id,
    NEW_INSTANCE_ID
  );

  assert.equal(
    racePayload.submission.instance_id,
    NEW_INSTANCE_ID
  );

  assert.equal(
    racePayload.submission.score_total,
    65
  );

  const instanceReads =
    calls.filter(
      (call) =>
        call.method === 'GET' &&
        call.url.startsWith(
          '/rest/v1/assignment_instances?'
        )
    );

  assert.equal(
    instanceReads.length,
    2,
    'race recovery must re-read exact canonical instance'
  );

  assert.equal(
    calls.filter(
      (call) =>
        call.method === 'POST' &&
        call.url ===
          '/rest/v1/assignment_instances'
    ).length,
    1
  );

  console.log(
    'OK concurrent instance creation conflict reuses canonical instance'
  );

  passed++;

  console.log();
  console.log(
    `${passed} passed, 0 failed`
  );

  console.log(
    'RC-SEC-01I-D1C2 teacher Gradebook score endpoint tests PASS'
  );
}

run().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
