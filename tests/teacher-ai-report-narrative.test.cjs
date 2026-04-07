// Unit tests for netlify/functions/teacher-ai-report-narrative.js
// Tests: auth, CORS, input validation, Anthropic API integration, error handling
// Run with: node tests/teacher-ai-report-narrative.test.cjs

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
const ANTHROPIC_API_KEY = 'sk-ant-test-fake-key';
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
process.env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;

// Now load the handler
const { handler } = require('../netlify/functions/teacher-ai-report-narrative');

// ── Test runner ───────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  console.log('Running teacher-ai-report-narrative unit tests...\n');
  let failed = 0;
  for (const { name, fn } of tests) {
    // Reset env vars and fetch mock before each test
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
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
  console.log('\n✓ All teacher-ai-report-narrative tests passed!');
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

const validGoals = [
  {
    code: 'ELA.1.A',
    area: 'Reading Comprehension',
    description: 'Student will identify main idea and supporting details in grade-level text with 80% accuracy.',
    baseline: '30%',
    target: '80%',
    current_value: 65,
    trend: 'Improving',
    data_count: 8,
  },
  {
    code: 'M.3.B',
    area: 'Mathematics',
    description: 'Student will solve two-step word problems with 75% accuracy.',
    baseline: '20%',
    target: '75%',
    current_value: 50,
    trend: 'Maintaining',
    data_count: 5,
  },
];

const validBody = {
  student_code: 'STU001',
  student_name: 'Alex Johnson',
  goals: validGoals,
  quarter_label: 'Q3',
  scores: [
    { assignment_title: 'Reading Quiz', score: 70, date: '2026-02-15', type: 'html' },
    { assignment_title: 'Math Test', score: 55, date: '2026-02-20', type: 'txt' },
  ],
  trend_data: { overall_trend: 'Improving', improvement_pct: 15 },
};

function makeAnthropicResponse(narratives, status = 200) {
  const content = JSON.stringify(narratives);
  return async (_url, _opts) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      content: [{ type: 'text', text: content }],
    }),
    text: async () => JSON.stringify({ error: 'Anthropic error' }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('returns 200 for CORS preflight OPTIONS', async () => {
  const res = await handler(mockEvent(null, 'OPTIONS', ''));
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers['Access-Control-Allow-Methods'].includes('POST'));
});

test('returns 405 for GET requests', async () => {
  const res = await handler(authedEvent(null, 'GET'));
  assert.strictEqual(res.statusCode, 405);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('returns 405 for PUT requests', async () => {
  const res = await handler(authedEvent(null, 'PUT'));
  assert.strictEqual(res.statusCode, 405);
});

test('returns 401 when no auth cookie', async () => {
  const res = await handler(mockEvent(validBody, 'POST', ''));
  assert.strictEqual(res.statusCode, 401);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('ANTHROPIC_API_KEY'));
  process.env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
});

test('returns 400 when student_code is missing', async () => {
  const { student_code: _, ...bodyWithout } = validBody;
  const res = await handler(authedEvent(bodyWithout));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('student_code'));
});

test('returns 400 when goals is missing', async () => {
  const { goals: _, ...bodyWithout } = validBody;
  const res = await handler(authedEvent(bodyWithout));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('goals'));
});

test('returns 400 when goals is empty array', async () => {
  const res = await handler(authedEvent({ ...validBody, goals: [] }));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('goals'));
});

test('returns 400 when goals is not an array', async () => {
  const res = await handler(authedEvent({ ...validBody, goals: 'not an array' }));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('returns 200 with valid narratives on success', async () => {
  const mockNarratives = [
    { goal_code: 'ELA.1.A', narrative_text: 'During Q3, the student demonstrated consistent growth in reading comprehension (ELA.1.A), improving from 30% to 65% accuracy across 8 data collection opportunities. This goal is Progressing.' },
    { goal_code: 'M.3.B', narrative_text: 'During Q3, the student maintained performance on mathematics problem solving (M.3.B) with an average of 50% across 5 data collection opportunities. This goal is Progressing but Not Yet Meeting target.' },
  ];
  global.fetch = makeAnthropicResponse(mockNarratives);

  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.ok(Array.isArray(body.narratives));
  assert.strictEqual(body.narratives.length, 2);
  assert.strictEqual(body.narratives[0].goal_code, 'ELA.1.A');
  assert.ok(body.narratives[0].narrative_text.length > 0);
});

test('calls Anthropic API with correct structure', async () => {
  let capturedBody = null;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify([{ goal_code: 'ELA.1.A', narrative_text: 'Test narrative.' }]) }],
      }),
    };
  };

  await handler(authedEvent(validBody));

  assert.ok(capturedBody, 'fetch should have been called');
  assert.strictEqual(capturedBody.model, 'claude-sonnet-4-20250514');
  assert.ok(capturedBody.system, 'system prompt should be set');
  assert.ok(capturedBody.system.includes('IEP'), 'system prompt should mention IEP');
  assert.strictEqual(capturedBody.messages.length, 1);
  assert.strictEqual(capturedBody.messages[0].role, 'user');
  assert.ok(capturedBody.messages[0].content.includes('STU001'), 'user message should include student code');
  assert.ok(capturedBody.messages[0].content.includes('ELA.1.A'), 'user message should include goal code');
  assert.ok(capturedBody.messages[0].content.includes('Q3'), 'user message should include quarter label');
});

