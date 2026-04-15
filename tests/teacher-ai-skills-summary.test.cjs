// Unit tests for netlify/functions/teacher-ai-skills-summary.js
// Tests teacher auth, input validation, OpenAI integration, source field, error handling
// Run with: node tests/teacher-ai-skills-summary.test.cjs

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

var handler = require('../netlify/functions/teacher-ai-skills-summary').handler;

// ── Test utilities ────────────────────────────────────────────────────────────

function mockEvent(body, method, cookieHeader) {
  return {
    httpMethod: method || 'POST',
    headers: { cookie: cookieHeader !== undefined ? cookieHeader : ('tc=' + validToken) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function authedEvent(body) {
  return mockEvent(body, 'POST', 'tc=' + validToken);
}

function makeOpenAiResponse(skillsJson) {
  return function(_url, _opts) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function() {
        return Promise.resolve({
          choices: [{ message: { content: JSON.stringify(skillsJson) } }],
        });
      },
    });
  };
}

var validBody = {
  student_code: 'S001',
  iep_goals: [
    { code: 'G001', area: 'Reading', current_avg: 75, trend: 'up', data_points: 5, target: 85, baseline: 50 },
  ],
  dese_standards: [
    { code: 'R.1.A.9-12.a', percent_correct: 42, item_count: 8 },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

async function runAll() {
  console.log('Running teacher-ai-skills-summary unit tests...\n');
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

// ── Auth & method tests ───────────────────────────────────────────────────────

test('returns 405 for GET request', async function() {
  var res = await handler(mockEvent(null, 'GET'));
  assert.strictEqual(res.statusCode, 405);
});

test('returns 200 for OPTIONS preflight', async function() {
  var res = await handler(mockEvent(null, 'OPTIONS'));
  assert.strictEqual(res.statusCode, 200);
});

test('returns 401 when no auth token', async function() {
  var res = await handler(mockEvent(validBody, 'POST', ''));
  assert.strictEqual(res.statusCode, 401);
});

test('returns 503 when OPENAI_API_KEY is not configured', async function() {
  delete process.env.OPENAI_API_KEY;
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 503);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 when body is invalid JSON', async function() {
  var res = await handler(mockEvent('not-json', 'POST', 'tc=' + validToken));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 when student_code is missing', async function() {
  var body = { iep_goals: validBody.iep_goals };
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
  var parsed = JSON.parse(res.body);
  assert.ok(parsed.error.includes('student_code'));
});

test('returns 400 when neither iep_goals nor dese_standards provided', async function() {
  var body = { student_code: 'S001' };
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 400);
});

// ── Source field tests ────────────────────────────────────────────────────────

test('success: skills include source field from AI response', async function() {
  var aiSkills = {
    skills: [
      { code: 'G001', summary: 'Good progress.', tier: 'on-track', source: 'iep' },
      { code: 'R.1.A.9-12.a', summary: 'Needs work.', tier: 'needs-support', source: 'dese' },
    ],
  };
  global.fetch = makeOpenAiResponse(aiSkills);
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.ok(Array.isArray(parsed.skills));
  var iepSkill = parsed.skills.find(function(s) { return s.code === 'G001'; });
  var deseSkill = parsed.skills.find(function(s) { return s.code === 'R.1.A.9-12.a'; });
  assert.ok(iepSkill, 'IEP skill G001 should be present');
  assert.strictEqual(iepSkill.source, 'iep', 'IEP skill should have source: iep');
  assert.ok(deseSkill, 'DESE skill R.1.A.9-12.a should be present');
  assert.strictEqual(deseSkill.source, 'dese', 'DESE skill should have source: dese');
});

test('sanitization: source defaults to "iep" when AI omits the field', async function() {
  var aiSkills = {
    skills: [
      { code: 'G001', summary: 'Progress noted.', tier: 'on-track' },
    ],
  };
  global.fetch = makeOpenAiResponse(aiSkills);
  var body = { student_code: 'S001', iep_goals: validBody.iep_goals };
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.skills[0].source, 'iep', 'Missing source should default to "iep"');
});

test('sanitization: source "dese" is preserved, invalid values default to "iep"', async function() {
  var aiSkills = {
    skills: [
      { code: 'R.1.A.9-12.a', summary: 'Low score.', tier: 'critical', source: 'dese' },
      { code: 'BAD001', summary: 'Unknown.', tier: 'on-track', source: 'unknown_value' },
    ],
  };
  global.fetch = makeOpenAiResponse(aiSkills);
  var body = { student_code: 'S001', dese_standards: [
    { code: 'R.1.A.9-12.a', percent_correct: 30, item_count: 5 },
    { code: 'BAD001', percent_correct: 70, item_count: 3 },
  ]};
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  var deseSkill = parsed.skills.find(function(s) { return s.code === 'R.1.A.9-12.a'; });
  var badSkill = parsed.skills.find(function(s) { return s.code === 'BAD001'; });
  assert.strictEqual(deseSkill.source, 'dese', 'Valid "dese" source should be preserved');
  assert.strictEqual(badSkill.source, 'iep', 'Invalid source should default to "iep"');
});

test('sanitization: invalid tier defaults to "needs-support"', async function() {
  var aiSkills = {
    skills: [
      { code: 'G001', summary: 'Some summary.', tier: 'unknown-tier', source: 'iep' },
    ],
  };
  global.fetch = makeOpenAiResponse(aiSkills);
  var body = { student_code: 'S001', iep_goals: validBody.iep_goals };
  var res = await handler(authedEvent(body));
  assert.strictEqual(res.statusCode, 200);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.skills[0].tier, 'needs-support', 'Invalid tier should default to needs-support');
});

test('returns 502 when OpenAI response is missing skills array', async function() {
  global.fetch = makeOpenAiResponse({ not_skills: [] });
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 502 when OpenAI returns error status', async function() {
  global.fetch = function(_url, _opts) {
    return Promise.resolve({
      ok: false,
      status: 500,
      text: function() { return Promise.resolve('Internal Server Error'); },
    });
  };
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 504 when OpenAI request times out', async function() {
  global.fetch = function(_url, _opts) {
    var err = new Error('The operation was aborted');
    err.name = 'AbortError';
    return Promise.reject(err);
  };
  var res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 504);
  var parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

runAll();
