// Unit tests for netlify/functions/teacher-ai-skills-summary-status.js
// Tests teacher auth, job_id validation, Supabase query, and response shape
// Run with: node tests/teacher-ai-skills-summary-status.test.cjs

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
  handleCorsPreFlight: function(_event, methods, headers) {
    return { statusCode: 200, headers: {}, body: '' };
  },
};

var realAuth = require('../netlify/functions/_lib/auth');

var mockSupaLib = {
  getSupabaseConfig: function() { return { url: SUPABASE_URL, key: SUPABASE_KEY }; },
};

require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: realAuth };
require.cache[require.resolve('../netlify/functions/_lib/supa')] = { exports: mockSupaLib };

process.env.SESSION_SECRET = SESSION_SECRET;
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;

var handler = require('../netlify/functions/teacher-ai-skills-summary-status').handler;

// ── Test utilities ────────────────────────────────────────────────────────────

function authedEvent(jobId) {
  return {
    httpMethod: 'GET',
    headers: { cookie: 'tc=' + validToken },
    queryStringParameters: { job_id: jobId !== undefined ? jobId : validJobId },
    body: null,
  };
}

function makeSupabaseResponse(rows) {
  return function(_url, _opts) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function() { return Promise.resolve(rows); },
      text: function() { return Promise.resolve(JSON.stringify(rows)); },
    });
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

async function runAll() {
  console.log('Running teacher-ai-skills-summary-status unit tests...\n');
  var failed = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    process.env.SESSION_SECRET = SESSION_SECRET;
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

test('returns 200 for OPTIONS preflight', async function() {
  var res = await handler({ httpMethod: 'OPTIONS', headers: {}, queryStringParameters: {}, body: null });
  assert.strictEqual(res.statusCode, 200);
});

test('returns 405 for POST request', async function() {
  var res = await handler({ httpMethod: 'POST', headers: { cookie: 'tc=' + validToken }, queryStringParameters: { job_id: validJobId }, body: null });
  assert.strictEqual(res.statusCode, 405);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 401 when no auth token', async function() {
  var res = await handler({ httpMethod: 'GET', headers: { cookie: '' }, queryStringParameters: { job_id: validJobId }, body: null });
  assert.strictEqual(res.statusCode, 401);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 when job_id is missing', async function() {
  var res = await handler({ httpMethod: 'GET', headers: { cookie: 'tc=' + validToken }, queryStringParameters: {}, body: null });
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 when job_id is not a UUID v4', async function() {
  var res = await handler({ httpMethod: 'GET', headers: { cookie: 'tc=' + validToken }, queryStringParameters: { job_id: 'not-a-uuid' }, body: null });
  assert.strictEqual(res.statusCode, 400);
});

// ── Status response tests ─────────────────────────────────────────────────────

test('returns pending when job is not yet found in Supabase', async function() {
  global.fetch = makeSupabaseResponse([]); // no rows
  var res = await handler(authedEvent());
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.status, 'pending');
});

test('returns pending when job status is pending', async function() {
  global.fetch = makeSupabaseResponse([{ status: 'pending', result: null, error: null }]);
  var res = await handler(authedEvent());
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.status, 'pending');
  assert.strictEqual(parsed.skills, undefined, 'skills should not be present for pending');
});

test('returns complete with skills when job is done', async function() {
  var skills = [
    { code: 'G001', description: 'Reading', summary: 'Good progress.', tier: 'on-track', source: 'iep' },
  ];
  global.fetch = makeSupabaseResponse([{ status: 'complete', result: { skills: skills }, error: null }]);
  var res = await handler(authedEvent());
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.status, 'complete');
  assert.ok(Array.isArray(parsed.skills), 'skills should be an array');
  assert.strictEqual(parsed.skills[0].code, 'G001');
});

test('returns error status with error message when job failed', async function() {
  global.fetch = makeSupabaseResponse([{ status: 'error', result: null, error: 'OpenAI API error: 500' }]);
  var res = await handler(authedEvent());
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.status, 'error');
  assert.ok(typeof parsed.error === 'string', 'error message should be present');
});

test('returns 502 when Supabase fetch fails', async function() {
  global.fetch = function() {
    return Promise.resolve({ ok: false, status: 500, text: function() { return Promise.resolve('Server Error'); } });
  };
  var res = await handler(authedEvent());
  assert.strictEqual(res.statusCode, 502);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 502 when Supabase fetch throws', async function() {
  global.fetch = function() { return Promise.reject(new Error('Network error')); };
  var res = await handler(authedEvent());
  assert.strictEqual(res.statusCode, 502);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

runAll();
