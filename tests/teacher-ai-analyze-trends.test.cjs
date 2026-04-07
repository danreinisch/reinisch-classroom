// Unit tests for netlify/functions/teacher-ai-analyze-trends.js
// Tests teacher auth, input validation, Anthropic integration, error handling
// Run with: node tests/teacher-ai-analyze-trends.test.cjs

'use strict';

const assert = require('assert');
const crypto = require('crypto');

// -- Helpers -------------------------------------------------------------------

// Minimal HS256 JWT signer (mirrors auth.js sign())
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
var ANTHROPIC_API_KEY = 'sk-ant-test-fake-key';
var validToken = makeTeacherToken(SESSION_SECRET);

// -- Mock setup ----------------------------------------------------------------

var mockHttpLib = {
  generateRequestId: function() { return 'test-req-id'; },
  jsonResponse: function(_event, status, body) {
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  },
  handleCorsPreFlight: function(_event, methods, headers) {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': methods.join(', '),
        'Access-Control-Allow-Headers': (headers || []).join(', '),
      },
      body: '',
    };
  },
  safeJsonParse: function(str) {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

// Real auth lib (uses actual JWT verification)
var realAuth = require('../netlify/functions/_lib/auth');

// Inject mocks into require cache before loading the handler
require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: realAuth };

// Set env vars before loading the module
process.env.SESSION_SECRET = SESSION_SECRET;
process.env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;

// Now load the handler
var handler = require('../netlify/functions/teacher-ai-analyze-trends').handler;

// -- Test runner ---------------------------------------------------------------

var tests = [];
function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

async function runAll() {
  console.log('Running teacher-ai-analyze-trends unit tests...\n');
  var failed = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
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
  }
  console.log('\n\u2713 All teacher-ai-analyze-trends tests passed!');
}

// -- Helper functions ----------------------------------------------------------

function mockEvent(body, method, cookie) {
  var m = method || 'POST';
  var c = cookie || '';
  return {
    httpMethod: m,
    headers: {
      'content-type': 'application/json',
      cookie: c,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function authedEvent(body, method) {
  return mockEvent(body, method, 'tc=' + validToken);
}

var validGoals = [
  {
    code: 'G001',
    area: 'Reading',
    description: 'Student will read grade-level text with 80% accuracy.',
    baseline: '60%',
    target: '80%',
    currentValue: '72%',
    trend: 'up',
    dataCount: 8,
  },
];

var validDataPoints = [
  { goalCode: 'G001', date: '2025-09-05', value: '62' },
  { goalCode: 'G001', date: '2025-09-19', value: '65' },
  { goalCode: 'G001', date: '2025-10-03', value: '70' },
  { goalCode: 'G001', date: '2025-10-17', value: '72' },
];

var validBody = {
  studentCode: 'S001',
  studentName: 'Test Student',
  goals: validGoals,
  dateRange: { start: '2025-09-01', end: '2025-11-30' },
  dataPoints: validDataPoints,
};

function makeAnthropicResponse(analysis, status) {
  var s = status || 200;
  return function(_url, _opts) {
    return Promise.resolve({
      ok: s >= 200 && s < 300,
      status: s,
      json: function() {
        return Promise.resolve({
          content: [{ type: 'text', text: analysis }],
        });
      },
      text: function() {
        return Promise.resolve(JSON.stringify({ error: 'Anthropic error' }));
      },
    });
  };
}

// -- Tests --------------------------------------------------------------------

test('CORS preflight returns 204', async function() {
  var event = { httpMethod: 'OPTIONS', headers: {} };
  var res = await handler(event);
  assert.strictEqual(res.statusCode, 204, 'Should return 204 for OPTIONS');
  assert.ok(res.headers['Access-Control-Allow-Methods'], 'Should have Allow-Methods header');
});

test('returns 405 for non-POST methods', async function() {
  var res = await handler(authedEvent(null, 'GET'));
  assert.strictEqual(res.statusCode, 405);
  var body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('Method Not Allowed'));
});

test('returns 401 when no auth cookie', async function() {
  var res = await handler(mockEvent(validBody, 'POST', ''));
  assert.strictEqual(res.statusCode, 401);
  var body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('returns 401 when invalid auth token', async function() {
  var res = await handler(mockEvent(validBody, 'POST', 'tc=invalid.token.here'));
  assert.strictEqual(res.statusCode, 401);
  var body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('returns 400 when studentCode is missing', async function() {
  var body = Object.assign({}, validBody, { studentCode: '' });
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.error.includes('studentCode'));
});

test('returns 400 when studentName is missing', async function() {
  var body = Object.assign({}, validBody, { studentName: '' });
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.error.includes('studentName'));
});

test('returns 400 when goals is empty array', async function() {
  var body = Object.assign({}, validBody, { goals: [] });
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.error.includes('goals'));
});

test('returns 400 when goals is not an array', async function() {
  var body = Object.assign({}, validBody, { goals: 'not-an-array' });
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 when body is invalid JSON', async function() {
  var event = mockEvent('not-valid-json', 'POST', 'tc=' + validToken);
  var res = await handler(event);
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('success returns 200 and analysis', async function() {
  var expectedAnalysis = 'Reading goal G001 shows consistent upward growth from 62% to 72% over the reporting period, indicating steady progress toward the 80% target.\n\nAt the current rate of improvement (approximately 2.5 percentage points per data collection cycle), the student is on track to meet the target by end of Q2.\n\nNo regressions or plateaus were observed. Continued implementation of current reading fluency strategies is recommended.';
  global.fetch = makeAnthropicResponse(expectedAnalysis);
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.analysis, expectedAnalysis);
});

test('success without dataPoints returns 200', async function() {
  var bodyNoDp = Object.assign({}, validBody, { dataPoints: [] });
  var expectedAnalysis = 'Limited data points available for trend analysis.';
  global.fetch = makeAnthropicResponse(expectedAnalysis);
  var res = await handler(authedEvent(bodyNoDp));
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.analysis, expectedAnalysis);
});

test('success without dateRange returns 200', async function() {
  var bodyNoRange = Object.assign({}, validBody, { dateRange: null });
  var expectedAnalysis = 'Goal analysis complete.';
  global.fetch = makeAnthropicResponse(expectedAnalysis);
  var res = await handler(authedEvent(bodyNoRange));
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
});

test('returns 502 when Anthropic API returns error status', async function() {
  global.fetch = makeAnthropicResponse('', 500);
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.error.includes('failed'));
});

test('returns 503 when ANTHROPIC_API_KEY is not configured', async function() {
  delete process.env.ANTHROPIC_API_KEY;
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 503);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.error.includes('ANTHROPIC_API_KEY'));
});

test('returns 502 when Anthropic returns empty content', async function() {
  global.fetch = function(_url, _opts) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function() {
        return Promise.resolve({ content: [] });
      },
    });
  };
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.error.includes('empty'));
});

test('returns 504 when Anthropic request times out (AbortError)', async function() {
  global.fetch = function(_url, _opts) {
    var err = new Error('The operation was aborted');
    err.name = 'AbortError';
    return Promise.reject(err);
  };
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 504);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.error.includes('timed out'));
});

runAll();
