'use strict';

const assert =
  require('assert');

const path =
  require('path');

const ROOT =
  path.resolve(
    __dirname,
    '..'
  );

const endpointAbsolute =
  path.join(
    ROOT,
    'netlify/functions/teacher-manual-objective-evidence.js'
  );

const httpAbsolute =
  path.join(
    ROOT,
    'netlify/functions/_lib/http.js'
  );

const authAbsolute =
  path.join(
    ROOT,
    'netlify/functions/_lib/auth.js'
  );

const TEACHER_ID =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function uuid(
  prefix,
  number
) {
  return (
    `${prefix}0000000-0000-4000-8000-` +
    String(number)
      .padStart(
        12,
        '0'
      )
  );
}

function cacheStub(
  filename,
  exportsValue
) {
  require.cache[
    filename
  ] = {
    id:
      filename,
    filename,
    loaded:
      true,
    exports:
      exportsValue,
  };
}

function jsonResponse(
  data,
  status = 200
) {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,

    async json() {
      return JSON.parse(
        JSON.stringify(
          data
        )
      );
    },

    async text() {
      return JSON.stringify(
        data
      );
    },
  };
}

function parseEndpointResponse(
  response
) {
  return {
    statusCode:
      response.statusCode,
    body:
      typeof response.body ===
        'string'
        ? JSON.parse(
            response.body
          )
        : response.body,
  };
}

const savedHttp =
  require.cache[
    httpAbsolute
  ];

const savedAuth =
  require.cache[
    authAbsolute
  ];

const savedEndpoint =
  require.cache[
    endpointAbsolute
  ];

const savedFetch =
  global.fetch;

const savedUrl =
  process.env
    .SUPABASE_URL;

const savedKey =
  process.env
    .SUPABASE_SERVICE_ROLE_KEY;

process.env.SUPABASE_URL =
  'https://example.supabase.test';

process.env
  .SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role';

cacheStub(
  httpAbsolute,
  {
    generateRequestId() {
      return 'manual-objective-test';
    },

    jsonResponse(
      _event,
      statusCode,
      body,
      headers
    ) {
      return {
        statusCode,
        headers:
          headers || {},
        body:
          JSON.stringify(body),
      };
    },

    handleCorsPreFlight() {
      return {
        statusCode:
          204,
        headers: {},
        body: '',
      };
    },

    validateBodySize() {
      return {
        valid:
          true,
      };
    },
  }
);

cacheStub(
  authAbsolute,
  {
    async requireTeacher() {
      return {
        ok:
          true,
        user: {
          role:
            'teacher',
          teacherId:
            TEACHER_ID,
        },
      };
    },
  }
);

delete require.cache[
  endpointAbsolute
];

const {
  handler,
} = require(
  endpointAbsolute
);

let activeCase =
  null;

let calls =
  [];

function idsFor(
  testCase
) {
  return {
    student:
      uuid(
        '1',
        testCase.number
      ),
    parent:
      uuid(
        '2',
        testCase.number
      ),
    class:
      uuid(
        '3',
        testCase.number
      ),
    objective:
      uuid(
        '4',
        testCase.number
      ),
  };
}

