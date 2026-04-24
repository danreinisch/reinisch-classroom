// Unit tests for netlify/functions/teacher-sync-observations.js
// Verifies that safeJsonParse is used correctly so a valid { entries: [...] }
// body is NOT rejected with "entries must be a non-empty array".
// Run with: node tests/teacher-sync-observations.test.cjs

'use strict';

const assert = require('assert');

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSupabaseConfig = {
  url: 'https://test.supabase.co',
  key: 'test-service-role-key'
};

const mockHttpLib = {
  generateRequestId: () => 'test-request-id',
  jsonResponse: (_event, statusCode, body, _headers = {}, _requestId = '') => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }),
  handleCorsPreFlight: (_event, methods, headers) => ({
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': (headers || []).join(', ')
    },
    body: ''
  }),
  validateBodySize: (_body, _maxKb) => ({ valid: true }),
  // safeJsonParse contract: returns { ok: true, data } or { ok: false, error }
  safeJsonParse: (body) => {
    if (!body) return { ok: false, error: 'Empty request body' };
    try {
      return { ok: true, data: JSON.parse(body) };
    } catch (_) {
      return { ok: false, error: 'Invalid JSON' };
    }
  }
};

// Mock auth — always succeeds for POST tests
const mockAuthLib = {
  requireTeacher: (_event, _secret) => ({ ok: true, teacher: { id: 'teacher-1' } })
};

const mockSupaLib = {
  getSupabaseConfig: () => mockSupabaseConfig
};

// Register mocks before loading the handler (getSupabaseConfig is called at module load)
require.cache[require.resolve('../netlify/functions/_lib/http')] = {
  id: require.resolve('../netlify/functions/_lib/http'),
  filename: require.resolve('../netlify/functions/_lib/http'),
  loaded: true,
  exports: mockHttpLib
};

require.cache[require.resolve('../netlify/functions/_lib/supa')] = {
  id: require.resolve('../netlify/functions/_lib/supa'),
  filename: require.resolve('../netlify/functions/_lib/supa'),
  loaded: true,
  exports: mockSupaLib
};

require.cache[require.resolve('../netlify/functions/_lib/auth')] = {
  id: require.resolve('../netlify/functions/_lib/auth'),
  filename: require.resolve('../netlify/functions/_lib/auth'),
  loaded: true,
  exports: mockAuthLib
};

// Set env vars required at module load
process.env.SESSION_SECRET = 'test-session-secret';

const { handler } = require('../netlify/functions/teacher-sync-observations');

// ─── Fetch Mock ───────────────────────────────────────────────────────────────

// Default: all Supabase inserts succeed
global.fetch = async (_url, _options) => ({
  ok: true,
  status: 201,
  json: () => Promise.resolve({}),
  text: () => Promise.resolve('')
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePostEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function parseResponse(response) {
  return JSON.parse(response.body);
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      console.error(`✗ ${name}`);
      console.error('  Error:', e.message);
      if (e.stack) {
        console.error('  Stack:', e.stack.split('\n').slice(1, 4).join('\n'));
      }
      process.exit(1);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

console.log('Running teacher-sync-observations function unit tests...\n');

(async () => {
  console.log('--- Input Validation ---');

  await test('CORS preflight returns 204', async () => {
    const event = { httpMethod: 'OPTIONS', headers: {} };
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 204);
  })();

  await test('rejects non-POST methods with 405', async () => {
    const event = { httpMethod: 'GET', headers: {} };
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 405);
  })();

  await test('valid entries body is accepted (not rejected with "entries must be a non-empty array")', async () => {
    const event = makePostEvent({
      entries: [{
        student_code: 'S001',
        goal_id: 'goal-uuid-1',
        date: '2026-04-24',
        percent: 80,
        method: 'Observation',
        by_name: 'Teacher',
        via: 'observation_tray',
        notes: ''
      }]
    });
    const response = await handler(event);
    const body = parseResponse(response);

    assert.notStrictEqual(
      body.error,
      'entries must be a non-empty array',
      'Should not reject a valid entries payload with "entries must be a non-empty array"'
    );
    assert.strictEqual(response.statusCode, 200, `Expected 200 but got ${response.statusCode}: ${body.error || ''}`);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.synced, 1);
  })();

  await test('rejects empty entries array with 400', async () => {
    const event = makePostEvent({ entries: [] });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 400);
    const body = parseResponse(response);
    assert.strictEqual(body.error, 'entries must be a non-empty array');
  })();

  await test('rejects missing entries field with 400', async () => {
    const event = makePostEvent({ other: 'data' });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 400);
    const body = parseResponse(response);
    assert.strictEqual(body.error, 'entries must be a non-empty array');
  })();

  await test('rejects invalid JSON with 400', async () => {
    const event = {
      httpMethod: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-valid-json'
    };
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 400);
    const body = parseResponse(response);
    assert.strictEqual(body.error, 'Invalid JSON in request body');
  })();

  await test('entry missing required fields is added to failed array', async () => {
    const event = makePostEvent({
      entries: [{ student_code: 'S001', date: '2026-04-24' }] // missing goal_id
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    const body = parseResponse(response);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.synced, 0);
    assert.strictEqual(body.failed.length, 1);
    assert.ok(body.failed[0].reason.includes('Missing required fields'));
  })();

  console.log('\nAll tests passed.');
})();
