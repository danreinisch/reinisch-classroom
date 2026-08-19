'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

process.env.SESSION_SECRET =
  'rc-goals-04c3-transport-test-secret';

process.env.SUPABASE_URL =
  'https://example.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'synthetic-service-role-key';

const {
  createStudentSessionCookie,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const root =
  path.resolve(
    __dirname,
    '..'
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath
    ),
    'utf8'
  );
}

function response({
  status = 200,
  jsonBody = [],
  textBody = null,
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
      return textBody !== null
        ? textBody
        : JSON.stringify(jsonBody);
    },
  };
}

function cookieHeader() {
  return createStudentSessionCookie(
    'E2E01',
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
      code: 'E2E01',
    },
  };
}

function loadHandlerFresh() {
  const functionPath =
    require.resolve(
      '../netlify/functions/student-goal-progress'
    );

  delete require.cache[
    functionPath
  ];

  return require(
    functionPath
  ).handler;
}

const migration =
  read(
    'supabase/migrations/' +
    '20260816230000_goal_criterion_conflict.sql'
  );

const teacherContext =
  read(
    'netlify/functions/teacher-roster-context.js'
  );

const studentProgress =
  read(
    'netlify/functions/student-goal-progress.js'
  );

const studentGoals =
  read(
    'netlify/functions/student-goals.js'
  );

const adapter =
  read(
    'site/web/data-adapter.js'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

console.log(
  'Running criterion-conflict transport contract tests...'
);

assert.ok(
  migration.includes(
    'criterion_conflict boolean NOT NULL DEFAULT false'
  ),
  'transport requires the prepared additive schema field'
);

assert.ok(
  teacherContext.includes(
    "'version,observation_config,notes,criterion_conflict,'"
  ),
  'Teacher roster query must select criterion_conflict'
);

assert.ok(
  teacherContext.includes(
    'goal.criterion_conflict === true'
  ),
  'Teacher response must normalize criterion_conflict'
);

assert.ok(
  adapter.includes(
    'notes, criterion_conflict, addressed_in_class'
  ),
  'direct Teacher goal reads must select criterion_conflict'
);

assert.ok(
  studentGoals.includes(
    'select=*'
  ),
  'Student goal-list endpoint must carry the complete goal row'
);

assert.ok(
  studentProgress.includes(
    'baseline,mastery,target,criterion_conflict,' +
    'measurement_type,class_context'
  ),
  'Student progress must select both criteria and the flag'
);

for (const source of [
  teacherContext,
  studentProgress,
  adapter,
]) {
  assert.ok(
    !source.includes(
      'mastery !== target'
    ),
    'transport must not infer conflicts from unequal values'
  );

  assert.ok(
    !source.includes(
      'mastery != target'
    ),
    'transport must not infer conflicts from unequal values'
  );
}

async function primaryCase(handler) {
  global.fetch =
    async url => {
      const value =
        String(url);

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
          jsonBody: [
            {
              id: 'progress-1',
              goal_id: 'goal-1',
              student_id: 'student-1',
              date: '2026-08-10',
              value: 76,
              source: 'manual',
              goals: {
                code: 'E2E01.CG1',
                desc: 'Synthetic reading goal',
                goal_area: 'Reading',
                baseline: '40%',
                mastery: '80%',
                target: '75%',
                criterion_conflict: false,
                measurement_type: 'percent',
                class_context: 'ELA',
              },
            },
          ],
        });
      }

      throw new Error(
        `Unexpected primary fetch: ${value}`
      );
    };

  const result =
    await handler(
      event()
    );

  assert.strictEqual(
    result.statusCode,
    200
  );

  const body =
    JSON.parse(
      result.body
    );

  assert.strictEqual(
    body.progress.length,
    1
  );

  const goal =
    body.progress[0];

  assert.strictEqual(
    goal.mastery,
    '80%'
  );

  assert.strictEqual(
    goal.target,
    '75%'
  );

  assert.strictEqual(
    goal.criterion_conflict,
    false,
    'different values must remain non-conflicted when source flag is false'
  );
}

async function fallbackCase(handler) {
  global.fetch =
    async url => {
      const value =
        String(url);

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
        ) &&
        value.includes(
          'goals!inner'
        )
      ) {
        return response({
          status: 500,
          textBody:
            'temporary joined-query failure',
        });
      }

      if (
        value.includes(
          '/rest/v1/goal_progress?'
        )
      ) {
        return response({
          jsonBody: [
            {
              id: 'progress-2',
              goal_id: 'goal-2',
              student_id: 'student-1',
              date: '2026-08-11',
              value: 70,
              source: 'manual',
            },
          ],
        });
      }

      if (
        value.includes(
          '/rest/v1/goals?select='
        )
      ) {
        return response({
          jsonBody: [
            {
              id: 'goal-2',
              code: 'E2E01.CG2',
              desc: 'Synthetic conflicted goal',
              goal_area: 'Reading',
              baseline: '30%',
              mastery: '85%',
              target: '80%',
              criterion_conflict: true,
              measurement_type: 'percent',
              class_context: 'ELA',
            },
          ],
        });
      }

      throw new Error(
        `Unexpected fallback fetch: ${value}`
      );
    };

  const result =
    await handler(
      event()
    );

  assert.strictEqual(
    result.statusCode,
    200
  );

  const body =
    JSON.parse(
      result.body
    );

  assert.strictEqual(
    body.fallback,
    true
  );

  assert.strictEqual(
    body.progress.length,
    1
  );

  const goal =
    body.progress[0];

  assert.strictEqual(
    goal.mastery,
    '85%'
  );

  assert.strictEqual(
    goal.target,
    '80%'
  );

  assert.strictEqual(
    goal.criterion_conflict,
    true,
    'source-flagged conflict must survive fallback enrichment'
  );
}

async function run() {
  const originalFetch =
    global.fetch;

  const originalLog =
    console.log;

  const originalError =
    console.error;

  const originalWarn =
    console.warn;

  try {
    const handler =
      loadHandlerFresh();

    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};

    await primaryCase(
      handler
    );

    await fallbackCase(
      handler
    );
  } finally {
    global.fetch =
      originalFetch;

    console.log =
      originalLog;

    console.error =
      originalError;

    console.warn =
      originalWarn;
  }

  const unit =
    String(
      packageJson.scripts?.['test:unit'] || ''
    );

  const testName =
    'tests/criterion-conflict-transport-contract.test.cjs';

  assert.strictEqual(
    unit.split(testName).length - 1,
    1,
    'transport contract must be wired exactly once'
  );

  assert.ok(
    unit.indexOf(testName) <
    unit.indexOf(
      'tests/tc-library-helpers.test.cjs'
    ),
    'transport contract must run before the known local helper stop'
  );

  console.log(
    'PASS: Teacher transport carries explicit conflict metadata'
  );

  console.log(
    'PASS: unequal criteria remain ordinary when flag is false'
  );

  console.log(
    'PASS: source-flagged conflict survives fallback enrichment'
  );

  console.log(
    'PASS: mastery and goal-text target remain separate'
  );

  console.log(
    'PASS: transport contract is wired into test:unit'
  );

  console.log();
  console.log(
    'CRITERION-CONFLICT TRANSPORT CONTRACT: PASS'
  );
}

run().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
