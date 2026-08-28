'use strict';

const assert =
  require('assert');

process.env.SUPABASE_URL =
  'https://example.supabase.test';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key';

process.env.SESSION_SECRET =
  'test-teacher-session-secret';

const {
  sign,
  teacherCookie,
} = require(
  '../netlify/functions/_lib/auth'
);

const {
  handler,
} = require(
  '../netlify/functions/teacher-roster-context'
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

    async text() {
      return typeof data ===
        'string'
        ? data
        : JSON.stringify(data);
    },

    async json() {
      return JSON.parse(
        JSON.stringify(data)
      );
    },
  };
}

function objective({
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
      parent === 'S009.CG4'
        ? 'Written Expression'
        : 'Reading Comprehension',
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

    // These are intentionally supplied by the mock
    // to prove they never reach browser projection.
    dan_monitoring_role:
      'Primary',
    assignment_evidence_mode:
      'internal assignment metadata',
    rc_objective_status:
      'internal status',
    source_qa_notes:
      'internal QA text',

    active: true,
  };
}

const registryRows = [
  objective({
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

  objective({
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

  objective({
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

  objective({
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

  objective({
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

  objective({
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

  // Unrelated objective must not attach to either control parent.
  {
    ...objective({
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
    goal_area:
      'Life Skills Math Skills',
  },
];

const students = [
  {
    id:
      'student-S009',
    code:
      'S009',
    name:
      null,
    class_id:
      null,
    iep_due:
      null,
    eval_due:
      null,
    primary_case_manager:
      null,
    archived_at:
      null,
    active:
      true,
  },
  {
    id:
      'student-S069',
    code:
      'S069',
    name:
      null,
    class_id:
      null,
    iep_due:
      null,
    eval_due:
      null,
    primary_case_manager:
      null,
    archived_at:
      null,
    active:
      true,
  },
];

const goals = [
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
    status:
      'Open',
    measurement_type:
      'Accuracy',
    data_collector:
      null,
    data_collector_email:
      null,
    class_context:
      'Language Arts',
    goal_area:
      'Written Expression',
    baseline:
      '47%',
    mastery:
      '80%',
    case_manager:
      null,
    version:
      1,
    observation_config:
      null,
    notes:
      null,
    criterion_conflict:
      false,
    addressed_in_class:
      true,
    individual_delivery:
      false,
    students: {
      code:
        'S009',
    },
  },
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
    status:
      'Open',
    measurement_type:
      'Accuracy',
    data_collector:
      null,
    data_collector_email:
      null,
    class_context:
      'Language Arts 3 SC',
    goal_area:
      'Reading Comprehension',
    baseline:
      'MAP Reading RIT 215',
    mastery:
      'MAP Reading RIT 220',
    case_manager:
      null,
    version:
      1,
    observation_config:
      null,
    notes:
      null,
    criterion_conflict:
      false,
    addressed_in_class:
      true,
    individual_delivery:
      false,
    students: {
      code:
        'S069',
    },
  },
];

(async () => {
  console.log(
    'Running Teacher Center production-registry objective endpoint test...\n'
  );

  const originalFetch =
    global.fetch;

  const calls = [];

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
        return response(
          students
        );
      }

      if (
        requestUrl.includes(
          '/rest/v1/goals?'
        )
      ) {
        return response(
          goals
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
          'Teacher Center registry read must request active objectives only'
        );

        for (const internalField of [
          'dan_monitoring_role',
          'assignment_evidence_mode',
          'rc_objective_status',
          'source_qa_notes',
        ]) {
          assert.ok(
            !requestUrl.includes(
              internalField
            ),
            `Teacher Center registry SELECT must not fetch ${internalField}`
          );
        }

        return response(
          registryRows
        );
      }

      if (
        requestUrl.includes(
          '/rest/v1/class_enrollments?'
        )
      ) {
        return response([]);
      }

      if (
        requestUrl.includes(
          '/rest/v1/classes?'
        )
      ) {
        return response([]);
      }

      throw new Error(
        `Unexpected fetch URL: ${requestUrl}`
      );
    };

  try {
    const token =
      sign(
        {
          role:
            'teacher',
          username:
            'test-teacher',
        },
        process.env.SESSION_SECRET
      );

    const cookie =
      teacherCookie(
        'tc',
        token,
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
        queryStringParameters:
          {},
        headers: {
          cookie,
          Cookie:
            cookie,
        },
      });

    assert.strictEqual(
      result.statusCode,
      200,
      'Teacher roster context should succeed'
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
      body.goals.length,
      2
    );

    const byCode =
      new Map(
        body.goals.map(
          goal => [
            goal.code,
            goal,
          ]
        )
      );

    const s009 =
      byCode.get(
        'S009.CG4'
      );

    const s069 =
      byCode.get(
        'S069.CG1'
      );

    assert.ok(
      s009,
      'S009 control parent must be present'
    );

    assert.ok(
      s069,
      'S069 new parent must be present'
    );

    assert.deepStrictEqual(
      s009.objectives.map(
        row => row.code
      ),
      [
        'S009.CG4.O1',
        'S009.CG4.O2',
        'S009.CG4.O3',
      ],
      'existing S009 objective visibility must remain unchanged'
    );

    assert.deepStrictEqual(
      s069.objectives.map(
        row => row.code
      ),
      [
        'S069.CG1.O1',
        'S069.CG1.O2',
        'S069.CG1.O3',
      ],
      'new S069 objective hierarchy must now be visible to Teacher Center'
    );

    for (
      const parent
      of [s009, s069]
    ) {
      for (
        const child
        of parent.objectives
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
            `browser child objective must exclude ${forbidden}`
          );
        }
      }
    }

    assert.strictEqual(
      calls.filter(
        call =>
          call.url.includes(
            '/rest/v1/goal_objectives?'
          )
      ).length,
      1,
      'Teacher roster context should perform exactly one objective-registry read'
    );

    console.log(
      '✓ S009 existing 3-objective Teacher Center visibility preserved'
    );

    console.log(
      '✓ S069 newly imported 3-objective hierarchy now visible in Teacher Center transport'
    );

    console.log(
      '✓ unrelated student objective does not attach across parent/student boundary'
    );

    console.log(
      '✓ internal UUID/monitoring/status/QA metadata stays server-only'
    );

    console.log(
      '✓ one server-side registry read serves the roster payload'
    );

    console.log('');
    console.log(
      'TEACHER ROSTER LIVE OBJECTIVE REGISTRY: PASS'
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
