'use strict';

const assert = require('assert');
const path = require('path');

process.env.SESSION_SECRET = 'rc-goal-test-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const authPath = require.resolve('../netlify/functions/_lib/auth');
const supaPath = require.resolve('../netlify/functions/_lib/supa');

require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    requireTeacher() {
      return {
        ok: true,
        user: {
          username: 'teacher_test',
          role: 'teacher',
          teacherId: TEACHER_ID,
        },
      };
    },
  },
};

require.cache[supaPath] = {
  id: supaPath,
  filename: supaPath,
  loaded: true,
  exports: {
    getSupabaseConfig() {
      return {
        url: 'https://test.supabase.co',
        key: 'test-key',
      };
    },
  },
};

const endpointPath = path.resolve(
  __dirname,
  '../netlify/functions/teacher-sync-observations.js'
);

delete require.cache[require.resolve(endpointPath)];

const { handler } = require(endpointPath);

const STUDENT_ID =
  '11111111-1111-4111-8111-111111111111';

const CLASS_ID =
  '22222222-2222-4222-8222-222222222222';

const TEACHER_ID =
  '55555555-5555-4555-8555-555555555555';

const GOAL_ID =
  '33333333-3333-4333-8333-333333333333';

const WRONG_GOAL_ID =
  '44444444-4444-4444-8444-444444444444';

let canonical = [];
let legacy = [];
let serial = 1;
let studentActive = true;
let activeEnrollment = true;
let teacherOwnsClass = true;

function reset() {
  canonical = [];
  legacy = [];
  serial = 1;
  studentActive = true;
  activeEnrollment = true;
  teacherOwnsClass = true;
}

function reply(status, data = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  };
}

function eq(params, key) {
  const raw = params.get(key);
  return raw?.startsWith('eq.') ? raw.slice(3) : raw;
}

function matches(row, params, keys) {
  return keys.every(key => {
    const wanted = eq(params, key);
    return !wanted || String(row[key]) === wanted;
  });
}

global.fetch = async (rawUrl, init = {}) => {
  const url = new URL(String(rawUrl));
  const resource = url.pathname.replace('/rest/v1/', '');
  const method = init.method || 'GET';
  const params = url.searchParams;

  if (resource === 'students' && method === 'GET') {
    const valid =
      eq(params, 'code') === 'S001' &&
      studentActive;

    return reply(
      200,
      valid
        ? [{
            id: STUDENT_ID,
            class_id: CLASS_ID,
            active: true,
            archived_at: null,
          }]
        : []
    );
  }

  if (
    resource === 'class_enrollments' &&
    method === 'GET'
  ) {
    return reply(
      200,
      activeEnrollment
        ? [{ class_id: CLASS_ID }]
        : []
    );
  }

  if (resource === 'classes' && method === 'GET') {
    const valid =
      teacherOwnsClass &&
      eq(params, 'teacher_id') === TEACHER_ID;

    return reply(
      200,
      valid ? [{ id: CLASS_ID }] : []
    );
  }

  if (resource === 'goals' && method === 'GET') {
    const valid =
      eq(params, 'id') === GOAL_ID &&
      eq(params, 'student_id') === STUDENT_ID;

    return reply(
      200,
      valid
        ? [{ id: GOAL_ID, status: 'active' }]
        : []
    );
  }

  if (resource === 'goal_progress' && method === 'GET') {
    return reply(
      200,
      canonical
        .filter(row =>
          matches(
            row,
            params,
            ['student_id', 'goal_id', 'date', 'source']
          )
        )
        .map(row => ({ id: row.id, notes: row.notes }))
    );
  }

  if (resource === 'progress_entries' && method === 'GET') {
    return reply(
      200,
      legacy
        .filter(row =>
          matches(
            row,
            params,
            ['student_id', 'goal_id', 'date', 'via']
          )
        )
        .map(row => ({ id: row.id }))
    );
  }

  const body = init.body ? JSON.parse(init.body) : null;
  const id = eq(params, 'id');

  if (resource === 'goal_progress' && method === 'POST') {
    canonical.push({ id: `gp-${serial++}`, ...body });
    return reply(201);
  }

  if (resource === 'progress_entries' && method === 'POST') {
    legacy.push({ id: `pe-${serial++}`, ...body });
    return reply(201);
  }

  if (resource === 'goal_progress' && method === 'PATCH') {
    Object.assign(
      canonical.find(row => row.id === id),
      body
    );
    return reply(204);
  }

  if (resource === 'progress_entries' && method === 'PATCH') {
    Object.assign(
      legacy.find(row => row.id === id),
      body
    );
    return reply(204);
  }

  if (resource === 'goal_progress' && method === 'DELETE') {
    canonical = canonical.filter(row => row.id !== id);
    return reply(204);
  }

  if (resource === 'progress_entries' && method === 'DELETE') {
    legacy = legacy.filter(row => row.id !== id);
    return reply(204);
  }

  throw new Error(`Unexpected fetch: ${method} ${url}`);
};

