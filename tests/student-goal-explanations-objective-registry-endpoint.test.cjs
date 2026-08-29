'use strict';

const assert =
  require('assert');

process.env.SUPABASE_URL =
  'https://example.supabase.test';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key';

process.env.SESSION_SECRET =
  'test-student-explanation-secret';

const {
  createStudentSessionCookie,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const {
  handler,
} = require(
  '../netlify/functions/student-goal-explanations'
);

const studentCode =
  'S069';

const studentId =
  'student-S069';

const parentGoalId =
  'goal-S069.CG1';

function response(
  data,
  status = 200,
) {
  return {
    ok:
      status >= 200 &&
      status < 300,

    status,

    async json() {
      return JSON.parse(
        JSON.stringify(data)
      );
    },

    async text() {
      return typeof data ===
        'string'
        ? data
        : JSON.stringify(data);
    },
  };
}

function objective({
  id,
  code,
  number,
  text,
  baseline,
  wording,
  mastery,
}) {
  return {
    id,
    student_id:
      studentId,
    parent_goal_id:
      parentGoalId,
    student_code:
      studentCode,
    parent_goal_code:
      'S069.CG1',
    code,
    goal_area:
      'Reading Comprehension',
    objective_number:
      number,
    objective_text:
      text,
    baseline,
    objective_wording_criterion:
      wording,
    mastery_field:
      mastery,
    parent_goal_criterion:
      'Parent Reading goal target: MAP Reading RIT 220',

    // Internal fields deliberately supplied by the mock.
    // They must never reach the Student explanation payload.
    dan_monitoring_role:
      'Primary',
    assignment_evidence_mode:
      'internal planning metadata',
    rc_objective_status:
      'internal status',
    source_qa_notes:
      'internal QA metadata',

    active:
      true,
  };
}

const registryRows = [
  objective({
    id:
      'objective-S069-CG1-O2',
    code:
      'S069.CG1.O2',
    number:
      2,
    text:
      'Identify main ideas and supporting details and make inferences in informational text.',
    baseline:
      'MAP Reading Informational Text RIT 218',
    wording:
      'MAP Reading Informational Text RIT 222',
    mastery:
      '222',
  }),

  objective({
    id:
      'objective-S069-CG1-O1',
    code:
      'S069.CG1.O1',
    number:
      1,
    text:
      'Determine the meaning of unfamiliar academic and domain-specific words and phrases using context clues, prefixes/suffixes, and reference tools.',
    baseline:
      'MAP Reading Vocabulary RIT 211',
    wording:
      'MAP Reading Vocabulary RIT 216',
    mastery:
      '216',
  }),

  objective({
    id:
      'objective-S069-CG1-O3',
    code:
      'S069.CG1.O3',
    number:
      3,
    text:
      'Analyze plot, character development, and theme in literary text.',
    baseline:
      'MAP Reading Literary Text RIT 219',
    wording:
      'MAP Reading Literary Text RIT 223',
    mastery:
      '223',
  }),
];

const goalRows = [{
  id:
    parentGoalId,
  student_id:
    studentId,
  code:
    'S069.CG1',
  measurement_type:
    'Accuracy',
  baseline:
    'MAP Reading RIT 215',
  mastery:
    'MAP Reading RIT 220',
  target:
    'MAP Reading RIT 220',
  goal_area:
    'Reading Comprehension',
  desc:
    'Reading comprehension goal',
  criterion_conflict:
    false,
  class_context:
    'Language Arts 3 SC',
}];

(async () => {
  console.log(
    'Running Student Goal Explanations live-registry endpoint test...\n'
  );

  const originalFetch =
    global.fetch;

  const calls = [];

  global.fetch =
    async function mockFetch(
      input,
      init = {},
    ) {
      const url =
        String(input);

      calls.push({
        url,
        method:
          init.method || 'GET',
      });

      if (
        url.includes(
          '/rest/v1/students?'
        )
      ) {
        assert.ok(
          url.includes(
            'code=eq.S069'
          ),
          'student lookup must remain scoped to signed student'
        );

        return response([
          {
            id:
              studentId,
          },
        ]);
      }

      if (
        url.includes(
          '/rest/v1/goals?'
        )
      ) {
        assert.ok(
          url.includes(
            `student_id=eq.${studentId}`
          ),
          'goal lookup must use resolved student UUID'
        );

        return response(
          goalRows
        );
      }

      if (
        url.includes(
          '/rest/v1/goal_objectives?'
        )
      ) {
        assert.ok(
          url.includes(
            'active=eq.true'
          ),
          'objective registry reads must request active rows only'
        );

        /*
         * The endpoint performs one student-scoped registry read to attach
         * goal.objectives. The shared progress reader then performs its own
         * parent-scoped normalized registry read.
         */
        if (
          url.includes(
            `student_id=eq.${studentId}`
          )
        ) {
          return response(
            registryRows
          );
        }

        if (
          url.includes(
            'parent_goal_id='
          )
        ) {
          return response(
            registryRows
          );
        }

        throw new Error(
          `Unexpected objective-registry scope: ${url}`
        );
      }

      if (
        url.includes(
          '/rest/v1/goal_progress'
        )
      ) {
        assert.ok(
          url.includes(
            'date=gte.2026-08-16'
          )
        );

        assert.ok(
          url.includes(
            'date=lte.2026-10-17'
          )
        );

        return response([]);
      }

      if (
        url.includes(
          '/rest/v1/goal_data_points'
        )
      ) {
        return response([]);
      }

      if (
        url.includes(
          '/rest/v1/objective_data_points?'
        )
      ) {
        assert.ok(
          url.includes(
            'date=gte.2026-08-16'
          )
        );

        assert.ok(
          url.includes(
            'date=lte.2026-10-17'
          )
        );

        return response([]);
      }

      throw new Error(
        `Unexpected fetch URL: ${url}`
      );
    };

  try {
    const cookie =
      createStudentSessionCookie(
        studentCode,
        process.env.SESSION_SECRET,
        {
          secure:
            false,
        }
      )
        .split(';')[0];

    const result =
      await handler({
        httpMethod:
          'GET',

        queryStringParameters: {
          code:
            studentCode,
          quarter:
            'Q1',
          start:
            '2026-08-16',
          end:
            '2026-10-17',
        },

        headers: {
          cookie,
          Cookie:
            cookie,
        },
      });

    assert.strictEqual(
      result.statusCode,
      200,
      'Student explanation request should succeed'
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
      body.available,
      true
    );

    assert.strictEqual(
      body.goals.length,
      1
    );

    const goal =
      body.goals[0];

    assert.strictEqual(
      goal.goal_code,
      'S069.CG1'
    );

    assert.deepStrictEqual(
      goal.objectives.map(
        row => row.code
      ),
      [
        'S069.CG1.O1',
        'S069.CG1.O2',
        'S069.CG1.O3',
      ],
      'newly imported live objectives must drive Student explanation hierarchy'
    );

    assert.deepStrictEqual(
      goal.coverage,
      {
        with_data:
          0,
        total:
          3,
      },
      'three live children with no evidence must remain explicit No Data coverage'
    );

    assert.deepStrictEqual(
      goal.objective_status,
      {
        available:
          true,
        reason:
          null,
      },
      'live objective hierarchy must be available even with zero measured evidence'
    );

    assert.strictEqual(
      goal.percentage,
      null,
      'zero objective and parent evidence must remain No Data'
    );

    for (
      const child
      of goal.objectives
    ) {
      for (const forbidden of [
        'id',
        'student_id',
        'parent_goal_id',
        'dan_monitoring_role',
        'assignment_evidence_mode',
        'rc_objective_status',
        'source_qa_notes',
        'active',
      ]) {
        assert.ok(
          !Object.prototype
            .hasOwnProperty.call(
              child,
              forbidden
            ),
          `Student explanation objective must exclude ${forbidden}`
        );
      }
    }

    assert.strictEqual(
      calls.some(
        call =>
          call.url.includes(
            '/rest/v1/assignment_instances'
          )
      ),
      false,
      'zero assignment-linked evidence must require no assignment-instance fanout'
    );

    const registryCalls =
      calls.filter(
        call =>
          call.url.includes(
            '/rest/v1/goal_objectives?'
          )
      );

    assert.ok(
      registryCalls.some(
        call =>
          call.url.includes(
            `student_id=eq.${studentId}`
          )
      ),
      'endpoint must perform a student-scoped live-registry visibility read'
    );

    assert.ok(
      registryCalls.some(
        call =>
          call.url.includes(
            'parent_goal_id='
          )
      ),
      'shared progress reader must independently resolve normalized parent objective identity'
    );

    console.log(
      '✓ S069 newly imported objective hierarchy drives Student Goal Explanation'
    );

    console.log(
      '✓ three unmeasured objectives remain No Data with 0/3 coverage'
    );

    console.log(
      '✓ internal objective UUID/monitoring/status/QA metadata stays server-only'
    );

    console.log(
      '✓ signed student + quarter boundaries remain intact'
    );

    console.log('');
    console.log(
      'STUDENT GOAL EXPLANATIONS LIVE OBJECTIVE REGISTRY: PASS'
    );
  } finally {
    global.fetch =
      originalFetch;
  }
})().catch(error => {
  console.error(
    error.stack ||
    error.message
  );

  process.exit(1);
});
