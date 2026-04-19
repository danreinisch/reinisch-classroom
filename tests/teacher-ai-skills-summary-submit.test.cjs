// Unit tests for netlify/functions/teacher-ai-skills-summary-submit.js
// Tests teacher auth, input validation, Supabase job insertion, and background trigger
// Run with: node tests/teacher-ai-skills-summary-submit.test.cjs

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
  handleCorsPreFlight: function(_event, _methods, _headers) {
    return { statusCode: 200, headers: {}, body: '' };
  },
  validateBodySize: function(_body, _maxKb) { return { valid: true }; },
  safeJsonParse: function(str) {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
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
process.env.OPENAI_API_KEY = OPENAI_API_KEY;
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;
process.env.URL = 'https://test.netlify.app';

var handler = require('../netlify/functions/teacher-ai-skills-summary-submit').handler;

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

// Supabase insert succeeds; background function trigger resolves to 202
function makeSuccessfulFetch() {
  return function(url, opts) {
    // Supabase POST (insert job)
    if (url.includes('/rest/v1/ai_jobs') && opts && opts.method === 'POST') {
      return Promise.resolve({
        ok: true, status: 201,
        json: function() { return Promise.resolve([]); },
        text: function() { return Promise.resolve(''); },
      });
    }
    // Background function trigger
    if (url.includes('teacher-ai-skills-summary-background')) {
      return Promise.resolve({
        ok: true, status: 202,
        json: function() { return Promise.resolve({}); },
        text: function() { return Promise.resolve(''); },
      });
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: function() { return Promise.resolve({}); },
      text: function() { return Promise.resolve(''); },
    });
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

async function runAll() {
  console.log('Running teacher-ai-skills-summary-submit unit tests...\n');
  var failed = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    process.env.SESSION_SECRET = SESSION_SECRET;
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

// ── Method & CORS tests ───────────────────────────────────────────────────────

test('returns 200 for OPTIONS preflight', async function() {
  var res = await handler({ httpMethod: 'OPTIONS', headers: {}, body: null });
  assert.strictEqual(res.statusCode, 200);
});

test('returns 405 for GET request', async function() {
  var res = await handler({ httpMethod: 'GET', headers: {}, body: null });
  assert.strictEqual(res.statusCode, 405);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

// ── Auth tests ────────────────────────────────────────────────────────────────

test('returns 401 when no auth token', async function() {
  var res = await handler({
    httpMethod: 'POST',
    headers: { cookie: '' },
    body: JSON.stringify(validBody()),
  });
  assert.strictEqual(res.statusCode, 401);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 503 when OPENAI_API_KEY is not configured', async function() {
  delete process.env.OPENAI_API_KEY;
  var res = await handler(authedEvent(validBody()));
  assert.strictEqual(res.statusCode, 503);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

// ── Input validation tests ────────────────────────────────────────────────────

test('returns 400 for invalid job_id (not a UUID)', async function() {
  process.env.OPENAI_API_KEY = OPENAI_API_KEY;
  var body = Object.assign({}, validBody(), { job_id: 'not-a-uuid' });
  global.fetch = makeSuccessfulFetch();
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 for UUID v1 (not v4)', async function() {
  var body = Object.assign({}, validBody(), { job_id: '12345678-1234-1234-abcd-1234567890ab' }); // version 1
  global.fetch = makeSuccessfulFetch();
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 when student_code is missing', async function() {
  var body = Object.assign({}, validBody(), { student_code: '' });
  global.fetch = makeSuccessfulFetch();
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 when neither iep_goals nor dese_standards provided', async function() {
  var body = { job_id: validJobId, student_code: 'S001' };
  global.fetch = makeSuccessfulFetch();
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

// ── Success path ──────────────────────────────────────────────────────────────

test('returns 200 with job_id on success', async function() {
  global.fetch = makeSuccessfulFetch();
  var res = await handler(authedEvent(validBody()));
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.job_id, validJobId);
});

test('inserts job into Supabase with correct fields', async function() {
  var insertedBody = null;
  global.fetch = function(url, opts) {
    if (url.includes('/rest/v1/ai_jobs') && opts && opts.method === 'POST') {
      insertedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 201, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 202, json: function() { return Promise.resolve({}); }, text: function() { return Promise.resolve(''); } });
  };

  await handler(authedEvent(validBody()));

  assert.ok(insertedBody, 'Supabase insert should have been called');
  assert.strictEqual(insertedBody.id, validJobId);
  assert.strictEqual(insertedBody.student_code, 'S001');
  assert.strictEqual(insertedBody.status, 'pending');
  assert.strictEqual(insertedBody.created_by, 'testteacher');
  assert.ok(typeof insertedBody.payload_hash === 'string', 'payload_hash should be set');
});

test('returns 500 when Supabase insert fails', async function() {
  global.fetch = function(url, opts) {
    if (url.includes('/rest/v1/ai_jobs') && opts && opts.method === 'POST') {
      return Promise.resolve({ ok: false, status: 500, json: function() { return Promise.resolve({}); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 202, json: function() { return Promise.resolve({}); }, text: function() { return Promise.resolve(''); } });
  };

  var res = await handler(authedEvent(validBody()));
  assert.strictEqual(res.statusCode, 500);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('triggers background function after inserting job', async function() {
  var backgroundTriggered = false;
  global.fetch = function(url, opts) {
    if (url.includes('/rest/v1/ai_jobs') && opts && opts.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    if (url.includes('teacher-ai-skills-summary-background')) {
      backgroundTriggered = true;
      return Promise.resolve({ ok: true, status: 202, json: function() { return Promise.resolve({}); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve({}); }, text: function() { return Promise.resolve(''); } });
  };

  var res = await handler(authedEvent(validBody()));
  assert.strictEqual(res.statusCode, 200);
  // Allow the fire-and-forget fetch to resolve
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(backgroundTriggered, true, 'Background function should be triggered');
});

test('resolvedAudience is included in background trigger body', async function() {
  var backgroundBody = null;
  global.fetch = function(url, opts) {
    if (url.includes('/rest/v1/ai_jobs') && opts && opts.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, json: function() { return Promise.resolve([]); }, text: function() { return Promise.resolve(''); } });
    }
    if (url.includes('teacher-ai-skills-summary-background')) {
      backgroundBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 202, json: function() { return Promise.resolve({}); }, text: function() { return Promise.resolve(''); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve({}); }, text: function() { return Promise.resolve(''); } });
  };

  var body = Object.assign({}, validBody(), { language_mode: 'parent-friendly' });
  await handler(authedEvent(body));
  await new Promise(r => setTimeout(r, 10));
  assert.ok(backgroundBody, 'Background body should be set');
  assert.strictEqual(backgroundBody.audience, 'external', 'language_mode parent-friendly should resolve to external audience');
});

runAll();
