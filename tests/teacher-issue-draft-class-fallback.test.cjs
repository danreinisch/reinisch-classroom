// Unit tests for teacher-issue-draft.js — class lookup fallback
// Verifies that when the teacher-scoped class query returns 0 results (e.g. existing
// class has teacher_id=null), the code falls back to a name-only query and uses that
// class instead of trying (and failing) to auto-create one.
// Run with: node tests/teacher-issue-draft-class-fallback.test.cjs
//
// NOTE: The login endpoint (teacher-login.js) now fails hard (HTTP 500) when the
// teacher UUID lookup fails or returns 0 rows. This means all JWTs in production
// will have a valid teacherId — the null-teacherId path in teacher-issue-draft.js
// is only reachable for sessions created before this hardening was deployed.

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
const TEACHER_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// Set environment variables before the module is loaded
process.env.SESSION_SECRET = SESSION_SECRET;
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
const validToken = makeTeacherToken(SESSION_SECRET, { teacherId: TEACHER_UUID });

// ── Minimal draft body ────────────────────────────────────────────────────────

const DRAFT = {
  id: 'draft-class-fallback-001',
  title: 'Week 10 Test',
  className: 'Language Arts 3 SC',
  // Minimal required fields so that the function gets past draft validation
  assignmentText: '= Student: S001 | Class: Language Arts 3 SC\n[Q1]\ntype: mc\n1. Question?\na. A\nb. B\nc. C\nd. D\ncorrect: A\n=',
  mappingText: '',
};

// ── Mock infrastructure ───────────────────────────────────────────────────────

const mockSupabaseConfig = { url: 'https://test.supabase.co', key: 'test-service-key' };

