// Unit tests for scheduled-auto-release.js
// Tests that the scheduler correctly issues pending drafts, skips future ones,
// handles errors, and respects the auto_release flag.
// Run with: node tests/scheduled-auto-release.test.cjs

'use strict';

const assert = require('assert');

// ── Environment setup (before any module loads) ────────────────────────────

process.env.SESSION_SECRET = 'test-session-secret-32-chars-long!!';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// ── Test helpers ──────────────────────────────────────────────────────────

const TEACHER_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DRAFT_ID = 'draft-uuid-0001';
const ASSIGNMENT_ID = 'assignment-uuid-0001';

// Fake "now" in the past, so release_at in the past is really in the past
const PAST_RELEASE = new Date(Date.now() - 60 * 60 * 1000).toISOString();  // 1 hour ago

function makeRow(overrides = {}) {
  return {
    id: DRAFT_ID,
    teacher: 'teacher_test',
    title: 'Week 14 Test',
    class_name: 'Language Arts 3 SC',
    release_at: PAST_RELEASE,
    due_at: null,
    notes: null,
    assignment: {
      kind: 'file',
      name: 'test.txt',
      text: '= Student: S001 | Class: Language Arts 3 SC\n[Q1]\ntype: mc\n1. Q?\na. A\nb. B\nc. C\nd. D\ncorrect: A\n=',
      link: null,
    },
    mapping: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    auto_release: true,
    issued_at: null,
    auto_release_status: 'pending',
    auto_release_error: null,
    auto_release_attempted_at: null,
    ...overrides,
  };
}

function okJson(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}
function noContent() {
  return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
}
function failStatus(status) {
  return { ok: false, status, json: async () => ({}), text: async () => `error ${status}` };
}

// ── Mock infrastructure ───────────────────────────────────────────────────

// Mock _lib/http
require.cache[require.resolve('../netlify/functions/_lib/http')] = {
  exports: {
    generateRequestId: () => 'sched-test-id',
    jsonResponse: (_event, status, body) => ({
      statusCode: status,
      body: JSON.stringify(body),
    }),
    handleCorsPreFlight: () => ({ statusCode: 204, body: '' }),
    validateBodySize: () => ({ valid: true }),
    safeJsonParse: (str) => {
      if (!str) return { ok: false, error: 'Empty body' };
      try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
    },
  },
};

// Mock _lib/auth
require.cache[require.resolve('../netlify/functions/_lib/auth')] = {
  exports: {
    requireTeacher: () => ({ ok: false }),
  },
};

// Mock _lib/supa — lookupActiveTeacherId and lookupTeacherIdByUsername are
// overridable per test via the mock* variables below.
let mockLookupTeacherIdByUsernameFn = async () => null; // default: returns null → falls back
let mockLookupActiveTeacherIdFn = async () => TEACHER_UUID; // default: returns TEACHER_UUID

require.cache[require.resolve('../netlify/functions/_lib/supa')] = {
  exports: {
    getSupabaseConfig: () => ({ url: 'https://test.supabase.co', key: 'test-service-key' }),
    lookupActiveTeacherId: async () => mockLookupActiveTeacherIdFn(),
    lookupTeacherIdByUsername: async (u) => mockLookupTeacherIdByUsernameFn(u),
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  },
};

// Mock _lib/build-items
require.cache[require.resolve('../netlify/functions/_lib/build-items')] = {
  exports: { buildItemsFromMeta: () => [] },
};

// ── Mock issueDraftCore ───────────────────────────────────────────────────
// We mock issueDraftCore to isolate the scheduler from the full issuance pipeline.

let mockIssueDraftCoreFn = null;

// Mock teacher-issue-draft to expose issueDraftCore
require.cache[require.resolve('../netlify/functions/teacher-issue-draft')] = {
  exports: {
    handler: async () => ({ statusCode: 405, body: '{}' }),
    issueDraftCore: async (params) => {
      if (typeof mockIssueDraftCoreFn === 'function') {
        return mockIssueDraftCoreFn(params);
      }
      throw new Error('mockIssueDraftCoreFn not set');
    },
  },
};

// ── Fetch mock queue ──────────────────────────────────────────────────────

let _fetchQueue = [];
global.fetch = async (url, opts) => {
  if (_fetchQueue.length === 0) throw new Error(`Unexpected fetch call to ${url} (method: ${opts?.method || 'GET'})`);
  const responder = _fetchQueue.shift();
  return responder(url, opts);
};

// ── Load the module AFTER mocks are in place ──────────────────────────────
const { handler } = require('../netlify/functions/scheduled-auto-release');

// ── Test runner ───────────────────────────────────────────────────────────

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

