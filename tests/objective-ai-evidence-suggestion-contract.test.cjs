'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const root =
  path.resolve(__dirname, '..');

const endpointPath =
  path.join(
    root,
    'netlify/functions/' +
      'teacher-ai-suggest-objective-evidence.js'
  );

const reviewPath =
  path.join(
    root,
    'site/web/tc-review.js'
  );

if (!fs.existsSync(endpointPath)) {
  console.error(
    'RED: teacher-ai-suggest-objective-evidence.js ' +
    'does not exist yet.'
  );
  process.exit(1);
}

const endpoint =
  fs.readFileSync(
    endpointPath,
    'utf8'
  );

const review =
  fs.readFileSync(
    reviewPath,
    'utf8'
  );

/*
 * Server boundary:
 * teacher session + canonical Review ownership chain.
 */
assert.match(
  endpoint,
  /requireTeacher/,
  'objective AI endpoint must require signed teacher session'
);

for (const marker of [
  'submissions',
  'assignment_instances',
  'assignments',
  'classes',
  'teacher_id',
  'class_enrollments',
  'active=eq.true',
  'assignment_items',
  'submission_answers',
  'assignment_item_objectives',
  'goal_objectives',
]) {
  assert.ok(
    endpoint.includes(marker),
    `objective AI endpoint must resolve server source: ${marker}`
  );
}

/*
 * Browser should identify only the artifact to review.
 * Objective identities/max/criteria come from server reads.
 */
assert.ok(
  endpoint.includes('submissionId'),
  'endpoint must accept submissionId'
);

assert.ok(
  endpoint.includes('itemId'),
  'endpoint must accept itemId'
);

assert.ok(
  endpoint.includes('objective_text'),
  'endpoint must use official child-objective wording'
);

assert.ok(
  endpoint.includes('objective_wording_criterion'),
  'endpoint must preserve objective wording criterion'
);

assert.ok(
  endpoint.includes('mastery_field'),
  'endpoint must preserve separate mastery field'
);

assert.ok(
  endpoint.includes('parent_goal_criterion'),
  'endpoint must preserve separate parent criterion'
);

/*
 * Suggestion endpoint is NON-MUTATING.
 */
for (const forbidden of [
  'teacher-review-save',
  'reconcile_objective_review_outcomes',
  'objective_data_points',
  'objective_review_dispositions',
]) {
  assert.ok(
    !endpoint.includes(forbidden),
    `objective AI suggestion endpoint must not reference ${forbidden}`
  );
}

/*
 * UI placement and explicit teacher agency.
 */
assert.ok(
  review.includes('Suggest IEP Evidence'),
  'Review must expose a distinct Suggest IEP Evidence action'
);

assert.ok(
  review.includes(
    '/.netlify/functions/' +
    'teacher-ai-suggest-objective-evidence'
  ),
  'Review must call the dedicated objective suggestion endpoint'
);

assert.ok(
  review.includes('Apply Suggestions'),
  'AI objective suggestions must require an explicit Apply Suggestions action'
);

assert.ok(
  review.includes('rv-objective-component-input'),
  'AI suggestions must target the existing objective component controls'
);

assert.ok(
  review.includes('objective-review-not-scorable'),
  'AI suggestions must reuse the existing Not Scorable control'
);

/*
 * Applying suggestions may populate controls only.
 * The existing teacher Save remains the persistence judgment point.
 */
const applyStart =
  review.indexOf(
    'Apply Suggestions'
  );

assert.ok(
  applyStart >= 0,
  'Apply Suggestions UI must exist'
);

const applyWindow =
  review.slice(
    Math.max(0, applyStart - 5000),
    applyStart + 10000
  );

assert.ok(
  !applyWindow.includes('teacher-review-save'),
  'Apply Suggestions must not persist through teacher-review-save'
);

assert.ok(
  !applyWindow.includes('save_objective_components'),
  'Apply Suggestions must not save objective evidence'
);

/*
 * Auto-Grade All remains academic-only.
 */
const autoStart =
  review.indexOf(
    'async function handleAutoGradeAll'
  );

assert.ok(
  autoStart >= 0,
  'existing Auto-Grade All handler must remain present'
);

const nextHandler =
  review.indexOf(
    '\n  async function ',
    autoStart + 30
  );

const autoBlock =
  review.slice(
    autoStart,
    nextHandler > autoStart
      ? nextHandler
      : review.length
  );

assert.ok(
  !autoBlock.includes(
    'teacher-ai-suggest-objective-evidence'
  ),
  'Auto-Grade All must never invoke objective evidence AI'
);

