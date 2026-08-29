'use strict';

const assert =
  require('assert');

process.env.SUPABASE_URL =
  'https://example.supabase.test';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key';

process.env.SESSION_SECRET =
  'test-student-session-secret';

const {
  createStudentSessionCookie,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const {
  handler,
} = require(
  '../netlify/functions/student-goals'
);

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

function browserObjective({
  student,
  parent,
  code,
  number,
  text,
  baseline = null,
  wording = null,
  mastery = null,
  parentCriterion = null,
}) {
  return {
    id:
      `uuid-${code}`,
    student_id:
      `student-${student}`,
    parent_goal_id:
      `goal-${parent}`,
    student_code:
      student,
    parent_goal_code:
      parent,
    code,
    goal_area:
      parent === 'S009.CG4' ||
      parent === 'S069.CG1'
        ? (
            parent === 'S009.CG4'
              ? 'Written Expression'
              : 'Reading Comprehension'
          )
        : 'Other',
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
      parentCriterion,

    // These must never reach browser payload.
    dan_monitoring_role:
      'Primary',
    assignment_evidence_mode:
      'internal planning metadata',
    rc_objective_status:
      'internal status',
    source_qa_notes:
      'internal QA metadata',

    active: true,
  };
}

const fixtures = {
  S009: {
    studentId:
      'student-S009',

    goals: [
      {
        id:
          'goal-S009.CG4',
        student_id:
          'student-S009',
        code:
          'S009.CG4',
        desc:
          'Written expression goal',
        target:
          '80%',
        active: true,
        status:
          'Open',
      },
    ],

    objectives: [
      browserObjective({
        student:
          'S009',
        parent:
          'S009.CG4',
        code:
          'S009.CG4.O1',
        number:
          1,
        text:
          'Topic/Claim',
        baseline:
          '47%',
        parentCriterion:
          '80% overall',
      }),

      browserObjective({
        student:
          'S009',
        parent:
          'S009.CG4',
        code:
          'S009.CG4.O2',
        number:
          2,
        text:
          'Three supporting details',
        baseline:
          '47%',
        parentCriterion:
          '80% overall',
      }),

      browserObjective({
        student:
          'S009',
        parent:
          'S009.CG4',
        code:
          'S009.CG4.O3',
        number:
          3,
        text:
          'Conclusion',
        baseline:
          '47%',
        parentCriterion:
          '80% overall',
      }),
    ],

    expectedCodes: [
      'S009.CG4.O1',
      'S009.CG4.O2',
      'S009.CG4.O3',
    ],
  },

  S069: {
    studentId:
      'student-S069',

    goals: [
      {
        id:
          'goal-S069.CG1',
        student_id:
          'student-S069',
        code:
          'S069.CG1',
        desc:
          'Reading comprehension goal',
        target:
          'MAP Reading RIT 220',
        active: true,
        status:
          'Open',
      },
    ],

    objectives: [
      browserObjective({
        student:
          'S069',
        parent:
          'S069.CG1',
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
        parentCriterion:
          'Parent Reading goal target: MAP Reading RIT 220',
      }),

      browserObjective({
        student:
          'S069',
        parent:
          'S069.CG1',
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
        parentCriterion:
          'Parent Reading goal target: MAP Reading RIT 220',
      }),

      browserObjective({
        student:
          'S069',
        parent:
          'S069.CG1',
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
        parentCriterion:
          'Parent Reading goal target: MAP Reading RIT 220',
      }),

      // Deliberately wrong student in mock response.
      // Student-scoped registry projection must drop it.
      browserObjective({
        student:
          'S015',
        parent:
          'S015.CG3',
        code:
          'S015.CG3.O1',
        number:
          1,
        text:
          'Solve 2-step math problems',
      }),
    ],

    expectedCodes: [
      'S069.CG1.O1',
      'S069.CG1.O2',
      'S069.CG1.O3',
    ],
  },
};

async function runCase(code) {
  const fixture =
    fixtures[code];

  const calls = [];

  const originalFetch =
    global.fetch;

  global.fetch =
    async function mockFetch(
      input,
      init = {},
    ) {
      const requestUrl =
        String(input);

      calls.push({
        url:
          requestUrl,
        method:
          init.method || 'GET',
      });

      if (
        requestUrl.includes(
          '/rest/v1/students?'
        )
      ) {
        assert.ok(
          requestUrl.includes(
            `code=eq.${code}`
          ),
          'student lookup must remain scoped to requested signed student'
        );

        return response([
          {
            id:
              fixture.studentId,
          },
        ]);
      }

      if (
        requestUrl.includes(
          '/rest/v1/goals?'
        )
      ) {
        assert.ok(
          requestUrl.includes(
            `student_id=eq.${fixture.studentId}`
          ),
          'goal lookup must remain scoped by resolved student UUID'
        );

        return response(
          fixture.goals
        );
      }

      if (
        requestUrl.includes(
          '/rest/v1/goal_objectives?'
        )
      ) {
        assert.ok(
          requestUrl.includes(
            '&active=eq.true'
          ),
          'objective registry read must request active rows only'
        );

        assert.ok(
          requestUrl.includes(
            `&student_id=eq.${fixture.studentId}`
          ),
          'objective registry read must be scoped by resolved student UUID'
        );

        assert.ok(
          requestUrl.includes(
            '&order=student_code.asc,parent_goal_code.asc,objective_number.asc,code.asc'
          ),
          'objective registry read must have deterministic order'
        );

        return response(
          fixture.objectives
        );
      }

      throw new Error(
        `Unexpected fetch URL: ${requestUrl}`
      );
    };

  try {
    const cookie =
      createStudentSessionCookie(
        code,
        process.env.SESSION_SECRET,
        {
          secure: false,
        }
      )
        .split(';')[0];

    const result =
      await handler({
        httpMethod:
          'GET',
        queryStringParameters: {
          code,
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
      `${code}: endpoint should succeed`
    );

    const body =
      JSON.parse(
        result.body
      );

    assert.strictEqual(
      body.ok,
      true,
      `${code}: response should be ok`
    );

    assert.strictEqual(
      body.goals.length,
      1,
      `${code}: exactly one fixture parent expected`
    );

    const objectives =
      body.goals[0]
        .objectives || [];

    assert.deepStrictEqual(
      objectives.map(
        row => row.code
      ),
      fixture.expectedCodes,
      `${code}: browser objective identities/order must match production registry`
    );

    for (
      const objective
      of objectives
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
              objective,
              forbidden
            ),
          `${code}: browser objective must exclude ${forbidden}`
        );
      }
    }

    assert.strictEqual(
      calls.length,
      3,
      `${code}: endpoint should perform student + goals + objective-registry reads only`
    );

    return {
      codes:
        objectives.map(
          row => row.code
        ),
      calls,
    };
  } finally {
    global.fetch =
      originalFetch;
  }
}

(async () => {
  console.log(
    'Running Student Portal production-registry objective endpoint tests...\n'
  );

  const oldControl =
    await runCase(
      'S009'
    );

  assert.deepStrictEqual(
    oldControl.codes,
    [
      'S009.CG4.O1',
      'S009.CG4.O2',
      'S009.CG4.O3',
    ]
  );

  console.log(
    '✓ S009.CG4 existing 3-objective behavior is preserved'
  );

  const newlyVisible =
    await runCase(
      'S069'
    );

  assert.deepStrictEqual(
    newlyVisible.codes,
    [
      'S069.CG1.O1',
      'S069.CG1.O2',
      'S069.CG1.O3',
    ]
  );

  console.log(
    '✓ S069.CG1 newly imported 3-objective hierarchy is now visible'
  );

  console.log(
    '✓ wrong-student registry row is excluded from signed student payload'
  );

  console.log(
    '✓ internal monitoring/status/QA/UUID metadata stays server-only'
  );

  console.log('');
  console.log(
    'STUDENT GOALS LIVE OBJECTIVE REGISTRY: PASS'
  );
})().catch(error => {
  console.error(
    error.stack ||
    error.message
  );

  process.exit(1);
});
