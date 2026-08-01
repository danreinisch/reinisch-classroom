const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root =
  path.join(
    __dirname,
    '..',
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath,
    ),
    'utf8',
  );
}

function response(
  status,
  data,
) {
  const text =
    data === null ||
    data === undefined
      ? ''
      : JSON.stringify(data);

  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
    },
  };
}

function parseBody(result) {
  return JSON.parse(
    result.body,
  );
}

function freshHandler(relativePath) {
  const absolutePath =
    path.join(
      root,
      relativePath,
    );

  delete require.cache[
    require.resolve(absolutePath)
  ];

  return require(
    absolutePath,
  ).handler;
}

async function run() {
  process.env.SUPABASE_URL =
    'https://example.supabase.co';

  process.env.SUPABASE_SERVICE_ROLE_KEY =
    'service-role-test-key';

  process.env.SESSION_SECRET =
    'session-secret-test-value';

  const adapter =
    read(
      'site/web/data-adapter.js',
    );

  const browserEntry =
    read(
      'site/web/data-entry.js',
    );

  const teacherFunction =
    read(
      'netlify/functions/teacher-data-entry-tokens.js',
    );

  const publicFunction =
    read(
      'netlify/functions/data-entry-access.js',
    );

  const migration =
    read(
      'supabase/migrations/20260801233500_data_entry_tokens_server_only.sql',
    );

  const packageJson =
    read(
      'package.json',
    );

  assert.ok(
    !adapter.includes(
      ".from('data_entry_tokens')",
    ),
    'remote browser adapter must not access data_entry_tokens directly',
  );

  assert.ok(
    !browserEntry.includes(
      'getSupabase',
    ),
    'external data-entry browser must not instantiate Supabase',
  );

  for (
    const table
    of [
      'data_entry_tokens',
      'students',
      'goals',
      'goal_progress',
    ]
  ) {
    assert.ok(
      !browserEntry.includes(
        `.from('${table}')`,
      ),
      `external browser must not access ${table} directly`,
    );
  }

  assert.ok(
    adapter.includes(
      '/.netlify/functions/teacher-data-entry-tokens',
    ),
    'teacher token adapter must use authenticated function',
  );

  assert.ok(
    adapter.includes(
      "credentials: 'include'",
    ),
    'teacher token request must include teacher session cookie',
  );

  assert.ok(
    browserEntry.includes(
      '/.netlify/functions/data-entry-access',
    ),
    'external page must use token-scoped function',
  );

  assert.ok(
    teacherFunction.includes(
      'requireTeacher',
    ),
    'teacher endpoint must require teacher authentication',
  );

  assert.ok(
    teacherFunction.includes(
      'SUPABASE_SERVICE_ROLE_KEY',
    ),
    'teacher endpoint must use service role',
  );

  assert.ok(
    publicFunction.includes(
      'student_id=eq.',
    ) &&
    publicFunction.includes(
      'goal_id=eq.',
    ),
    'public endpoint must scope progress rows to resolved student and goal',
  );

  assert.match(
    migration,
    /DROP POLICY IF EXISTS\s+"Anyone can read valid tokens"/i,
  );

  assert.match(
    migration,
    /DROP POLICY IF EXISTS\s+"Teacher can manage tokens"/i,
  );

  for (
    const role
    of [
      'PUBLIC',
      'anon',
      'authenticated',
    ]
  ) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL PRIVILEGES[\\s\\S]*FROM ${role}`,
        'i',
      ),
    );
  }

  assert.match(
    migration,
    /GRANT SELECT,\s*INSERT,\s*UPDATE,\s*DELETE[\s\S]*TO service_role/i,
  );

  assert.ok(
    packageJson.includes(
      'node tests/data-entry-token-server-boundary.test.cjs',
    ),
    'boundary test must be registered in test:unit',
  );

  let fetchCalled = false;

  global.fetch =
    async () => {
      fetchCalled = true;
      throw new Error(
        'Unauthorized test must not call Supabase',
      );
    };

  const teacherHandler =
    freshHandler(
      'netlify/functions/teacher-data-entry-tokens.js',
    );

  const unauthorized =
    await teacherHandler({
      httpMethod: 'POST',
      headers: {
        'content-type':
          'application/json',
      },
      body:
        JSON.stringify({
          action: 'list',
          student_code: 'S001',
        }),
    });

  assert.strictEqual(
    unauthorized.statusCode,
    401,
  );

  assert.strictEqual(
    fetchCalled,
    false,
  );

  const {
    sign,
  } =
    require(
      path.join(
        root,
        'netlify/functions/_lib/auth.js',
      ),
    );

  const teacherJwt =
    sign(
      {
        role: 'teacher',
        username: 'teacher-test',
      },
      process.env.SESSION_SECRET,
    );

  let insertedTokenBody = null;

  global.fetch =
    async (
      url,
      init = {},
    ) => {
      if (
        url.includes('/students?')
      ) {
        return response(
          200,
          [
            {
              id: 'student-real',
              code: 'S001',
            },
          ],
        );
      }

      if (
        url.includes('/goals?')
      ) {
        return response(
          200,
          [
            {
              id: 'goal-real',
              code: 'READ.1',
              student_id:
                'student-real',
            },
          ],
        );
      }

      if (
        url.includes('/data_entry_tokens?') &&
        (
          init.method ||
          'GET'
        ) === 'GET'
      ) {
        return response(
          200,
          [],
        );
      }

      if (
        url.endsWith(
          '/rest/v1/data_entry_tokens',
        ) &&
        init.method === 'POST'
      ) {
        insertedTokenBody =
          JSON.parse(
            init.body,
          );

        return response(
          201,
          [
            {
              id:
                '11111111-1111-4111-8111-111111111111',
              ...insertedTokenBody,
              revoked: false,
              expires_at: null,
            },
          ],
        );
      }

      throw new Error(
        `Unexpected teacher fetch: ${init.method || 'GET'} ${url}`,
      );
    };

  const created =
    await teacherHandler({
      httpMethod: 'POST',
      headers: {
        'content-type':
          'application/json',
        cookie:
          `tc=${teacherJwt}`,
      },
      body:
        JSON.stringify({
          action: 'create',
          student_code: 's001',
          goal_code: 'read.1',
          data_collector:
            'External Teacher',
        }),
    });

  assert.strictEqual(
    created.statusCode,
    200,
  );

  const createdBody =
    parseBody(created);

  assert.strictEqual(
    createdBody.ok,
    true,
  );

  assert.strictEqual(
    insertedTokenBody.student_code,
    'S001',
  );

  assert.strictEqual(
    insertedTokenBody.goal_code,
    'READ.1',
  );

  assert.match(
    insertedTokenBody.token,
    /^[0-9a-f]{32}$/,
  );

  let capturedProgressInsert = null;

  global.fetch =
    async (
      url,
      init = {},
    ) => {
      if (
        url.includes('/data_entry_tokens?')
      ) {
        return response(
          200,
          [
            {
              id: 'token-row',
              student_code: 'S001',
              goal_code: 'READ.1',
              data_collector:
                'External Teacher',
              expires_at: null,
              revoked: false,
            },
          ],
        );
      }

      if (
        url.includes('/students?')
      ) {
        return response(
          200,
          [
            {
              id: 'student-real',
              code: 'S001',
            },
          ],
        );
      }

      if (
        url.includes('/goals?')
      ) {
        return response(
          200,
          [
            {
              id: 'goal-real',
              code: 'READ.1',
              desc: 'Read accurately',
              goal_area: 'Reading',
              measurement_type:
                'percent',
              student_id:
                'student-real',
            },
          ],
        );
      }

      if (
        url.endsWith(
          '/rest/v1/goal_progress',
        ) &&
        init.method === 'POST'
      ) {
        capturedProgressInsert =
          JSON.parse(
            init.body,
          );

        return response(
          201,
          [
            {
              id: 'progress-real',
              ...capturedProgressInsert,
            },
          ],
        );
      }

      throw new Error(
        `Unexpected public fetch: ${init.method || 'GET'} ${url}`,
      );
    };

  const publicHandler =
    freshHandler(
      'netlify/functions/data-entry-access.js',
    );

  const submitted =
    await publicHandler({
      httpMethod: 'POST',
      headers: {
        'content-type':
          'application/json',
      },
      body:
        JSON.stringify({
          token:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          date: '2026-08-18',
          value: 80,
          notes: '',
          student_id:
            'attacker-student',
          goal_id:
            'attacker-goal',
          source:
            'attacker-source',
          collected_by:
            'attacker-name',
        }),
    });

  assert.strictEqual(
    submitted.statusCode,
    200,
  );

  assert.strictEqual(
    capturedProgressInsert.student_id,
    'student-real',
    'student scope must come from token resolution',
  );

  assert.strictEqual(
    capturedProgressInsert.goal_id,
    'goal-real',
    'goal scope must come from token resolution',
  );

  assert.strictEqual(
    capturedProgressInsert.source,
    'external',
  );

  assert.strictEqual(
    capturedProgressInsert.collected_by,
    'External Teacher',
  );

  assert.strictEqual(
    capturedProgressInsert.school_year,
    2026,
  );

  const expiredHandler =
    freshHandler(
      'netlify/functions/data-entry-access.js',
    );

  global.fetch =
    async url => {
      if (
        url.includes('/data_entry_tokens?')
      ) {
        return response(
          200,
          [
            {
              student_code: 'S001',
              goal_code: 'READ.1',
              expires_at:
                '2000-01-01T00:00:00Z',
              revoked: false,
            },
          ],
        );
      }

      throw new Error(
        'Expired token must stop before dependent lookups',
      );
    };

  const expired =
    await expiredHandler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: {
        token:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    });

  assert.strictEqual(
    expired.statusCode,
    404,
  );


  global.fetch =
    async (
      url,
      init = {},
    ) => {
      if (
        url.includes(
          '/data_entry_tokens?',
        ) &&
        (
          init.method ||
          'GET'
        ) === 'GET'
      ) {
        return response(
          200,
          [
            {
              id:
                '22222222-2222-4222-8222-222222222222',
              token:
                'cccccccccccccccccccccccccccccccc',
              student_code: 'S001',
              goal_code: 'READ.1',
              data_collector:
                'External Teacher',
              data_collector_email:
                'collector@example.test',
              created_by:
                'teacher-test',
              created_at:
                '2026-08-01T12:00:00Z',
              expires_at: null,
              revoked: false,
            },
            {
              id:
                '33333333-3333-4333-8333-333333333333',
              token:
                'dddddddddddddddddddddddddddddddd',
              student_code: 'S001',
              goal_code: 'READ.2',
              data_collector:
                'Expired Collector',
              created_at:
                '2026-07-01T12:00:00Z',
              expires_at:
                '2000-01-01T00:00:00Z',
              revoked: false,
            },
          ],
        );
      }

      throw new Error(
        `Unexpected teacher-list fetch: ${
          init.method || 'GET'
        } ${url}`,
      );
    };

  const listed =
    await teacherHandler({
      httpMethod: 'POST',
      headers: {
        'content-type':
          'application/json',
        cookie:
          `tc=${teacherJwt}`,
      },
      body:
        JSON.stringify({
          action: 'list',
          student_code: 's001',
        }),
    });

  assert.strictEqual(
    listed.statusCode,
    200,
  );

  const listedBody =
    parseBody(listed);

  assert.strictEqual(
    listedBody.ok,
    true,
  );

  assert.strictEqual(
    listedBody.tokens.length,
    1,
    'expired tokens must not be returned to teacher UI',
  );

  assert.strictEqual(
    listedBody.tokens[0].goal_code,
    'READ.1',
  );

  const revokeId =
    '22222222-2222-4222-8222-222222222222';

  let revokeRequest = null;

  global.fetch =
    async (
      url,
      init = {},
    ) => {
      if (
        url.includes(
          `/data_entry_tokens?id=eq.${revokeId}`,
        ) &&
        init.method === 'PATCH'
      ) {
        revokeRequest =
          JSON.parse(
            init.body,
          );

        return response(
          200,
          [
            {
              id: revokeId,
              revoked: true,
            },
          ],
        );
      }

      throw new Error(
        `Unexpected teacher-revoke fetch: ${
          init.method || 'GET'
        } ${url}`,
      );
    };

  const revokedByTeacher =
    await teacherHandler({
      httpMethod: 'POST',
      headers: {
        'content-type':
          'application/json',
        cookie:
          `tc=${teacherJwt}`,
      },
      body:
        JSON.stringify({
          action: 'revoke',
          token_id: revokeId,
        }),
    });

  assert.strictEqual(
    revokedByTeacher.statusCode,
    200,
  );

  assert.deepStrictEqual(
    revokeRequest,
    {
      revoked: true,
    },
  );

  assert.strictEqual(
    parseBody(
      revokedByTeacher,
    ).revoked,
    true,
  );

  let progressLookupUrl = '';

  global.fetch =
    async (
      url,
      init = {},
    ) => {
      if (
        url.includes(
          '/data_entry_tokens?',
        )
      ) {
        return response(
          200,
          [
            {
              id: 'token-row',
              student_code: 'S001',
              goal_code: 'READ.1',
              data_collector:
                'External Teacher',
              expires_at: null,
              revoked: false,
            },
          ],
        );
      }

      if (
        url.includes('/students?')
      ) {
        return response(
          200,
          [
            {
              id: 'student-real',
              code: 'S001',
            },
          ],
        );
      }

      if (
        url.includes('/goals?')
      ) {
        return response(
          200,
          [
            {
              id: 'goal-real',
              code: 'READ.1',
              desc:
                'Read accurately',
              goal_area:
                'Reading',
              measurement_type:
                'percent',
              student_id:
                'student-real',
            },
          ],
        );
      }

      if (
        url.includes(
          '/goal_progress?',
        ) &&
        (
          init.method ||
          'GET'
        ) === 'GET'
      ) {
        progressLookupUrl = url;

        return response(
          200,
          [
            {
              id: 'progress-one',
              date: '2026-08-18',
              value: 80,
              source: 'external',
              collected_by:
                'External Teacher',
              created_at:
                '2026-08-18T12:00:00Z',
            },
          ],
        );
      }

      throw new Error(
        `Unexpected public-load fetch: ${
          init.method || 'GET'
        } ${url}`,
      );
    };

  const loaded =
    await publicHandler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: {
        token:
          'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        start_date:
          '2026-08-01',
        end_date:
          '2026-10-17',
      },
    });

  assert.strictEqual(
    loaded.statusCode,
    200,
  );

  const loadedBody =
    parseBody(loaded);

  assert.strictEqual(
    loadedBody.ok,
    true,
  );

  assert.deepStrictEqual(
    loadedBody.student,
    {
      code: 'S001',
    },
  );

  assert.strictEqual(
    loadedBody.goal.code,
    'READ.1',
  );

  assert.strictEqual(
    loadedBody.progress.length,
    1,
  );

  assert.ok(
    progressLookupUrl.includes(
      'student_id=eq.student-real',
    ),
    'history lookup must be scoped to resolved student',
  );

  assert.ok(
    progressLookupUrl.includes(
      'goal_id=eq.goal-real',
    ),
    'history lookup must be scoped to resolved goal',
  );

  assert.ok(
    !Object.prototype.hasOwnProperty.call(
      loadedBody.token,
      'token',
    ),
    'raw bearer token must not be echoed in response',
  );

  let unknownDependentLookup = false;

  global.fetch =
    async url => {
      if (
        url.includes(
          '/data_entry_tokens?',
        )
      ) {
        return response(
          200,
          [],
        );
      }

      unknownDependentLookup = true;

      throw new Error(
        'Unknown token must stop before dependent lookups',
      );
    };

  const unknown =
    await publicHandler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: {
        token:
          'ffffffffffffffffffffffffffffffff',
      },
    });

  assert.strictEqual(
    unknown.statusCode,
    404,
  );

  assert.strictEqual(
    unknownDependentLookup,
    false,
  );

  let revokedDependentLookup = false;

  global.fetch =
    async url => {
      if (
        url.includes(
          '/data_entry_tokens?',
        )
      ) {
        return response(
          200,
          [
            {
              student_code: 'S001',
              goal_code: 'READ.1',
              expires_at: null,
              revoked: true,
            },
          ],
        );
      }

      revokedDependentLookup = true;

      throw new Error(
        'Revoked token must stop before dependent lookups',
      );
    };

  const revokedPublic =
    await publicHandler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: {
        token:
          'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
      },
    });

  assert.strictEqual(
    revokedPublic.statusCode,
    404,
  );

  assert.strictEqual(
    revokedDependentLookup,
    false,
  );

  console.log(
    '✓ teacher token list and revoke are server-backed',
  );

  console.log(
    '✓ valid token loads only scoped context and history',
  );

  console.log(
    '✓ unknown and revoked tokens are rejected',
  );

  console.log(
    '✓ data-entry token browser access removed',
  );

  console.log(
    '✓ teacher token operations require teacher session',
  );

  console.log(
    '✓ token creation is server-backed and normalized',
  );

  console.log(
    '✓ external submission scope is derived from token',
  );

  console.log(
    '✓ expired tokens are rejected',
  );

  console.log(
    '✓ server-only migration boundary asserted',
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
