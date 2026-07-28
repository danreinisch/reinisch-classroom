'use strict';

const assert = require('assert');

process.env.SESSION_SECRET =
  'test-session-secret-32-chars-long!!';

const TEACHER_ID =
  '11111111-1111-4111-8111-111111111111';

const SUBMISSION_ID =
  '22222222-2222-4222-8222-222222222222';

const INSTANCE_ID =
  '33333333-3333-4333-8333-333333333333';

const WRONG_INSTANCE_ID =
  '44444444-4444-4444-8444-444444444444';

const STUDENT_ID =
  '55555555-5555-4555-8555-555555555555';

const CLASS_ID =
  '66666666-6666-4666-8666-666666666666';

const ASSIGNMENT_ID = 101;

let fetchCalls = [];

const mockHttpLib = {
  generateRequestId: () => 'instance-test',
  jsonResponse: (_event, status, body) => ({
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }),
  handleCorsPreFlight: () => ({
    statusCode: 200,
    headers: {},
    body: '',
  }),
  validateBodySize: () => ({
    valid: true,
  }),
  safeJsonParse: (text) => {
    try {
      return {
        ok: true,
        data: JSON.parse(text),
      };
    } catch (_) {
      return {
        ok: false,
        error: 'Invalid JSON',
      };
    }
  },
};

const mockAuthLib = {
  requireTeacher: () => ({
    ok: true,
    user: {
      role: 'teacher',
      teacherId: TEACHER_ID,
    },
  }),
};

const mockSupaLib = {
  getSupabaseConfig: () => ({
    url: 'https://test.supabase.co',
    key: 'test-service-key',
  }),
};

require.cache[
  require.resolve('../netlify/functions/_lib/http')
] = {
  exports: mockHttpLib,
};

require.cache[
  require.resolve('../netlify/functions/_lib/auth')
] = {
  exports: mockAuthLib,
};

require.cache[
  require.resolve('../netlify/functions/_lib/supa')
] = {
  exports: mockSupaLib,
};

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: {
      get: () => null,
    },
  };
}

global.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';

  fetchCalls.push({
    url,
    method,
    body: options.body
      ? JSON.parse(options.body)
      : null,
  });

  if (
    method === 'GET' &&
    url.includes('/rest/v1/submissions') &&
    url.includes('select=id,instance_id')
  ) {
    return response([{
      id: SUBMISSION_ID,
      instance_id: INSTANCE_ID,
    }]);
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/assignment_instances') &&
    url.includes('select=id,student_id,assignment_id')
  ) {
    return response([{
      id: INSTANCE_ID,
      student_id: STUDENT_ID,
      assignment_id: ASSIGNMENT_ID,
    }]);
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/assignments') &&
    url.includes('select=id,class_id')
  ) {
    return response([{
      id: ASSIGNMENT_ID,
      class_id: CLASS_ID,
    }]);
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/classes') &&
    url.includes('teacher_id=eq.')
  ) {
    return response([{
      id: CLASS_ID,
    }]);
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/class_enrollments')
  ) {
    return response([{
      class_id: CLASS_ID,
      student_id: STUDENT_ID,
      active: true,
    }]);
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/submissions') &&
    url.includes('select=instance_id')
  ) {
    return response([{
      instance_id: INSTANCE_ID,
    }]);
  }

  if (
    method === 'PATCH' &&
    url.includes('/rest/v1/submissions')
  ) {
    return response([{
      id: SUBMISSION_ID,
      review_status: 'reviewed',
    }]);
  }

  if (
    method === 'PATCH' &&
    url.includes('/rest/v1/assignment_instances')
  ) {
    return response([{
      id: INSTANCE_ID,
    }]);
  }

  throw new Error(
    `Unexpected fetch: ${method} ${url}`
  );
};

const {
  handler,
} = require(
  '../netlify/functions/teacher-review-save'
);

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: {
      cookie: 'tc=test-cookie',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function instanceMutation() {
  return fetchCalls.find(
    (call) =>
      call.method === 'PATCH' &&
      call.url.includes(
        '/rest/v1/assignment_instances'
      )
  );
}

async function runCase({
  action,
  callerInstanceId,
  expectedStatus,
}) {
  fetchCalls = [];

  const body = {
    action,
    submissionId: SUBMISSION_ID,
  };

  if (action === 'save_grade') {
    Object.assign(body, {
      scoreAuto: 5,
      scoreManual: 0,
      scoreTotal: 100,
      status: 'Graded',
    });
  }

  if (callerInstanceId !== undefined) {
    body.instanceId = callerInstanceId;
  }

  const result =
    await handler(
      makeEvent(body)
    );

  assert.strictEqual(
    result.statusCode,
    200
  );

  const mutation =
    instanceMutation();

  assert.ok(
    mutation,
    'expected assignment instance mutation'
  );

  assert.ok(
    mutation.url.includes(INSTANCE_ID),
    'instance mutation must use canonical instance'
  );

  assert.ok(
    !mutation.url.includes(WRONG_INSTANCE_ID),
    'instance mutation must not use caller-controlled instance'
  );

  assert.strictEqual(
    mutation.body.status,
    expectedStatus
  );
}

(async () => {
  console.log(
    '--- teacher-review-save: canonical instance tests ---\n'
  );

  const cases = [
    {
      name:
        'save_grade ignores wrong caller instanceId',
      action: 'save_grade',
      callerInstanceId: WRONG_INSTANCE_ID,
      expectedStatus: 'Graded',
    },
    {
      name:
        'save_grade without caller instanceId uses canonical instance',
      action: 'save_grade',
      expectedStatus: 'Graded',
    },
    {
      name:
        'reopen ignores wrong caller instanceId',
      action: 'reopen',
      callerInstanceId: WRONG_INSTANCE_ID,
      expectedStatus: 'In Progress',
    },
    {
      name:
        'reopen without caller instanceId uses canonical instance',
      action: 'reopen',
      expectedStatus: 'In Progress',
    },
  ];

  let failed = 0;

  for (const testCase of cases) {
    try {
      await runCase(testCase);
      console.log(
        `OK ${testCase.name}`
      );
    } catch (error) {
      failed += 1;
      console.error(
        `FAIL ${testCase.name}`
      );
      console.error(
        `  ${error.message}`
      );
    }
  }

  if (failed > 0) {
    console.error(
      `\n${failed} canonical instance test(s) failed.`
    );
    process.exit(1);
  }

  console.log(
    '\nAll teacher-review-save canonical instance tests passed!'
  );
})();
