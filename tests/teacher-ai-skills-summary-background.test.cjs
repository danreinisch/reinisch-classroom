// Unit tests for netlify/functions/teacher-ai-skills-summary-background.js
// Tests OpenAI retries, job update, and banned-phrase logic.
// Auth and input validation are handled by teacher-ai-skills-summary-submit.
// Run with: node tests/teacher-ai-skills-summary-background.test.cjs

'use strict';

const assert = require('assert');

// ── Mock setup ────────────────────────────────────────────────────────────────

var mockHttpLib = {
  generateRequestId: function() { return 'test-req-id'; },
  jsonResponse: function(_event, status, body) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  },
  safeJsonParse: function(str) {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

// Mock supa.js
var SUPABASE_URL = 'https://test.supabase.co';
var SUPABASE_KEY = 'test-supabase-service-key';
var OPENAI_API_KEY = 'sk-test-fake-openai-key';
var validJobId = '12345678-1234-4234-abcd-1234567890ab';

var mockSupaLib = {
  getSupabaseConfig: function() { return { url: SUPABASE_URL, key: SUPABASE_KEY }; },
  rest: function() {},
  jsonRes: function() {},
  rpc: function() {},
  parseBooleanRpcResponse: function() {},
  lookupActiveTeacherId: function() {},
  SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
};

require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/supa')] = { exports: mockSupaLib };

var INTERNAL_SECRET = 'test-internal-secret-value';

process.env.OPENAI_API_KEY = OPENAI_API_KEY;
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;
process.env.INTERNAL_FUNCTION_SECRET = INTERNAL_SECRET;

var handler = require('../netlify/functions/teacher-ai-skills-summary-background').handler;

// ── Test utilities ────────────────────────────────────────────────────────────

function mockEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { 'x-internal-secret': INTERNAL_SECRET },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function validBody(jobId) {
  return {
    job_id: jobId || validJobId,
    student_code: 'S001',
    iep_goals: [
      { code: 'G001', area: 'Reading', current_avg: 75, trend: 'up', data_points: 5, target: 85, baseline: 50 },
    ],
    dese_standards: [
      { code: 'R.1.A.9-12.a', percent_correct: 42, item_count: 8 },
    ],
  };
}

function makeOpenAiSuccess(skills) {
  return {
    ok: true,
    status: 200,
    json: function() {
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ skills: skills }) } }],
      });
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

async function runAll() {
  console.log('Running teacher-ai-skills-summary-background unit tests...\n');
  var failed = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    process.env.OPENAI_API_KEY = OPENAI_API_KEY;
    global.fetch = null;
    try {
      await t.fn();
      console.log('\u2713 ' + t.name);
    } catch (e) {
      console.error('\u2717 ' + t.name);
      console.error('  Error:', e.message);
      if (e.stack) console.error('  Stack:', e.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }
  if (failed > 0) {
    console.error('\n' + failed + ' test(s) failed.');
    process.exit(1);
  } else {
    console.log('\nAll tests passed.');
  }
}

// ── Method & config tests ─────────────────────────────────────────────────────

test('returns 405 for GET request', async function() {
  var res = await handler({ httpMethod: 'GET', headers: {}, body: null });
  assert.strictEqual(res.statusCode, 405);
});

test('returns 403 when X-Internal-Secret header is missing', async function() {
  var res = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(validBody()) });
  assert.strictEqual(res.statusCode, 403);
});

test('returns 403 when X-Internal-Secret header is wrong', async function() {
  var res = await handler({ httpMethod: 'POST', headers: { 'x-internal-secret': 'wrong-secret' }, body: JSON.stringify(validBody()) });
  assert.strictEqual(res.statusCode, 403);
});

test('returns 503 when OPENAI_API_KEY is not configured', async function() {
  delete process.env.OPENAI_API_KEY;
  var res = await handler(mockEvent(validBody()));
  assert.strictEqual(res.statusCode, 503);
});

test('returns 400 when job_id is missing', async function() {
  process.env.OPENAI_API_KEY = OPENAI_API_KEY;
  var body = { student_code: 'S001', iep_goals: [{ code: 'G001' }] };
  var res = await handler(mockEvent(body));
  assert.strictEqual(res.statusCode, 400);
});

// ── Success path ──────────────────────────────────────────────────────────────

test('returns 202 and writes complete job on success', async function() {
  var aiSkills = [
    { code: 'G001', description: 'Reading goal', summary: 'Good.', tier: 'on-track', source: 'iep' },
  ];

  var patchedBody = null;
  global.fetch = function(url, opts) {
    // OpenAI
    if (url.startsWith('https://api.openai.com/')) {
      return Promise.resolve(makeOpenAiSuccess(aiSkills));
    }
    // PATCH job
    if (url.includes('/rest/v1/ai_jobs?id=') && opts && opts.method === 'PATCH') {
      patchedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
  };

  var res = await handler(mockEvent(validBody()));
  assert.strictEqual(res.statusCode, 202);
  assert.ok(patchedBody, 'PATCH should have been called');
  assert.strictEqual(patchedBody.status, 'complete');
  assert.ok(patchedBody.result, 'result should be set');
  assert.ok(Array.isArray(patchedBody.result.skills), 'result.skills should be an array');
  assert.strictEqual(patchedBody.result.skills[0].code, 'G001');
});

test('writes error job when OpenAI fails all retries', async function() {
  var patchedBody = null;
  global.fetch = function(url, opts) {
    if (url.startsWith('https://api.openai.com/')) {
      return Promise.resolve({ ok: false, status: 500, text: function() { return Promise.resolve('Server Error'); }, json: function() { return Promise.resolve({}); } });
    }
    if (url.includes('/rest/v1/ai_jobs?id=') && opts && opts.method === 'PATCH') {
      patchedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
  };

  var res = await handler(mockEvent(validBody()));
  assert.strictEqual(res.statusCode, 202);
  assert.ok(patchedBody, 'PATCH should have been called');
  assert.strictEqual(patchedBody.status, 'error');
  assert.ok(typeof patchedBody.error === 'string', 'error message should be set');
});

test('marks job as error on unhandled throw inside handler', async function() {
  var patchedBody = null;
  global.fetch = function(url, opts) {
    if (url.startsWith('https://api.openai.com/')) {
      // Simulate a catastrophic unexpected error (e.g. malformed response that throws in JSON.parse)
      throw new Error('Simulated unhandled error in OpenAI fetch');
    }
    if (url.includes('/rest/v1/ai_jobs?id=') && opts && opts.method === 'PATCH') {
      patchedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
  };

  var res = await handler(mockEvent(validBody()));
  assert.strictEqual(res.statusCode, 202, 'handler should return 202 even after unhandled error');
  assert.ok(patchedBody, 'PATCH should have been called to mark job as error');
  assert.strictEqual(patchedBody.status, 'error', 'job status should be error');
  assert.ok(typeof patchedBody.error === 'string' && patchedBody.error.length > 0, 'error message should be set');
});

runAll();
