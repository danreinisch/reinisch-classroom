// Unit tests for netlify/functions/teacher-ai-iep-goal.js
// Run with: node tests/teacher-ai-iep-goal.test.cjs

'use strict';

var assert = require('assert');
var crypto = require('crypto');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTeacherToken(secret) {
  var b64url = function(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  var jsonb64 = function(obj) { return b64url(JSON.stringify(obj)); };
  var header = { alg: 'HS256', typ: 'JWT' };
  var now = Math.floor(Date.now() / 1000);
  var payload = { role: 'teacher', username: 'testteacher', iat: now, exp: now + 3600 };
  var data = jsonb64(header) + '.' + jsonb64(payload);
  var sig = crypto.createHmac('sha256', secret).update(data).digest();
  return data + '.' + b64url(sig);
}

var SESSION_SECRET = 'test-session-secret-32-chars-long!!';
var OPENAI_API_KEY = 'sk-test-fake-openai-key';
var validToken = makeTeacherToken(SESSION_SECRET);

// ── Mock setup ────────────────────────────────────────────────────────────────

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
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': methods.join(', '),
        'Access-Control-Allow-Headers': (headers || []).join(', '),
      },
      body: '',
    };
  },
  validateBodySize: function(_body, _maxKb) { return { valid: true }; },
  safeJsonParse: function(str) {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

var realAuth = require('../netlify/functions/_lib/auth');
require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: realAuth };

process.env.SESSION_SECRET = SESSION_SECRET;
process.env.OPENAI_API_KEY = OPENAI_API_KEY;

var handler = require('../netlify/functions/teacher-ai-iep-goal').handler;

// ── Test utilities ────────────────────────────────────────────────────────────

function authedEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { cookie: 'tc=' + validToken },
    body: JSON.stringify(body),
  };
}

function mockOpenAI(goalData) {
  return function(_url, _opts) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function() {
        return Promise.resolve({
          choices: [{ message: { content: JSON.stringify(goalData) } }],
        });
      },
      text: function() { return Promise.resolve(''); },
    });
  };
}

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

async function runAll() {
  console.log('Running teacher-ai-iep-goal unit tests...\n');
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

// ── Tests ─────────────────────────────────────────────────────────────────────

test('returns 405 for GET request', async function() {
  var res = await handler({ httpMethod: 'GET', headers: {}, body: '' });
  assert.strictEqual(res.statusCode, 405);
});

test('returns 200 for OPTIONS preflight', async function() {
  var res = await handler({ httpMethod: 'OPTIONS', headers: {}, body: '' });
  assert.strictEqual(res.statusCode, 200);
});

test('returns 401 when no auth token', async function() {
  var res = await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ student_code: 'S016', dese_code: 'R.1.A.9-12.a' }),
  });
  assert.strictEqual(res.statusCode, 401);
});

test('returns 503 when OPENAI_API_KEY is not configured', async function() {
  delete process.env.OPENAI_API_KEY;
  var res = await handler(authedEvent({ student_code: 'S016', dese_code: 'R.1.A.9-12.a' }));
  assert.strictEqual(res.statusCode, 503);
  var body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  process.env.OPENAI_API_KEY = OPENAI_API_KEY;
});

test('returns 400 when student_code is missing', async function() {
  var res = await handler(authedEvent({ dese_code: 'R.1.A.9-12.a' }));
  assert.strictEqual(res.statusCode, 400);
  var body = JSON.parse(res.body);
  assert.ok(body.error.includes('student_code'));
});

test('returns 400 when dese_code is missing', async function() {
  var res = await handler(authedEvent({ student_code: 'S016' }));
  assert.strictEqual(res.statusCode, 400);
  var body = JSON.parse(res.body);
  assert.ok(body.error.includes('dese_code'));
});

test('returns AI-drafted IEP goal with all required fields', async function() {
  global.fetch = mockOpenAI({
    goal_area: 'Reading Comprehension',
    goal_code: 'RC1A-1',
    description: 'Given grade-level text, the student will demonstrate textual evidence by achieving 70% accuracy by the end of the IEP period.',
    measurement_type: 'Accuracy',
    baseline: 45,
    mastery: 70,
    target: 75,
  });

  var res = await handler(authedEvent({
    student_code: 'S016',
    dese_code: 'R.1.A.9-12.a',
    dese_area: 'Textual Evidence',
    percent_correct: 45.5,
    item_count: 11,
    evidence_items: [
      { question_text: 'What evidence supports the claim?', assignment_title: 'Week 12 ELA', date: 'Apr 1, 2026', earned_points: 0, max_points: 1, is_correct: false },
    ],
  }));

  assert.strictEqual(res.statusCode, 200);
  var body = JSON.parse(res.body);
  assert.ok(body.ok, 'ok should be true');
  assert.ok(body.goal, 'goal should be present');
  assert.strictEqual(body.goal.goal_area, 'Reading Comprehension');
  assert.strictEqual(body.goal.goal_code, 'RC1A-1');
  assert.ok(body.goal.description.length > 10);
  assert.strictEqual(body.goal.measurement_type, 'Accuracy');
  assert.strictEqual(body.goal.baseline, 45);
  assert.strictEqual(body.goal.mastery, 70);
  assert.strictEqual(body.goal.target, 75);
});

