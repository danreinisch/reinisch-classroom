'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const root =
  path.resolve(
    __dirname,
    '..'
  );

const endpointPath =
  require.resolve(
    '../netlify/functions/teacher-ai-builder'
  );

const supaPath =
  require.resolve(
    '../netlify/functions/_lib/supa'
  );

const httpPath =
  require.resolve(
    '../netlify/functions/_lib/http'
  );

const authPath =
  require.resolve(
    '../netlify/functions/_lib/auth'
  );

const rulesPath =
  require.resolve(
    '../netlify/functions/_lib/ai-builder-rules'
  );

let scenario =
  'conflict';

let calls =
  [];

function studentRows() {
  return [{
    id: 'student-1',
    code: 'S900',
    active: true,
  }];
}

function enrollmentRows() {
  return [{
    student_code: 'S900',
    class_name: 'Language Arts Test',
    active: true,
  }];
}

function goalRow(
  conflictValue
) {
  return [{
    id: 'goal-1',
    student_id: 'student-1',
    code: 'S900.CG1',
    desc: 'Synthetic goal',
    goal_area: 'Reading',
    baseline: '20%',
    mastery: '80%',
    target: '60%',
    criterion_conflict: conflictValue,
    status: 'Open',
    active: true,
    measurement_type: 'percent',
    addressed_in_class: true,
    individual_delivery: false,
  }];
}

function resolveData(url) {
  if (
    url.includes(
      '/rest/v1/students?'
    )
  ) {
    return {
      ok: true,
      status: 200,
      data: studentRows(),
    };
  }

  if (
    url.includes(
      '/rest/v1/class_enrollments?'
    )
  ) {
    return {
      ok: true,
      status: 200,
      data: enrollmentRows(),
    };
  }

  if (
    url.includes(
      '/rest/v1/goals?'
    )
  ) {
    if (
      scenario === 'schema-fallback' &&
      url.includes(
        'criterion_conflict'
      )
    ) {
      return {
        ok: false,
        status: 400,
        data: {
          code: 'PGRST204',
          message:
            'Could not find the criterion_conflict column in the schema cache',
        },
      };
    }

    if (
      scenario === 'query-failure'
    ) {
      return {
        ok: false,
        status: 500,
        data: {
          code: 'SERVER',
          message: 'Synthetic goal query failure',
        },
      };
    }

    if (
      scenario === 'ordinary'
    ) {
      return {
        ok: true,
        status: 200,
        data: goalRow(false),
      };
    }

    if (
      scenario === 'schema-fallback'
    ) {
      const rows =
        goalRow(undefined);

      delete rows[0].criterion_conflict;

      return {
        ok: true,
        status: 200,
        data: rows,
      };
    }

    return {
      ok: true,
      status: 200,
      data: goalRow(true),
    };
  }

  throw new Error(
    'Unexpected synthetic REST path: ' +
    url
  );
}

require.cache[httpPath] = {
  exports: {
    generateRequestId:
      () => 'criterion-test',
    jsonResponse:
      (_event, status, body) => ({
        statusCode: status,
        body: JSON.stringify(body),
      }),
    handleCorsPreFlight:
      () => ({
        statusCode: 204,
        body: '',
      }),
    validateBodySize:
      () => ({
        valid: true,
      }),
    safeJsonParse:
      text => ({
        ok: true,
        data: JSON.parse(text),
      }),
  },
};

require.cache[authPath] = {
  exports: {
    requireTeacher:
      () => ({
        ok: true,
        user: {
          username: 'test',
        },
      }),
  },
};

require.cache[supaPath] = {
  exports: {
    rest:
      async url => {
        calls.push(
          String(url)
        );

        return {
          syntheticUrl:
            String(url),
        };
      },

    jsonRes:
      async response =>
        resolveData(
          response.syntheticUrl
        ),
  },
};

require.cache[rulesPath] = {
  exports: {
    buildSystemPrompt:
      () => 'mock system prompt',
  },
};

process.env.SESSION_SECRET =
  'synthetic-session-secret';

process.env.ANTHROPIC_API_KEY =
  'synthetic-ai-key';

delete require.cache[
  endpointPath
];

const {
  _buildStudentContext:
    buildStudentContext,
} =
  require(
    endpointPath
  );

const serverSource =
  fs.readFileSync(
    endpointPath,
    'utf8'
  );

const rulesSource =
  fs.readFileSync(
    rulesPath,
    'utf8'
  );

const packageJson =
  JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        'package.json'
      ),
      'utf8'
    )
  );


function countOccurrences(
  source,
  needle
) {
  return source.split(
    needle
  ).length - 1;
}


