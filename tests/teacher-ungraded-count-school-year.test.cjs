'use strict';

const assert = require('assert');

const RealDate = global.Date;
const realFetch = global.fetch;

const endpointPath =
  require.resolve('../netlify/functions/teacher-ungraded-count');
const authPath =
  require.resolve('../netlify/functions/_lib/auth');

const savedEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

async function run() {
  console.log('Running teacher ungraded school-year isolation test...\n');

  process.env.SUPABASE_URL = 'https://synthetic.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  process.env.SESSION_SECRET = 'synthetic-session-secret';

  // Freeze "today" in the July transition period.
  global.Date = class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super('2026-07-25T12:00:00-05:00');
      } else {
        super(...args);
      }
    }

    static now() {
      return new RealDate('2026-07-25T12:00:00-05:00').getTime();
    }
  };

  const auth = require(authPath);
  const originalRequireTeacher = auth.requireTeacher;

  auth.requireTeacher = () => ({
    ok: true,
    user: { username: 'teacher_test' },
  });

  let capturedUrl = null;
  let fetchCalls = 0;

  global.fetch = async (url) => {
    fetchCalls += 1;
    capturedUrl = String(url);

    return {
      ok: true,
      headers: {
        get(name) {
          return String(name).toLowerCase() === 'content-range'
            ? '0-0/1'
            : null;
        },
      },
      async json() {
        return [{ id: 'synthetic-instance' }];
      },
    };
  };

  try {
    delete require.cache[endpointPath];
    const { handler } = require(endpointPath);

    const response = await handler({
      httpMethod: 'GET',
      headers: {},
      body: null,
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(fetchCalls, 1);

    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.count, 1);

    assert.ok(
      capturedUrl.includes('status=eq.Submitted'),
      'query must count only Submitted instances'
    );

    assert.ok(
      capturedUrl.includes('school_year=eq.2026'),
      `July operational query must target 2026: ${capturedUrl}`
    );

    assert.ok(
      !capturedUrl.includes('school_year=eq.2025'),
      'ending 2025-26 year must not be counted as active in July'
    );

    assert.ok(
      !capturedUrl.includes('school_year.is.null'),
      'legacy NULL-year records must not enter active ungraded count'
    );

    console.log('✓ July 2026 operational ungraded query targets school_year=2026');
    console.log('✓ 2025-26 records are excluded from the active count');
    console.log('✓ NULL-year legacy records are excluded from the active count');
    console.log('\n✓ Focused ungraded school-year isolation test passed!');
  } finally {
    auth.requireTeacher = originalRequireTeacher;
    global.Date = RealDate;
    global.fetch = realFetch;
    delete require.cache[endpointPath];

    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