(async () => {
  console.log('\nscheduled-auto-release — scheduler tests\n');

  // ── Test 1: pending past-due draft gets issued ──────────────────────────
  await test('issues a pending draft whose release_at is in the past', async () => {
    const row = makeRow();
    let issueDraftCoreParams = null;
    let patchUrls = [];
    let patchBodies = [];

    mockIssueDraftCoreFn = async (params) => {
      issueDraftCoreParams = params;
      return { ok: true, assignment_id: ASSIGNMENT_ID, issued_count: 5 };
    };

    _fetchQueue = [
      // 1. fetchDueDrafts — returns one pending row
      (url) => {
        assert(url.includes('auto_release=eq.true'), 'Expected auto_release filter');
        assert(url.includes('auto_release_status=eq.pending'), 'Expected pending status filter');
        assert(url.includes('issued_at=is.null'), 'Expected issued_at=is.null filter');
        assert(url.includes('release_at=not.is.null'), 'Expected release_at not null filter');
        assert(url.includes('lte.'), 'Expected release_at lte filter');
        return okJson([row]);
      },
      // 2. stampAttempted PATCH
      (url, opts) => {
        patchUrls.push(url);
        patchBodies.push(JSON.parse(opts.body));
        assert.strictEqual(opts.method, 'PATCH');
        assert(url.includes(`id=eq.${DRAFT_ID}`));
        return noContent();
      },
      // 3. markIssued PATCH
      (url, opts) => {
        patchUrls.push(url);
        patchBodies.push(JSON.parse(opts.body));
        assert.strictEqual(opts.method, 'PATCH');
        assert(url.includes(`id=eq.${DRAFT_ID}`));
        return noContent();
      },
    ];

    const resp = await handler({});
    const body = JSON.parse(resp.body);

    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.attempted, 1);
    assert.strictEqual(body.issued, 1);
    assert.strictEqual(body.errored, 0);

    // Verify issueDraftCore was called with the right params
    assert.ok(issueDraftCoreParams, 'issueDraftCore should have been called');
    assert.strictEqual(issueDraftCoreParams.draft.title, row.title);
    assert.strictEqual(issueDraftCoreParams.draft.className, row.class_name);
    assert.strictEqual(issueDraftCoreParams.teacherUsername, row.teacher);
    assert.strictEqual(issueDraftCoreParams.teacherUUID, TEACHER_UUID);

    // Verify the markIssued PATCH set the right fields
    const issuedPatch = patchBodies[1]; // second PATCH is markIssued
    assert.strictEqual(issuedPatch.auto_release_status, 'issued');
    assert.ok(issuedPatch.issued_at, 'issued_at should be set');
    assert.strictEqual(issuedPatch.auto_release_error, null);
    assert.strictEqual(issuedPatch.assignment_id, undefined, 'assignment_id must NOT be in the markIssued PATCH body (no such column on teacher_drafts)');
  });

  // ── Test 2: future draft is not in the query results ────────────────────
  await test('does not touch a draft whose release_at is in the future', async () => {
    mockIssueDraftCoreFn = async () => {
      throw new Error('issueDraftCore should not be called for future drafts');
    };

    _fetchQueue = [
      // fetchDueDrafts — returns empty (future draft was filtered out by the lte filter)
      () => okJson([]),
    ];

    const resp = await handler({});
    const body = JSON.parse(resp.body);

    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.attempted, 0);
    assert.strictEqual(body.issued, 0);
    assert.strictEqual(body.errored, 0);
  });

  // ── Test 3: issueDraftCore throws → errored, not retried ────────────────
  await test('marks draft errored when issueDraftCore throws, and does not retry', async () => {
    const row = makeRow();
    let patchBodies = [];
    const errorMessage = 'Database connection refused';

    mockIssueDraftCoreFn = async () => {
      throw new Error(errorMessage);
    };

    _fetchQueue = [
      // 1. fetchDueDrafts
      () => okJson([row]),
      // 2. stampAttempted PATCH
      (_url, opts) => {
        patchBodies.push(JSON.parse(opts.body));
        return noContent();
      },
      // 3. markErrored PATCH
      (_url, opts) => {
        patchBodies.push(JSON.parse(opts.body));
        return noContent();
      },
    ];

    const resp = await handler({});
    const body = JSON.parse(resp.body);

    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.attempted, 1);
    assert.strictEqual(body.issued, 0);
    assert.strictEqual(body.errored, 1);

    const erroredPatch = patchBodies[1]; // second PATCH is markErrored
    assert.strictEqual(erroredPatch.auto_release_status, 'errored');
    assert.ok(
      erroredPatch.auto_release_error.includes(errorMessage),
      `Error text should include "${errorMessage}", got: "${erroredPatch.auto_release_error}"`
    );

    // Confirm subsequent run would NOT retry (because status is now 'errored' not 'pending')
    // Simulated by another run that returns empty results (scheduler filters on status=pending)
    _fetchQueue = [
      () => okJson([]), // no pending drafts
    ];

    const resp2 = await handler({});
    const body2 = JSON.parse(resp2.body);
    assert.strictEqual(body2.attempted, 0, 'Errored draft should not be retried');
  });

  // ── Test 4: issueDraftCore returns ok=false → errored ───────────────────
  await test('marks draft errored when issueDraftCore returns ok=false', async () => {
    const row = makeRow();
    let patchBodies = [];

    mockIssueDraftCoreFn = async () => ({
      ok: false,
      error: 'Class not found in database',
      statusCode: 404,
    });

    _fetchQueue = [
      () => okJson([row]),
      (_url, opts) => { patchBodies.push(JSON.parse(opts.body)); return noContent(); }, // stampAttempted
      (_url, opts) => { patchBodies.push(JSON.parse(opts.body)); return noContent(); }, // markErrored
    ];

    const resp = await handler({});
    const body = JSON.parse(resp.body);

    assert.strictEqual(body.errored, 1);
    assert.strictEqual(patchBodies[1].auto_release_status, 'errored');
    assert.ok(patchBodies[1].auto_release_error.includes('Class not found'));
  });

  // ── Test 5: auto_release=false drafts are never in the query ────────────
  await test('never touches a draft with auto_release=false', async () => {
    mockIssueDraftCoreFn = async () => {
      throw new Error('issueDraftCore should not be called for auto_release=false drafts');
    };

    _fetchQueue = [
      // fetchDueDrafts returns empty — the query filters on auto_release=true,
      // so a false draft would never appear.
      () => okJson([]),
    ];

    const resp = await handler({});
    const body = JSON.parse(resp.body);

    assert.strictEqual(body.attempted, 0);
    assert.strictEqual(body.issued, 0);
  });

  // ── Test 6: error text is truncated to 500 chars ─────────────────────────
  await test('truncates auto_release_error to 500 characters', async () => {
    const row = makeRow();
    const longError = 'x'.repeat(600);
    let erroredPatchBody = null;

    mockIssueDraftCoreFn = async () => {
      throw new Error(longError);
    };

    _fetchQueue = [
      () => okJson([row]),
      () => noContent(), // stampAttempted
      (_url, opts) => {
        erroredPatchBody = JSON.parse(opts.body);
        return noContent();
      },
    ];

    await handler({});

    assert.ok(erroredPatchBody, 'markErrored PATCH should have been called');
    assert.ok(
      erroredPatchBody.auto_release_error.length <= 500,
      `Error should be truncated to ≤500 chars, got ${erroredPatchBody.auto_release_error.length}`
    );
  });

  // ── Test 7: lookupTeacherIdByUsername resolves UUID directly (happy path) ─
  await test('uses lookupTeacherIdByUsername result directly when it returns a UUID', async () => {
    const row = makeRow();
    let issueDraftCoreParams = null;

    mockLookupTeacherIdByUsernameFn = async (u) => {
      assert.strictEqual(u, row.teacher, "Should look up the draft's teacher username");
      return TEACHER_UUID;
    };
    // If the fallback is called, it should fail the test
    mockLookupActiveTeacherIdFn = async () => {
      throw new Error('lookupActiveTeacherId should not be called when username lookup succeeds');
    };

    mockIssueDraftCoreFn = async (params) => {
      issueDraftCoreParams = params;
      return { ok: true, assignment_id: ASSIGNMENT_ID, issued_count: 3 };
    };

    _fetchQueue = [
      () => okJson([row]),
      () => noContent(), // stampAttempted
      () => noContent(), // markIssued
    ];

    const resp = await handler({});
    const body = JSON.parse(resp.body);

    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.issued, 1);
    assert.strictEqual(body.errored, 0);
    assert.ok(issueDraftCoreParams, 'issueDraftCore should have been called');
    assert.strictEqual(issueDraftCoreParams.teacherUUID, TEACHER_UUID);

    // Reset to defaults for subsequent tests
    mockLookupTeacherIdByUsernameFn = async () => null;
    mockLookupActiveTeacherIdFn = async () => TEACHER_UUID;
  });

  // ── Test 8: both lookups return null → draft marked errored ───────────────
  await test('marks draft errored when both teacher lookups return null', async () => {
    const row = makeRow();
    let patchBodies = [];

    mockLookupTeacherIdByUsernameFn = async () => null;
    mockLookupActiveTeacherIdFn = async () => null;

    mockIssueDraftCoreFn = async () => {
      throw new Error('issueDraftCore should not be called when teacher UUID cannot be resolved');
    };

    _fetchQueue = [
      () => okJson([row]),
      () => noContent(), // stampAttempted
      (_url, opts) => { patchBodies.push(JSON.parse(opts.body)); return noContent(); }, // markErrored
    ];

    const resp = await handler({});
    const body = JSON.parse(resp.body);

    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.attempted, 1);
    assert.strictEqual(body.issued, 0);
    assert.strictEqual(body.errored, 1);

    assert.strictEqual(patchBodies.length, 1, 'markErrored PATCH should have been called');
    assert.strictEqual(patchBodies[0].auto_release_status, 'errored');
    assert.ok(
      patchBodies[0].auto_release_error.includes(row.teacher),
      `Error message should mention the teacher username, got: "${patchBodies[0].auto_release_error}"`
    );

    // Reset to defaults for subsequent tests
    mockLookupTeacherIdByUsernameFn = async () => null;
    mockLookupActiveTeacherIdFn = async () => TEACHER_UUID;
  });

  console.log('\n✓ All scheduled-auto-release tests complete\n');
})();
