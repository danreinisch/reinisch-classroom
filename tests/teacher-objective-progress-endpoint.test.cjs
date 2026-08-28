'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root =
  path.resolve(__dirname, '..');

const endpointRelative =
  'netlify/functions/teacher-objective-progress.js';

const endpointPath =
  path.join(root, endpointRelative);

assert(
  fs.existsSync(endpointPath),
  '5C2 RED: signed Teacher objective-progress endpoint must be implemented'
);

const source =
  fs.readFileSync(
    endpointPath,
    'utf8'
  );

function mustContain(text, message) {
  assert(
    source.includes(text),
    message
  );
}

function mustNotContain(text, message) {
  assert(
    !source.includes(text),
    message
  );
}

/*
 * Authentication / server boundary.
 */
mustContain(
  "require('./_lib/auth')",
  'endpoint must use the established signed Teacher Center auth boundary'
);

mustContain(
  'requireTeacher',
  'endpoint must require a valid teacher/admin session'
);

mustContain(
  "require('./_lib/objective-progress-reader')",
  'endpoint must reuse the shared 5C1 reader'
);

mustContain(
  'readObjectiveProgress',
  'endpoint must delegate objective math/evidence projection to 5C1'
);

mustContain(
  "require('./_lib/goal-objective-registry-reader')",
  'endpoint must preflight child-objective candidates from the live server-only registry reader'
);

mustNotContain(
  "require('./_lib/goal-objective-catalog')",
  'endpoint must no longer depend on the stale 35-row static objective catalog'
);

for (
  const required of [
    'buildObjectiveRegistryPath',
    'indexObjectiveRegistryRowsByParent',
    'getBrowserObjectivesForParent',
  ]
) {
  mustContain(
    required,
    `endpoint live-registry prefilter must use ${required}`
  );
}

mustContain(
  "'Cache-Control': 'no-store'",
  'Teacher objective progress response must remain no-store'
);

/*
 * Request contract.
 *
 * Quarter dates originate from Teacher Center quarter-utils.js.
 * Server validates them instead of recreating quarter rules.
 */
for (
  const required of [
    'student_code',
    'quarter',
    'start',
    'end',
    'DATE_PATTERN',
  ]
) {
  mustContain(
    required,
    `endpoint must validate request field ${required}`
  );
}

mustContain(
  'Q1',
  'endpoint must recognize Q1-Q4 quarter labels'
);

mustContain(
  'Q4',
  'endpoint must recognize Q1-Q4 quarter labels'
);

/*
 * Authoritative server-side parent fallback.
 *
 * The browser must NOT send existing parent progress rows as trusted input.
 * The endpoint resolves the student, candidate parent goals, and only then
 * reads same-quarter parent progress for those parent IDs.
 */
mustContain(
  '/rest/v1/students',
  'endpoint must resolve the requested student on the server'
);

mustContain(
  '/rest/v1/goals',
  'endpoint must resolve canonical parent goals on the server'
);

mustContain(
  '/rest/v1/goal_progress',
  'endpoint must obtain parent fallback evidence server-side'
);

mustContain(
  'date',
  'parent fallback query must be quarter-date scoped'
);

mustContain(
  'gte.',
  'parent fallback query must enforce the lower quarter boundary'
);

mustContain(
  'lte.',
  'parent fallback query must enforce the upper quarter boundary'
);

mustNotContain(
  'parentProgressRows = body',
  'browser-supplied parent progress must never become authoritative'
);

mustNotContain(
  'body.parentProgressRows',
  'browser-supplied parent progress must never become authoritative'
);

/*
 * Zero-candidate behavior.
 */
mustContain(
  'candidate',
  'endpoint must have an explicit live-registry candidate preflight'
);

mustContain(
  'parents: []',
  'zero-candidate response must remain an empty successful objective result'
);

/*
 * The endpoint owns only orchestration.
 * 5C1 owns normalized objective registry/evidence reads.
 */
mustNotContain(
  '/rest/v1/goal_objectives',
  '5C2 endpoint must not duplicate the 5C1 objective-registry reader'
);

mustNotContain(
  '/rest/v1/objective_data_points',
  '5C2 endpoint must not duplicate the 5C1 objective-evidence reader'
);

mustNotContain(
  '/rest/v1/goal_data_points',
  'parent item evidence must not be repurposed as child-objective evidence'
);

/*
 * Read-only / dormant safety.
 */
