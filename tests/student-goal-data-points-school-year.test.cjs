'use strict';

const assert = require('assert');

process.env.SESSION_SECRET =
  'rc-year-03i-b-test-secret';

process.env.SUPABASE_URL =
  'https://example.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key';

const {
  createStudentSessionCookie,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const RealDate = global.Date;

function useFixedDate(iso) {
  const timestamp =
    new RealDate(iso).getTime();

  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(timestamp);
      } else {
        super(...args);
      }
    }

    static now() {
      return timestamp;
    }
  }

  global.Date = FixedDate;
}

function loadHandlerFresh() {
  const helperPath =
    require.resolve(
      '../netlify/functions/_lib/student-visible-school-years'
    );

  const functionPath =
    require.resolve(
      '../netlify/functions/student-goal-data-points'
    );

  delete require.cache[helperPath];
  delete require.cache[functionPath];

  return require(functionPath).handler;
}

function cookieHeader() {
  return createStudentSessionCookie(
    'S001',
    process.env.SESSION_SECRET,
    {
      secure: false,
      maxAge: 3600,
    }
  ).split(';')[0];
}

function event(goalId = null) {
  return {
    httpMethod: 'GET',
    headers: {
      cookie: cookieHeader(),
    },
    queryStringParameters: {
      code: 'S001',
      ...(goalId
        ? { goal_id: goalId }
        : {}),
    },
  };
}

function response({
  status = 200,
  jsonBody = [],
} = {}) {
  return {
    ok:
      status >= 200 &&
      status < 300,

    status,

    async json() {
      return jsonBody;
    },

    async text() {
      return JSON.stringify(
        jsonBody
      );
    },
  };
}

async function runCase({
  iso,
  expectedFilter,
  goalId = null,
}) {
  useFixedDate(iso);

  const handler =
    loadHandlerFresh();

  const calls = [];

  global.fetch =
    async url => {
      const value =
        String(url);

      calls.push(value);

      if (
        value.includes(
          '/rest/v1/students?'
        )
      ) {
        return response({
          jsonBody: [
            {
              id: 'student-1',
            },
          ],
        });
      }

      if (
        value.includes(
          '/rest/v1/goal_data_points?'
        )
      ) {
        return response({
          jsonBody: [],
        });
      }

      throw new Error(
        `Unexpected fetch: ${value}`
      );
    };

  const result =
    await handler(
      event(goalId)
    );

  assert.strictEqual(
    result.statusCode,
    200
  );

  const dpCalls =
    calls.filter(
      url =>
        url.includes(
          '/rest/v1/goal_data_points?'
        )
    );

  assert.strictEqual(
    dpCalls.length,
    1
  );

  const dpUrl =
    dpCalls[0];

  assert.ok(
    dpUrl.includes(
      expectedFilter
    ),
    `missing expected filter: ${expectedFilter}`
  );

  assert.ok(
    !dpUrl.includes(
      'school_year.is.null'
    ),
    'NULL-year question evidence must remain excluded'
  );

  if (goalId) {
    assert.ok(
      dpUrl.includes(
        `goal_id=eq.${goalId}`
      ),
      'optional goal_id filtering must remain intact'
    );
  }
}

(async () => {
  const originalFetch =
    global.fetch;

  try {
    console.log(
      'Running Student Portal goal-data-points school-year boundary tests...\n'
    );

    await runCase({
      iso:
        '2026-08-10T12:00:00Z',

      expectedFilter:
        'or=(school_year.eq.2026)',
    });

    console.log(
      '✓ August 2026 exposes only school_year=2026'
    );

    await runCase({
      iso:
        '2026-07-18T12:00:00Z',

      expectedFilter:
        'or=(school_year.eq.2025,school_year.eq.2026)',
    });

    console.log(
      '✓ July 2026 preserves the transition-year visibility contract'
    );

    await runCase({
      iso:
        '2026-08-10T12:00:00Z',

      expectedFilter:
        'or=(school_year.eq.2026)',

      goalId:
        'goal-123',
    });

    console.log(
      '✓ optional goal_id filtering remains intact'
    );

    console.log(
      '✓ NULL-year question evidence remains excluded'
    );

    console.log(
      '\nSTUDENT GOAL-DATA-POINTS SCHOOL-YEAR BOUNDARY: PASS'
    );
  } finally {
    global.fetch =
      originalFetch;

    global.Date =
      RealDate;
  }
})().catch(error => {
  global.Date =
    RealDate;

  console.error(error);
  process.exit(1);
});
