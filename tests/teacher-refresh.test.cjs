// Unit tests for netlify/functions/teacher-refresh.js
// Tests: valid session → 200, missing cookie → 401, expired JWT → 401, non-POST → 405
// Run with: node tests/teacher-refresh.test.cjs

'use strict';

const assert = require('assert');
const crypto = require('crypto');

// ── JWT helpers ───────────────────────────────────────────────────────────────

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jsonb64 = (obj) => b64url(JSON.stringify(obj));

function makeTeacherToken(secret, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = {
    role: 'teacher',
    username: 'teacher_test',
    teacherId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  const data = `${jsonb64(header)}.${jsonb64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

function makeExpiredToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  return makeTeacherToken(secret, { iat: now - 7200, exp: now - 3600 });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_SECRET = 'test-session-secret-32-chars-long!!';

process.env.SESSION_SECRET = SESSION_SECRET;
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const validToken = makeTeacherToken(SESSION_SECRET);
const expiredToken = makeExpiredToken(SESSION_SECRET);

// ── Mock infrastructure ───────────────────────────────────────────────────────

const mockHttpLib = {
  generateRequestId: () => 'test-req-id',
  jsonResponse: (_event, status, body, _headers = {}, _requestId = '') => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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
  validateBodySize: (_body, _limit) => ({ valid: true }),
  getSecurityHeaders: (_requestId) => ({ 'Cache-Control': 'no-store' }),
  getCorsHeaders: (_event, _methods, _headers) => ({}),
};

// Real auth lib (uses actual JWT sign/verify so token contents are correct)
const realAuthLib = require('../netlify/functions/_lib/auth');

// Inject mocks before requiring the module under test
require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
// Do NOT mock auth — use real sign/verify so the refresh endpoint truly re-signs

const { handler } = require('../netlify/functions/teacher-refresh');

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeEvent({ method = 'POST', cookie = '' } = {}) {
  return {
    httpMethod: method,
    headers: {
      'content-type': 'application/json',
      host: 'test.netlify.app',
      cookie,
    },
    body: '',
  };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  let passed = 0;
  let failed = 0;

  console.log('\nteacher-refresh\n');

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ ${name}`);
      console.error('    ', err.message);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

// ── Case A: valid tc cookie → 200 with ok:true, exp, Set-Cookie ──────────────

test('Case A: valid tc cookie → 200, ok:true, exp ≥ now + 7.5h, Set-Cookie with tc', async () => {
  const event = makeEvent({ cookie: `tc=${validToken}` });
  const res = await handler(event);

  assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);

  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true, 'body.ok should be true');
  assert.strictEqual(typeof body.exp, 'number', 'body.exp should be a number');

  const minExp = Math.floor(Date.now() / 1000) + 7.5 * 60 * 60;
  assert.ok(body.exp >= minExp, `exp ${body.exp} should be >= now + 7.5h (${minExp})`);

  // Set-Cookie header should contain tc= with HttpOnly, Secure, Path=/, Max-Age=28800
  const setCookie = res.headers['Set-Cookie'];
  assert.ok(setCookie, 'Set-Cookie header should be present');
  assert.ok(setCookie.startsWith('tc='), 'Set-Cookie should start with tc=');
  assert.ok(setCookie.includes('HttpOnly'), 'Set-Cookie should contain HttpOnly');
  assert.ok(setCookie.includes('Secure'), 'Set-Cookie should contain Secure');
  assert.ok(setCookie.includes('Path=/'), 'Set-Cookie should contain Path=/');
  assert.ok(setCookie.includes('Max-Age=28800'), 'Set-Cookie should contain Max-Age=28800');
});

test('Case A: refreshed JWT preserves role, username, teacherId', async () => {
  const event = makeEvent({ cookie: `tc=${validToken}` });
  const res = await handler(event);

  assert.strictEqual(res.statusCode, 200);

  // Extract the new token from the Set-Cookie header and decode its payload
  const setCookie = res.headers['Set-Cookie'];
  const tokenMatch = setCookie.match(/^tc=([^;]+)/);
  assert.ok(tokenMatch, 'Should find tc= value in Set-Cookie');
  const newToken = tokenMatch[1];
  const [, payloadB64] = newToken.split('.');
  const payload = JSON.parse(
    Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  );
  assert.strictEqual(payload.role, 'teacher', 'role should be preserved');
  assert.strictEqual(payload.username, 'teacher_test', 'username should be preserved');
  assert.strictEqual(payload.teacherId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'teacherId should be preserved');
});

// ── Case B: missing cookie → 401, no Set-Cookie ───────────────────────────────

test('Case B: missing cookie → 401 with error:Session expired, no Set-Cookie', async () => {
  const event = makeEvent({ cookie: '' });
  const res = await handler(event);

  assert.strictEqual(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);

  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false, 'body.ok should be false');
  assert.strictEqual(body.error, 'Session expired', `Expected error 'Session expired', got '${body.error}'`);
  assert.ok(!res.headers['Set-Cookie'], 'Set-Cookie should not be present on 401');
});

// ── Case C: expired JWT → 401, no Set-Cookie ──────────────────────────────────

test('Case C: expired JWT → 401 with error:Session expired, no Set-Cookie', async () => {
  const event = makeEvent({ cookie: `tc=${expiredToken}` });
  const res = await handler(event);

  assert.strictEqual(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);

  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false, 'body.ok should be false');
  assert.strictEqual(body.error, 'Session expired', `Expected error 'Session expired', got '${body.error}'`);
  assert.ok(!res.headers['Set-Cookie'], 'Set-Cookie should not be present on 401');
});

// ── Case D: non-POST → 405 ────────────────────────────────────────────────────

test('Case D: GET request → 405 Method Not Allowed', async () => {
  const event = makeEvent({ method: 'GET', cookie: `tc=${validToken}` });
  const res = await handler(event);

  assert.strictEqual(res.statusCode, 405, `Expected 405, got ${res.statusCode}`);
});

test('Case D: OPTIONS preflight → 200 (CORS preflight handled)', async () => {
  const event = makeEvent({ method: 'OPTIONS', cookie: '' });
  const res = await handler(event);

  assert.strictEqual(res.statusCode, 200, `Expected 200 for preflight, got ${res.statusCode}`);
});

run();