for (
  const method of [
    "'POST'",
    '"POST"',
    "'PATCH'",
    '"PATCH"',
    "'PUT'",
    '"PUT"',
    "'DELETE'",
    '"DELETE"',
  ]
) {
  mustNotContain(
    `method: ${method}`,
    'Teacher objective progress endpoint must remain read-only'
  );
}

mustNotContain(
  'sync_goal_objective_registry' + '(',
  '5C2 must never activate the dormant objective registry'
);

mustNotContain(
  'insert(',
  '5C2 endpoint must not gain an objective write path'
);

mustNotContain(
  'upsert',
  '5C2 endpoint must not gain an objective write path'
);

console.log(
  '✓ Teacher objective progress signed endpoint contract'
);

/*
 * Runtime behavior contract.
 *
 * The static checks above protect architecture. These cases exercise the
 * actual handler with isolated module stubs so the signed server boundary
 * itself is also locked before production use.
 */

const endpointAbsolute =
  path.join(
    root,
    'netlify/functions/teacher-objective-progress.js'
  );

const httpAbsolute =
  path.join(
    root,
    'netlify/functions/_lib/http.js'
  );

const authAbsolute =
  path.join(
    root,
    'netlify/functions/_lib/auth.js'
  );

const supaAbsolute =
  path.join(
    root,
    'netlify/functions/_lib/supa.js'
  );

const registryReaderAbsolute =
  path.join(
    root,
    'netlify/functions/_lib/goal-objective-registry-reader.js'
  );

const readerAbsolute =
  path.join(
    root,
    'netlify/functions/_lib/objective-progress-reader.js'
  );

function cacheStub(filename, exportsValue) {
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: exportsValue,
  };
}

function parseResponse(response) {
  return {
    statusCode:
      response.statusCode,
    headers:
      response.headers || {},
    body:
      typeof response.body === 'string'
        ? JSON.parse(response.body)
        : response.body,
  };
}

