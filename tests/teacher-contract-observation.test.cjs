'use strict';

const assert = require('assert');
const path = require('path');

process.env.SESSION_SECRET = 'obs-nq2-test-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const CLASS_ID = '22222222-2222-4222-8222-222222222222';
const GOAL_ID = '33333333-3333-4333-8333-333333333333';
const TEACHER_ID = '55555555-5555-4555-8555-555555555555';

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
      return { url: 'https://test.supabase.co', key: 'test-key' };
    },
  },
};

const endpointPath = path.resolve(__dirname, '../netlify/functions/teacher-contract-observation.js');
delete require.cache[require.resolve(endpointPath)];
const { handler } = require(endpointPath);

let canonical = [];
let dispositions = [];
let serial = 1;

function reply(status, data = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
    async text() { return data == null ? '' : JSON.stringify(data); },
  };
}

function eq(params, key) {
  const raw = params.get(key);
  return raw?.startsWith('eq.') ? raw.slice(3) : raw;
}

function matches(row, params, keys) {
  return keys.every(key => {
    const wanted = eq(params, key);
    if (!wanted) return true;
    return String(row[key]) === wanted;
  });
}

global.fetch = async (rawUrl, init = {}) => {
  const url = new URL(String(rawUrl));
  const resource = url.pathname.replace('/rest/v1/', '');
  const method = init.method || 'GET';
  const params = url.searchParams;

  if (resource === 'students' && method === 'GET') {
    return reply(200, eq(params, 'code') === 'S071'
      ? [{ id: STUDENT_ID, class_id: CLASS_ID, active: true, archived_at: null }]
      : []);
  }

  if (resource === 'class_enrollments' && method === 'GET') {
    return reply(200, [{ class_id: CLASS_ID }]);
  }

  if (resource === 'classes' && method === 'GET') {
    return reply(200, eq(params, 'teacher_id') === TEACHER_ID ? [{ id: CLASS_ID }] : []);
  }

  if (resource === 'goals' && method === 'GET') {
    const valid = eq(params, 'student_id') === STUDENT_ID && eq(params, 'code') === 'S071.CG1';
    return reply(200, valid ? [{ id: GOAL_ID, code: 'S071.CG1', status: 'Open', measurement_type: 'x/y' }] : []);
  }

  if (resource === 'goal_progress' && method === 'GET') {
    return reply(200, canonical
      .filter(row => matches(row, params, ['student_id', 'goal_id', 'date', 'source']))
      .map(row => ({ id: row.id, value: row.value, notes: row.notes, created_at: row.created_at })));
  }

  if (resource === 'progress_entries' && method === 'GET') {
    return reply(200, dispositions
      .filter(row => matches(row, params, ['student_id', 'goal_id', 'date', 'via']))
      .map(row => ({ id: row.id, percent: row.percent, notes: row.notes })));
  }

  const body = init.body ? JSON.parse(init.body) : null;
  const id = eq(params, 'id');

  if (resource === 'goal_progress' && method === 'POST') {
    canonical.push({ id: `gp-${serial++}`, created_at: new Date().toISOString(), ...body });
    return reply(201);
  }

  if (resource === 'goal_progress' && method === 'PATCH') {
    Object.assign(canonical.find(row => row.id === id), body);
    return reply(204);
  }

  if (resource === 'goal_progress' && method === 'DELETE') {
    canonical = canonical.filter(row => row.id !== id);
    return reply(204);
  }

  if (resource === 'progress_entries' && method === 'POST') {
    dispositions.push({ id: `pe-${serial++}`, ...body });
    return reply(201);
  }

  if (resource === 'progress_entries' && method === 'PATCH') {
    Object.assign(dispositions.find(row => row.id === id), body);
    return reply(204);
  }

  if (resource === 'progress_entries' && method === 'DELETE') {
    dispositions = dispositions.filter(row => row.id !== id);
    return reply(204);
  }

  throw new Error(`Unexpected fetch: ${method} ${url}`);
};

function post(body) {
  return handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function parsed(responsePromise) {
  const response = await responsePromise;
  return { response, body: JSON.parse(response.body) };
}

function base(eventKey, result) {
  return {
    action: 'save',
    student_code: 'S071',
    goal_code: 'S071.CG1',
    date: '2026-09-14',
    event_key: eventKey,
    class_period: 'Period 2',
    data: { result },
    note: '',
  };
}

(async () => {
  console.log('\n--- teacher-contract-observation ---');

  let result = await parsed(post(base('period:Period 2:slot:1', 'met')));
  assert.strictEqual(result.response.statusCode, 200);
  assert.strictEqual(result.body.ok, true);
  assert.strictEqual(canonical.length, 1);
  assert.strictEqual(canonical[0].value, 100);

  result = await parsed(post(base('period:Period 2:slot:2', 'not_met')));
  assert.strictEqual(result.body.ok, true);
  assert.strictEqual(canonical.length, 2, 'two same-period slots must remain separate rows');
  assert.deepStrictEqual(canonical.map(row => row.value).sort(), [0, 100]);
  console.log('  ✓ two same-day high-frequency slots persist independently');

  result = await parsed(post(base('period:Period 2:slot:1', 'not_met')));
  assert.strictEqual(result.body.ok, true);
  assert.strictEqual(canonical.length, 2, 'editing slot 1 must not duplicate or erase slot 2');
  assert.deepStrictEqual(canonical.map(row => row.value).sort(), [0, 0]);
  console.log('  ✓ editing one slot updates only that event key');

  result = await parsed(post({
    action: 'disposition',
    student_code: 'S071',
    goal_code: 'S071.CG1',
    date: '2026-09-14',
    event_key: 'period:Period 2:slot:2',
    class_period: 'Period 2',
    disposition: 'no_opportunity',
    note: '',
  }));
  assert.strictEqual(result.body.ok, true);
  assert.strictEqual(canonical.length, 1, 'slot 1 must survive a slot 2 disposition');
  assert.strictEqual(dispositions.length, 1);
  assert.ok(canonical[0].notes.includes('slot%3A1'));
  assert.ok(dispositions[0].notes.includes('slot%3A2'));
  console.log('  ✓ a slot-specific disposition does not erase another captured slot');

  const getResponse = await handler({
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {
      student_code: 'S071',
      goal_code: 'S071.CG1',
      date: '2026-09-14',
    },
  });
  const getBody = JSON.parse(getResponse.body);
  assert.strictEqual(getBody.ok, true);
  assert.strictEqual(getBody.events.length, 1);
  assert.strictEqual(getBody.dispositions.length, 1);
  assert.strictEqual(getBody.events[0].event_key, 'period:Period 2:slot:1');
  assert.strictEqual(getBody.dispositions[0].event_key, 'period:Period 2:slot:2');
  console.log('  ✓ readback preserves event-keyed evidence and dispositions');

  console.log('\n✅ teacher-contract-observation tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
