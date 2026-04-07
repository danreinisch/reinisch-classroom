// Unit tests for netlify/functions/teacher-ai-suggest-feedback.js
// Tests teacher auth, input validation, OpenAI integration, error handling
// Run with: node tests/teacher-ai-suggest-feedback.test.cjs

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
const { handler } = require('../netlify/functions/teacher-ai-suggest-feedback');

// ── Test runner ───────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  console.log('Running teacher-ai-suggest-feedback unit tests...\n');
  let failed = 0;
  for (const { name, fn } of tests) {
    // Reset env vars and fetch mock before each test
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.OPENAI_API_KEY = OPENAI_API_KEY;
    global.fetch = null;
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${failed === 0 ? '✓ All teacher-ai-suggest-feedback tests passed!' : `✗ ${failed} test(s) failed`}`);
  process.exit(failed > 0 ? 1 : 0);
}

// ── Helper: build a valid event ───────────────────────────────────────────────

function makeEvent(body, token = validToken, method = 'POST') {
  return {
    httpMethod: method,
    headers: {
      'content-type': 'application/json',
      cookie: token ? `tc=${token}` : '',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

const validBody = {
  assignment_title: 'Earth Science Quiz',
  total_score: 8,
  total_possible: 10,
  total_percent: 80,
  item_summaries: [
    { label: 'WP1', type: 'constructed', earned: 3, max: 5, teacher_note: 'Good effort' },
    { label: 'Q1', type: 'auto', earned: 5, max: 5 },
  ],
  student_code: 'STU001',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test('returns 405 for non-POST methods', async () => {
  const res = await handler(makeEvent(validBody, validToken, 'GET'));
  assert.strictEqual(res.statusCode, 405);
});

test('returns 200 for OPTIONS preflight', async () => {
  const res = await handler({ httpMethod: 'OPTIONS', headers: {}, body: null });
  assert.strictEqual(res.statusCode, 200);
});

test('returns 401 when no auth token', async () => {
  const res = await handler(makeEvent(validBody, null));
  assert.strictEqual(res.statusCode, 401);
  const parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 401 for non-teacher role', async () => {
  const studentToken = makeTeacherToken(SESSION_SECRET, 'student');
  const res = await handler(makeEvent(validBody, studentToken));
  assert.strictEqual(res.statusCode, 401);
});

test('returns 503 when OPENAI_API_KEY not configured', async () => {
  delete process.env.OPENAI_API_KEY;
  const res = await handler(makeEvent(validBody));
  assert.strictEqual(res.statusCode, 503);
  const parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.error.includes('not configured'));
  process.env.OPENAI_API_KEY = OPENAI_API_KEY;
});

test('returns 400 for invalid JSON body', async () => {
  const res = await handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', cookie: `tc=${validToken}` },
    body: 'not-valid-json{{{',
  });
  assert.strictEqual(res.statusCode, 400);
});

test('returns 400 when both total_possible and item_summaries missing', async () => {
  const res = await handler(makeEvent({
    assignment_title: 'Test',
    student_code: 'STU001',
  }));
  assert.strictEqual(res.statusCode, 400);
  const parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 400 when item_summaries is empty array and total_possible missing', async () => {
  const res = await handler(makeEvent({
    assignment_title: 'Test',
    item_summaries: [],
    student_code: 'STU001',
  }));
  assert.strictEqual(res.statusCode, 400);
});

test('returns suggested_feedback on success', async () => {
  global.fetch = async (_url, _opts) => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            suggested_feedback: 'Great work overall! You demonstrated strong understanding of Earth Science. Focus on improving written responses for full credit next time.',
            rationale: 'Student scored 80% — emphasize strengths and one area for improvement.',
          }),
        },
      }],
    }),
  });

  const res = await handler(makeEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  const parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.ok(typeof parsed.suggested_feedback === 'string');
  assert.ok(parsed.suggested_feedback.length > 0);
  assert.ok(typeof parsed.rationale === 'string');
});

test('returns 502 when OpenAI API returns error status', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error',
  });

  const res = await handler(makeEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  const parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, false);
});

test('returns 502 when OpenAI returns empty content', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: null } }] }),
  });

  const res = await handler(makeEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
});

test('returns 502 when OpenAI returns empty suggested_feedback', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggested_feedback: '', rationale: 'test' }) } }],
    }),
  });

  const res = await handler(makeEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
});

test('returns 502 when fetch throws (timeout)', async () => {
  global.fetch = async () => {
    const err = new Error('Timeout');
    err.name = 'AbortError';
    throw err;
  };

  const res = await handler(makeEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
});

test('includes goal context in prompt when provided', async () => {
  let capturedBody;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ suggested_feedback: 'Excellent progress toward your IEP goals!', rationale: 'Goal-focused.' }) } }],
      }),
    };
  };

  const bodyWithGoals = {
    ...validBody,
    goal_codes: ['G1', 'G2'],
    goal_descriptions: ['Reading Comprehension — Identify main idea', 'Writing — Complete sentences'],
  };

  const res = await handler(makeEvent(bodyWithGoals));
  assert.strictEqual(res.statusCode, 200);
  assert.ok(capturedBody, 'fetch was called');
  const systemPrompt = capturedBody.messages[0].content;
  assert.ok(systemPrompt.includes('G1'), 'prompt should include goal code G1');
  assert.ok(systemPrompt.includes('G2'), 'prompt should include goal code G2');
  assert.ok(systemPrompt.includes('Reading Comprehension'), 'prompt should include goal description');
});

test('works with only total_possible (no item_summaries)', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggested_feedback: 'Good job on this assignment!', rationale: 'Simple positive feedback.' }) } }],
    }),
  });

  const res = await handler(makeEvent({
    assignment_title: 'Math Test',
    total_score: 9,
    total_possible: 10,
    total_percent: 90,
    student_code: 'STU002',
  }));
  assert.strictEqual(res.statusCode, 200);
  const parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.ok, true);
  assert.ok(parsed.suggested_feedback.length > 0);
});

test('rationale defaults to empty string when AI omits it', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggested_feedback: 'Keep up the great work!' }) } }],
    }),
  });

  const res = await handler(makeEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  const parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.rationale, '');
});

runAll();
