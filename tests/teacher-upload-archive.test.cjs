// Unit tests for netlify/functions/teacher-upload-archive.js
// Tests server-side validation without requiring live Supabase or Storage
// Run with: node tests/teacher-upload-archive.test.cjs

'use strict';

const assert = require('assert');
const crypto = require('crypto');

// ── Helpers ──────────────────────────────────────────────────────────────────

// Minimal HS256 JWT signer (mirrors auth.js sign())
function makeTeacherToken(secret) {
  const b64url = (buf) =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jsonb64 = (obj) => b64url(JSON.stringify(obj));
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { role: 'teacher', iat: now, exp: now + 3600 };
  const data = `${jsonb64(header)}.${jsonb64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

const SESSION_SECRET = 'test-session-secret-32-chars-long!!';
const validToken = makeTeacherToken(SESSION_SECRET);

// Fake base64 PNG (1×1 pixel, minimal valid PNG)
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ── Mock setup ────────────────────────────────────────────────────────────────

const mockSupabaseConfig = { url: 'https://test.supabase.co', key: 'test-service-key' };

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
  safeJsonParse: (str) => {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

const mockAuthLib = {
  requireTeacher: (event, _secret) => {
    const cookie = event.headers?.cookie || '';
    if (cookie.includes('tc=')) return { ok: true, user: { role: 'teacher' } };
    return { ok: false };
  },
};

const mockSupaLib = { getSupabaseConfig: () => mockSupabaseConfig };

// Inject mocks into require cache
require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/supa')] = { exports: mockSupaLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: mockAuthLib };

// Configurable global fetch mock
let fetchResponses = [];
global.fetch = async (url, _opts) => {
  const next = fetchResponses.shift();
  if (!next) throw new Error(`Unexpected fetch call to ${url}`);
  return next(url);
};

// Now load the handler
const { handler } = require('../netlify/functions/teacher-upload-archive');

// ── Sequential test runner ────────────────────────────────────────────────────

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  console.log('Running teacher-upload-archive unit tests...\n');
  let failed = 0;
  for (const { name, fn } of tests) {
    fetchResponses = []; // reset between tests
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
  console.log('\n✓ All teacher-upload-archive tests passed!');
}

function makeJsonFetch(status, data) {
  return async (_url) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  });
}

function makeEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: { cookie: `tc=${validToken}` },
    isBase64Encoded: false,
    body: JSON.stringify({
      title: 'Test Paper',
      student_code: 'S001',
      class_name: 'Language Arts 1 SC',
      assignment_type: 'Paper Assignment',
      file_data: TINY_PNG_BASE64,
      file_name: 'test.png',
      file_type: 'image/png',
    }),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('handles CORS preflight (OPTIONS)', async () => {
  const res = await handler({ httpMethod: 'OPTIONS', headers: {} });
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers['Access-Control-Allow-Methods'].includes('POST'));
});

test('rejects non-POST requests with 405', async () => {
  const res = await handler({ httpMethod: 'GET', headers: {} });
  assert.strictEqual(res.statusCode, 405);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.error, 'Method not allowed');
});

test('rejects missing auth cookie with 401', async () => {
  const res = await handler({ httpMethod: 'POST', headers: {}, body: '{}', isBase64Encoded: false });
  assert.strictEqual(res.statusCode, 401);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.error, 'Unauthorized');
});

test('returns 400 for invalid JSON body', async () => {
  const res = await handler(makeEvent({ body: 'not-json' }));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.error, 'Invalid JSON');
});

test('returns 400 when title is missing', async () => {
  const res = await handler(makeEvent({
    body: JSON.stringify({ student_code: 'S001', file_data: TINY_PNG_BASE64, file_name: 'f.png', file_type: 'image/png' }),
  }));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.ok(body.error.includes('title'));
});

test('returns 400 when student_code is missing', async () => {
  const res = await handler(makeEvent({
    body: JSON.stringify({ title: 'T', file_data: TINY_PNG_BASE64, file_name: 'f.png', file_type: 'image/png' }),
  }));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.ok(body.error.includes('student_code'));
});

test('returns 400 when file_data is missing', async () => {
  const res = await handler(makeEvent({
    body: JSON.stringify({ title: 'T', student_code: 'S001', file_name: 'f.png', file_type: 'image/png' }),
  }));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.ok(body.error.includes('file_data'));
});

test('returns 400 when file_name is missing', async () => {
  const res = await handler(makeEvent({
    body: JSON.stringify({ title: 'T', student_code: 'S001', file_data: TINY_PNG_BASE64, file_type: 'image/png' }),
  }));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.ok(body.error.includes('file_name'));
});

test('returns 400 when file_type is missing', async () => {
  const res = await handler(makeEvent({
    body: JSON.stringify({ title: 'T', student_code: 'S001', file_data: TINY_PNG_BASE64, file_name: 'f.png' }),
  }));
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.ok(body.error.includes('file_type'));
});

test('returns 404 when student is not found', async () => {
  fetchResponses = [makeJsonFetch(200, [])];
  const res = await handler(makeEvent());
  assert.strictEqual(res.statusCode, 404);
  const body = JSON.parse(res.body);
  assert.ok(body.error.includes('Student not found'));
});

test('returns 500 when assignment insert fails', async () => {
  fetchResponses = [
    makeJsonFetch(200, [{ id: 'stu-1', code: 'S001' }]),
    makeJsonFetch(500, { message: 'DB error' }),
  ];
  const res = await handler(makeEvent());
  assert.strictEqual(res.statusCode, 500);
  const body = JSON.parse(res.body);
  assert.ok(body.error.includes('Failed to create assignment'));
});

test('returns 500 when storage upload fails', async () => {
  fetchResponses = [
    makeJsonFetch(200, [{ id: 'stu-1', code: 'S001' }]),
    makeJsonFetch(200, [{ id: 'asg-1', title: 'Test Paper' }]),
    // storage POST (raw fetch — must return object with ok, status, text)
    async (_url) => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: 'bucket not found' }) }),
  ];
  const res = await handler(makeEvent());
  assert.strictEqual(res.statusCode, 500);
  const body = JSON.parse(res.body);
  assert.ok(body.error.includes('Failed to upload file'));
});

test('returns ok:true with assignment and instance on success (no score)', async () => {
  const assignmentId = 'asg-uuid-1';
  const publicUrl = `https://test.supabase.co/storage/v1/object/public/assignment-archives/archives/${assignmentId}/test.png`;
  fetchResponses = [
    makeJsonFetch(200, [{ id: 'stu-1', code: 'S001' }]),
    makeJsonFetch(200, [{ id: assignmentId, title: 'Test Paper' }]),
    async (_url) => ({ ok: true, status: 200, text: async () => JSON.stringify({ Key: `archives/${assignmentId}/test.png` }) }),
    makeJsonFetch(200, [{ id: assignmentId, title: 'Test Paper', page: publicUrl }]),
    makeJsonFetch(200, [{ id: 'inst-1', assignment_id: assignmentId, student_id: 'stu-1', status: 'Submitted' }]),
  ];

  const res = await handler(makeEvent());
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.ok(body.assignment);
  assert.ok(body.instance);
  assert.strictEqual(body.submission, null);
});