async function loadHandler({
  authorized = true,
  rowsForPath = () => [],
  registryRows = [],
  readerResult = {
    available: true,
    parents: [],
  },
} = {}) {
  const savedEntries =
    new Map();

  const stubbed = [
    httpAbsolute,
    authAbsolute,
    supaAbsolute,
    registryReaderAbsolute,
    readerAbsolute,
  ];

  for (const filename of stubbed) {
    savedEntries.set(
      filename,
      require.cache[filename]
    );
  }

  const savedSecret =
    process.env.SESSION_SECRET;

  process.env.SESSION_SECRET =
    'test-session-secret';

  const restCalls = [];
  const readerCalls = [];

  cacheStub(
    httpAbsolute,
    {
      generateRequestId() {
        return 'test-request';
      },

      jsonResponse(
        _event,
        statusCode,
        body,
        headers
      ) {
        return {
          statusCode,
          headers: headers || {},
          body: JSON.stringify(body),
        };
      },

      handleCorsPreFlight() {
        return {
          statusCode: 204,
          headers: {},
          body: '',
        };
      },
    }
  );

  cacheStub(
    authAbsolute,
    {
      requireTeacher() {
        return authorized
          ? {
              ok: true,
              user: {
                role: 'teacher',
                teacherId:
                  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              },
            }
          : {
              ok: false,
            };
      },
    }
  );

  cacheStub(
    supaAbsolute,
    {
      getSupabaseConfig() {
        return {
          url: 'https://example.supabase.test',
          key: 'test-service-role',
        };
      },

      async rest(requestPath, init) {
        restCalls.push({
          path: requestPath,
          init,
        });

        return {
          __testPath: requestPath,
        };
      },

      async jsonRes(response) {
        return {
          ok: true,
          status: 200,
          data:
            response.__testPath.startsWith(
              '/rest/v1/goal_objectives?'
            )
              ? registryRows
              : rowsForPath(
                  response.__testPath
                ),
        };
      },
    }
  );

  cacheStub(
    registryReaderAbsolute,
    {
      buildObjectiveRegistryPath({
        studentId,
      } = {}) {
        return (
          '/rest/v1/goal_objectives' +
          '?select=test' +
          '&active=eq.true' +
          `&student_id=eq.${encodeURIComponent(studentId)}`
        );
      },

      indexObjectiveRegistryRowsByParent(
        rows
      ) {
        return Array.isArray(rows)
          ? rows
          : [];
      },

      getBrowserObjectivesForParent(
        index,
        parentGoalCode,
        studentCode
      ) {
        return (
          Array.isArray(index)
            ? index
            : []
        )
          .filter(row =>
            row &&
            row.active === true &&
            row.parent_goal_code ===
              parentGoalCode &&
            row.student_code ===
              studentCode
          )
          .map(row => ({
            code:
              row.code,
          }));
      },
    }
  );

  cacheStub(
    readerAbsolute,
    {
      async readObjectiveProgress(args) {
        readerCalls.push(args);
        return readerResult;
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

  return {
    handler,
    restCalls,
    readerCalls,

    cleanup() {
      delete require.cache[
        endpointAbsolute
      ];

      for (const filename of stubbed) {
        const prior =
          savedEntries.get(filename);

        if (prior) {
          require.cache[filename] =
            prior;
        } else {
          delete require.cache[
            filename
          ];
        }
      }

      if (savedSecret === undefined) {
        delete process.env
          .SESSION_SECRET;
      } else {
        process.env.SESSION_SECRET =
          savedSecret;
      }
    },
  };
}

function eventFor(params = {}) {
  return {
    httpMethod: 'GET',
    headers: {
      cookie: 'tc=test',
    },
    queryStringParameters: {
      student_code: 'S001',
      quarter: 'Q1',
      start: '2026-08-16',
      end: '2026-10-17',
      ...params,
    },
  };
}

async function runBehaviorContracts() {
  /*
   * 1. Unauthorized caller never reaches Supabase.
   */
  {
    const runtime =
      await loadHandler({
        authorized: false,
      });

    try {
      const response =
        parseResponse(
          await runtime.handler(
            eventFor()
          )
        );

      assert.strictEqual(
        response.statusCode,
        401,
        'unsigned objective-progress request must be rejected'
      );

      assert.strictEqual(
        runtime.restCalls.length,
        0,
        'unauthorized request must stop before database access'
      );

      assert.strictEqual(
        runtime.readerCalls.length,
        0,
        'unauthorized request must never reach 5C1 reader'
      );
    } finally {
      runtime.cleanup();
    }
  }

  console.log(
    '✓ unauthorized objective-progress request stops before DB access'
  );

  /*
   * 2. Invalid quarter/window fails closed before Supabase.
   */
  {
    const runtime =
      await loadHandler();

    try {
      const response =
        parseResponse(
          await runtime.handler(
            eventFor({
              quarter: 'Q5',
            })
          )
        );

      assert.strictEqual(
        response.statusCode,
        400,
        'invalid quarter must fail closed'
      );

      assert.strictEqual(
        runtime.restCalls.length,
        0,
        'invalid quarter must fail before database access'
      );

      assert.strictEqual(
        runtime.readerCalls.length,
        0,
        'invalid quarter must not invoke 5C1'
      );
    } finally {
      runtime.cleanup();
    }
  }

  console.log(
    '✓ invalid objective quarter fails closed before DB access'
  );

  /*
   * 3. No live-registry child objectives:
   * student + goals + one candidate-registry read may occur,
   * but no goal_progress and no 5C1 query.
   */
  {
    const runtime =
      await loadHandler({
        rowsForPath(requestPath) {
          if (
            requestPath.startsWith(
              '/rest/v1/students'
            )
          ) {
            return [{
              id:
                '11111111-1111-4111-8111-111111111111',
              code: 'S001',
              active: true,
              archived_at: null,
            }];
          }

          if (
            requestPath.startsWith(
              '/rest/v1/goals'
            )
          ) {
            return [{
              id:
                '22222222-2222-4222-8222-222222222222',
              student_id:
                '11111111-1111-4111-8111-111111111111',
              code: 'S001.CG99',
              status: 'active',
            }];
          }

          throw new Error(
            'Unexpected query in zero-candidate case: ' +
            requestPath
          );
        },

        registryRows: [],
      });

    try {
      const response =
        parseResponse(
          await runtime.handler(
            eventFor()
          )
        );

      assert.strictEqual(
        response.statusCode,
        200
      );

      assert.strictEqual(
        response.body.ok,
        true
      );

      assert.strictEqual(
        response.body.available,
        true
      );

      assert.deepStrictEqual(
        response.body.parents,
        []
      );

      assert.strictEqual(
        runtime.readerCalls.length,
        0,
        'zero live-registry objective parents must not invoke the shared progress reader'
      );

      assert.strictEqual(
        runtime.restCalls.some(call =>
          call.path.includes(
            '/rest/v1/goal_progress'
          )
        ),
        false,
        'zero live-registry objective parents must not query parent progress'
      );
    } finally {
      runtime.cleanup();
    }
  }

  console.log(
    '✓ zero live-registry objective parents short-circuit before progress/evidence fanout'
  );

  /*
   * 4. Candidate parent:
   * exact browser quarter range scopes parent fallback and reaches 5C1.
   */
  {
    const studentId =
      '11111111-1111-4111-8111-111111111111';

    const parentId =
      '22222222-2222-4222-8222-222222222222';

    const runtime =
      await loadHandler({
        rowsForPath(requestPath) {
          if (
            requestPath.startsWith(
              '/rest/v1/students'
            )
          ) {
            return [{
              id: studentId,
              code: 'S001',
              active: true,
              archived_at: null,
            }];
          }

          if (
            requestPath.startsWith(
              '/rest/v1/goals'
            )
          ) {
            return [{
              id: parentId,
              student_id: studentId,
              code: 'S001.CG1',
              status: 'active',
            }];
          }

          if (
            requestPath.startsWith(
              '/rest/v1/goal_progress'
            )
          ) {
            assert(
              requestPath.includes(
                'date=gte.2026-08-16'
              ),
              'parent fallback query must use quarter start'
            );

            assert(
              requestPath.includes(
                'date=lte.2026-10-17'
              ),
              'parent fallback query must use quarter end'
            );

            return [{
              id:
                '33333333-3333-4333-8333-333333333333',
              goal_id: parentId,
              student_id: studentId,
              assignment_instance_id: null,
              date: '2026-09-15',
              value: 64,
              created_at:
                '2026-09-15T12:00:00.000Z',
            }];
          }

          throw new Error(
            'Unexpected query: ' +
            requestPath
          );
        },

        registryRows: [{
          student_code:
            'S001',
          parent_goal_code:
            'S001.CG1',
          code:
            'S001.CG1.O1',
          active:
            true,
        }],

        readerResult: {
          available: true,
          parents: [{
            parent_goal_code:
              'S001.CG1',
            percentage: 64,
            source:
              'existing_parent',
            coverage: {
              objectives_with_data: 0,
              total_objectives: 1,
            },
            objectives: [],
          }],
        },
      });

    try {
      const response =
        parseResponse(
          await runtime.handler(
            eventFor()
          )
        );

      assert.strictEqual(
        response.statusCode,
        200
      );

      assert.strictEqual(
        runtime.readerCalls.length,
        1,
        'candidate parent must invoke 5C1 exactly once'
      );

      const args =
        runtime.readerCalls[0];

      assert.deepStrictEqual(
        args.quarterRange,
        {
          quarter: 'Q1',
          start: '2026-08-16',
          end: '2026-10-17',
        },
        '5C1 must receive the exact Teacher Center quarter window'
      );

      assert.strictEqual(
        args.parentGoals.length,
        1
      );

      assert.strictEqual(
        args.parentGoals[0].code,
        'S001.CG1'
      );


      assert.strictEqual(
        runtime.restCalls.filter(
          call =>
            call.path.startsWith(
              '/rest/v1/goal_objectives?'
            )
        ).length,
        1,
        'candidate detection must perform exactly one student-scoped live registry read'
      );

      assert(
        runtime.restCalls.some(
          call =>
            call.path.startsWith(
              '/rest/v1/goal_objectives?'
            ) &&
            call.path.includes(
              `student_id=eq.${studentId}`
            )
        ),
        'candidate registry read must use the resolved student UUID'
      );

      assert.strictEqual(
        args.parentProgressRows.length,
        1
      );

      assert.strictEqual(
        args.parentProgressRows[0].value,
        64
      );

      assert.strictEqual(
        response.body.available,
        true
      );

      assert.strictEqual(
        response.body.parents[0]
          .source,
        'existing_parent'
      );
    } finally {
      runtime.cleanup();
    }
  }

  console.log(
    '✓ candidate parent passes exact same-quarter fallback rows to 5C1'
  );

  /*
   * 5. Non-instructional assignment checkpoints are excluded from
   * authoritative parent fallback before 5C1 receives rows.
   */
  {
    const studentId =
      '11111111-1111-4111-8111-111111111111';

    const parentId =
      '22222222-2222-4222-8222-222222222222';

    const nonInstructionalInstance =
      '44444444-4444-4444-8444-444444444444';

    const runtime =
      await loadHandler({
        rowsForPath(requestPath) {
          if (
            requestPath.startsWith(
              '/rest/v1/students'
            )
          ) {
            return [{
              id: studentId,
              code: 'S001',
              active: true,
              archived_at: null,
            }];
          }

          if (
            requestPath.startsWith(
              '/rest/v1/goals'
            )
          ) {
            return [{
              id: parentId,
              student_id: studentId,
              code: 'S001.CG1',
              status: 'active',
            }];
          }

          if (
            requestPath.startsWith(
              '/rest/v1/goal_progress'
            )
          ) {
            return [
              {
                id:
                  '55555555-5555-4555-8555-555555555555',
                goal_id: parentId,
                student_id: studentId,
                assignment_instance_id:
                  nonInstructionalInstance,
                date: '2026-09-10',
                value: 100,
                created_at:
                  '2026-09-10T12:00:00.000Z',
              },
              {
                id:
                  '66666666-6666-4666-8666-666666666666',
                goal_id: parentId,
                student_id: studentId,
                assignment_instance_id: null,
                date: '2026-09-11',
                value: 55,
                created_at:
                  '2026-09-11T12:00:00.000Z',
              },
            ];
          }

          if (
            requestPath.startsWith(
              '/rest/v1/assignment_instances'
            )
          ) {
            return [{
              id:
                nonInstructionalInstance,
              settings: {
                non_instructional: true,
              },
            }];
          }

          throw new Error(
            'Unexpected query: ' +
            requestPath
          );
        },

        registryRows: [{
          student_code:
            'S001',
          parent_goal_code:
            'S001.CG1',
          code:
            'S001.CG1.O1',
          active:
            true,
        }],
      });

    try {
      const response =
        parseResponse(
          await runtime.handler(
            eventFor()
          )
        );

      assert.strictEqual(
        response.statusCode,
        200
      );

      assert.strictEqual(
        runtime.readerCalls.length,
        1
      );

      const parentRows =
        runtime.readerCalls[0]
          .parentProgressRows;

      assert.strictEqual(
        parentRows.length,
        1,
        'non-instructional checkpoint must be removed'
      );

      assert.strictEqual(
        parentRows[0].value,
        55,
        'manual/instructional parent fallback row must remain'
      );
    } finally {
      runtime.cleanup();
    }
  }

  console.log(
    '✓ non-instructional parent checkpoint is excluded before 5C1 fallback'
  );

  /*
   * 6. Dormant objective schema state is transported as unavailable,
   * not transformed into a false "No Data" result.
   */
  {
    const studentId =
      '11111111-1111-4111-8111-111111111111';

    const parentId =
      '22222222-2222-4222-8222-222222222222';

    const runtime =
      await loadHandler({
        rowsForPath(requestPath) {
          if (
            requestPath.startsWith(
              '/rest/v1/students'
            )
          ) {
            return [{
              id: studentId,
              code: 'S001',
              active: true,
              archived_at: null,
            }];
          }

          if (
            requestPath.startsWith(
              '/rest/v1/goals'
            )
          ) {
            return [{
              id: parentId,
              student_id: studentId,
              code: 'S001.CG1',
              status: 'active',
            }];
          }

          if (
            requestPath.startsWith(
              '/rest/v1/goal_progress'
            )
          ) {
            return [];
          }

          throw new Error(
            'Unexpected query: ' +
            requestPath
          );
        },

        registryRows: [{
          student_code:
            'S001',
          parent_goal_code:
            'S001.CG1',
          code:
            'S001.CG1.O1',
          active:
            true,
        }],

        readerResult: {
          available: false,
          reason:
            'schema_unavailable',
          parents: [],
        },
      });

    try {
      const response =
        parseResponse(
          await runtime.handler(
            eventFor()
          )
        );

      assert.strictEqual(
        response.statusCode,
        200
      );

      assert.strictEqual(
        response.body.available,
        false
      );

      assert.strictEqual(
        response.body.reason,
        'schema_unavailable'
      );

      assert.deepStrictEqual(
        response.body.parents,
        []
      );
    } finally {
      runtime.cleanup();
    }
  }

  console.log(
    '✓ dormant objective schema remains unavailable rather than false No Data'
  );
}

runBehaviorContracts()
  .then(() => {
    console.log(
      'TEACHER OBJECTIVE PROGRESS ENDPOINT BEHAVIOR: PASS'
    );
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
