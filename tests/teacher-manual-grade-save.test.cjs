'use strict';

const assert =
  require('node:assert/strict');

const Module =
  require('node:module');

const path =
  require('node:path');

const endpointPath =
  path.resolve(
    __dirname,
    '../netlify/functions/teacher-manual-grade-save.js'
  );

const TEACHER_ID =
  '11111111-1111-4111-8111-111111111111';

const CLASS_ID =
  '22222222-2222-4222-8222-222222222222';

const STUDENT_1_ID =
  '33333333-3333-4333-8333-333333333333';

const STUDENT_2_ID =
  '44444444-4444-4444-8444-444444444444';

const INSTANCE_1_ID =
  '55555555-5555-4555-8555-555555555555';

const INSTANCE_2_ID =
  '66666666-6666-4666-8666-666666666666';

const SUBMISSION_1_ID =
  '77777777-7777-4777-8777-777777777777';

const SUBMISSION_2_ID =
  '88888888-8888-4888-8888-888888888888';

let authResult;
let failEnrollmentFor;
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

function parseBody(options) {
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

  failEnrollmentFor = null;
  calls = [];
}

function studentForUrl(url) {
  if (url.includes('code=eq.S001')) {
    return {
      id: STUDENT_1_ID,
      code: 'S001',
      active: true,
    };
  }

  if (url.includes('code=eq.S002')) {
    return {
      id: STUDENT_2_ID,
      code: 'S002',
      active: true,
    };
  }

  return null;
}

