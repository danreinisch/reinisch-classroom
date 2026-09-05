'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root =
  path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch(error => {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
    });
}

function loadObservationUtils() {
  const sourcePath =
    path.join(
      root,
      'site',
      'web',
      'obs-utils.js'
    );

  const source =
    fs.readFileSync(
      sourcePath,
      'utf8'
    )
      .replace(
        /export function /g,
        'function '
      );

  const context = {};

  vm.createContext(context);

  vm.runInContext(
    source,
    context,
    {
      filename:
        'obs-utils.js',
    }
  );

  return {
    buildObservationDispositionNotes:
      context
        .buildObservationDispositionNotes,
    parseObservationDispositionNotes:
      context
        .parseObservationDispositionNotes,
  };
}

const TEACHER_ID =
  '55555555-5555-4555-8555-555555555555';

const STUDENT_ID =
  '11111111-1111-4111-8111-111111111111';

const CLASS_ID =
  '22222222-2222-4222-8222-222222222222';

const GOAL_ID =
  '33333333-3333-4333-8333-333333333333';

const FOREIGN_STUDENT_ID =
  '66666666-6666-4666-8666-666666666666';

const FOREIGN_CLASS_ID =
  '77777777-7777-4777-8777-777777777777';

const FOREIGN_GOAL_ID =
  '88888888-8888-4888-8888-888888888888';

let authOk = true;
let progressReadUrl = null;

function reply(status, data = null) {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    async json() {
      return data;
    },
    async text() {
      return data == null
        ? ''
        : JSON.stringify(data);
    },
  };
}

function eq(params, key) {
  const raw =
    params.get(key);

  return raw?.startsWith('eq.')
    ? raw.slice(3)
    : raw;
}

const eventRows = [
  {
    id: 'pe-owned-absent',
    student_id:
      STUDENT_ID,
    goal_id:
      GOAL_ID,
    date:
      '2026-09-01',
    percent:
      null,
    via:
      'observation_tray',
    notes:
      '[obs:disposition:absent|period=Language%20Arts%203%20SC]',
  },
  {
    id: 'pe-owned-no-opportunity',
    student_id:
      STUDENT_ID,
    goal_id:
      GOAL_ID,
    date:
      '2026-09-03',
    percent:
      null,
    via:
      'observation_tray',
    notes:
      '[obs:disposition:no_opportunity|period=Transitional%20Skills]',
  },
  {
    id: 'pe-owned-other-null-event',
    student_id:
      STUDENT_ID,
    goal_id:
      GOAL_ID,
    date:
      '2026-09-04',
    percent:
      null,
    via:
      'observation_tray',
    notes:
      '[obs:session_outcome:not_addressed]',
  },
  {
    id: 'pe-foreign-disposition',
    student_id:
      FOREIGN_STUDENT_ID,
    goal_id:
      FOREIGN_GOAL_ID,
    date:
      '2026-09-02',
    percent:
      null,
    via:
      'observation_tray',
    notes:
      '[obs:disposition:absent|period=Language%20Arts%202%20SC]',
  },
  {
    id: 'pe-numeric-not-a-reader-row',
    student_id:
      STUDENT_ID,
    goal_id:
      GOAL_ID,
    date:
      '2026-09-05',
    percent:
      80,
    via:
      'observation_tray',
    notes:
      '[obs:disposition:absent|period=Language%20Arts%203%20SC]',
  },
  {
    id: 'pe-wrong-via',
    student_id:
      STUDENT_ID,
    goal_id:
      GOAL_ID,
    date:
      '2026-09-05',
    percent:
      null,
    via:
      'manual',
    notes:
      '[obs:disposition:absent|period=Language%20Arts%203%20SC]',
  },
  {
    id: 'pe-malformed-period',
    student_id:
      STUDENT_ID,
    goal_id:
      GOAL_ID,
    date:
      '2026-09-05',
    percent:
      null,
    via:
      'observation_tray',
    notes:
      '[obs:disposition:absent|period=]',
  },
];

function filteredProgressRows(params) {
  return eventRows.filter(row => {
    if (
      params.get('percent') ===
        'is.null' &&
      row.percent !== null
    ) {
      return false;
    }

    if (
      params.get('via') ===
        'eq.observation_tray' &&
      row.via !==
        'observation_tray'
    ) {
      return false;
    }

    for (
      const filter
      of params.getAll('date')
    ) {
      if (
        filter.startsWith('gte.') &&
        row.date <
          filter.slice(4)
      ) {
        return false;
      }

      if (
        filter.startsWith('lte.') &&
        row.date >
          filter.slice(4)
      ) {
        return false;
      }
    }

    return true;
  });
}