function event(entries) {
  return {
    httpMethod: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ entries }),
  };
}

function entry(overrides = {}) {
  return {
    student_code: 'S001',
    goal_id: GOAL_ID,
    date: '2026-08-18',
    percent: 100,
    method: 'Observation',
    by_name: 'Teacher',
    via: 'observation_tray',
    notes: '[obs:session_outcome:met]',
    ...overrides,
  };
}

async function call(entries) {
  const response = await handler(event(entries));
  return {
    response,
    body: JSON.parse(response.body),
  };
}

async function run() {
  reset();

  console.log('RC-GOAL-02A lean adapter tests');

  let result = await call([entry()]);

  assert.strictEqual(result.body.ok, true);
  assert.strictEqual(result.body.synced, 1);
  assert.strictEqual(canonical.length, 1);
  assert.strictEqual(legacy.length, 0);

  assert.deepStrictEqual(
    {
      student_id: canonical[0].student_id,
      goal_id: canonical[0].goal_id,
      class_id: canonical[0].class_id,
      value: canonical[0].value,
      source: canonical[0].source,
      school_year: canonical[0].school_year,
      notes: canonical[0].notes,
    },
    {
      student_id: STUDENT_ID,
      goal_id: GOAL_ID,
      class_id: CLASS_ID,
      value: 100,
      source: 'manual',
      school_year: 2026,
      notes: '[obs:session_outcome:met]',
    }
  );

  console.log('✓ numeric observation becomes canonical evidence');

  await call([
    entry({
      percent: 60,
      notes: '[obs:tally:3/5]',
    }),
  ]);

  assert.strictEqual(canonical.length, 1);
  assert.strictEqual(canonical[0].value, 60);
  assert.strictEqual(canonical[0].notes, '[obs:tally:3/5]');

  console.log('✓ same-day retry/edit updates instead of duplicating');

  await call([
    entry({
      percent: null,
      notes: '[obs:session_outcome:not_addressed]',
    }),
  ]);

  assert.strictEqual(canonical.length, 0);
  assert.strictEqual(legacy.length, 1);
  assert.strictEqual(legacy[0].student_id, STUDENT_ID);
  assert.strictEqual(legacy[0].percent, null);
  assert.strictEqual('student_code' in legacy[0], false);

  console.log('✓ null event uses production student_id and stays null');

  await call([
    entry({
      percent: 0,
      notes: '[obs:session_outcome:not_met]',
    }),
  ]);

  assert.strictEqual(legacy.length, 0);
  assert.strictEqual(canonical.length, 1);
  assert.strictEqual(canonical[0].value, 0);

  console.log('✓ genuine Not Met remains a real zero');

  studentActive = false;

  result = await call([
    entry({
      date: '2026-08-19',
    }),
  ]);

  assert.strictEqual(result.body.ok, false);
  assert.strictEqual(result.body.synced, 0);
  assert.strictEqual(
    canonical.some(row => row.date === '2026-08-19'),
    false
  );

  studentActive = true;

  console.log('✓ inactive or archived student fails closed');

  activeEnrollment = false;

  result = await call([
    entry({
      date: '2026-08-20',
    }),
  ]);

  assert.strictEqual(result.body.ok, false);
  assert.strictEqual(result.body.synced, 0);
  assert.strictEqual(
    canonical.some(row => row.date === '2026-08-20'),
    false
  );

  activeEnrollment = true;

  console.log('✓ inactive enrollment fails closed');

  teacherOwnsClass = false;

  result = await call([
    entry({
      date: '2026-08-21',
    }),
  ]);

  assert.strictEqual(result.body.ok, false);
  assert.strictEqual(result.body.synced, 0);
  assert.strictEqual(
    canonical.some(row => row.date === '2026-08-21'),
    false
  );

  teacherOwnsClass = true;

  console.log('✓ non-owned class fails closed');

  const validBatchEntry = entry({
    date: '2026-08-22',
    percent: 80,
    notes: '[obs:tally:4/5]',
  });

  const invalidBatchEntry = entry({
    goal_id: WRONG_GOAL_ID,
    date: '2026-08-22',
  });

  result = await call([
    validBatchEntry,
    invalidBatchEntry,
  ]);

  assert.strictEqual(result.body.ok, false);
  assert.strictEqual(result.body.synced, 1);
  assert.strictEqual(result.body.failed.length, 1);

  await call([
    validBatchEntry,
    invalidBatchEntry,
  ]);

  assert.strictEqual(
    canonical.filter(row => row.date === '2026-08-22').length,
    1
  );

  console.log('✓ partial batch retry cannot duplicate saved evidence');

  await call([
    entry({
      date: '2026-07-31',
      percent: 75,
      notes: '[obs:tally:3/4]',
    }),
  ]);

  const july = canonical.find(row => row.date === '2026-07-31');

  assert.ok(july);
  assert.strictEqual(july.school_year, 2025);

  console.log('✓ canonical Aug-Jul school-year stamping preserved');

  console.log('RC-GOAL-02A LEAN ADAPTER: PASS');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
