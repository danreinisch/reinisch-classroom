'use strict';

const assert = require('assert');

process.env.SESSION_SECRET =
  'rc-year-03h-test-secret';

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
      '../netlify/functions/student-goal-progress'
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

function event() {
  return {
    httpMethod: 'GET',
    headers: {
      cookie: cookieHeader(),
    },
    queryStringParameters: {
      code: 'S001',
    },
  };
}

function response({
  status = 200,
  jsonBody = [],
  textBody = null,
} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,

    async json() {
      return jsonBody;
    },

    async text() {
      return textBody !== null
        ? textBody
        : JSON.stringify(jsonBody);
    },
  };
}

async function primaryCase({
  iso,
  expectedFilter,
}) {
  useFixedDate(iso);

  const handler =
    loadHandlerFresh();

  const calls = [];

  global.fetch =
    async url => {
      const value = String(url);
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
          '/rest/v1/goal_progress?'
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
    await handler(event());

  assert.strictEqual(
    result.statusCode,
    200
  );

  const progressCalls =
    calls.filter(
      url =>
        url.includes(
          '/rest/v1/goal_progress?'
        )
    );

  assert.strictEqual(
    progressCalls.length,
    1
  );

  assert.ok(
    progressCalls[0].includes(
      expectedFilter
    ),
    `missing expected filter: ${expectedFilter}`
  );

  assert.ok(
    !progressCalls[0].includes(
      'school_year.is.null'
    ),
    'NULL-year evidence must not enter active Student Portal progress'
  );
}

async function fallbackCase() {
  useFixedDate(
    '2026-08-10T12:00:00Z'
  );

  const handler =
    loadHandlerFresh();

  const progressCalls = [];

  global.fetch =
    async url => {
      const value = String(url);

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
          '/rest/v1/goal_progress?'
        )
      ) {
        progressCalls.push(value);

        if (
          value.includes(
            'goals!inner'
          )
        ) {
          return response({
            status: 500,
            textBody:
              'temporary query failure',
          });
        }

        return response({
          jsonBody: [],
        });
      }

      throw new Error(
        `Unexpected fetch: ${value}`
      );
    };

  const originalLog =
    console.log;

  const originalError =
    console.error;

  try {
    console.log = () => {};
    console.error = () => {};

    const result =
      await handler(event());

    assert.strictEqual(
      result.statusCode,
      200
    );

    const body =
      JSON.parse(
        result.body || '{}'
      );

    assert.strictEqual(
      body.fallback,
      true
    );
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.strictEqual(
    progressCalls.length,
    2
  );

  for (
    const url
    of progressCalls
  ) {
    assert.ok(
      url.includes(
        'or=(school_year.eq.2026)'
      ),
      'primary and fallback must both retain current-year filtering'
    );

    assert.ok(
      !url.includes(
        'school_year.is.null'
      )
    );
  }
}

(async () => {
  const originalFetch =
    global.fetch;

  try {
    console.log(
      'Running Student Portal goal-progress school-year boundary tests...\n'
    );

    await primaryCase({
      iso:
        '2026-08-10T12:00:00Z',

      expectedFilter:
        'or=(school_year.eq.2026)',
    });

    console.log(
      '✓ August 2026 exposes only school_year=2026'
    );

    await primaryCase({
      iso:
        '2026-07-18T12:00:00Z',

      expectedFilter:
        'or=(school_year.eq.2025,school_year.eq.2026)',
    });

    console.log(
      '✓ July 2026 exposes school_year=2025 and 2026'
    );

    await fallbackCase();

    console.log(
      '✓ fallback preserves the same year boundary'
    );

    console.log(
      '✓ NULL-year evidence remains excluded'
    );

    console.log(
      '\nSTUDENT GOAL-PROGRESS SCHOOL-YEAR BOUNDARY: PASS'
    );
  } finally {
    global.fetch = originalFetch;
    global.Date = RealDate;
  }
})().catch(error => {
  global.Date = RealDate;
  console.error(error);
  process.exit(1);
});
