// Unit tests for netlify/functions/teacher-ai-skills-summary-background.js
// Tests teacher auth, input validation, Supabase integration, OpenAI retries, caching
// Run with: node tests/teacher-ai-skills-summary-background.test.cjs

'use strict';

const assert = require('assert');
const crypto = require('crypto');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTeacherToken(secret, role) {
  var r = role || 'teacher';
  var b64url = function(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  var jsonb64 = function(obj) { return b64url(JSON.stringify(obj)); };
  var header = { alg: 'HS256', typ: 'JWT' };
  var now = Math.floor(Date.now() / 1000);
  var payload = { role: r, username: 'testteacher', iat: now, exp: now + 3600 };
  var data = jsonb64(header) + '.' + jsonb64(payload);
  var sig = crypto.createHmac('sha256', secret).update(data).digest();
  return data + '.' + b64url(sig);
}

var SESSION_SECRET = 'test-session-secret-32-chars-long!!';
var OPENAI_API_KEY = 'sk-test-fake-openai-key';
var SUPABASE_URL = 'https://test.supabase.co';
var SUPABASE_KEY = 'test-supabase-service-key';
var validToken = makeTeacherToken(SESSION_SECRET);
var validJobId = '12345678-1234-4234-abcd-1234567890ab';

// ── Mock setup ────────────────────────────────────────────────────────────────

var mockHttpLib = {
  generateRequestId: function() { return 'test-req-id'; },
  jsonResponse: function(_event, status, body) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  },
  validateBodySize: function(_body, _maxKb) { return { valid: true }; },
  safeJsonParse: function(str) {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

var realAuth = require('../netlify/functions/_lib/auth');

// Mock supa.js
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
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: realAuth };
require.cache[require.resolve('../netlify/functions/_lib/supa')] = { exports: mockSupaLib };

process.env.SESSION_SECRET = SESSION_SECRET;
process.env.OPENAI_API_KEY = OPENAI_API_KEY;
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;

var handler = require('../netlify/functions/teacher-ai-skills-summary-background').handler;

// ── Test utilities ────────────────────────────────────────────────────────────

function authedEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { cookie: 'tc=' + validToken },
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

// Track Supabase calls
var supabaseCalls = [];

function makeSuccessfulFetch(openAiSkills) {
  return function(url, opts) {
    supabaseCalls.push({ url: url, method: opts && opts.method });
    // All Supabase calls succeed
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function() {
        // findCachedJob → no cache hit (empty array)
        if (url.includes('/ai_jobs?payload_hash=')) {
          return Promise.resolve([]);
        }
        // OpenAI
        if (url.startsWith('https://api.openai.com/')) {
          return Promise.resolve({
            choices: [{ message: { content: JSON.stringify({ skills: openAiSkills }) } }],
          });
        }
        return Promise.resolve([]);
      },
      text: function() { return Promise.resolve(''); },
    });
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
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.OPENAI_API_KEY = OPENAI_API_KEY;
    supabaseCalls = [];
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

// ── Auth & method tests ───────────────────────────────────────────────────────

test('returns 405 for GET request', async function() {
  var res = await handler({ httpMethod: 'GET', headers: {}, body: null });
  assert.strictEqual(res.statusCode, 405);
});

test('returns 401 when no auth token', async function() {
  var res = await handler({
    httpMethod: 'POST',
    headers: { cookie: '' },
    body: JSON.stringify(validBody()),
  });
  assert.strictEqual(res.statusCode, 401);
});

test('returns 503 when OPENAI_API_KEY is not configured', async function() {
  delete process.env.OPENAI_API_KEY;
  var res = await handler(authedEvent(validBody()));
  assert.strictEqual(res.statusCode, 503);
});

test('returns 400 for invalid job_id (not a UUID)', async function() {
  process.env.OPENAI_API_KEY = OPENAI_API_KEY;
  var body = Object.assign({}, validBody(), { job_id: 'not-a-uuid' });
  global.fetch = function() { return Promise.resolve({ ok: true, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } }); };
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
});

