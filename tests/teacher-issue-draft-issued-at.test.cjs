// Unit tests for teacher-issue-draft.js — issued_at stamping (Bug 3 fix)
// Verifies that issueDraftCore PATCHes teacher_drafts to set issued_at and
// auto_release_status='issued' after a successful issuance, and that a failure
// to PATCH does NOT cause issueDraftCore to return ok=false.
// Run with: node tests/teacher-issue-draft-issued-at.test.cjs

'use strict';

const assert = require('assert');

// ── Environment setup ─────────────────────────────────────────────────────────

process.env.SESSION_SECRET = 'test-session-secret-32-chars-long!!';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// ── Mock infrastructure ───────────────────────────────────────────────────────

require.cache[require.resolve('../netlify/functions/_lib/http')] = {
  exports: {
    generateRequestId: () => 'issued-at-test-id',
    jsonResponse: (_event, status, body) => ({ statusCode: status, body: JSON.stringify(body) }),
    handleCorsPreFlight: () => ({ statusCode: 204, body: '' }),
    validateBodySize: () => ({ valid: true }),
    safeJsonParse: (str) => {
      if (!str) return { ok: false, error: 'Empty body' };
      try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
    },
  },
};

require.cache[require.resolve('../netlify/functions/_lib/auth')] = {
  exports: { requireTeacher: () => ({ ok: false }) },
};

require.cache[require.resolve('../netlify/functions/_lib/supa')] = {
  exports: {
    getSupabaseConfig: () => ({ url: 'https://test.supabase.co', key: 'test-service-key' }),
    lookupActiveTeacherId: async () => null,
    lookupTeacherIdByUsername: async () => null,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  },
};

