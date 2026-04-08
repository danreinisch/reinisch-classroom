// Unit tests for netlify/functions/teacher-ai-suggest.js
// Tests teacher auth, input validation, OpenAI integration, error handling
// Run with: node tests/teacher-ai-suggest.test.cjs

'use strict';

const assert = require('assert');
const crypto = require('crypto');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Minimal HS256 JWT signer (mirrors auth.js sign())
function makeTeacherToken(secret, role = 'teacher') {
  const b64url = (buf) =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jsonb64 = (obj) => b64url(JSON.stringify(obj));
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { role, username: 'testteacher', iat: now, exp: now + 3600 };
  const data = `${jsonb64(header)}.${jsonb64(payload)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

const SESSION_SECRET = 'test-session-secret-32-chars-long!!';
const OPENAI_API_KEY = 'sk-test-fake-key';
const validToken = makeTeacherToken(SESSION_SECRET);

// ── Mock setup ────────────────────────────────────────────────────────────────

const mockHttpLib = {
  generateRequestId: () => 'test-req-id',
  jsonResponse: (_event, status, body) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  handleCorsPreFlight: (_event, methods, headers) => ({
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': (headers || []).join(', '),
    },
    body: '',
  }),
  validateBodySize: (_body, _maxKb) => ({ valid: true }),
  safeJsonParse: (str) => {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

// Real auth lib (uses actual JWT verification)
const realAuth = require('../netlify/functions/_lib/auth');

// Inject mocks into require cache before loading the handler
require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: realAuth };

// Set env vars before loading the module
process.env.SESSION_SECRET = SESSION_SECRET;
process.env.OPENAI_API_KEY = OPENAI_API_KEY;

// Now load the handler
const { handler } = require('../netlify/functions/teacher-ai-suggest');

// ── Test runner ───────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  console.log('Running teacher-ai-suggest unit tests...\n');
  let failed = 0;
  for (const { name, fn } of tests) {
    // Reset env vars and fetch mock before each test
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.OPENAI_API_KEY = OPENAI_API_KEY;
    global.fetch = null;
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      console.error(`✗ ${name}`);
      console.error('  Error:', e.message);
      if (e.stack) console.error('  Stack:', e.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  }
  console.log('\n✓ All teacher-ai-suggest tests passed!');
}

// ── Helper functions ──────────────────────────────────────────────────────────

function mockEvent(body, method = 'POST', cookie = '') {
  return {
    httpMethod: method,
    headers: {
      'content-type': 'application/json',
      cookie: cookie,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function authedEvent(body, method = 'POST') {
  return mockEvent(body, method, `tc=${validToken}`);
}

const validBody = {
  student_response: 'The slope of the line is 2, meaning it rises 2 units for every 1 unit it runs.',
  rubric_tiers: [
    { points: 5, label: 'Exemplary', desc: 'Thorough, evidence-based' },
    { points: 4, label: 'Proficient', desc: 'Clear, mostly complete' },
    { points: 3, label: 'Developing', desc: 'Partial understanding' },
    { points: 0, label: 'No Credit', desc: 'Not attempted or off-topic' },
  ],
  max_points: 5,
  item_label: 'Question 3: Explain slope',
};

function makeOpenAiResponse(content, status = 200) {
  return async (_url, _opts) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    text: async () => JSON.stringify({ error: 'OpenAI error' }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('returns 401 when no auth cookie', async () => {
  const res = await handler(mockEvent(validBody, 'POST', ''));
  assert.strictEqual(res.statusCode, 401);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('returns 405 for GET requests', async () => {
  const res = await handler(authedEvent(null, 'GET'));
  assert.strictEqual(res.statusCode, 405);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('returns 400 for missing student_response', async () => {
  const { student_response: _, ...bodyWithoutStudentResponse } = validBody;
  const res = await handler(authedEvent(bodyWithoutStudentResponse));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('student_response'));
});

test('returns 400 for missing max_points', async () => {
  const { max_points: _, ...bodyWithoutMaxPoints } = validBody;
  const res = await handler(authedEvent(bodyWithoutMaxPoints));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('max_points'));
});

test('returns 400 for missing rubric_tiers', async () => {
  const { rubric_tiers: _, ...bodyWithoutRubricTiers } = validBody;
  const res = await handler(authedEvent(bodyWithoutRubricTiers));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('rubric_tiers'));
});

test('returns 503 when OPENAI_API_KEY is not set', async () => {
  delete process.env.OPENAI_API_KEY;
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('not configured'));
  process.env.OPENAI_API_KEY = OPENAI_API_KEY;
});

test('returns 200 with valid suggestion', async () => {
  const suggestion = { suggested_score: 4, suggested_note: 'Good explanation of slope.', rationale: 'Correct definition provided.' };
  global.fetch = makeOpenAiResponse(suggestion);
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.suggested_score, 4);
  assert.strictEqual(body.suggested_note, 'Good explanation of slope.');
  assert.strictEqual(body.rationale, 'Correct definition provided.');
});

test('clamps suggested_score to max_points when OpenAI returns higher score', async () => {
  const suggestion = { suggested_score: 10, suggested_note: 'Excellent.', rationale: 'Score too high.' };
  global.fetch = makeOpenAiResponse(suggestion);
  const res = await handler(authedEvent(validBody)); // max_points = 5
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.suggested_score, 5); // clamped to max_points
});

test('clamps suggested_score to 0 when OpenAI returns negative score', async () => {
  const suggestion = { suggested_score: -3, suggested_note: 'Below zero.', rationale: 'Negative score.' };
  global.fetch = makeOpenAiResponse(suggestion);
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.suggested_score, 0); // clamped to 0
});

test('returns 502 on OpenAI API error (HTTP 500)', async () => {
  global.fetch = async (_url, _opts) => ({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error',
  });
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('score manually'));
});

test('returns 502 on OpenAI timeout (AbortError)', async () => {
  global.fetch = async (_url, _opts) => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('score manually'));
});

test('includes goal context in prompt when provided', async () => {
  let capturedBody = null;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ suggested_score: 3, suggested_note: 'OK', rationale: 'Met goal.' }) } }],
      }),
    };
  };

  const bodyWithGoals = {
    ...validBody,
    goal_codes: ['M.4.1'],
    goal_descriptions: ['Student will identify slope and intercept in linear equations'],
  };

  const res = await handler(authedEvent(bodyWithGoals));
  assert.strictEqual(res.statusCode, 200);
  assert.ok(capturedBody, 'fetch should have been called');
  const systemContent = capturedBody.messages[0].content;
  assert.ok(systemContent.includes('M.4.1'), 'prompt should include goal code');
  assert.ok(systemContent.includes('slope and intercept'), 'prompt should include goal description');
  assert.ok(systemContent.includes('IEP Goal'), 'prompt should mention IEP Goal');
});

test('handles missing optional fields gracefully (no goal_codes, no item_label)', async () => {
  const suggestion = { suggested_score: 3, suggested_note: 'Decent attempt.', rationale: 'Partial credit.' };
  global.fetch = makeOpenAiResponse(suggestion);

  const minimalBody = {
    student_response: 'The slope is the rise over run.',
    rubric_tiers: [
      { points: 5, label: 'Full Credit', desc: 'Complete answer' },
      { points: 0, label: 'No Credit', desc: 'Incomplete' },
    ],
    max_points: 5,
    // no item_label, no goal_codes, no goal_descriptions
  };

  const res = await handler(authedEvent(minimalBody));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.suggested_score, 3);
});

test('suggested_note contains multi-sentence feedback', async () => {
  const multiSentenceNote = 'You correctly identified the slope as 2. However, you did not mention the y-intercept in your explanation. Make sure to include how the line crosses the y-axis. Refer back to the standard form y = mx + b for guidance.';
  const suggestion = { suggested_score: 3, suggested_note: multiSentenceNote, rationale: 'Partial credit for slope only.' };
  global.fetch = makeOpenAiResponse(suggestion);
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.suggested_note, multiSentenceNote);
  const periodCount = (body.suggested_note.match(/\./g) || []).length;
  assert.ok(periodCount >= 2, `expected at least 2 sentence-ending periods, got ${periodCount}`);
});

test('suggested_note defaults to empty string when AI omits it', async () => {
  const suggestion = { suggested_score: 2, rationale: 'Partial credit.' };
  global.fetch = makeOpenAiResponse(suggestion);
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.suggested_note, '');
});

test('includes question_text in prompt when provided', async () => {
  let capturedBody = null;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ suggested_score: 4, suggested_note: 'Good.', rationale: 'Correct.' }) } }],
      }),
    };
  };

  const bodyWithQuestion = {
    ...validBody,
    question_text: 'What is the slope of a line and how do you calculate it?',
  };

  const res = await handler(authedEvent(bodyWithQuestion));
  assert.strictEqual(res.statusCode, 200);
  assert.ok(capturedBody, 'fetch should have been called');
  const systemContent = capturedBody.messages[0].content;
  assert.ok(systemContent.includes('What is the slope of a line'), 'prompt should include question_text');
  assert.ok(systemContent.includes('Question 3: Explain slope'), 'prompt should include item_label');
  assert.ok(systemContent.includes('(Question 3: Explain slope):'), 'prompt should use combined format');
});

test('question_text is optional — prompt still works without it', async () => {
  let capturedBody = null;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ suggested_score: 3, suggested_note: 'OK.', rationale: 'Partial.' }) } }],
      }),
    };
  };

  const res = await handler(authedEvent(validBody)); // no question_text
  assert.strictEqual(res.statusCode, 200);
  const systemContent = capturedBody.messages[0].content;
  assert.ok(systemContent.includes('Question: Question 3: Explain slope'), 'prompt should fall back to label-only format');
});

test('returns specific error when OpenAI returns valid HTTP 200 but invalid JSON content', async () => {
  global.fetch = async (_url, _opts) => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: 'This is not valid JSON at all!' } }],
    }),
  });

  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('invalid response'), `expected "invalid response" in error, got: "${body.error}"`);
});

// ── Run ───────────────────────────────────────────────────────────────────────

runAll();