test('returns 400 for UUID v1 (not v4)', async function() {
  var body = Object.assign({}, validBody(), { job_id: '12345678-1234-1234-abcd-1234567890ab' }); // version 1
  global.fetch = function() { return Promise.resolve({ ok: true, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } }); };
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
});

test('returns 400 when student_code is missing', async function() {
  var body = Object.assign({}, validBody(), { student_code: '' });
  global.fetch = function() { return Promise.resolve({ ok: true, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } }); };
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
});

test('returns 400 when neither iep_goals nor dese_standards provided', async function() {
  var body = { job_id: validJobId, student_code: 'S001' };
  global.fetch = function() { return Promise.resolve({ ok: true, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } }); };
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
});

// ── Success path ──────────────────────────────────────────────────────────────

test('returns 202 and writes complete job on success', async function() {
  var aiSkills = [
    { code: 'G001', description: 'Reading goal', summary: 'Good.', tier: 'on-track', source: 'iep' },
  ];

  var patchedBody = null;
  global.fetch = function(url, opts) {
    // Insert → ok
    if (url.includes('/rest/v1/ai_jobs') && opts && opts.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    // Cache lookup → no hit
    if (url.includes('payload_hash=')) {
      return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
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

  var res = await handler(authedEvent(validBody()));
  assert.strictEqual(res.statusCode, 202);
  assert.ok(patchedBody, 'PATCH should have been called');
  assert.strictEqual(patchedBody.status, 'complete');
  assert.ok(patchedBody.result, 'result should be set');
  assert.ok(Array.isArray(patchedBody.result.skills), 'result.skills should be an array');
  assert.strictEqual(patchedBody.result.skills[0].code, 'G001');
});

test('uses cached result when payload_hash matches recent complete job', async function() {
  var cachedSkills = [
    { code: 'G001', description: 'Reading', summary: 'Cached.', tier: 'on-track', source: 'iep' },
  ];
  var openAiCalled = false;
  var patchedBody = null;

  global.fetch = function(url, opts) {
    if (url.includes('/rest/v1/ai_jobs') && opts && opts.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    if (url.includes('payload_hash=')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: function() { return Promise.resolve([{ result: { skills: cachedSkills } }]); },
        text: function() { return Promise.resolve(''); },
      });
    }
    if (url.startsWith('https://api.openai.com/')) {
      openAiCalled = true;
      return Promise.resolve(makeOpenAiSuccess([]));
    }
    if (url.includes('/rest/v1/ai_jobs?id=') && opts && opts.method === 'PATCH') {
      patchedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
  };

  var res = await handler(authedEvent(validBody()));
  assert.strictEqual(res.statusCode, 202);
  assert.strictEqual(openAiCalled, false, 'OpenAI should NOT be called when cache hits');
  assert.ok(patchedBody, 'PATCH should have been called');
  assert.strictEqual(patchedBody.status, 'complete');
});

test('writes error job when OpenAI fails all retries', async function() {
  var patchedBody = null;
  global.fetch = function(url, opts) {
    if (url.includes('/rest/v1/ai_jobs') && opts && opts.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    if (url.includes('payload_hash=')) {
      return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    if (url.startsWith('https://api.openai.com/')) {
      return Promise.resolve({ ok: false, status: 500, text: function() { return Promise.resolve('Server Error'); }, json: function() { return Promise.resolve({}); } });
    }
    if (url.includes('/rest/v1/ai_jobs?id=') && opts && opts.method === 'PATCH') {
      patchedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
  };

  var res = await handler(authedEvent(validBody()));
  assert.strictEqual(res.statusCode, 202);
  assert.ok(patchedBody, 'PATCH should have been called');
  assert.strictEqual(patchedBody.status, 'error');
  assert.ok(typeof patchedBody.error === 'string', 'error message should be set');
});

test('returns 500 when Supabase insert fails', async function() {
  global.fetch = function(url, opts) {
    if (url.includes('/rest/v1/ai_jobs') && opts && opts.method === 'POST') {
      return Promise.resolve({ ok: false, status: 500, json: function() { return Promise.resolve({}); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
  };

  var res = await handler(authedEvent(validBody()));
  assert.strictEqual(res.statusCode, 500);
});

runAll();