test('falls back to mapped goal area when AI returns invalid area', async function() {
  global.fetch = mockOpenAI({
    goal_area: 'INVALID AREA',
    goal_code: 'RC-TEST',
    description: 'A test goal.',
    measurement_type: 'Accuracy',
    baseline: 0,
    mastery: 70,
    target: 70,
  });

  var res = await handler(authedEvent({
    student_code: 'S016',
    dese_code: 'R.3.C.9-12.a',
    percent_correct: 0,
    item_count: 3,
  }));

  assert.strictEqual(res.statusCode, 200);
  var body = JSON.parse(res.body);
  assert.strictEqual(body.goal.goal_area, 'Reading Comprehension');
});

test('maps W. DESE code to Written Expression when AI area is invalid', async function() {
  global.fetch = mockOpenAI({
    goal_area: 'NOT REAL',
    goal_code: 'WE3A-1',
    description: 'Goal description.',
    measurement_type: 'Accuracy',
    baseline: 35,
    mastery: 70,
    target: 70,
  });

  var res = await handler(authedEvent({
    student_code: 'S016',
    dese_code: 'W.3.A.',
    percent_correct: 35,
    item_count: 12,
  }));

  assert.strictEqual(res.statusCode, 200);
  var body = JSON.parse(res.body);
  assert.strictEqual(body.goal.goal_area, 'Written Expression');
});

test('clamps out-of-range baseline/mastery/target values', async function() {
  global.fetch = mockOpenAI({
    goal_area: 'Reading Comprehension',
    goal_code: 'RC-1',
    description: 'Test goal.',
    measurement_type: 'Accuracy',
    baseline: -10,
    mastery: 150,
    target: 999,
  });

  var res = await handler(authedEvent({
    student_code: 'S016',
    dese_code: 'R.1.A.9-12.a',
    percent_correct: 0,
    item_count: 5,
  }));

  assert.strictEqual(res.statusCode, 200);
  var body = JSON.parse(res.body);
  assert.strictEqual(body.goal.baseline, 0);
  assert.strictEqual(body.goal.mastery, 100);
  assert.strictEqual(body.goal.target, 100);
});

test('returns 502 when OpenAI returns error status', async function() {
  global.fetch = function(_url, _opts) {
    return Promise.resolve({
      ok: false,
      status: 500,
      text: function() { return Promise.resolve('Internal Server Error'); },
    });
  };

  var res = await handler(authedEvent({
    student_code: 'S016',
    dese_code: 'R.1.A.9-12.a',
    percent_correct: 45,
    item_count: 11,
  }));

  assert.strictEqual(res.statusCode, 502);
});

test('returns 504 when OpenAI request times out', async function() {
  global.fetch = function(_url, _opts) {
    var err = new Error('The operation was aborted');
    err.name = 'AbortError';
    return Promise.reject(err);
  };

  var res = await handler(authedEvent({
    student_code: 'S016',
    dese_code: 'R.1.A.9-12.a',
    percent_correct: 45,
    item_count: 11,
  }));

  assert.strictEqual(res.statusCode, 504);
});

test('truncates long description from AI to 600 chars', async function() {
  var longDesc = 'X'.repeat(1000);
  global.fetch = mockOpenAI({
    goal_area: 'Reading Comprehension',
    goal_code: 'RC-1',
    description: longDesc,
    measurement_type: 'Accuracy',
    baseline: 45,
    mastery: 70,
    target: 70,
  });

  var res = await handler(authedEvent({
    student_code: 'S016',
    dese_code: 'R.1.A.9-12.a',
    percent_correct: 45,
    item_count: 11,
  }));

  assert.strictEqual(res.statusCode, 200);
  var body = JSON.parse(res.body);
  assert.ok(body.goal.description.length <= 600);
});

// ── Run ───────────────────────────────────────────────────────────────────────

runAll();