async function restMock(
  url,
  options = {}
) {
  const method =
    options.method || 'GET';

  const body =
    parseBody(options);

  calls.push({
    url,
    method,
    body,
  });

  if (
    url.startsWith('/rest/v1/classes?') &&
    method === 'GET'
  ) {
    return response(
      200,
      [{
        id: CLASS_ID,
        name: 'Language Arts 1 SC',
        teacher_id: TEACHER_ID,
      }]
    );
  }

  if (
    url.startsWith('/rest/v1/students?') &&
    method === 'GET'
  ) {
    const student =
      studentForUrl(url);

    return response(
      200,
      student
        ? [student]
        : []
    );
  }

  if (
    url.startsWith('/rest/v1/class_enrollments?') &&
    method === 'GET'
  ) {
    const isStudent1 =
      url.includes(
        `student_id=eq.${STUDENT_1_ID}`
      );

    const code =
      isStudent1
        ? 'S001'
        : 'S002';

    if (failEnrollmentFor === code) {
      return response(
        200,
        []
      );
    }

    return response(
      200,
      [{
        class_id: CLASS_ID,
        student_id:
          isStudent1
            ? STUDENT_1_ID
            : STUDENT_2_ID,
        active: true,
      }]
    );
  }

  if (
    url === '/rest/v1/assignments' &&
    method === 'POST'
  ) {
    return response(
      201,
      [{
        id: 901,
        ...body,
      }]
    );
  }

  if (
    url === '/rest/v1/assignment_instances' &&
    method === 'POST'
  ) {
    assert.ok(
      Array.isArray(body),
      'instances must be inserted as one batch'
    );

    return response(
      201,
      body.map(
        (row, index) => ({
          id:
            index === 0
              ? INSTANCE_1_ID
              : INSTANCE_2_ID,
          ...row,
        })
      )
    );
  }

  if (
    url === '/rest/v1/submissions' &&
    method === 'POST'
  ) {
    assert.ok(
      Array.isArray(body),
      'submissions must be inserted as one batch'
    );

    return response(
      201,
      body.map(
        (row, index) => ({
          id:
            index === 0
              ? SUBMISSION_1_ID
              : SUBMISSION_2_ID,
          ...row,
        })
      )
    );
  }

  if (
    url.startsWith('/rest/v1/assignments?') &&
    method === 'DELETE'
  ) {
    return response(
      204,
      null
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
      parent &&
      parent.filename === endpointPath
    ) {
      if (request === './_lib/http') {
        return {
          generateRequestId:
            () => 'manual-grade-test',
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

      if (request === './_lib/auth') {
        return {
          requireTeacher:
            () => authResult,
        };
      }

      if (request === './_lib/supa') {
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
        request ===
        './_lib/school-year'
      ) {
        return {
          getCurrentSchoolYear:
            () => 2026,
        };
      }
    }

    return originalLoad(
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

function event(body) {
  return {
    httpMethod: 'POST',
    headers: {},
    body:
      JSON.stringify(body),
  };
}

function parseResult(result) {
  return {
    statusCode:
      result.statusCode,
    body:
      JSON.parse(result.body),
  };
}

function goodBody(overrides = {}) {
  return {
    title:
      'Verbal Quiz — Chapter 5',
    className:
      'Language Arts 1 SC',
    studentCodes:
      ['S001', 'S002'],
    totalPossible:
      50,
    scoreEarned:
      40,
    date:
      '2026-09-10',
    category:
      'quiz',
    notes:
      'Teacher-entered verbal assessment.',
    ...overrides,
  };
}

async function run() {
  let passed = 0;

  reset();

  let result =
    parseResult(
      await handler(
        event(
          goodBody()
        )
      )
    );

  assert.equal(
    result.statusCode,
    200
  );

  assert.equal(
    result.body.ok,
    true
  );

  assert.equal(
    result.body.saved_count,
    2
  );

  assert.equal(
    result.body.score_percent,
    80
  );

  const assignmentWrites =
    calls.filter(
      call =>
        call.method === 'POST' &&
        call.url ===
          '/rest/v1/assignments'
    );

  assert.equal(
    assignmentWrites.length,
    1,
    'one request must create exactly one canonical assignment'
  );

  assert.deepEqual(
    assignmentWrites[0].body.meta,
    {
      manual: true,
      category: 'quiz',
      total_possible: 50,
      recorded_date:
        '2026-09-10',
      notes:
        'Teacher-entered verbal assessment.',
    }
  );

  assert.equal(
    assignmentWrites[0].body.type,
    'html'
  );

  assert.equal(
    assignmentWrites[0].body.class_id,
    CLASS_ID
  );

  const instanceWrite =
    calls.find(
      call =>
        call.method === 'POST' &&
        call.url ===
          '/rest/v1/assignment_instances'
    );

  assert.equal(
    instanceWrite.body.length,
    2
  );

  assert.ok(
    instanceWrite.body.every(
      row =>
        row.assignment_id === 901 &&
        row.status === 'Graded' &&
        row.school_year === 2026
    )
  );

  const submissionWrite =
    calls.find(
      call =>
        call.method === 'POST' &&
        call.url ===
          '/rest/v1/submissions'
    );

  assert.equal(
    submissionWrite.body.length,
    2
  );

  assert.ok(
    submissionWrite.body.every(
      row =>
        row.score_manual === 40 &&
        row.score_total === 80 &&
        row.review_status ===
          'reviewed' &&
        row.school_year === 2026
    )
  );

  assert.equal(
    calls.some(
      call =>
        call.url.includes(
          'process_submission'
        )
    ),
    false,
    'process_submission is forbidden'
  );

  assert.equal(
    calls.some(
      call =>
        call.url.includes(
          'goal_progress'
        )
    ),
    false,
    'goal_progress writes are forbidden'
  );

  console.log(
    'OK one canonical MANUAL assignment creates two reviewed student results'
  );

  passed++;

  reset();

  result =
    parseResult(
      await handler(
        event(
          goodBody({
            studentCodes:
              ['S001'],
            scoreEarned:
              0,
          })
        )
      )
    );

  assert.equal(
    result.statusCode,
    200
  );

  const zeroSubmissionWrite =
    calls.find(
      call =>
        call.method === 'POST' &&
        call.url ===
          '/rest/v1/submissions'
    );

  assert.equal(
    zeroSubmissionWrite.body[0]
      .score_manual,
    0
  );

  assert.equal(
    zeroSubmissionWrite.body[0]
      .score_total,
    0
  );

  console.log(
    'OK explicit zero score is preserved'
  );

  passed++;

  reset();

  failEnrollmentFor = 'S002';

  result =
    parseResult(
      await handler(
        event(
          goodBody()
        )
      )
    );

  assert.equal(
    result.statusCode,
    404
  );

  assert.equal(
    calls.some(
      call =>
        call.method === 'POST'
    ),
    false,
    'all students must validate before the first write'
  );

  console.log(
    'OK wrong-class student fails closed before any write'
  );

  passed++;

  reset();

  result =
    parseResult(
      await handler(
        event(
          goodBody({
            scoreEarned:
              51,
          })
        )
      )
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
    'OK invalid earned score fails before database access'
  );

  passed++;

  console.log(
    `MANUAL GRADE SERVER BOUNDARY: PASS (${passed} cases)`
  );
}

run().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
