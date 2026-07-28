'use strict';

const assert = require('assert');

process.env.SESSION_SECRET =
  'test-session-secret-32-chars-long!!';

const TEACHER_ID =
  '11111111-1111-4111-8111-111111111111';

const OTHER_TEACHER_ID =
  '22222222-2222-4222-8222-222222222222';

const SUBMISSION_ID =
  '33333333-3333-4333-8333-333333333333';

const INSTANCE_ID =
  '44444444-4444-4444-8444-444444444444';

const WRONG_INSTANCE_ID =
  '55555555-5555-4555-8555-555555555555';

const STUDENT_ID =
  '66666666-6666-4666-8666-666666666666';

const CLASS_ID =
  '77777777-7777-4777-8777-777777777777';

const OTHER_CLASS_ID =
  '88888888-8888-4888-8888-888888888888';

const ASSIGNMENT_ID = '101';
const ITEM_ID = '201';

let authUser = null;
let scenario = null;
let calls = [];

const mockHttpLib = {
  generateRequestId: () => 'ownership-test',
  jsonResponse: (_event, statusCode, body) => ({
    statusCode,
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
  requireTeacher: () => {
    if (!authUser) {
      return {
        ok: false,
      };
    }

    return {
      ok: true,
      user: authUser,
    };
  },
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

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: {
      get: () => null,
    },
  };
}

function currentScenario(overrides = {}) {
  return {
    submissionExists: true,
    teacherOwnsClass: true,
    activeExactEnrollment: true,
    assignmentId: ASSIGNMENT_ID,
    classId: CLASS_ID,
    instanceId: INSTANCE_ID,
    studentId: STUDENT_ID,
    itemMatchesAssignment: true,
    ...overrides,
  };
}

global.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';

  calls.push({
    url,
    method,
    body: options.body
      ? JSON.parse(options.body)
      : null,
  });

  const s = scenario || currentScenario();

  if (
    method === 'GET' &&
    url.includes('/rest/v1/submissions') &&
    url.includes('select=id,instance_id')
  ) {
    return jsonResponse(
      s.submissionExists
        ? [{
            id: SUBMISSION_ID,
            instance_id: s.instanceId,
          }]
        : []
    );
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/assignment_instances') &&
    url.includes('select=id,student_id,assignment_id')
  ) {
    return jsonResponse([{
      id: s.instanceId,
      student_id: s.studentId,
      assignment_id: Number(s.assignmentId),
    }]);
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/assignments') &&
    url.includes('select=id,class_id')
  ) {
    return jsonResponse([{
      id: Number(s.assignmentId),
      class_id: s.classId,
    }]);
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/classes') &&
    url.includes('teacher_id=eq.')
  ) {
    return jsonResponse(
      s.teacherOwnsClass
        ? [{
            id: s.classId,
          }]
        : []
    );
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/class_enrollments')
  ) {
    return jsonResponse(
      s.activeExactEnrollment
        ? [{
            class_id: s.classId,
            student_id: s.studentId,
            active: true,
          }]
        : []
    );
  }

  if (
    method === 'GET' &&
    url.includes('/rest/v1/assignment_items') &&
    url.includes('assignment_id=eq.')
  ) {
    return jsonResponse(
      s.itemMatchesAssignment
        ? [{
            id: Number(ITEM_ID),
            assignment_id: Number(s.assignmentId),
          }]
        : []
    );
  }

  // Existing save_score lookup.
  if (
    method === 'GET' &&
    url.includes('/rest/v1/submission_answers') &&
    url.includes('select=id')
  ) {
    return jsonResponse([]);
  }

  // Existing legacy instance lookup, if still present.
  if (
    method === 'GET' &&
    url.includes('/rest/v1/submissions') &&
    url.includes('select=instance_id')
  ) {
    return jsonResponse([{
      instance_id: s.instanceId,
    }]);
  }

  // return_for_revision answer lookup.
  if (
    method === 'GET' &&
    url.includes('/rest/v1/submission_answers')
  ) {
    return jsonResponse([]);
  }

  // Generic existing mutation success.
  if (method === 'POST') {
    return jsonResponse([{
      id: 1,
    }]);
  }

  if (method === 'PATCH') {
    return jsonResponse([{
      id: SUBMISSION_ID,
      score_total: 100,
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

function event(body) {
  return {
    httpMethod: 'POST',
    headers: {
      cookie: 'tc=fake-signed-test-cookie',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function reset(overrides = {}) {
  authUser = {
    role: 'teacher',
    teacherId: TEACHER_ID,
  };

  scenario =
    currentScenario(overrides);

  calls = [];
}

function mutations() {
  return calls.filter(
    (call) =>
      call.method !== 'GET'
  );
}

function urlsBeforeFirstMutation() {
  const index =
    calls.findIndex(
      (call) =>
        call.method !== 'GET'
    );

  const relevant =
    index === -1
      ? calls
      : calls.slice(0, index);

  return relevant.map(
    (call) => call.url
  );
}

const tests = [];

function test(name, fn) {
  tests.push({
    name,
    fn,
  });
}

test(
  'unauthenticated request returns 401 before Supabase',
  async () => {
    authUser = null;
    scenario = currentScenario();
    calls = [];

    const result =
      await handler(
        event({
          action: 'set_in_progress',
          submissionId: SUBMISSION_ID,
        })
      );

    assert.strictEqual(
      result.statusCode,
      401
    );

    assert.strictEqual(
      calls.length,
      0
    );
  }
);

test(
  'teacher session without signed teacherId returns 403 before Supabase',
  async () => {
    authUser = {
      role: 'teacher',
    };

    scenario = currentScenario();
    calls = [];

    const result =
      await handler(
        event({
          action: 'set_in_progress',
          submissionId: SUBMISSION_ID,
        })
      );

    assert.strictEqual(
      result.statusCode,
      403
    );

    assert.strictEqual(
      calls.length,
      0
    );
  }
);

test(
  'invalid submissionId returns 400 before Supabase',
  async () => {
    reset();

    const result =
      await handler(
        event({
          action: 'set_in_progress',
          submissionId: 'not-a-uuid',
        })
      );

    assert.strictEqual(
      result.statusCode,
      400
    );

    assert.strictEqual(
      calls.length,
      0
    );
  }
);

test(
  'nonexistent submission returns 404 before mutation',
  async () => {
    reset({
      submissionExists: false,
    });

    const result =
      await handler(
        event({
          action: 'set_in_progress',
          submissionId: SUBMISSION_ID,
        })
      );

    assert.strictEqual(
      result.statusCode,
      404
    );

    assert.strictEqual(
      mutations().length,
      0
    );
  }
);

test(
  'submission in another teacher class returns 404 before mutation',
  async () => {
    reset({
      teacherOwnsClass: false,
    });

    const result =
      await handler(
        event({
          action: 'set_in_progress',
          submissionId: SUBMISSION_ID,
        })
      );

    assert.strictEqual(
      result.statusCode,
      404
    );

    assert.strictEqual(
      mutations().length,
      0
    );
  }
);

test(
  'student relationship in another class does not authorize this class',
  async () => {
    reset({
      teacherOwnsClass: true,
      activeExactEnrollment: false,
    });

    const result =
      await handler(
        event({
          action: 'set_in_progress',
          submissionId: SUBMISSION_ID,
        })
      );

    assert.strictEqual(
      result.statusCode,
      404
    );

    assert.strictEqual(
      mutations().length,
      0
    );
  }
);

test(
  'caller-provided wrong instanceId cannot redirect mutation',
  async () => {
    reset();

    const result =
      await handler(
        event({
          action: 'save_grade',
          submissionId: SUBMISSION_ID,
          instanceId: WRONG_INSTANCE_ID,
          scoreAuto: 5,
          scoreManual: 5,
          scoreTotal: 100,
          status: 'Graded',
        })
      );

    assert.strictEqual(
      result.statusCode,
      200
    );

    const instanceMutation =
      mutations().find(
        (call) =>
          call.url.includes(
            '/rest/v1/assignment_instances'
          )
      );

    assert.ok(
      instanceMutation,
      'expected assignment instance mutation'
    );

    assert.ok(
      instanceMutation.url.includes(
        INSTANCE_ID
      ),
      'must use canonical instance from submission'
    );

    assert.ok(
      !instanceMutation.url.includes(
        WRONG_INSTANCE_ID
      ),
      'must ignore caller-controlled instanceId'
    );
  }
);

test(
  'save_score rejects item from another assignment before answer access',
  async () => {
    reset({
      itemMatchesAssignment: false,
    });

    const result =
      await handler(
        event({
          action: 'save_score',
          submissionId: SUBMISSION_ID,
          itemId: ITEM_ID,
          earnedPoints: 1,
        })
      );

    assert.strictEqual(
      result.statusCode,
      404
    );

    assert.ok(
      !calls.some(
        (call) =>
          call.url.includes(
            '/rest/v1/submission_answers'
          )
      ),
      'must reject mismatched item before answer access'
    );
  }
);

test(
  'save_score accepts item belonging to authorized assignment',
  async () => {
    reset();

    const result =
      await handler(
        event({
          action: 'save_score',
          submissionId: SUBMISSION_ID,
          itemId: ITEM_ID,
          earnedPoints: 1,
        })
      );

    assert.strictEqual(
      result.statusCode,
      200
    );

    assert.ok(
      mutations().some(
        (call) =>
          call.url.includes(
            '/rest/v1/submission_answers'
          )
      ),
      'authorized score must reach answer mutation'
    );
  }
);

test(
  'same teacher may act across multiple classes they own',
  async () => {
    reset({
      classId: CLASS_ID,
    });

    let result =
      await handler(
        event({
          action: 'set_in_progress',
          submissionId: SUBMISSION_ID,
        })
      );

    assert.strictEqual(
      result.statusCode,
      200
    );

    reset({
      classId: OTHER_CLASS_ID,
    });

    result =
      await handler(
        event({
          action: 'set_in_progress',
          submissionId: SUBMISSION_ID,
        })
      );

    assert.strictEqual(
      result.statusCode,
      200
    );
  }
);

test(
  'all seven actions pass exact-class authorization before mutation',
  async () => {
    const actionBodies = [
      {
        action: 'save_score',
        itemId: ITEM_ID,
        earnedPoints: 1,
      },
      {
        action: 'save_grade',
        scoreTotal: 100,
        status: 'Graded',
      },
      {
        action: 'finalize',
        scoreAuto: 1,
        scoreManual: 0,
        scoreTotal: 100,
      },
      {
        action: 'set_in_progress',
      },
      {
        action: 'reopen',
      },
      {
        action: 'mark_reviewed',
      },
      {
        action: 'return_for_revision',
      },
    ];

    for (
      const actionBody
      of actionBodies
    ) {
      reset();

      const result =
        await handler(
          event({
            ...actionBody,
            submissionId: SUBMISSION_ID,
          })
        );

      assert.strictEqual(
        result.statusCode,
        200,
        `${actionBody.action} should succeed`
      );

      const before =
        urlsBeforeFirstMutation();

      assert.ok(
        before.some(
          (url) =>
            url.includes('/rest/v1/classes')
        ),
        `${actionBody.action} must verify exact class ownership`
      );

      assert.ok(
        before.some(
          (url) =>
            url.includes(
              '/rest/v1/class_enrollments'
            )
        ),
        `${actionBody.action} must verify active same-class enrollment`
      );
    }
  }
);

(async () => {
  console.log(
    '--- teacher-review-save ownership security tests ---\n'
  );

  let failed = 0;

  for (
    const {
      name,
      fn,
    }
    of tests
  ) {
    try {
      await fn();
      console.log(
        `OK ${name}`
      );
    } catch (error) {
      failed += 1;

      console.error(
        `FAIL ${name}`
      );

      console.error(
        `  ${error.message}`
      );
    }
  }

  console.log(
    `\n${tests.length - failed} passed, ${failed} failed`
  );

  if (failed > 0) {
    console.error(
      '\nOwnership security contract failed.'
    );
    process.exit(1);
  }

  console.log(
    '\nAll teacher-review-save ownership security tests passed!'
  );

  process.exit(0);
})();
