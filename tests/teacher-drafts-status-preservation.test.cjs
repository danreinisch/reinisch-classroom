// Unit tests for teacher-drafts.js — auto_release_status preservation
// Verifies that an 'errored' status is preserved when the teacher saves a draft
// without changing the releaseAt timestamp, and is reset to 'pending' only when
// the releaseAt timestamp has actually changed.
// Run with: node tests/teacher-drafts-status-preservation.test.cjs

'use strict';

const assert = require('assert');
const crypto = require('crypto');

// ── JWT helper ────────────────────────────────────────────────────────────────

function makeTeacherToken(secret, payload = {}) {
  const b64url = (buf) =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jsonb64 = (obj) => b64url(JSON.stringify(obj));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { role: 'teacher', username: 'teacher_test', iat: now, exp: now + 3600, ...payload };
  const data = `${jsonb64(header)}.${jsonb64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

const SESSION_SECRET = 'test-session-secret-32-chars-long!!';
process.env.SESSION_SECRET = SESSION_SECRET;
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const validToken = makeTeacherToken(SESSION_SECRET);

// ── Mock infrastructure ───────────────────────────────────────────────────────

const mockHttpLib = {
  generateRequestId: () => 'drafts-test-id',
  jsonResponse: (_event, status, body, _headers = {}, _requestId = '') => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  handleCorsPreFlight: () => ({ statusCode: 204, body: '' }),
};

const mockAuthLib = {
  requireTeacher: (event) => {
    const cookie = event.headers?.cookie || '';
    const match = cookie.match(/tc=([^;]+)/);
    if (!match) return { ok: false };
    const [, payloadB64] = match[1].split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
    if (payload.role !== 'teacher') return { ok: false };
    return { ok: true, user: { role: 'teacher', username: payload.username || 'teacher_test' } };
  },
};

require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: mockAuthLib };
require.cache[require.resolve('../netlify/functions/_lib/supa')] = {
  exports: {
    getSupabaseConfig: () => ({ url: 'https://test.supabase.co', key: 'test-service-key' }),
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  },
};

// ── Fetch mock queue ──────────────────────────────────────────────────────────

let _fetchQueue = [];
global.fetch = async (url, opts) => {
  if (_fetchQueue.length === 0) throw new Error(`Unexpected fetch call to ${url} (method: ${opts?.method || 'GET'})`);
  const responder = _fetchQueue.shift();
  return responder(url, opts);
};

function okJson(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}
function noContent() {
  return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
}

// ── Load module ───────────────────────────────────────────────────────────────

const { handler } = require('../netlify/functions/teacher-drafts');

// ── Test runner ───────────────────────────────────────────────────────────────

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { cookie: `tc=${validToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const FIXED_RELEASE_AT = '2026-05-01T12:00:00.000Z';
const DRAFT_ID = 'draft-status-test-001';

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\nteacher-drafts — auto_release_status preservation\n');

  // ── Test 1: errored + same releaseAt → stays errored ─────────────────────
  await test('errored draft with same releaseAt stays errored', async () => {
    let upsertBody = null;

    _fetchQueue = [
      // 1. Fetch existing row: status='errored', same release_at
      (url) => {
        assert(url.includes(`id=eq.${DRAFT_ID}`), 'Should query by draft id');
        assert(url.includes('auto_release_status'), 'Should select auto_release_status');
        return okJson([{ auto_release_status: 'errored', release_at: FIXED_RELEASE_AT }]);
      },
      // 2. Upsert
      (_url, opts) => {
        upsertBody = JSON.parse(opts.body)[0];
        return okJson([upsertBody]);
      },
    ];

    const event = makeEvent({
      id: DRAFT_ID,
      title: 'Test Draft',
      autoRelease: true,
      releaseAt: FIXED_RELEASE_AT,  // same as existing
      notes: 'Updated notes only',
    });

    const resp = await handler(event);
    const body = JSON.parse(resp.body);

    assert.strictEqual(resp.statusCode, 200, 'Should return 200');
    assert.ok(body.ok, 'Response should be ok');
    assert.strictEqual(upsertBody.auto_release_status, 'errored', 'Status should remain errored');
  });

  // ── Test 2: errored + changed releaseAt → becomes pending ─────────────────
  await test('errored draft with changed releaseAt resets to pending', async () => {
    let upsertBody = null;
    const newReleaseAt = '2026-06-01T08:00:00.000Z';

    _fetchQueue = [
      // 1. Fetch existing row
      () => okJson([{ auto_release_status: 'errored', release_at: FIXED_RELEASE_AT }]),
      // 2. Upsert
      (_url, opts) => {
        upsertBody = JSON.parse(opts.body)[0];
        return okJson([upsertBody]);
      },
    ];

    const event = makeEvent({
      id: DRAFT_ID,
      title: 'Test Draft',
      autoRelease: true,
      releaseAt: newReleaseAt,  // different from existing
    });

    const resp = await handler(event);
    const body = JSON.parse(resp.body);

    assert.strictEqual(resp.statusCode, 200);
    assert.ok(body.ok);
    assert.strictEqual(upsertBody.auto_release_status, 'pending', 'Status should reset to pending after releaseAt change');
  });

  // ── Test 3: pending draft → stays pending regardless of releaseAt ─────────
  await test('pending draft stays pending (not errored, so no special handling)', async () => {
    let upsertBody = null;

    _fetchQueue = [
      () => okJson([{ auto_release_status: 'pending', release_at: FIXED_RELEASE_AT }]),
      (_url, opts) => {
        upsertBody = JSON.parse(opts.body)[0];
        return okJson([upsertBody]);
      },
    ];

    const event = makeEvent({
      id: DRAFT_ID,
      title: 'Test Draft',
      autoRelease: true,
      releaseAt: FIXED_RELEASE_AT,  // unchanged
    });

    const resp = await handler(event);
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(upsertBody.auto_release_status, 'pending');
  });

  // ── Test 4: issuedAt set → becomes issued regardless of errored state ─────
  await test('draft with issuedAt set → status becomes issued', async () => {
    let upsertBody = null;

    _fetchQueue = [
      () => okJson([{ auto_release_status: 'errored', release_at: FIXED_RELEASE_AT }]),
      (_url, opts) => {
        upsertBody = JSON.parse(opts.body)[0];
        return okJson([upsertBody]);
      },
    ];

    const event = makeEvent({
      id: DRAFT_ID,
      title: 'Test Draft',
      autoRelease: true,
      releaseAt: FIXED_RELEASE_AT,
      issuedAt: new Date().toISOString(),
    });

    const resp = await handler(event);
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(upsertBody.auto_release_status, 'issued');
  });

  // ── Test 5: autoRelease=false → becomes disabled ──────────────────────────
  await test('draft with autoRelease=false → status becomes disabled', async () => {
    let upsertBody = null;

    _fetchQueue = [
      () => okJson([{ auto_release_status: 'errored', release_at: FIXED_RELEASE_AT }]),
      (_url, opts) => {
        upsertBody = JSON.parse(opts.body)[0];
        return okJson([upsertBody]);
      },
    ];

    const event = makeEvent({
      id: DRAFT_ID,
      title: 'Test Draft',
      autoRelease: false,
      releaseAt: FIXED_RELEASE_AT,
    });

    const resp = await handler(event);
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(upsertBody.auto_release_status, 'disabled');
  });

  // ── Test 6: errored + releaseAt null → null changed, becomes pending ──────
  await test('errored draft with releaseAt going from set to null resets to pending', async () => {
    let upsertBody = null;

    _fetchQueue = [
      () => okJson([{ auto_release_status: 'errored', release_at: FIXED_RELEASE_AT }]),
      (_url, opts) => {
        upsertBody = JSON.parse(opts.body)[0];
        return okJson([upsertBody]);
      },
    ];

    const event = makeEvent({
      id: DRAFT_ID,
      title: 'Test Draft',
      autoRelease: true,
      releaseAt: null,  // changed to null
    });

    const resp = await handler(event);
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(upsertBody.auto_release_status, 'pending', 'Clearing releaseAt should count as a change and re-arm');
  });

  // ── Test 7: no existing row → new draft with autoRelease=true → pending ───
  await test('new draft (no existing row) with autoRelease=true → status is pending', async () => {
    let upsertBody = null;

    _fetchQueue = [
      () => okJson([]),  // no existing row
      (_url, opts) => {
        upsertBody = JSON.parse(opts.body)[0];
        return okJson([upsertBody]);
      },
    ];

    const event = makeEvent({
      id: 'brand-new-draft-id',
      title: 'Brand New Draft',
      autoRelease: true,
      releaseAt: FIXED_RELEASE_AT,
    });

    const resp = await handler(event);
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(upsertBody.auto_release_status, 'pending');
  });

  console.log('\n✓ All teacher-drafts status-preservation tests complete\n');
})();
