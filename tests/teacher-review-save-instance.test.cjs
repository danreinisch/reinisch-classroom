// Unit tests for teacher-review-save.js instance status update logic
// Verifies that assignment_instances.status is always updated when a submission
// is graded or reviewed, even when instanceId is not provided by the caller.
// Run with: node tests/teacher-review-save-instance.test.cjs

'use strict';

const assert = require('assert');
const crypto = require('crypto');

// ── Env setup ────────────────────────────────────────────────────────────────

const SESSION_SECRET = 'test-session-secret-32-chars-long!!';
process.env.SESSION_SECRET = SESSION_SECRET;

// ── Minimal JWT helpers ──────────────────────────────────────────────────────

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

const validToken = makeTeacherToken(SESSION_SECRET);

// ── Mock setup ────────────────────────────────────────────────────────────────

const mockHttpLib = {
  generateRequestId: () => 'test-req-id',
  jsonResponse: (_event, status, body) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  handleCorsPreFlight: () => ({ statusCode: 200, headers: {}, body: '' }),
  validateBodySize: () => ({ valid: true }),
  safeJsonParse: (str) => {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

const mockAuthLib = {
  requireTeacher: (event) => {
    const cookie = event.headers && event.headers.cookie || '';
    if (cookie.includes('tc=')) return { ok: true };
    return { ok: false };
  },
};

const mockSupaLib = {
  getSupabaseConfig: () => ({ url: 'https://test.supabase.co', key: 'test-service-key' }),
};

// Inject mocks into require cache before loading handler
require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/supa')] = { exports: mockSupaLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: mockAuthLib };

// Configurable fetch mock
let fetchResponses = [];
let fetchCalls = [];
global.fetch = async (url, opts) => {
  opts = opts || {};
  const body = opts.body ? JSON.parse(opts.body) : undefined;
  fetchCalls.push({ url, method: opts.method || 'GET', body });
  const next = fetchResponses.shift();
  if (!next) throw new Error(`Unexpected fetch call to ${url}`);
  return {
    ok: next.ok !== false,
    status: next.status || 200,
    text: async () => next.body || '{}',
    headers: { get: () => null },
  };
};

const { handler } = require('../netlify/functions/teacher-review-save');

// ── Test runner ──────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
  console.log('--- teacher-review-save: instance status update tests ---\n');
  let failed = 0;
  for (const { name, fn } of tests) {
    fetchResponses = [];
    fetchCalls = [];
    try {
      await fn();
      console.log('OK ' + name);
    } catch (e) {
      console.error('FAIL ' + name);
      console.error('  Error:', e.message);
      failed++;
    }
  }
  if (failed > 0) {
    console.error('\n' + failed + ' test(s) failed.');
    process.exit(1);
  }
  console.log('\nAll teacher-review-save instance status tests passed!');
}

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { cookie: 'tc=' + validToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function ok(body) { return { ok: true, status: 200, body: body || '{}' }; }

// ── Tests ────────────────────────────────────────────────────────────────────

// Test 1: save_grade with instanceId → updates instance directly (no extra lookup)
test('save_grade with instanceId: updates instance directly (no extra DB lookup)', async () => {
  fetchResponses = [
    ok('[{"id":"sub-1","review_status":"reviewed"}]'),   // submissions PATCH
    ok('[{"id":"inst-1","status":"Graded"}]'),           // instances PATCH
  ];
  const result = await handler(makeEvent({
    action: 'save_grade', submissionId: 'sub-1',
    scoreAuto: 5, scoreManual: 0, scoreTotal: 100, status: 'Graded',
    instanceId: 'inst-1',
  }));
  assert.strictEqual(result.statusCode, 200, 'should return 200');
  assert.strictEqual(fetchCalls.length, 2, 'should make exactly 2 fetch calls (no DB lookup)');
  const instCall = fetchCalls[1];
  assert.ok(instCall.url.includes('assignment_instances'), 'second call should target assignment_instances');
  assert.ok(instCall.url.includes('inst-1'), 'should use the provided instanceId');
  assert.strictEqual(instCall.body && instCall.body.status, 'Graded', 'instance status should be Graded');
});

// Test 2: save_grade without instanceId → falls back to DB lookup then updates instance
test('save_grade without instanceId: falls back to DB lookup and still updates instance', async () => {
  fetchResponses = [
    ok('[{"id":"sub-2","review_status":"reviewed"}]'),   // submissions PATCH
    ok('[{"instance_id":"inst-2"}]'),                    // lookup: SELECT instance_id
    ok('[{"id":"inst-2","status":"Graded"}]'),           // instances PATCH
  ];
  const result = await handler(makeEvent({
    action: 'save_grade', submissionId: 'sub-2',
    scoreAuto: 5, scoreManual: 0, scoreTotal: 100, status: 'Graded',
    // no instanceId
  }));
  assert.strictEqual(result.statusCode, 200, 'should return 200 even without instanceId');
  assert.strictEqual(fetchCalls.length, 3, 'should make 3 fetch calls (includes DB lookup)');
  const lookupCall = fetchCalls[1];
  assert.ok(lookupCall.url.includes('submissions'), 'second call should be the submission lookup');
  assert.ok(lookupCall.url.includes('instance_id'), 'lookup should select instance_id');
  const instCall = fetchCalls[2];
  assert.ok(instCall.url.includes('assignment_instances'), 'third call should target assignment_instances');
  assert.ok(instCall.url.includes('inst-2'), 'should use the looked-up instanceId');
  assert.strictEqual(instCall.body && instCall.body.status, 'Graded', 'instance status should be Graded');
});

// Test 3: reopen with instanceId → updates instance directly (no extra lookup)
test('reopen with instanceId: updates instance directly (no extra DB lookup)', async () => {
  fetchResponses = [
    ok('[{"id":"sub-3","review_status":"pending"}]'),   // submissions PATCH
    ok(''),                                              // instances PATCH
  ];
  const result = await handler(makeEvent({
    action: 'reopen', submissionId: 'sub-3', instanceId: 'inst-3',
  }));
  assert.strictEqual(result.statusCode, 200, 'should return 200');
  assert.strictEqual(fetchCalls.length, 2, 'should make exactly 2 fetch calls');
  const instCall = fetchCalls[1];
  assert.ok(instCall.url.includes('assignment_instances'), 'second call should target assignment_instances');
  assert.ok(instCall.url.includes('inst-3'), 'should use the provided instanceId');
  assert.strictEqual(instCall.body && instCall.body.status, 'In Progress', 'instance status should be In Progress');
});

// Test 4: reopen without instanceId → falls back to DB lookup then updates instance
test('reopen without instanceId: falls back to DB lookup and still updates instance', async () => {
  fetchResponses = [
    ok('[{"id":"sub-4","review_status":"pending"}]'),   // submissions PATCH
    ok('[{"instance_id":"inst-4"}]'),                   // lookup: SELECT instance_id
    ok(''),                                              // instances PATCH
  ];
  const result = await handler(makeEvent({
    action: 'reopen', submissionId: 'sub-4',
    // no instanceId
  }));
  assert.strictEqual(result.statusCode, 200, 'should return 200 even without instanceId');
  assert.strictEqual(fetchCalls.length, 3, 'should make 3 fetch calls (includes DB lookup)');
  const instCall = fetchCalls[2];
  assert.ok(instCall.url.includes('assignment_instances'), 'third call should target assignment_instances');
  assert.ok(instCall.url.includes('inst-4'), 'should use the looked-up instanceId');
  assert.strictEqual(instCall.body && instCall.body.status, 'In Progress', 'instance status should be In Progress');
});

runAll();
