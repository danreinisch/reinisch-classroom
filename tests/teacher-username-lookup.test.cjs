// Unit tests for lookupTeacherIdByUsername in netlify/functions/_lib/supa.js
// Verifies lowercasing, correct URL construction, null returns on empty/error/falsy input,
// and that console.warn is fired on non-2xx responses and on thrown fetch errors.
// Run with: node tests/teacher-username-lookup.test.cjs

'use strict';

const assert = require('assert');

// ── Environment setup (before module load) ────────────────────────────────────

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// ── Fetch mock queue ──────────────────────────────────────────────────────────

let _fetchQueue = [];
global.fetch = async (url, opts) => {
  if (_fetchQueue.length === 0) throw new Error(`Unexpected fetch call to ${url} (method: ${opts?.method || 'GET'})`);
  const responder = _fetchQueue.shift();
  return responder(url, opts);
};

function restoreQueuedFetch() {
  global.fetch = async (url, opts) => {
    if (_fetchQueue.length === 0) throw new Error(`Unexpected fetch call to ${url} (method: ${opts?.method || 'GET'})`);
    return _fetchQueue.shift()(url, opts);
  };
}

function okJson(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}
function failResponse(status, bodyObj) {
  const text = JSON.stringify(bodyObj);
  return { ok: false, status, json: async () => bodyObj, text: async () => text };
}

// ── Load module ───────────────────────────────────────────────────────────────

const { lookupTeacherIdByUsername } = require('../netlify/functions/_lib/supa');

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

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\nteacher-username-lookup — lookupTeacherIdByUsername\n');

  // ── Test 1: lowercases input and constructs correct URL ───────────────────
  await test('lowercases input and constructs correct URL shape', async () => {
    let capturedUrl = null;

    _fetchQueue = [
      (url) => {
        capturedUrl = url;
        return okJson([{ id: 'teacher-uuid-001' }]);
      },
    ];

    const result = await lookupTeacherIdByUsername('TeacherOne');

    assert.strictEqual(result, 'teacher-uuid-001', 'Should return the teacher UUID from the row');
    assert.ok(capturedUrl, 'Fetch should have been called');
    assert.ok(capturedUrl.includes('username=eq.teacherone'), 'URL should contain lowercased username=eq.teacherone');
    assert.ok(capturedUrl.includes('active=eq.true'), 'URL should contain active=eq.true');
    assert.ok(capturedUrl.includes('select=id'), 'URL should contain select=id');
    assert.ok(capturedUrl.includes('limit=1'), 'URL should contain limit=1');
  });

  // ── Test 2: returns null on empty rows ────────────────────────────────────
  await test('returns null on empty rows (200 OK with [])', async () => {
    _fetchQueue = [() => okJson([])];

    const result = await lookupTeacherIdByUsername('teacher_test');

    assert.strictEqual(result, null, 'Should return null when rows array is empty');
  });

  // ── Test 3a: returns null + console.warn on 400 response ─────────────────
  await test('returns null and warns on 400 non-2xx response', async () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    const errorBody = { message: 'column "username" does not exist', code: '42703' };
    _fetchQueue = [() => failResponse(400, errorBody)];

    const result = await lookupTeacherIdByUsername('teacher_test');

    console.warn = origWarn;

    assert.strictEqual(result, null, 'Should return null on non-2xx response');
    assert.ok(warnings.length > 0, 'console.warn should have been called');
    const warning = warnings[0];
    assert.ok(
      warning.includes('400') || warning.includes('status 400'),
      `Warning should include status 400, got: "${warning}"`
    );
    assert.ok(
      warning.includes('42703') || warning.includes('username'),
      `Warning should include response body snippet, got: "${warning}"`
    );
  });

  // ── Test 3b: returns null + console.warn on 404 response ─────────────────
  await test('returns null and warns on 404 non-2xx response', async () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    _fetchQueue = [() => failResponse(404, { message: 'not found' })];

    const result = await lookupTeacherIdByUsername('teacher_test');

    console.warn = origWarn;

    assert.strictEqual(result, null, 'Should return null on 404');
    assert.ok(warnings.length > 0, 'console.warn should have been called');
    assert.ok(
      warnings[0].includes('404'),
      `Warning should include status 404, got: "${warnings[0]}"`
    );
  });

  // ── Test 4: returns null + console.warn on thrown fetch error ─────────────
  await test('returns null and warns when fetch throws (network error)', async () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    global.fetch = async () => { throw new Error('network down'); };

    const result = await lookupTeacherIdByUsername('teacher_test');

    // Restore queue-based fetch before asserting (so failures below don't break teardown)
    restoreQueuedFetch();
    console.warn = origWarn;

    assert.strictEqual(result, null, 'Should return null when fetch throws');
    assert.ok(warnings.length > 0, 'console.warn should have been called');
    assert.ok(
      warnings[0].includes('network down'),
      `Warning should include the error message, got: "${warnings[0]}"`
    );
  });

  // ── Test 5: falsy username short-circuits without calling fetch ───────────
  await test('falsy username (null, undefined, empty string) returns null without calling fetch', async () => {
    global.fetch = async (url) => { throw new Error(`fetch should not be called for falsy username (got: ${url})`); };

    for (const falsy of [null, undefined, '']) {
      const result = await lookupTeacherIdByUsername(falsy);
      assert.strictEqual(result, null, `Should return null for ${JSON.stringify(falsy)}`);
    }

    // Restore queue-based fetch
    restoreQueuedFetch();
  });

  // ── Test 6: missing Supabase config short-circuits without calling fetch ──
  await test('missing Supabase config returns null without calling fetch', async () => {
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; throw new Error('fetch should not be called when config is missing'); };

    const savedUrl = process.env.SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    let result;
    try {
      result = await lookupTeacherIdByUsername('teacher_test');
    } finally {
      process.env.SUPABASE_URL = savedUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    }

    // Restore queue-based fetch
    restoreQueuedFetch();

    assert.strictEqual(result, null, 'Should return null when Supabase config is missing');
    assert.strictEqual(fetchCalled, false, 'Should not call fetch when config is missing');
  });

  console.log('\n✓ All teacher-username-lookup tests complete\n');
})();