test('uses custom model when valid model is provided', async () => {
  let capturedModel = null;
  global.fetch = async (_url, opts) => {
    capturedModel = JSON.parse(opts.body).model;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify([{ goal_code: 'ELA.1.A', narrative_text: 'Test.' }]) }],
      }),
    };
  };

  await handler(authedEvent({ ...validBody, model: 'claude-opus-4-20250514' }));
  assert.strictEqual(capturedModel, 'claude-opus-4-20250514');
});

test('falls back to default model when invalid model is provided', async () => {
  let capturedModel = null;
  global.fetch = async (_url, opts) => {
    capturedModel = JSON.parse(opts.body).model;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify([{ goal_code: 'ELA.1.A', narrative_text: 'Test.' }]) }],
      }),
    };
  };

  await handler(authedEvent({ ...validBody, model: 'gpt-4-turbo' }));
  assert.strictEqual(capturedModel, 'claude-sonnet-4-20250514');
});

test('returns 502 on Anthropic API error (HTTP 500)', async () => {
  global.fetch = async (_url, _opts) => ({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error',
  });
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('AI generation failed'));
});

test('returns 504 on Anthropic timeout (AbortError)', async () => {
  global.fetch = async (_url, _opts) => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 504);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('timed out'));
});

test('returns 502 when Anthropic returns empty content', async () => {
  global.fetch = async (_url, _opts) => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [] }),
  });
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('returns 502 when Anthropic returns unparseable JSON', async () => {
  global.fetch = async (_url, _opts) => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: 'This is not valid JSON for narrative output' }],
    }),
  });
  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes('unparseable'));
});

test('handles markdown-fenced JSON response from Anthropic', async () => {
  const mockNarratives = [{ goal_code: 'ELA.1.A', narrative_text: 'The student progressed well.' }];
  const fencedContent = '```json\n' + JSON.stringify(mockNarratives) + '\n```';
  global.fetch = async (_url, _opts) => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: fencedContent }],
    }),
  });

  const res = await handler(authedEvent({ ...validBody, goals: [validGoals[0]] }));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.narratives[0].narrative_text, 'The student progressed well.');
});

test('handles request with minimal required fields only', async () => {
  const mockNarratives = [{ goal_code: 'ELA.1.A', narrative_text: 'Minimal test.' }];
  global.fetch = makeAnthropicResponse(mockNarratives);

  const minimalBody = {
    student_code: 'STU002',
    goals: [validGoals[0]],
    // no scores, no trend_data, no quarter_label, no student_name
  };

  const res = await handler(authedEvent(minimalBody));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
});

test('sanitizes student_code — truncates and strips control chars', async () => {
  let capturedContent = null;
  global.fetch = async (_url, opts) => {
    capturedContent = JSON.parse(opts.body).messages[0].content;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify([{ goal_code: 'ELA.1.A', narrative_text: 'Test.' }]) }],
      }),
    };
  };

  // student_code with newline injection attempt
  const maliciousBody = { ...validBody, student_code: 'STU001\nINJECT' };
  await handler(authedEvent(maliciousBody));

  assert.ok(capturedContent, 'fetch should be called');
  assert.ok(!capturedContent.includes('\n' + 'INJECT'), 'newline injection should be stripped');
});

test('response narratives are validated and filtered', async () => {
  // Include an invalid entry (missing narrative_text) which should be filtered out
  const mockNarratives = [
    { goal_code: 'ELA.1.A', narrative_text: 'Valid narrative.' },
    { goal_code: 'M.3.B' }, // missing narrative_text
    null,                   // null entry
  ];
  global.fetch = makeAnthropicResponse(mockNarratives);

  const res = await handler(authedEvent(validBody));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.narratives.length, 1, 'invalid entries should be filtered out');
  assert.strictEqual(body.narratives[0].goal_code, 'ELA.1.A');
});

// ── Run ───────────────────────────────────────────────────────────────────────

runAll();