assert.ok(
  autoBlock.includes(
    'teacher-ai-suggest'
  ),
  'existing academic Auto-Grade behavior must remain'
);

console.log(
  '✓ objective AI evidence endpoint/UI contract'
);

/*
 * Runtime endpoint contract.
 *
 * Auth, Supabase, and OpenAI are mocked so the actual endpoint
 * handler can be exercised without network access or persistence.
 */
async function runObjectiveAiEndpointRuntimeContract() {
  process.env.SESSION_SECRET =
    'test-session-secret-32-chars-long!!';

  process.env.OPENAI_API_KEY =
    'test-openai-key';

  const TEACHER_ID =
    '11111111-1111-4111-8111-111111111111';

  const OTHER_TEACHER_ID =
    '22222222-2222-4222-8222-222222222222';

  const SUBMISSION_ID =
    '33333333-3333-4333-8333-333333333333';

  const INSTANCE_ID =
    '44444444-4444-4444-8444-444444444444';

  const STUDENT_ID =
    '55555555-5555-4555-8555-555555555555';

  const CLASS_ID =
    '66666666-6666-4666-8666-666666666666';

  const OBJ1 =
    '77777777-7777-4777-8777-777777777777';

  const OBJ2 =
    '88888888-8888-4888-8888-888888888888';

  const ASSIGNMENT_ID =
    '101';

  const ITEM_ID =
    '201';

  let authUser =
    null;

  let scenario =
    'authorized';

  let calls =
    [];

  const mockHttp = {
    generateRequestId: () =>
      'objective-ai-test',

    jsonResponse:
      (_event, statusCode, body, headers = {}) => ({
        statusCode,
        headers: {
          'Content-Type':
            'application/json',
          ...headers,
        },
        body:
          JSON.stringify(body),
      }),

    handleCorsPreFlight: () => ({
      statusCode: 200,
      headers: {},
      body: '',
    }),

    validateBodySize: () => ({
      valid: true,
    }),

    safeJsonParse: text => {
      try {
        return {
          ok: true,
          data:
            JSON.parse(text),
        };
      } catch (_) {
        return {
          ok: false,
          error:
            'Invalid JSON',
        };
      }
    },
  };

  const mockAuth = {
    requireTeacher: () => {
      if (!authUser) {
        return {
          ok: false,
        };
      }

      return {
        ok: true,
        user:
          authUser,
      };
    },
  };

  const mockSupa = {
    getSupabaseConfig: () => ({
      url:
        'https://test.supabase.co',
      key:
        'test-service-key',
    }),
  };

  require.cache[
    require.resolve(
      '../netlify/functions/_lib/http'
    )
  ] = {
    exports:
      mockHttp,
  };

  require.cache[
    require.resolve(
      '../netlify/functions/_lib/auth'
    )
  ] = {
    exports:
      mockAuth,
  };

  require.cache[
    require.resolve(
      '../netlify/functions/_lib/supa'
    )
  ] = {
    exports:
      mockSupa,
  };

  function mockResponse(
    body,
    status = 200
  ) {
    return {
      ok:
        status >= 200 &&
        status < 300,
      status,
      json:
        async () =>
          body,
      text:
        async () =>
          JSON.stringify(body),
      headers: {
        get: () =>
          null,
      },
    };
  }

  global.fetch =
    async (url, init = {}) => {
      const urlText =
        String(url);

      const method =
        init.method ||
        'GET';

      calls.push({
        url:
          urlText,
        method,
        body:
          init.body ||
          null,
      });

      if (
        urlText.startsWith(
          'https://api.openai.com/'
        )
      ) {
        return mockResponse({
          choices: [
            {
              message: {
                content:
                  JSON.stringify({
                    suggestions: [
                      {
                        component_order:
                          1,
                        suggested_disposition:
                          'scored',
                        suggested_earned:
                          0,
                        evidence_excerpt:
                          'A measurable attempt is present.',
                        rationale:
                          'The component is scorable but not demonstrated.',
                      },
                      {
                        component_order:
                          2,
                        suggested_disposition:
                          'not_scorable',
                        evidence_excerpt:
                          '',
                        rationale:
                          'The response does not contain usable evidence for this component.',
                      },
                    ],
                  }),
              },
            },
          ],
        });
      }

      const parsed =
        new URL(urlText);

      const route =
        parsed.pathname;

      if (
        route ===
        '/rest/v1/submissions'
      ) {
        return mockResponse([
          {
            id:
              SUBMISSION_ID,
            instance_id:
              INSTANCE_ID,
          },
        ]);
      }

      if (
        route ===
        '/rest/v1/assignment_instances'
      ) {
        return mockResponse([
          {
            id:
              INSTANCE_ID,
            student_id:
              STUDENT_ID,
            assignment_id:
              ASSIGNMENT_ID,
          },
        ]);
      }

      if (
        route ===
        '/rest/v1/assignments'
      ) {
        return mockResponse([
          {
            id:
              ASSIGNMENT_ID,
            class_id:
              CLASS_ID,
            type:
              'digital',
            meta: {},
          },
        ]);
      }

      if (
        route ===
        '/rest/v1/classes'
      ) {
        if (
          scenario ===
          'foreign'
        ) {
          return mockResponse([]);
        }

        return mockResponse([
          {
            id:
              CLASS_ID,
            teacher_id:
              TEACHER_ID,
          },
        ]);
      }

      if (
        route ===
        '/rest/v1/class_enrollments'
      ) {
        return mockResponse([
          {
            class_id:
              CLASS_ID,
            student_id:
              STUDENT_ID,
            active:
              true,
          },
        ]);
      }

      if (
        route ===
        '/rest/v1/assignment_items'
      ) {
        return mockResponse([
          {
            id:
              ITEM_ID,
            assignment_id:
              ASSIGNMENT_ID,
            item_ref:
              'Q1',
            points:
              5,
            meta: {
              question:
                'Write a short response.',
            },
          },
        ]);
      }

      if (
        route ===
        '/rest/v1/submission_answers'
      ) {
        return mockResponse([
          {
            submission_id:
              SUBMISSION_ID,
            assignment_item_id:
              ITEM_ID,
            raw_answer: {
              value:
                'Contact me at student@example.com. ' +
                'I live at 123 Main Street. ' +
                'The response contains an attempt.',
            },
          },
        ]);
      }

      if (
        route ===
        '/rest/v1/assignment_item_objectives'
      ) {
        if (
          scenario ===
          'no_mappings'
        ) {
          return mockResponse([]);
        }

        return mockResponse([
          {
            item_id:
              ITEM_ID,
            objective_id:
              OBJ1,
            component_label:
              'Topic/Claim',
            objective_max:
              1,
            component_order:
              1,
          },
          {
            item_id:
              ITEM_ID,
            objective_id:
              OBJ2,
            component_label:
              'Conclusion',
            objective_max:
              1,
            component_order:
              2,
          },
        ]);
      }

      if (
        route ===
        '/rest/v1/goal_objectives'
      ) {
        return mockResponse([
          {
            id:
              OBJ1,
            student_id:
              STUDENT_ID,
            code:
              'S999.CG1.O1',
            objective_text:
              'State a topic or claim',
            objective_wording_criterion:
              null,
            mastery_field:
              null,
            parent_goal_criterion:
              '80% overall',
            measurement_method:
              'Work samples',
            active:
              true,
          },
          {
            id:
              OBJ2,
            student_id:
              STUDENT_ID,
            code:
              'S999.CG1.O2',
            objective_text:
              'Provide a conclusion',
            objective_wording_criterion:
              null,
            mastery_field:
              null,
            parent_goal_criterion:
              '80% overall',
            measurement_method:
              'Work samples',
            active:
              true,
          },
        ]);
      }

      throw new Error(
        `Unexpected mocked request: ${method} ${urlText}`
      );
    };

  delete require.cache[
    require.resolve(
      '../netlify/functions/teacher-ai-suggest-objective-evidence'
    )
  ];

  const {
    handler,
  } =
    require(
      '../netlify/functions/teacher-ai-suggest-objective-evidence'
    );

  async function invoke({
    user,
    body,
    nextScenario =
      'authorized',
  }) {
    authUser =
      user;

    scenario =
      nextScenario;

    calls =
      [];

    const response =
      await handler({
        httpMethod:
          'POST',
        headers: {},
        body:
          JSON.stringify(body),
      });

    return {
      statusCode:
        response.statusCode,
      body:
        JSON.parse(
          response.body
        ),
      calls:
        calls.slice(),
    };
  }

  let result =
    await invoke({
      user:
        null,
      body: {
        submissionId:
          SUBMISSION_ID,
        itemId:
          ITEM_ID,
      },
    });

  assert.equal(
    result.statusCode,
    401,
    'unauthenticated objective AI request must return 401'
  );

  assert.equal(
    result.calls.length,
    0,
    'unauthenticated request must not touch Supabase/OpenAI'
  );

  result =
    await invoke({
      user: {
        username:
          'teacher',
      },
      body: {
        submissionId:
          SUBMISSION_ID,
        itemId:
          ITEM_ID,
      },
    });

  assert.equal(
    result.statusCode,
    403,
    'signed teacher without teacherId must fail before data access'
  );

  assert.equal(
    result.calls.length,
    0,
    'missing teacherId must not touch Supabase/OpenAI'
  );

  result =
    await invoke({
      user: {
        username:
          'teacher',
        teacherId:
          TEACHER_ID,
      },
      body: {
        submissionId:
          SUBMISSION_ID,
        itemId:
          ITEM_ID,
        objectiveId:
          OBJ1,
      },
    });

  assert.equal(
    result.statusCode,
    400,
    'browser-supplied objective identity must be rejected'
  );

  assert.equal(
    result.calls.length,
    0,
    'unexpected browser fields must fail before data access'
  );

  result =
    await invoke({
      user: {
        username:
          'teacher',
        teacherId:
          OTHER_TEACHER_ID,
      },
      body: {
        submissionId:
          SUBMISSION_ID,
        itemId:
          ITEM_ID,
      },
      nextScenario:
        'foreign',
    });

  assert.equal(
    result.statusCode,
    404,
    'foreign-class submission must fail closed'
  );

  assert.ok(
    !result.calls.some(
      call =>
        call.url.startsWith(
          'https://api.openai.com/'
        )
    ),
    'foreign-class submission must never reach OpenAI'
  );

  result =
    await invoke({
      user: {
        username:
          'teacher',
        teacherId:
          TEACHER_ID,
      },
      body: {
        submissionId:
          SUBMISSION_ID,
        itemId:
          ITEM_ID,
      },
      nextScenario:
        'no_mappings',
    });

  assert.equal(
    result.statusCode,
    409,
    'unmapped item must not receive inferred objective suggestions'
  );

  assert.ok(
    !result.calls.some(
      call =>
        call.url.startsWith(
          'https://api.openai.com/'
        )
    ),
    'unmapped item must never reach OpenAI'
  );

  result =
    await invoke({
      user: {
        username:
          'teacher',
        teacherId:
          TEACHER_ID,
      },
      body: {
        submissionId:
          SUBMISSION_ID,
        itemId:
          ITEM_ID,
      },
    });

  assert.equal(
    result.statusCode,
    200,
    'authorized mapped artifact should return suggestions'
  );

  assert.equal(
    result.body.suggestions.length,
    2,
    'endpoint must return complete mapped-component suggestions'
  );

  assert.equal(
    result.body.suggestions[0]
      .suggested_earned,
    0,
    'measured zero must survive endpoint validation'
  );

  assert.equal(
    result.body.suggestions[1]
      .suggested_disposition,
    'not_scorable',
    'Not Scorable must remain distinct'
  );

  const supabaseCalls =
    result.calls.filter(
      call =>
        call.url.startsWith(
          'https://test.supabase.co/'
        )
    );

  assert.ok(
    supabaseCalls.length > 0,
    'authorized endpoint must resolve canonical server context'
  );

  assert.ok(
    supabaseCalls.every(
      call =>
        call.method ===
        'GET'
    ),
    'objective AI endpoint must perform only Supabase reads'
  );

  const openAiCalls =
    result.calls.filter(
      call =>
        call.url.startsWith(
          'https://api.openai.com/'
        )
    );

  assert.equal(
    openAiCalls.length,
    1,
    'authorized artifact should make exactly one mocked AI request'
  );

  const aiBody =
    String(
      openAiCalls[0].body ||
      ''
    );

  assert.ok(
    !aiBody.includes(
      'student@example.com'
    ) &&
    !aiBody.includes(
      '123 Main Street'
    ),
    'raw common-pattern PII must not reach OpenAI'
  );

  assert.ok(
    aiBody.includes(
      '[EMAIL REDACTED]'
    ) &&
    aiBody.includes(
      '[ADDRESS REDACTED]'
    ),
    'AI prompt must contain redacted PII tokens'
  );

  assert.ok(
    !aiBody.includes(
      OBJ1
    ) &&
    !aiBody.includes(
      OBJ2
    ),
    'objective UUIDs must never be sent to OpenAI'
  );

  console.log(
    '✓ objective AI endpoint runtime ownership/non-mutation contract'
  );
}

runObjectiveAiEndpointRuntimeContract()
  .catch(error => {
    console.error(error);
    process.exitCode =
      1;
  });
