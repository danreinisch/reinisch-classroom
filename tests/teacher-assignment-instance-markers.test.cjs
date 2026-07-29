'use strict';

const assert = require('assert');

process.env.SESSION_SECRET =
  'synthetic-test-secret';

const teacherId =
  '11111111-1111-4111-8111-111111111111';

const ownedClassId =
  '22222222-2222-4222-8222-222222222222';

const otherClassId =
  '33333333-3333-4333-8333-333333333333';

const instanceA =
  '44444444-4444-4444-8444-444444444444';

const instanceB =
  '55555555-5555-4555-8555-555555555555';

let authResult =
  {
    ok: true,
    user: {
      teacherId,
    },
  };

let restCalls = [];

let fixture = {};

function okRows(rows) {
  return {
    ok: true,
    status: 200,
    async json() {
      return rows;
    },
  };
}

function failed(status = 500) {
  return {
    ok: false,
    status,
    async json() {
      return [];
    },
  };
}

const authPath =
  require.resolve(
    '../netlify/functions/_lib/auth'
  );

const supaPath =
  require.resolve(
    '../netlify/functions/_lib/supa'
  );

require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    requireTeacher() {
      return authResult;
    },
  },
};

require.cache[supaPath] = {
  id: supaPath,
  filename: supaPath,
  loaded: true,
  exports: {
    SUPABASE_URL:
      'https://synthetic.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:
      'synthetic-service-role-key',

    async rest(path) {
      restCalls.push(path);

      if (
        fixture.failPrefix &&
        path.startsWith(
          fixture.failPrefix
        )
      ) {
        return failed(500);
      }

      if (
        path.startsWith(
          '/rest/v1/assignment_instances'
        )
      ) {
        return okRows(
          fixture.instances || []
        );
      }

      if (
        path.startsWith(
          '/rest/v1/assignments'
        )
      ) {
        return okRows(
          fixture.assignments || []
        );
      }

      if (
        path.startsWith(
          '/rest/v1/classes'
        )
      ) {
        return okRows(
          fixture.classes || []
        );
      }

      throw new Error(
        `Unexpected REST path: ${path}`
      );
    },
  },
};

const endpointPath =
  require.resolve(
    '../netlify/functions/teacher-assignment-instance-markers'
  );

delete require.cache[endpointPath];

const {
  handler,
} = require(
  '../netlify/functions/teacher-assignment-instance-markers'
);

function resetFixture() {
  authResult = {
    ok: true,
    user: {
      teacherId,
    },
  };

  restCalls = [];

  fixture = {
    instances: [
      {
        id: instanceA,
        assignment_id: 101,
        settings: {},
      },
      {
        id: instanceB,
        assignment_id: 102,
        settings: {
          non_instructional: true,
        },
      },
    ],

    assignments: [
      {
        id: 101,
        class_id: ownedClassId,
      },
      {
        id: 102,
        class_id: ownedClassId,
      },
    ],

    classes: [
      {
        id: ownedClassId,
      },
    ],
  };
}

function event(body) {
  return {
    httpMethod: 'POST',
    headers: {},
    body:
      typeof body === 'string'
        ? body
        : JSON.stringify(body),
  };
}

function bodyOf(response) {
  return JSON.parse(
    response.body
  );
}