function installEndpointHarness() {
  process.env.SESSION_SECRET =
    'obs5-test-secret';

  const authPath =
    require.resolve(
      path.join(
        root,
        'netlify',
        'functions',
        '_lib',
        'auth.js'
      )
    );

  const supaPath =
    require.resolve(
      path.join(
        root,
        'netlify',
        'functions',
        '_lib',
        'supa.js'
      )
    );

  require.cache[authPath] = {
    id:
      authPath,
    filename:
      authPath,
    loaded:
      true,
    exports: {
      requireTeacher() {
        if (!authOk) {
          return {
            ok: false,
          };
        }

        return {
          ok: true,
          user: {
            username:
              'teacher_test',
            role:
              'teacher',
            teacherId:
              TEACHER_ID,
          },
        };
      },
    },
  };

  require.cache[supaPath] = {
    id:
      supaPath,
    filename:
      supaPath,
    loaded:
      true,
    exports: {
      getSupabaseConfig() {
        return {
          url:
            'https://test.supabase.co',
          key:
            'test-key',
        };
      },
    },
  };

  global.fetch =
    async (
      rawUrl,
      init = {}
    ) => {
      const url =
        new URL(
          String(rawUrl)
        );

      const resource =
        url.pathname.replace(
          '/rest/v1/',
          ''
        );

      const method =
        init.method ||
        'GET';

      const params =
        url.searchParams;

      if (
        resource ===
          'progress_entries' &&
        method === 'GET'
      ) {
        progressReadUrl =
          url;

        return reply(
          200,
          filteredProgressRows(
            params
          )
        );
      }

      if (
        resource ===
          'students' &&
        method === 'GET'
      ) {
        const id =
          eq(
            params,
            'id'
          );

        if (
          id ===
          STUDENT_ID
        ) {
          return reply(
            200,
            [{
              id:
                STUDENT_ID,
              code:
                'S001',
              class_id:
                CLASS_ID,
              active:
                true,
              archived_at:
                null,
            }]
          );
        }

        if (
          id ===
          FOREIGN_STUDENT_ID
        ) {
          return reply(
            200,
            [{
              id:
                FOREIGN_STUDENT_ID,
              code:
                'S099',
              class_id:
                FOREIGN_CLASS_ID,
              active:
                true,
              archived_at:
                null,
            }]
          );
        }

        return reply(
          200,
          []
        );
      }

      if (
        resource ===
          'class_enrollments' &&
        method === 'GET'
      ) {
        const studentId =
          eq(
            params,
            'student_id'
          );

        if (
          studentId ===
          STUDENT_ID
        ) {
          return reply(
            200,
            [{
              class_id:
                CLASS_ID,
            }]
          );
        }

        if (
          studentId ===
          FOREIGN_STUDENT_ID
        ) {
          return reply(
            200,
            [{
              class_id:
                FOREIGN_CLASS_ID,
            }]
          );
        }

        return reply(
          200,
          []
        );
      }

      if (
        resource ===
          'classes' &&
        method === 'GET'
      ) {
        if (
          eq(
            params,
            'teacher_id'
          ) !==
          TEACHER_ID
        ) {
          return reply(
            200,
            []
          );
        }

        const idFilter =
          params.get('id') ||
          '';

        if (
          idFilter &&
          idFilter.includes(
            FOREIGN_CLASS_ID
          )
        ) {
          return reply(
            200,
            []
          );
        }

        return reply(
          200,
          [{
            id:
              CLASS_ID,
          }]
        );
      }

      if (
        resource ===
          'goals' &&
        method === 'GET'
      ) {
        const goalId =
          eq(
            params,
            'id'
          );

        const studentId =
          eq(
            params,
            'student_id'
          );

        if (
          goalId ===
            GOAL_ID &&
          studentId ===
            STUDENT_ID
        ) {
          return reply(
            200,
            [{
              id:
                GOAL_ID,
              code:
                'G-OWN',
              status:
                'active',
              active:
                true,
            }]
          );
        }

        if (
          goalId ===
            FOREIGN_GOAL_ID &&
          studentId ===
            FOREIGN_STUDENT_ID
        ) {
          return reply(
            200,
            [{
              id:
                FOREIGN_GOAL_ID,
              code:
                'G-FOREIGN',
              status:
                'active',
              active:
                true,
            }]
          );
        }

        return reply(
          200,
          []
        );
      }

      throw new Error(
        `Unexpected fetch: ${method} ${url}`
      );
    };

  const endpointPath =
    require.resolve(
      path.join(
        root,
        'netlify',
        'functions',
        'teacher-sync-observations.js'
      )
    );

  delete require.cache[
    endpointPath
  ];

  return require(
    endpointPath
  ).handler;
}

function getEvent(
  startDate =
    '2026-09-01',
  endDate =
    '2026-09-06'
) {
  return {
    httpMethod:
      'GET',
    headers: {},
    queryStringParameters: {
      start_date:
        startDate,
      end_date:
        endDate,
    },
  };
}

