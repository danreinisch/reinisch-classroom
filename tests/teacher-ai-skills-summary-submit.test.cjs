// Unit tests for netlify/functions/teacher-ai-skills-summary-submit.js
// Tests cache validation, rate-limit robustness, dedup, background invocation, and error handling.
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
var SUPABASE_URL = 'https://test.supabase.co';
var SUPABASE_KEY = 'test-supabase-service-key';
var INTERNAL_SECRET = 'test-internal-secret-value';
var validToken = makeTeacherToken(SESSION_SECRET);
var validJobId = '12345678-1234-4234-abcd-1234567890ab';

// ── Mock setup ────────────────────────────────────────────────────────────────

var mockHttpLib = {
  generateRequestId: function() { return 'test-req-id'; },
  jsonResponse: function(_event, status, body) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  },
  handleCorsPreFlight: function() { return { statusCode: 200, headers: {}, body: '' }; },
  validateBodySize: function() { return { valid: true }; },
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
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;
process.env.INTERNAL_FUNCTION_SECRET = INTERNAL_SECRET;
// Use a non-existent URL so background invocation attempts fail fast
process.env.URL = 'http://localhost:19999';

var handler = require('../netlify/functions/teacher-ai-skills-summary-submit').handler;

// ── Test utilities ────────────────────────────────────────────────────────────

function authedEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { cookie: 'tc=' + validToken, 'Content-Type': 'application/json' },
    queryStringParameters: {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

var validBody = {
  job_id: validJobId,
  student_code: 'S001',
  iep_goals: [{ code: 'G001', area: 'Reading', current_avg: 75 }],
  dese_standards: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

async function runAll() {
  console.log('Running teacher-ai-skills-summary-submit unit tests...\n');
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

test('returns 405 for GET request', async function() {
  var res = await handler({ httpMethod: 'GET', headers: {}, body: null, queryStringParameters: {} });
  assert.strictEqual(res.statusCode, 405);
});

test('returns 200 for OPTIONS preflight', async function() {
  var res = await handler({ httpMethod: 'OPTIONS', headers: {}, body: null, queryStringParameters: {} });
  assert.strictEqual(res.statusCode, 200);
});

test('returns 401 when no auth token', async function() {
  var res = await handler({ httpMethod: 'POST', headers: { cookie: '' }, body: JSON.stringify(validBody), queryStringParameters: {} });
  assert.strictEqual(res.statusCode, 401);
});

test('returns 400 when job_id is missing', async function() {
  var body = Object.assign({}, validBody);
  delete body.job_id;
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 when job_id is not a UUID v4', async function() {
  var body = Object.assign({}, validBody, { job_id: 'not-a-uuid' });
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
});

test('returns 400 when neither iep_goals nor dese_standards provided', async function() {
  var body = Object.assign({}, validBody, { iep_goals: [], dese_standards: [] });
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
});

// ── Cache validation tests ────────────────────────────────────────────────────

test('returns cached job when cache hit has valid non-empty skills', async function() {
  var cachedSkills = [{ code: 'G001', description: 'Reading', summary: 'Good progress', tier: 'on-track', source: 'iep' }];
  var upsertCalled = false;
  global.fetch = function(url, opts) {
    // Cache lookup (GET) — return a complete job with valid skills
    if (opts && opts.method === 'GET' && url.includes('status=eq.complete')) {
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: function() { return null; } },
        json: function() { return Promise.resolve([{ result: { skills: cachedSkills } }]); },
      });
    }
    // Upsert (POST) for the cache hit
    if (opts && opts.method === 'POST' && url.includes('/rest/v1/ai_jobs')) {
      upsertCalled = true;
      return Promise.resolve({ ok: true, status: 201, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Background function — should NOT be reached on cache hit
    return Promise.resolve({ ok: true, status: 202, headers: { get: function() { return null; } }, json: function() { return Promise.resolve({}); } });
  };
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.cached, true, 'should report cached: true');
  assert.ok(upsertCalled, 'should upsert the job record');
});

test('does NOT serve cache when cached result has empty skills array', async function() {
  var backgroundCalled = false;
  global.fetch = function(url, opts) {
    // Cache lookup — return a complete job with EMPTY skills (invalid)
    if (opts && opts.method === 'GET' && url.includes('status=eq.complete')) {
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: function() { return null; } },
        json: function() { return Promise.resolve([{ result: { skills: [] } }]); },
      });
    }
    // Dedup check — no pending job
    if (opts && opts.method === 'GET' && url.includes('status=eq.pending') && !url.includes('created_by=eq.')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Rate-limit check — 0 pending
    if (opts && opts.method === 'GET' && url.includes('status=eq.pending')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return '/0'; } }, json: function() { return Promise.resolve([]); } });
    }
    // Insert pending job
    if (opts && opts.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Background function call — fail fast (expected connection refused)
    if (url.includes('teacher-ai-skills-summary-background')) {
      backgroundCalled = true;
      return Promise.reject(new Error('ECONNREFUSED'));
    }
    return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
  };
  var res = await handler(authedEvent(validBody));
  // Should proceed past cache (not return cached: true) — either creates new job or returns 500 on bg failure
  assert.notEqual(res.statusCode, 400, 'should not return 400 (validation error)');
  var parsed = JSON.parse(res.body);
  // Should NOT be a cache hit
  assert.notStrictEqual(parsed.cached, true, 'should NOT serve empty-skills cache hit');
});