require.cache[require.resolve('../netlify/functions/_lib/build-items')] = {
  exports: { buildItemsFromMeta: () => [] },
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
function failStatus(status) {
  return { ok: false, status, json: async () => ({}), text: async () => `error ${status}` };
}

// ── Load module ───────────────────────────────────────────────────────────────

const { issueDraftCore } = require('../netlify/functions/teacher-issue-draft');

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

// ── Shared draft fixture ──────────────────────────────────────────────────────

const DRAFT_ID = 'draft-issued-at-test-001';
const CLASS_ID = 'class-issued-at-test-001';
const ASSIGNMENT_ID = 'assignment-issued-at-test-001';
const STUDENT_ID = 'student-issued-at-test-001';

// A minimal valid draft with a class and one enrolled student
function makeDraft(overrides = {}) {
  return {
    id: DRAFT_ID,
    title: 'Week 15 Test',
    className: 'Language Arts 3 SC',
    assignment: {
      kind: 'link',
      name: null,
      text: null,
      link: 'https://example.com/week15',
    },
    mapping: {},
    ...overrides,
  };
}

// Full happy-path fetch queue for a successful issuance with one student.
// Last entry is the teacher_drafts PATCH (the issued_at stamp from Bug 3 fix).
function happyPathQueue({ patchResponder } = {}) {
  return [
    // 1. Class lookup (teacher-scoped → found)
    () => okJson([{ id: CLASS_ID, name: 'Language Arts 3 SC', teacher_id: 'teacher-uuid-test' }]),
    // 2. class_enrollments
    () => okJson([{ student_id: STUDENT_ID }]),
    // 3. Duplicate check → no existing assignment
    () => okJson([]),
    // 4. Create assignment
    () => okJson([{ id: ASSIGNMENT_ID, title: 'Week 15 Test' }]),
    // 5. Fetch student details
    () => okJson([{ id: STUDENT_ID, code: 'S001', name: 'Student One' }]),
    // 6. Existing instances lookup
    () => okJson([]),
    // 7. Insert assignment_instances
    () => okJson([{ id: 'inst-001', student_id: STUDENT_ID, assignment_id: ASSIGNMENT_ID }]),
    // 8. teacher_drafts PATCH (issued_at stamp)
    patchResponder || (() => noContent()),
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\nteacher-issue-draft — issued_at stamping (Bug 3)\n');

  // ── Test 1: successful issuance stamps issued_at on teacher_drafts ─────────
  await test('successful issueDraftCore PATCHes teacher_drafts with issued_at and auto_release_status=issued', async () => {
    let draftsPatchUrl = null;
    let draftsPatchBody = null;

    _fetchQueue = happyPathQueue({
      patchResponder: (url, opts) => {
        draftsPatchUrl = url;
        draftsPatchBody = JSON.parse(opts.body);
        return noContent();
      },
    });

    const result = await issueDraftCore({
      draft: makeDraft(),
      teacherUsername: 'teacher_test',
      teacherUUID: 'teacher-uuid-test',
      requestId: 'issued-at-test-id',
    });

    assert.strictEqual(result.ok, true, 'issueDraftCore should return ok=true');
    assert.strictEqual(result.issued_count, 1, 'Should have issued 1 instance');

    assert.ok(draftsPatchUrl, 'teacher_drafts PATCH should have been called');
    assert.ok(draftsPatchUrl.includes(`id=eq.${DRAFT_ID}`), 'PATCH URL should target the draft by ID');
    assert.ok(draftsPatchUrl.includes('teacher_drafts'), 'PATCH URL should target teacher_drafts');
    assert.ok(draftsPatchBody, 'PATCH body should be set');
    assert.strictEqual(draftsPatchBody.auto_release_status, 'issued', 'PATCH should set auto_release_status=issued');
    assert.ok(draftsPatchBody.issued_at, 'PATCH should set issued_at to a non-empty value');
    // Verify it's a valid ISO timestamp
    assert.ok(!isNaN(new Date(draftsPatchBody.issued_at).getTime()), 'issued_at should be a valid timestamp');
  });

  // ── Test 2: PATCH fails → issueDraftCore still returns ok=true ────────────
  await test('PATCH to teacher_drafts failing (500) does NOT fail the issuance', async () => {
    _fetchQueue = happyPathQueue({
      patchResponder: () => failStatus(500),
    });

    const result = await issueDraftCore({
      draft: makeDraft(),
      teacherUsername: 'teacher_test',
      teacherUUID: 'teacher-uuid-test',
      requestId: 'issued-at-test-id',
    });

    assert.strictEqual(result.ok, true, 'issueDraftCore should return ok=true even when the PATCH fails');
    assert.strictEqual(result.issued_count, 1, 'Instances should still have been created');
  });

  // ── Test 3: draft without id → no PATCH attempt ───────────────────────────
  await test('draft without id skips the teacher_drafts PATCH entirely', async () => {
    let unexpectedPatch = false;

    _fetchQueue = [
      // Normal happy path without the trailing PATCH
      () => okJson([{ id: CLASS_ID, name: 'Language Arts 3 SC', teacher_id: 'teacher-uuid-test' }]),
      () => okJson([{ student_id: STUDENT_ID }]),
      () => okJson([]),
      () => okJson([{ id: ASSIGNMENT_ID }]),
      () => okJson([{ id: STUDENT_ID, code: 'S001', name: 'Student One' }]),
      () => okJson([]),
      () => okJson([{ id: 'inst-001' }]),
      // Any unexpected PATCH call would land here
      (url, opts) => {
        if (opts?.method === 'PATCH' && url.includes('teacher_drafts')) {
          unexpectedPatch = true;
        }
        return noContent();
      },
    ];

    const result = await issueDraftCore({
      draft: makeDraft({ id: undefined }),  // no id
      teacherUsername: 'teacher_test',
      teacherUUID: 'teacher-uuid-test',
      requestId: 'issued-at-test-id',
    });

    assert.strictEqual(result.ok, true, 'issueDraftCore should return ok=true');
    assert.strictEqual(unexpectedPatch, false, 'Should NOT PATCH teacher_drafts when draft.id is missing');
  });

  console.log('\n✓ All teacher-issue-draft issued-at tests complete\n');
})();