async function main() {
  console.log(
    '\n--- OBS-5 disposition behavioral hardening ---'
  );

  const {
    buildObservationDispositionNotes,
    parseObservationDispositionNotes,
  } =
    loadObservationUtils();

  await test(
    'Absent disposition notes round-trip exact period and user note',
    () => {
      const notes =
        buildObservationDispositionNotes(
          'absent',
          'Language Arts 3 SC',
          'Student unavailable'
        );

      const parsed =
        parseObservationDispositionNotes(
          notes
        );

      assert.deepStrictEqual(
        {
          disposition:
            parsed.disposition,
          classPeriod:
            parsed.classPeriod,
          userNote:
            parsed.userNote,
        },
        {
          disposition:
            'absent',
          classPeriod:
            'Language Arts 3 SC',
          userNote:
            'Student unavailable',
        }
      );
    }
  );

  await test(
    'No Opportunity safely round-trips punctuation in class-period label',
    () => {
      const period =
        'Period 4 / A&B: Skills';

      const notes =
        buildObservationDispositionNotes(
          'no_opportunity',
          period,
          ''
        );

      assert.ok(
        notes.includes(
          'period='
        )
      );

      const parsed =
        parseObservationDispositionNotes(
          notes
        );

      assert.strictEqual(
        parsed.disposition,
        'no_opportunity'
      );

      assert.strictEqual(
        parsed.classPeriod,
        period
      );
    }
  );

  await test(
    'invalid disposition or missing period fails closed',
    () => {
      assert.strictEqual(
        buildObservationDispositionNotes(
          'present',
          'Language Arts 3 SC',
          ''
        ),
        ''
      );

      assert.strictEqual(
        buildObservationDispositionNotes(
          'absent',
          '',
          ''
        ),
        ''
      );

      assert.strictEqual(
        parseObservationDispositionNotes(
          '[obs:disposition:present|period=ELA]'
        ),
        null
      );
    }
  );

  const handler =
    installEndpointHarness();

  await test(
    'signed GET returns only teacher-authorized persisted dispositions',
    async () => {
      authOk = true;
      progressReadUrl = null;

      const response =
        await handler(
          getEvent()
        );

      const body =
        JSON.parse(
          response.body
        );

      assert.strictEqual(
        response.statusCode,
        200
      );

      assert.strictEqual(
        body.ok,
        true
      );

      assert.deepStrictEqual(
        body.entries,
        [
          {
            student_code:
              'S001',
            goal_code:
              'G-OWN',
            date:
              '2026-09-01',
            disposition:
              'absent',
            classPeriod:
              'Language Arts 3 SC',
          },
          {
            student_code:
              'S001',
            goal_code:
              'G-OWN',
            date:
              '2026-09-03',
            disposition:
              'no_opportunity',
            classPeriod:
              'Transitional Skills',
          },
        ]
      );

      for (
        const row
        of body.entries
      ) {
        assert.strictEqual(
          'student_id' in row,
          false
        );

        assert.strictEqual(
          'goal_id' in row,
          false
        );

        assert.strictEqual(
          'id' in row,
          false
        );
      }
    }
  );

  await test(
    'GET query is server-filtered to null Observation Tray rows within requested week',
    () => {
      assert.ok(
        progressReadUrl,
        'progress_entries GET must occur'
      );

      const params =
        progressReadUrl
          .searchParams;

      assert.strictEqual(
        params.get(
          'percent'
        ),
        'is.null'
      );

      assert.strictEqual(
        params.get(
          'via'
        ),
        'eq.observation_tray'
      );

      const dateFilters =
        params.getAll(
          'date'
        );

      assert.ok(
        dateFilters.includes(
          'gte.2026-09-01'
        )
      );

      assert.ok(
        dateFilters.includes(
          'lte.2026-09-06'
        )
      );
    }
  );

  await test(
    'unauthenticated GET fails closed',
    async () => {
      authOk = false;

      const response =
        await handler(
          getEvent()
        );

      const body =
        JSON.parse(
          response.body
        );

      assert.strictEqual(
        response.statusCode,
        401
      );

      assert.strictEqual(
        body.ok,
        false
      );

      authOk = true;
    }
  );

  await test(
    'GET rejects a range larger than one Monday-Sunday-sized week',
    async () => {
      authOk = true;

      const response =
        await handler(
          getEvent(
            '2026-09-01',
            '2026-09-08'
          )
        );

      const body =
        JSON.parse(
          response.body
        );

      assert.strictEqual(
        response.statusCode,
        400
      );

      assert.strictEqual(
        body.ok,
        false
      );
    }
  );

  console.log(
    `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
  );

  if (failed > 0) {
    console.log(
      '\n✗ OBS-5 behavioral hardening failed'
    );
    process.exit(1);
  }

  console.log(
    '\n✅ OBS-5 behavioral hardening passed'
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