global.fetch =
  async function mockFetch(
    input,
    init = {}
  ) {
    assert.ok(
      activeCase,
      'test case must be active before DB access'
    );

    const target =
      new URL(
        String(input)
      );

    const resource =
      target.pathname
        .split('/')
        .filter(Boolean)
        .pop();

    const method =
      String(
        init.method || 'GET'
      ).toUpperCase();

    const ids =
      idsFor(
        activeCase
      );

    calls.push({
      resource,
      method,
      url:
        target.toString(),
      body:
        init.body || null,
    });

    if (
      resource ===
      'students'
    ) {
      assert.strictEqual(
        target
          .searchParams
          .get('code'),
        `eq.${activeCase.student_code}`
      );

      assert.strictEqual(
        target
          .searchParams
          .get('active'),
        'eq.true'
      );

      assert.strictEqual(
        target
          .searchParams
          .get('archived_at'),
        'is.null'
      );

      return jsonResponse([
        {
          id:
            ids.student,
          code:
            activeCase.student_code,
          class_id:
            ids.class,
          active:
            true,
          archived_at:
            null,
        },
      ]);
    }

    if (
      resource ===
      'class_enrollments'
    ) {
      assert.strictEqual(
        target
          .searchParams
          .get(
            'student_id'
          ),
        `eq.${ids.student}`
      );

      assert.strictEqual(
        target
          .searchParams
          .get('active'),
        'eq.true'
      );

      return jsonResponse([
        {
          class_id:
            ids.class,
          student_id:
            ids.student,
          active:
            true,
        },
      ]);
    }

    if (
      resource ===
      'classes'
    ) {
      assert.strictEqual(
        target
          .searchParams
          .get('teacher_id'),
        `eq.${TEACHER_ID}`
      );

      return jsonResponse([
        {
          id:
            ids.class,
          teacher_id:
            TEACHER_ID,
        },
      ]);
    }

    if (
      resource ===
      'goals'
    ) {
      assert.strictEqual(
        target
          .searchParams
          .get(
            'student_id'
          ),
        `eq.${ids.student}`
      );

      assert.strictEqual(
        target
          .searchParams
          .get('code'),
        `eq.${activeCase.parent_goal_code}`
      );

      assert.strictEqual(
        target
          .searchParams
          .get('active'),
        'eq.true'
      );

      return jsonResponse([
        {
          id:
            ids.parent,
          code:
            activeCase.parent_goal_code,
          student_id:
            ids.student,
          status:
            'active',
          active:
            true,
          addressed_in_class:
            activeCase
              .addressed_in_class,
          individual_delivery:
            activeCase
              .individual_delivery,
        },
      ]);
    }

    if (
      resource ===
      'goal_objectives'
    ) {
      const expected = {
        student_id:
          `eq.${ids.student}`,
        parent_goal_id:
          `eq.${ids.parent}`,
        student_code:
          `eq.${activeCase.student_code}`,
        parent_goal_code:
          `eq.${activeCase.parent_goal_code}`,
        code:
          `eq.${activeCase.objective_code}`,
        active:
          'eq.true',
      };

      for (
        const [
          key,
          value,
        ]
        of Object.entries(
          expected
        )
      ) {
        assert.strictEqual(
          target
            .searchParams
            .get(key),
          value,
          `registry query must enforce ${key}`
        );
      }

      return jsonResponse([
        {
          id:
            ids.objective,
          student_id:
            ids.student,
          parent_goal_id:
            ids.parent,
          student_code:
            activeCase.student_code,
          parent_goal_code:
            activeCase.parent_goal_code,
          code:
            activeCase.objective_code,
          dan_monitoring_role:
            activeCase.role,
          active:
            true,
        },
      ]);
    }

    if (
      resource ===
      'objective_data_points'
    ) {
      assert.strictEqual(
        method,
        'POST',
        'objective evidence mutation must be POST'
      );

      const body =
        JSON.parse(
          init.body || '{}'
        );

      return jsonResponse([
        body,
      ]);
    }

    throw new Error(
      `Unexpected resource: ${resource}`
    );
  };

function eventFor(
  testCase
) {
  return {
    httpMethod:
      'POST',
    headers: {
      cookie:
        'teacher=test',
    },
    body:
      JSON.stringify({
        student_code:
          testCase.student_code,
        parent_goal_code:
          testCase.parent_goal_code,
        objective_code:
          testCase.objective_code,
        date:
          '2026-08-28',
        objective_earned:
          1,
        objective_max:
          2,
        evidence_type:
          'binder',
        support_level:
          'verbal prompt',
        notes:
          'Permission-fence behavior test',
      }),
  };
}

async function runCase(
  testCase
) {
  activeCase =
    testCase;

  calls =
    [];

  const response =
    parseEndpointResponse(
      await handler(
        eventFor(
          testCase
        )
      )
    );

  return {
    response,
    calls:
      calls.slice(),
    ids:
      idsFor(
        testCase
      ),
  };
}

async function expectAllowed(
  testCase
) {
  const {
    response,
    calls:
      caseCalls,
    ids,
  } =
    await runCase(
      testCase
    );

  assert.strictEqual(
    response.statusCode,
    200,
    `${testCase.label} should be accepted`
  );

  assert.strictEqual(
    response.body.ok,
    true
  );

  assert.strictEqual(
    response.body.available,
    true
  );

  const writes =
    caseCalls.filter(
      call =>
        call.resource ===
          'objective_data_points' &&
        call.method ===
          'POST'
    );

  assert.strictEqual(
    writes.length,
    1,
    `${testCase.label} must create exactly one objective evidence write`
  );

  const inserted =
    JSON.parse(
      writes[0].body
    );

  assert.strictEqual(
    inserted.objective_id,
    ids.objective,
    'server-owned registry UUID must control objective identity'
  );

  assert.strictEqual(
    inserted.student_id,
    ids.student,
    'server-owned student UUID must control student identity'
  );

  assert.strictEqual(
    inserted.source,
    'manual'
  );

  assert.strictEqual(
    inserted.assignment_instance_id,
    null
  );

  assert.strictEqual(
    inserted.item_id,
    null
  );

  assert.strictEqual(
    inserted.school_year,
    '2026'
  );

  for (
    const forbidden
    of [
      'earned_points',
      'max_points',
      'score',
      'submission_id',
      'assignment_id',
    ]
  ) {
    assert.ok(
      !Object.prototype
        .hasOwnProperty.call(
          inserted,
          forbidden
        ),
      `manual objective write must exclude ${forbidden}`
    );
  }

  console.log(
    `✓ ${testCase.label}`
  );
}