async function conflictCase() {
  scenario =
    'conflict';

  calls = [];

  const context =
    await buildStudentContext(
      'conflict-case'
    );

  assert.ok(
    context.includes(
      'Header Mastery: 80%'
    )
  );

  assert.ok(
    context.includes(
      'Goal-Text Target: 60%'
    )
  );

  assert.ok(
    context.includes(
      'Criterion Status: Manual Criterion Review Required'
    )
  );

  assert.strictEqual(
    context.includes(
      '20% → 80%'
    ),
    false
  );

  const goalCalls =
    calls.filter(
      value =>
        value.includes(
          '/rest/v1/goals?'
        )
    );

  assert.strictEqual(
    goalCalls.length,
    1
  );

  assert.ok(
    goalCalls[0].includes(
      'target'
    )
  );

  assert.ok(
    goalCalls[0].includes(
      'criterion_conflict'
    )
  );
}


async function ordinaryUnequalCase() {
  scenario =
    'ordinary';

  calls = [];

  const context =
    await buildStudentContext(
      'ordinary-case'
    );

  assert.ok(
    context.includes(
      'Header Mastery: 80%'
    )
  );

  assert.ok(
    context.includes(
      'Goal-Text Target: 60%'
    )
  );

  assert.strictEqual(
    context.includes(
      'Manual Criterion Review Required'
    ),
    false,
    'different source values must remain ordinary when explicit flag is false'
  );
}


async function schemaFallbackCase() {
  scenario =
    'schema-fallback';

  calls = [];

  const context =
    await buildStudentContext(
      'fallback-case'
    );

  const goalCalls =
    calls.filter(
      value =>
        value.includes(
          '/rest/v1/goals?'
        )
    );

  assert.strictEqual(
    goalCalls.length,
    2
  );

  assert.ok(
    goalCalls[0].includes(
      'criterion_conflict'
    )
  );

  assert.strictEqual(
    goalCalls[1].includes(
      'criterion_conflict'
    ),
    false
  );

  assert.ok(
    goalCalls[1].includes(
      'target'
    )
  );

  assert.ok(
    context.includes(
      'CRITERION CONFLICT METADATA STATUS: unavailable'
    )
  );

  assert.ok(
    context.includes(
      'Header Mastery: 80%'
    )
  );

  assert.ok(
    context.includes(
      'Goal-Text Target: 60%'
    )
  );

  assert.strictEqual(
    context.includes(
      'Manual Criterion Review Required'
    ),
    false
  );
}


async function queryFailureCase() {
  scenario =
    'query-failure';

  calls = [];

  const context =
    await buildStudentContext(
      'failure-case'
    );

  assert.ok(
    context.includes(
      'GOAL DATA STATUS: unavailable'
    )
  );

  assert.ok(
    context.includes(
      'Goals: Unavailable'
    )
  );

  assert.strictEqual(
    context.includes(
      'Goals: None (DESE-only)'
    ),
    false,
    'goal-query failure must never become a DESE-only classification'
  );

  const goalCalls =
    calls.filter(
      value =>
        value.includes(
          '/rest/v1/goals?'
        )
    );

  assert.strictEqual(
    goalCalls.length,
    1,
    'non-schema query failures must not trigger compatibility fallback'
  );
}


async function run() {
  console.log(
    'Running AI Builder criterion-conflict context tests...\n'
  );

  await conflictCase();

  console.log(
    'PASS: explicit conflict preserves both source criteria and manual review'
  );

  await ordinaryUnequalCase();

  console.log(
    'PASS: unequal ordinary criteria do not create a conflict'
  );

  await schemaFallbackCase();

  console.log(
    'PASS: missing criterion column retries a target-preserving compatibility query'
  );

  await queryFailureCase();

  console.log(
    'PASS: failed goal query never becomes DESE-only'
  );

  assert.ok(
    serverSource.includes(
      'GOAL_CONTEXT_BASE_FIELDS'
    )
  );

  assert.ok(
    serverSource.includes(
      'criterion_conflict'
    )
  );

  assert.ok(
    rulesSource.includes(
      'SECTION P. CRITERION CONFLICT HANDLING'
    )
  );

  assert.ok(
    rulesSource.includes(
      'Treat a goal as conflicted ONLY when its live line says "Criterion Status: Manual Criterion Review Required".'
    )
  );

  assert.ok(
    rulesSource.includes(
      'Do not infer a conflict merely because Header Mastery and Goal-Text Target are different.'
    )
  );

  assert.ok(
    rulesSource.includes(
      'do not choose either criterion as controlling'
    )
  );

  const unit =
    String(
      packageJson.scripts?.[
        'test:unit'
      ] || ''
    );

  const testName =
    'tests/criterion-conflict-ai-builder-context.test.cjs';

  assert.strictEqual(
    countOccurrences(
      unit,
      testName
    ),
    1
  );

  console.log(
    'PASS: AI Builder prompt rules prohibit criterion selection and inference'
  );

  console.log();
  console.log(
    'AI BUILDER CRITERION-CONFLICT CONTEXT: PASS'
  );
}


run().catch(
  error => {
    console.error(
      error
    );

    process.exitCode =
      1;
  }
);