test('creates submission row when score is provided', async () => {
  const assignmentId = 'asg-uuid-2';
  const publicUrl = `https://test.supabase.co/storage/v1/object/public/assignment-archives/archives/${assignmentId}/quiz.png`;
  fetchResponses = [
    makeJsonFetch(200, [{ id: 'stu-1', code: 'S001' }]),
    makeJsonFetch(200, [{ id: assignmentId, title: 'Scored Paper' }]),
    async (_url) => ({ ok: true, status: 200, text: async () => JSON.stringify({ Key: 'ok' }) }),
    makeJsonFetch(200, [{ id: assignmentId, title: 'Scored Paper', page: publicUrl }]),
    makeJsonFetch(200, [{ id: 'inst-2', assignment_id: assignmentId, student_id: 'stu-1', status: 'Submitted' }]),
    makeJsonFetch(200, [{ id: 'sub-1', score_manual: 18, score_total: 90 }]),
  ];

  const event = makeEvent({
    body: JSON.stringify({
      title: 'Scored Paper',
      student_code: 'S001',
      class_name: 'Language Arts 1 SC',
      assignment_type: 'Test/Quiz',
      file_data: TINY_PNG_BASE64,
      file_name: 'quiz.png',
      file_type: 'image/png',
      score: 18,
      score_total: 20,
      notes: 'Good work',
    }),
  });

  const res = await handler(event);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.ok(body.submission);
  assert.strictEqual(body.submission.score_manual, 18);
});

// Run all tests sequentially
runAll();