async function expectDenied(
  testCase
) {
  const {
    response,
    calls:
      caseCalls,
  } =
    await runCase(
      testCase
    );

  assert.strictEqual(
    response.statusCode,
    422,
    `${testCase.label} must fail as an ineligible objective measurement`
  );

  assert.strictEqual(
    response.body.ok,
    false
  );

  assert.match(
    response.body.error,
    /not eligible for manual\/binder evidence/i
  );

  assert.strictEqual(
    caseCalls.some(
      call =>
        call.resource ===
          'objective_data_points' &&
        call.method ===
          'POST'
    ),
    false,
    `${testCase.label} must stop before objective_data_points mutation`
  );

  assert.strictEqual(
    caseCalls.some(
      call =>
        call.resource ===
          'goal_objectives'
    ),
    true,
    'denial must be grounded in server-resolved registry identity'
  );

  console.log(
    `✓ ${testCase.label}`
  );
}

async function main() {
  console.log(
    'Running live-registry manual objective evidence authorization tests...\n'
  );

  await expectAllowed({
    label:
      'existing S009 Primary objective remains writable',
    number:
      9,
    student_code:
      'S009',
    parent_goal_code:
      'S009.CG4',
    objective_code:
      'S009.CG4.O1',
    role:
      'Primary',
    addressed_in_class:
      true,
    individual_delivery:
      false,
  });

  await expectAllowed({
    label:
      'new S069 Primary objective is admitted by live registry',
    number:
      69,
    student_code:
      'S069',
    parent_goal_code:
      'S069.CG1',
    objective_code:
      'S069.CG1.O1',
    role:
      'Primary',
    addressed_in_class:
      true,
    individual_delivery:
      false,
  });

  await expectDenied({
    label:
      'Supporting objective is rejected even if parent flags drift eligible',
    number:
      70,
    student_code:
      'S070',
    parent_goal_code:
      'S070.CG1',
    objective_code:
      'S070.CG1.O1',
    role:
      'Supporting / Responsibility Review',
    addressed_in_class:
      true,
    individual_delivery:
      false,
  });

  await expectDenied({
    label:
      'Primary objective is rejected when parent is not addressed in class',
    number:
      169,
    student_code:
      'S069',
    parent_goal_code:
      'S069.CG1',
    objective_code:
      'S069.CG1.O1',
    role:
      'Primary',
    addressed_in_class:
      false,
    individual_delivery:
      false,
  });

  await expectDenied({
    label:
      'Primary objective is rejected when parent uses individual delivery',
    number:
      269,
    student_code:
      'S069',
    parent_goal_code:
      'S069.CG1',
    objective_code:
      'S069.CG1.O1',
    role:
      'Primary',
    addressed_in_class:
      true,
    individual_delivery:
      true,
  });

  console.log('');
  console.log(
    'MANUAL OBJECTIVE EVIDENCE LIVE PERMISSION FENCE: PASS'
  );
}

main()
  .catch(error => {
    console.error(
      error.stack ||
      error.message
    );
    process.exitCode =
      1;
  })
  .finally(() => {
    global.fetch =
      savedFetch;

    if (
      savedUrl ===
      undefined
    ) {
      delete process.env
        .SUPABASE_URL;
    } else {
      process.env
        .SUPABASE_URL =
        savedUrl;
    }

    if (
      savedKey ===
      undefined
    ) {
      delete process.env
        .SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env
        .SUPABASE_SERVICE_ROLE_KEY =
        savedKey;
    }

    delete require.cache[
      endpointAbsolute
    ];

    if (savedEndpoint) {
      require.cache[
        endpointAbsolute
      ] =
        savedEndpoint;
    }

    if (savedHttp) {
      require.cache[
        httpAbsolute
      ] =
        savedHttp;
    } else {
      delete require.cache[
        httpAbsolute
      ];
    }

    if (savedAuth) {
      require.cache[
        authAbsolute
      ] =
        savedAuth;
    } else {
      delete require.cache[
        authAbsolute
      ];
    }
  });