async function run() {
  console.log(
    'Running teacher assignment-instance marker endpoint tests...\n'
  );

  // 1. Unauthenticated requests never reach the database.
  resetFixture();

  authResult = {
    ok: false,
  };

  let response =
    await handler(
      event({
        instance_ids: [
          instanceA,
        ],
      })
    );

  assert.strictEqual(
    response.statusCode,
    401
  );

  assert.strictEqual(
    restCalls.length,
    0
  );

  console.log(
    '✓ unauthenticated request rejected before DB access'
  );

  // 2. Signed session without a usable teacherId fails closed.
  resetFixture();

  authResult = {
    ok: true,
    user: {
      teacherId: null,
    },
  };

  response =
    await handler(
      event({
        instance_ids: [
          instanceA,
        ],
      })
    );

  assert.strictEqual(
    response.statusCode,
    403
  );

  assert.strictEqual(
    restCalls.length,
    0
  );

  console.log(
    '✓ missing signed teacherId rejected before DB access'
  );

  // 3. Invalid IDs fail before DB access.
  resetFixture();

  response =
    await handler(
      event({
        instance_ids: [
          'not-a-uuid',
        ],
      })
    );

  assert.strictEqual(
    response.statusCode,
    400
  );

  assert.strictEqual(
    restCalls.length,
    0
  );

  console.log(
    '✓ malformed instance IDs rejected before DB access'
  );

  // 4. Owned canonical classes return only marker state.
  resetFixture();

  response =
    await handler(
      event({
        instance_ids: [
          instanceA,
          instanceB,
        ],
      })
    );

  assert.strictEqual(
    response.statusCode,
    200
  );

  assert.deepStrictEqual(
    bodyOf(response),
    {
      ok: true,
      markers: [
        {
          id: instanceA,
          non_instructional: false,
        },
        {
          id: instanceB,
          non_instructional: true,
        },
      ],
    }
  );

  assert.ok(
    restCalls.some(
      (path) =>
        path.startsWith(
          '/rest/v1/assignment_instances'
        )
    )
  );

  assert.ok(
    restCalls.some(
      (path) =>
        path.startsWith(
          '/rest/v1/assignments'
        )
    )
  );

  assert.ok(
    restCalls.some(
      (path) =>
        path.startsWith(
          '/rest/v1/classes'
        ) &&
        path.includes(
          `teacher_id=eq.${teacherId}`
        )
    )
  );

  assert.ok(
    restCalls.every(
      (path) =>
        !path.includes(
          'class_enrollments'
        )
    ),
    'historical marker lookup must not require active enrollment'
  );

  assert.ok(
    restCalls.every(
      (path) =>
        !path.includes(
          'school_year'
        )
    ),
    'historical marker lookup must not impose a school-year filter'
  );

  console.log(
    '✓ owned historical instances resolve through signed teacher -> canonical class'
  );

  // 5. Missing requested instance fails closed.
  resetFixture();

  fixture.instances =
    fixture.instances.slice(
      0,
      1
    );

  response =
    await handler(
      event({
        instance_ids: [
          instanceA,
          instanceB,
        ],
      })
    );

  assert.strictEqual(
    response.statusCode,
    404
  );

  assert.deepStrictEqual(
    bodyOf(response),
    {
      ok: false,
      error:
        'Marker state unavailable',
    }
  );

  console.log(
    '✓ incomplete instance resolution fails closed'
  );

  // 6. Missing canonical assignment/class fails closed.
  resetFixture();

  fixture.assignments = [
    {
      id: 101,
      class_id: ownedClassId,
    },
  ];

  response =
    await handler(
      event({
        instance_ids: [
          instanceA,
          instanceB,
        ],
      })
    );

  assert.strictEqual(
    response.statusCode,
    404
  );

  console.log(
    '✓ incomplete canonical assignment resolution fails closed'
  );

  // 7. Cross-teacher / unowned class fails closed.
  resetFixture();

  fixture.assignments = [
    {
      id: 101,
      class_id: ownedClassId,
    },
    {
      id: 102,
      class_id: otherClassId,
    },
  ];

  fixture.classes = [
    {
      id: ownedClassId,
    },
  ];

  response =
    await handler(
      event({
        instance_ids: [
          instanceA,
          instanceB,
        ],
      })
    );

  assert.strictEqual(
    response.statusCode,
    404
  );

  console.log(
    '✓ unowned canonical class fails closed'
  );

  // 8. Authorization/data query failures become server errors,
  // never "instructional=false" guesses.
  resetFixture();

  fixture.failPrefix =
    '/rest/v1/classes';

  response =
    await handler(
      event({
        instance_ids: [
          instanceA,
          instanceB,
        ],
      })
    );

  assert.strictEqual(
    response.statusCode,
    500
  );

  assert.strictEqual(
    bodyOf(response).ok,
    false
  );

  console.log(
    '✓ authorization query failure fails closed'
  );

  // 9. Empty input is harmless and requires no DB reads.
  resetFixture();

  response =
    await handler(
      event({
        instance_ids: [],
      })
    );

  assert.strictEqual(
    response.statusCode,
    200
  );

  assert.deepStrictEqual(
    bodyOf(response),
    {
      ok: true,
      markers: [],
    }
  );

  assert.strictEqual(
    restCalls.length,
    0
  );

  console.log(
    '✓ empty marker request returns empty result without DB access'
  );

  console.log();
  console.log(
    'RC-SEC-01I-D1B marker endpoint tests PASS'
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