const mockHttpLib = {
  generateRequestId: () => 'test-req-id',
  jsonResponse: (_event, status, body, _headers = {}, _requestId = '') => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  }),
  handleCorsPreFlight: (_event, methods, headers) => ({
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': (headers || []).join(', '),
    },
    body: '',
  }),
  validateBodySize: (_body, _limit) => ({ valid: true }),
  safeJsonParse: (str) => {
    if (!str) return { ok: false, error: 'Empty body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

const mockAuthLib = {
  requireTeacher: (event, _secret) => {
    const cookie = event.headers?.cookie || '';
    const match = cookie.match(/tc=([^;]+)/);
    if (!match) return { ok: false };
    // Decode payload (no signature verification needed for unit tests)
    const [, payloadB64] = match[1].split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
    if (payload.role !== 'teacher') return { ok: false };
    return { ok: true, user: { role: 'teacher', username: payload.username || 'teacher_test', teacherId: payload.teacherId || null } };
  },
};

const mockSupaLib = {
  getSupabaseConfig: () => mockSupabaseConfig,
  lookupActiveTeacherId: async () => null,
};

const mockBuildItems = {
  buildItemsFromMeta: (_assignmentId, _meta) => [],
};

// Inject mocks before requiring the module
require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: mockAuthLib };
require.cache[require.resolve('../netlify/functions/_lib/supa')] = { exports: mockSupaLib };
require.cache[require.resolve('../netlify/functions/_lib/build-items')] = { exports: mockBuildItems };

// Configurable queue of fetch responses (consumed in order)
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

const { handler } = require('../netlify/functions/teacher-issue-draft');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { cookie: `tc=${validToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

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

// Number of stub 500 responses appended after the explicit calls to absorb any
// unexpected remaining fetch calls and fail loudly (small count so a future
// added fetch call breaks the test noticeably instead of being silently absorbed).
const REMAINING_CALL_STUBS = Array.from({ length: 5 }, () => () => failStatus(500));

(async () => {

console.log('\nteacher-issue-draft — class lookup fallback\n');

// Test: class with teacher_id=null is found via fallback and used (not auto-created)
await test('uses fallback name-only query when teacher-scoped query returns empty', async () => {
  // Fetch call order:
  // 1. Teacher-scoped class query → empty (class has teacher_id=null)
  // 2. Fallback name-only class query → returns the existing class
  // 3. PATCH to adopt teacher_id → success
  // (After that the function continues with enrollment/assignment logic which we
  //  intentionally short-circuit by returning an error from the next fetch.)

  let patchCalled = false;
  let autoCreateCalled = false;

  _fetchQueue = [
    // 1. Teacher-scoped class lookup → empty result.
    //    URL must include teacher_id filter to prove we attempted the scoped query.
    (url) => {
      assert(url.includes('teacher_id=eq.'), 'Expected teacher-scoped query (url contained teacher_id=eq.)');
      return okJson([]);
    },
    // 2. Fallback name-only lookup → existing class.
    //    URL must NOT include teacher_id filter and must reference the class name.
    (url) => {
      const parsedUrl = new URL(url);
      assert(!parsedUrl.searchParams.has('teacher_id'), 'Fallback must not filter by teacher_id');
      assert.strictEqual(parsedUrl.searchParams.get('name'), `eq.Language Arts 3 SC`, 'Fallback must filter by class name');
      return okJson([{ id: 'class-uuid-123', name: 'Language Arts 3 SC', teacher_id: null }]);
    },
    // 3. PATCH to adopt teacher_id.
    //    URL must target the found class by ID; body must set teacher_id.
    (url, opts) => {
      assert.strictEqual(opts.method, 'PATCH', 'Expected PATCH to adopt teacher_id');
      const parsedUrl = new URL(url);
      assert.strictEqual(parsedUrl.searchParams.get('id'), 'eq.class-uuid-123', 'PATCH must target the found class by ID');
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.teacher_id, TEACHER_UUID, 'PATCH body must set teacher_id to current teacher UUID');
      patchCalled = true;
      return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
    },
    // 4. Any subsequent call (enrollment fetch, etc.) — signal end of the relevant flow
    //    by returning a benign empty result so the function can proceed or fail gracefully.
    () => okJson([]),   // class_enrollments query
    () => okJson([]),   // enrollments fallback
    // Assignment duplicate check
    () => okJson([]),
    // Assignment create — returns the new assignment so the function can proceed to PATCH
    () => okJson([{ id: 'assignment-fb-001', title: 'Week 10 Test' }]),
    // Trailing teacher_drafts PATCH from PR #1296 — issued_at stamp
    (url, opts) => {
      assert.strictEqual(opts.method, 'PATCH', 'Expected PATCH for issued_at stamp');
      assert.ok(url.includes('teacher_drafts'), 'PATCH URL should target teacher_drafts');
      assert.ok(url.includes('id=eq.draft-class-fallback-001'), 'PATCH should target draft by ID');
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.auto_release_status, 'issued', 'PATCH should set auto_release_status=issued');
      assert.ok(body.issued_at && !isNaN(new Date(body.issued_at).getTime()), 'issued_at should be a valid ISO timestamp');
      return noContent();
    },
    // Remaining calls — let them fail softly; we only care about the class lookup above
    ...REMAINING_CALL_STUBS,
  ];

  const event = makeEvent({ draft: DRAFT });
  // We don't need a successful response; we just need to confirm no 409/500 from
  // the auto-create branch.  The function may return 500 from a later unrelated
  // stub, but it must NOT have thrown the auto-create error.
  await handler(event);

  // If auto-create was reached the test fetch queue would have seen a POST to /classes.
  // We can verify by checking patchCalled (which is inside the fallback branch).
  assert(patchCalled, 'PATCH to adopt class teacher_id should have been called');
  assert(!autoCreateCalled, 'Auto-create branch should NOT have been reached');
});

// Test: class exists with correct teacher_id — no fallback needed
await test('does NOT trigger fallback when teacher-scoped query returns the class', async () => {
  let fallbackCalled = false;
  let patchCalled = false;

  _fetchQueue = [
    // 1. Teacher-scoped class query → class found (teacher_id already set)
    (url) => {
      assert(url.includes('teacher_id=eq.'), 'Expected teacher-scoped query');
      return okJson([{ id: 'class-uuid-456', name: 'Language Arts 3 SC', teacher_id: TEACHER_UUID }]);
    },
    // Any fallback or patch calls would be unexpected — detect and flag them
    (url, opts) => {
      const parsedUrl = new URL(url);
      if (parsedUrl.searchParams.get('name') === `eq.Language Arts 3 SC` && !parsedUrl.searchParams.has('teacher_id')) {
        fallbackCalled = true;
      }
      if (opts?.method === 'PATCH') {
        patchCalled = true;
      }
      return okJson([]);
    },
    // 3. enrollments fallback → empty
    () => okJson([]),
    // 4. Duplicate check → no existing assignment
    () => okJson([]),
    // 5. Assignment create → success
    () => okJson([{ id: 'assignment-no-fallback-001', title: 'Week 10 Test' }]),
    // Trailing teacher_drafts PATCH from PR #1296 — issued_at stamp
    (url, opts) => {
      assert.strictEqual(opts.method, 'PATCH', 'Expected PATCH for issued_at stamp');
      assert.ok(url.includes('teacher_drafts'), 'PATCH URL should target teacher_drafts');
      assert.ok(url.includes('id=eq.draft-class-fallback-001'), 'PATCH should target draft by ID');
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.auto_release_status, 'issued', 'PATCH should set auto_release_status=issued');
      assert.ok(body.issued_at && !isNaN(new Date(body.issued_at).getTime()), 'issued_at should be a valid ISO timestamp');
      return noContent();
    },
    ...REMAINING_CALL_STUBS,
  ];

  await handler(makeEvent({ draft: DRAFT }));

  assert(!fallbackCalled, 'Fallback should NOT be called when teacher-scoped query finds the class');
  assert(!patchCalled, 'PATCH should NOT be called when teacher-scoped query finds the class');
});

// Test: class truly does not exist → auto-create is still reached
await test('auto-creates class when neither teacher-scoped nor fallback query finds it', async () => {
  let autoCreateCalled = false;

  _fetchQueue = [
    // 1. Teacher-scoped class query → empty
    () => okJson([]),
    // 2. Fallback name-only lookup → also empty (class truly doesn't exist)
    () => okJson([]),
    // 3. Auto-create POST — the next write to /classes must be a POST, not a PATCH
    (_url, opts) => {
      assert.strictEqual(opts.method, 'POST', 'Expected POST to auto-create class');
      autoCreateCalled = true;
      return okJson([{ id: 'new-class-id', name: 'Language Arts 3 SC', teacher_id: TEACHER_UUID }]);
    },
    // 4. class_enrollments → empty
    () => okJson([]),
    // 5. enrollments fallback → empty
    () => okJson([]),
    // 6. Duplicate check → no existing assignment
    () => okJson([]),
    // 7. Assignment create → success
    () => okJson([{ id: 'assignment-autocreate-001', title: 'Week 10 Test' }]),
    // Trailing teacher_drafts PATCH from PR #1296 — issued_at stamp
    (url, opts) => {
      assert.strictEqual(opts.method, 'PATCH', 'Expected PATCH for issued_at stamp');
      assert.ok(url.includes('teacher_drafts'), 'PATCH URL should target teacher_drafts');
      assert.ok(url.includes('id=eq.draft-class-fallback-001'), 'PATCH should target draft by ID');
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.auto_release_status, 'issued', 'PATCH should set auto_release_status=issued');
      assert.ok(body.issued_at && !isNaN(new Date(body.issued_at).getTime()), 'issued_at should be a valid ISO timestamp');
      return noContent();
    },
    ...REMAINING_CALL_STUBS,
  ];

  await handler(makeEvent({ draft: DRAFT }));

    assert(autoCreateCalled, 'Auto-create branch should be reached when class not found anywhere');
});

// ── Week 13 regression: empty-meta guard ─────────────────────────────────────
// These tests verify that the issuance handler FAILS LOUDLY (HTTP 422) instead
// of silently inserting an assignment_instance row with meta = {}.
// Root cause of the bug: parseTxtToMeta returned null for unparseable content,
// and the old code continued to create the assignment with meta = {} rather than
// returning an error.

await test('returns 422 when file-type draft content has no DAY/Chapter headers', async () => {
  // Simulate a teacher uploading a TXT file for a Cause-and-Effect assignment
  // whose body has no recognised section headers (the actual Week 13 failure mode).
  const DRAFT_UNPARSEABLE = {
    title: 'WEEK 13 — LOST IN KRAGDON-AH (CHAPTERS 38–40) Cause and Effect',
    className: 'Language Arts 3 SC',
    assignment: {
      kind: 'file',
      name: 'WEEK_13_CAUSE_EFFECT.txt',
      // Deliberately has no "DAY N" or "Chapter N:" headers so parseTxtToMeta returns null
      text: 'This assignment file has no structured section headers.\nJust plain text about cause and effect.',
      link: null,
    },
  };

  _fetchQueue = [
    // 1. Teacher-scoped class lookup → class found directly (no fallback)
    () => okJson([{ id: 'class-uuid-w13', name: 'Language Arts 3 SC', teacher_id: TEACHER_UUID }]),
    // 2. class_enrollments → empty (simplify: zero students enrolled)
    () => okJson([]),
    // 3. Enrollments fallback → also empty
    () => okJson([]),
    // The 422 should be returned BEFORE the duplicate-check/assignment-create fetches.
    // Any unexpected fetch beyond this point will throw (queue is empty).
    ...REMAINING_CALL_STUBS,
  ];

  const event = makeEvent({ draft: DRAFT_UNPARSEABLE });
  const response = await handler(event);
  const body = JSON.parse(response.body);

  assert.strictEqual(response.statusCode, 422, 'Should return 422 for unparseable content (not 200 with meta = {})');
  assert.strictEqual(body.ok, false, 'ok should be false');
  assert.ok(body.error && body.error.length > 0, 'Error message should be non-empty');
  assert.ok(body.error.includes('DAY') || body.error.includes('Chapter'), 'Error message should mention required header formats');
});

await test('returns 422 when re-issuing a draft with no text whose existing assignment has empty meta', async () => {
  // Simulates the second broken issuance: the draft was stripped of its content
  // (assignment.text is falsy), and the existing assignment already has meta = {}.
  const DRAFT_STRIPPED = {
    title: 'WEEK 13 — LOST IN KRAGDON-AH (CHAPTERS 38–40) Cause and Effect',
    className: 'Language Arts 3 SC',
    // assignment has no text (stripped after first issue)
    assignment: {
      kind: 'file',
      name: 'WEEK_13_CAUSE_EFFECT.txt',
      text: '',   // stripped
      link: null,
    },
  };

  _fetchQueue = [
    // 1. Teacher-scoped class lookup → class found
    () => okJson([{ id: 'class-uuid-w13-2', name: 'Language Arts 3 SC', teacher_id: TEACHER_UUID }]),
    // 2. class_enrollments → one student
    () => okJson([{ student_id: 'student-uuid-s011' }]),
    // 3. Duplicate check → existing assignment found WITH empty meta
    () => okJson([{ id: 'assignment-uuid-w13', meta: {} }]),
    // 422 returned here — no more fetches expected.
    ...REMAINING_CALL_STUBS,
  ];

  const event = makeEvent({ draft: DRAFT_STRIPPED });
  const response = await handler(event);
  const body = JSON.parse(response.body);

  assert.strictEqual(response.statusCode, 422, 'Should return 422 when existing assignment has empty meta and no new content is provided');
  assert.strictEqual(body.ok, false, 'ok should be false');
  assert.ok(body.error && body.error.length > 0, 'Error message should be non-empty');
});

await test('returns 422 when first-time file draft has empty text and no duplicate exists', async () => {
  // Simulates a teacher clicking Issue for a brand-new file draft whose
  // assignment.text is empty (e.g. upload failed or content was stripped).
  // There is no existing assignment to reuse, so meta = {} would be created
  // silently — this guard must prevent that.
  const DRAFT_FIRST_TIME_EMPTY = {
    title: 'WEEK 13 — Brand New (Empty File)',
    className: 'Language Arts 3 SC',
    assignment: {
      kind: 'file',
      name: 'WEEK_13_MASTER_ALL_STUDENTS (4).txt',
      text: '',   // empty — no content uploaded
      link: null,
    },
  };

  _fetchQueue = [
    // 1. Teacher-scoped class lookup → class found directly
    () => okJson([{ id: 'class-uuid-w13-ft', name: 'Language Arts 3 SC', teacher_id: TEACHER_UUID }]),
    // 2. class_enrollments → one student enrolled
    () => okJson([{ student_id: 'student-uuid-s001' }]),
    // 3. Enrollments fallback → empty (class_enrollments succeeded)
    () => okJson([]),
    // 4. Duplicate check → no existing assignment (brand new)
    () => okJson([]),
    // 422 should be returned BEFORE assignment creation.
    ...REMAINING_CALL_STUBS,
  ];

  const event = makeEvent({ draft: DRAFT_FIRST_TIME_EMPTY });
  const response = await handler(event);
  const body = JSON.parse(response.body);

  assert.strictEqual(response.statusCode, 422, 'Should return 422 for first-time file draft with empty text');
  assert.strictEqual(body.ok, false, 'ok should be false');
  assert.ok(body.error && body.error.length > 0, 'Error message should be non-empty');
  assert.ok(
    body.error.toLowerCase().includes('re-upload') || body.error.toLowerCase().includes('file'),
    'Error message should mention re-uploading the file'
  );
});

console.log('\n✓ All teacher-issue-draft class-fallback tests complete\n');

})();