test('does NOT serve cache when cached result has no skills property', async function() {
  global.fetch = function(url, opts) {
    // Cache lookup — return a complete job with NULL result
    if (opts && opts.method === 'GET' && url.includes('status=eq.complete')) {
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: function() { return null; } },
        json: function() { return Promise.resolve([{ result: null }]); },
      });
    }
    // Dedup check
    if (opts && opts.method === 'GET' && url.includes('status=eq.pending') && !url.includes('created_by')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Rate-limit check
    if (opts && opts.method === 'GET' && url.includes('status=eq.pending')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return '/0'; } }, json: function() { return Promise.resolve([]); } });
    }
    // Insert pending job
    if (opts && opts.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Background function
    if (url.includes('teacher-ai-skills-summary-background')) {
      return Promise.reject(new Error('ECONNREFUSED'));
    }
    return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
  };
  var res = await handler(authedEvent(validBody));
  var parsed = JSON.parse(res.body);
  assert.notStrictEqual(parsed.cached, true, 'should NOT serve null-result cache hit');
});

// ── Rate-limit robustness tests ───────────────────────────────────────────────

test('rate limit: blocks when 3 or more recent pending jobs exist', async function() {
  global.fetch = function(url, opts) {
    // Cache miss
    if (opts && opts.method === 'GET' && url.includes('status=eq.complete')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Dedup miss
    if (opts && opts.method === 'GET' && url.includes('status=eq.pending') && !url.includes('created_by')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Rate-limit count — return 3 pending jobs via Content-Range header
    if (opts && opts.method === 'GET' && url.includes('status=eq.pending')) {
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: function(h) { return h === 'content-range' ? 'items 0-2/3' : null; } },
        json: function() { return Promise.resolve([]); },
      });
    }
    return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
  };
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 429, 'should return 429 when rate limited');
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('rate limit query includes created_at filter to exclude stale pending jobs', async function() {
  // Verify that the rate-limit fetch URL contains a created_at filter
  var rateCheckUrl = null;
  global.fetch = function(url, opts) {
    // Cache miss
    if (opts && opts.method === 'GET' && url.includes('status=eq.complete')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Dedup miss
    if (opts && opts.method === 'GET' && url.includes('status=eq.pending') && !url.includes('created_by')) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Rate-limit query
    if (opts && opts.method === 'GET' && url.includes('status=eq.pending') && url.includes('created_by')) {
      rateCheckUrl = url;
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: function(h) { return h === 'content-range' ? 'items 0-0/0' : null; } },
        json: function() { return Promise.resolve([]); },
      });
    }
    // Insert pending job
    if (opts && opts.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
    }
    // Background function — reject to avoid test hanging
    if (url.includes('teacher-ai-skills-summary-background')) {
      return Promise.reject(new Error('ECONNREFUSED'));
    }
    return Promise.resolve({ ok: true, status: 200, headers: { get: function() { return null; } }, json: function() { return Promise.resolve([]); } });
  };
  await handler(authedEvent(validBody));
  assert.ok(rateCheckUrl !== null, 'rate-limit query should have been made');
  assert.ok(rateCheckUrl.includes('created_at=gte.'), 'rate-limit query should filter by created_at to exclude stale jobs');
});

runAll();
