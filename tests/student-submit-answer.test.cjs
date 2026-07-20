// Unit tests for netlify/functions/student-submit-answer.js
// Tests student answer submission without requiring live Supabase
// Run with: node tests/student-submit-answer.test.cjs

'use strict';

const assert = require('assert');

// student-submit-answer now treats the signed student session as the
// authoritative identity. Configure a deterministic test-only secret
// before requiring the handler so positive-path tests can authenticate.
process.env.SESSION_SECRET = 'student-submit-answer-unit-test-secret';

const {
  createStudentSessionCookie,
} = require('../netlify/functions/_lib/student-auth');

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSupabaseConfig = {
  url: 'https://test.supabase.co',
  key: 'test-key'
};

const mockHttpLib = {
  generateRequestId: () => 'test-request-id',
  jsonResponse: (_event, statusCode, body, headers = {}, _requestId = '') => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  }),
  handleCorsPreFlight: (_event, methods, headers) => ({
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': headers.join(', ')
    },
    body: ''
  }),
  validateBodySize: (_body, _maxKb) => ({ valid: true }),
  safeJsonParse: (body) => {
    try {
      return { ok: true, data: JSON.parse(body) };
    } catch (e) {
      return { ok: false, error: 'JSON parse error' };
    }
  }
};

const mockSupaLib = {
  getSupabaseConfig: () => mockSupabaseConfig
};

// Register mocks in require.cache before loading the handler so that
// getSupabaseConfig() (called at module load time) returns the mock config.
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

// Now require the handler (Supabase config is resolved at module load time)
const { handler } = require('../netlify/functions/student-submit-answer');

// ─── Fetch Mock ───────────────────────────────────────────────────────────────
// Per-test configurable handlers keyed by table/operation.
// URL routing mirrors the sequential fetch calls made by the handler.

let fetchHandlers = {};

// Captured request data available for assertions
let capturedInstancePatch = null;
let capturedInstancePatches = [];
let capturedSubAnswers = null;
let capturedGoalProgressPosts = [];
let capturedGoalDataPointsPosts = [];
let capturedSubmissionPatch = null;
let capturedSubmissionPatches = [];
let submissionPostCalled = false;
let submissionGetCalled = false;

function makeOkResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data))
  });
}

function reset() {
  fetchHandlers = {};
  capturedInstancePatch = null;
  capturedInstancePatches = [];
  capturedSubAnswers = null;
  capturedGoalProgressPosts = [];
  capturedGoalDataPointsPosts = [];
  capturedSubmissionPatch = null;
  capturedSubmissionPatches = [];
  submissionPostCalled = false;
  submissionGetCalled = false;
}

global.fetch = async (url, options) => {
  const method = (options && options.method) || 'GET';
  const urlStr = String(url);
  const basePath = urlStr.split('?')[0];

  // submission_answers must be checked before /submissions because
  // '/submission_answers' contains the substring '/submissions'
  if (urlStr.includes('/submission_answers')) {
    if (options && options.body) capturedSubAnswers = JSON.parse(options.body);
    const h = fetchHandlers.subAnswers;
    return h ? h(urlStr, options) : makeOkResponse([], 201);
  }

  if (urlStr.includes('/students?')) {
    const h = fetchHandlers.students;
    if (!h) throw new Error('No students mock configured');
    return h(urlStr, options);
  }

  if (urlStr.includes('/assignment_instances') && method === 'GET') {
    const h = fetchHandlers.instanceGet;
    if (!h) throw new Error('No instanceGet mock configured');
    return h(urlStr, options);
  }

  if (urlStr.includes('/assignment_instances') && method === 'PATCH') {
    if (options && options.body) {
      const parsed = JSON.parse(options.body);
      capturedInstancePatch = parsed;
      capturedInstancePatches.push(parsed);
    }
    const h = fetchHandlers.instancePatch;
    return h ? h(urlStr, options) : makeOkResponse([{}]);
  }

  // assignment_item_mappings must be checked BEFORE assignment_items because
  // '/assignment_item_mappings' contains the substring '/assignment_items'.
  if (urlStr.includes('/assignment_item_mappings')) {
    const h = fetchHandlers.itemMappings;
    return h ? h(urlStr, options) : makeOkResponse([]);
  }

  if (urlStr.includes('/assignment_items')) {
    const h = fetchHandlers.items;
    return h ? h(urlStr, options) : makeOkResponse([]);
  }

  if (urlStr.includes('/goals') && method === 'GET') {
    const h = fetchHandlers.goals;
    return h ? h(urlStr, options) : makeOkResponse([]);
  }

  if (basePath.endsWith('/goal_progress') && method === 'POST') {
    if (options && options.body) capturedGoalProgressPosts.push(JSON.parse(options.body));
    const h = fetchHandlers.goalProgressPost;
    return h ? h(urlStr, options) : makeOkResponse(null, 201);
  }

  if (basePath.endsWith('/goal_data_points') && method === 'POST') {
    if (options && options.body) {
      const rows = JSON.parse(options.body);
      if (Array.isArray(rows)) capturedGoalDataPointsPosts.push(...rows);
      else capturedGoalDataPointsPosts.push(rows);
    }
    const h = fetchHandlers.goalDataPointsPost;
    return h ? h(urlStr, options) : makeOkResponse(null, 201);
  }

  if (urlStr.includes('/submissions') && method === 'GET') {
    submissionGetCalled = true;
    const h = fetchHandlers.submissionGet;
    return h ? h(urlStr, options) : makeOkResponse([]);
  }

  // POST to /submissions has no query string (bare table URL)
  if (basePath.endsWith('/submissions') && method === 'POST') {
    submissionPostCalled = true;
    const h = fetchHandlers.submissionPost;
    return h ? h(urlStr, options) : makeOkResponse([{ id: 'new-sub-id' }], 201);
  }

  if (urlStr.includes('/submissions') && method === 'PATCH') {
    if (options && options.body) {
      const parsed = JSON.parse(options.body);
      capturedSubmissionPatch = parsed;
      capturedSubmissionPatches.push(parsed);
    }
    const h = fetchHandlers.submissionPatch;
    return h ? h(urlStr, options) : makeOkResponse([{}]);
  }

  throw new Error(`Unmatched fetch: ${method} ${urlStr}`);
};

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStudent(overrides = {}) {
  return { id: 'student-uuid-1', code: 'S001', ...overrides };
}

function makeInstance(overrides = {}) {
  return {
    id: 'instance-uuid-1',
    student_id: 'student-uuid-1',
    assignment_id: 'assignment-uuid-1',
    status: 'In Progress',
    settings: { answers: {} },
    ...overrides
  };
}

function makeStudentCookie(code = 'S001') {
  return createStudentSessionCookie(
    code,
    process.env.SESSION_SECRET,
    {
      secure: false,
      maxAge: 3600,
    }
  ).split(';')[0];
}

function makePostEvent(body, headers = {}, options = {}) {
  const includeAuth = options.includeAuth !== false;
  const authenticatedCode = options.studentCode || 'S001';

  const authHeaders = includeAuth
    ? { cookie: makeStudentCookie(authenticatedCode) }
    : {};

  return {
    httpMethod: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders,
      ...headers,
    },
    body: JSON.stringify(body)
  };
}

function setupBasicMocks(studentOverrides = {}, instanceOverrides = {}) {
  fetchHandlers.students = () => makeOkResponse([makeStudent(studentOverrides)]);
  fetchHandlers.instanceGet = () => makeOkResponse([makeInstance(instanceOverrides)]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Run all tests sequentially
// ═══════════════════════════════════════════════════════════════════════════════

console.log('Running student-submit-answer function unit tests...\n');

(async () => {
  // ── Group: Input Validation ────────────────────────────────────────────────
  console.log('--- Input Validation ---');

  await test('CORS preflight returns 204', async () => {
    const event = { httpMethod: 'OPTIONS', headers: {} };
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 204, 'Should return 204 for OPTIONS');
    assert(response.headers['Access-Control-Allow-Methods'], 'Should have Allow-Methods header');
  })();

  await test('rejects non-POST methods with 405', async () => {
    const event = { httpMethod: 'GET', headers: {} };
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 405, 'Should return 405 for GET');
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error, 'Method Not Allowed');
  })();

  await test('rejects missing Content-Type with 400', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ instance_id: 'i1', student_code: 'S001' })
    };
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 400, 'Should return 400 for missing Content-Type');
    const body = JSON.parse(response.body);
    assert(body.error.includes('Content-Type'), 'Error should mention Content-Type');
  })();

  await test('rejects missing instance_id with 400', async () => {
    const event = makePostEvent({ student_code: 'S001' });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 400, 'Should return 400 for missing instance_id');
    const body = JSON.parse(response.body);
    assert(body.error.includes('instance_id'), 'Error should mention instance_id');
  })();

  await test('returns 401 when signed student session is missing', async () => {
    const event = makePostEvent(
      { instance_id: 'instance-1' },
      {},
      { includeAuth: false }
    );
    const response = await handler(event);
    assert.strictEqual(
      response.statusCode,
      401,
      'Should return 401 when signed student session is missing'
    );
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, false);
  })();

  await test('signed student session supplies identity when student_code is omitted', async () => {
    reset();
    setupBasicMocks();

    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      answers: { q1: 'A' },
      submit: false
    });

    const response = await handler(event);

    assert.strictEqual(
      response.statusCode,
      200,
      'Signed session should supply authoritative S001 identity'
    );

    assert(
      capturedInstancePatch,
      'Authenticated request should reach normal submission path'
    );

    assert.strictEqual(
      capturedInstancePatch.status,
      'In Progress'
    );
  })();

  // ── Group: Authentication ──────────────────────────────────────────────────
  console.log('\n--- Authentication ---');

  await test('returns 401 when authenticated student code is not found', async () => {
    reset();
    fetchHandlers.students = () => makeOkResponse([]);

    const event = makePostEvent(
      { instance_id: 'i1' },
      {},
      { studentCode: 'UNKNOWN' }
    );

    const response = await handler(event);

    assert.strictEqual(
      response.statusCode,
      401,
      'Should return 401 when authenticated student is not found'
    );

    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, false);
  })();

  await test('returns 404 when assignment instance not found', async () => {
    reset();
    fetchHandlers.students = () => makeOkResponse([makeStudent()]);
    fetchHandlers.instanceGet = () => makeOkResponse([]); // empty — instance not found
    const event = makePostEvent({ instance_id: 'no-such-instance', student_code: 'S001' });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 404, 'Should return 404 for missing instance');
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, false);
    assert(body.error.toLowerCase().includes('not found'), 'Error should mention not found');
  })();

  await test('returns 403 when instance belongs to a different student', async () => {
    reset();
    fetchHandlers.students = () => makeOkResponse([makeStudent({ id: 'student-uuid-1' })]);
    fetchHandlers.instanceGet = () => makeOkResponse([makeInstance({ student_id: 'other-student-uuid' })]);
    const event = makePostEvent({ instance_id: 'i1', student_code: 'S001' });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 403, 'Should return 403 for wrong student');
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, false);
  })();

  // ── Group: Status Logic (PR 1 critical — the `submit` field) ──────────────
  console.log('\n--- Status Logic ---');

  await test('submit: false → status "In Progress", no submission records created', async () => {
    reset();
    setupBasicMocks();
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: false
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Should return 200');
    assert(capturedInstancePatch, 'Instance should have been PATCHed');
    assert.strictEqual(capturedInstancePatch.status, 'In Progress', 'Status should be "In Progress"');
    assert.strictEqual(submissionGetCalled, false, 'Should not check submissions for auto-save');
    assert.strictEqual(submissionPostCalled, false, 'Should not create submission for auto-save');
  })();

  await test('submit: true → status "Submitted", submission created', async () => {
    reset();
    setupBasicMocks();
    fetchHandlers.submissionGet = () => makeOkResponse([]); // no existing submission
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Should return 200');
    assert(capturedInstancePatch, 'Instance should have been PATCHed');
    assert.strictEqual(capturedInstancePatch.status, 'Submitted', 'Status should be "Submitted"');
    assert.strictEqual(submissionPostCalled, true, 'Should create submission record');
  })();

  await test('submit omitted (undefined) → treated as falsy, status "In Progress"', async () => {
    reset();
    setupBasicMocks();
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' }
      // submit intentionally omitted
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Should return 200');
    assert.strictEqual(capturedInstancePatch.status, 'In Progress', 'Omitted submit should default to "In Progress"');
    assert.strictEqual(submissionPostCalled, false, 'Should not create submission when submit is omitted');
  })();

  await test('submit: true with writing_response → status "Submitted"', async () => {
    reset();
    setupBasicMocks();
    fetchHandlers.submissionGet = () => makeOkResponse([]); // no existing submission
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      writing_response: 'My essay response here.',
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Should return 200');
    assert.strictEqual(capturedInstancePatch.status, 'Submitted', 'Status should be "Submitted"');
    assert.strictEqual(submissionPostCalled, true, 'Should create submission record');
  })();

  await test('re-submit on already-submitted instance with submit: true → 200 OK, updates existing', async () => {
    reset();
    setupBasicMocks({}, { status: 'Submitted' }); // instance already "Submitted"
    fetchHandlers.submissionGet = () => makeOkResponse([{ id: 'existing-sub-id' }]); // existing submission found
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'B' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Should return 200 OK on re-submit');
    assert.strictEqual(submissionPostCalled, false, 'Should not POST new submission on re-submit (should PATCH existing)');
  })();

  // ── Group: Answer Merging ──────────────────────────────────────────────────
  console.log('\n--- Answer Merging ---');

  await test('prior answers in instance.settings are merged with new incoming answers', async () => {
    reset();
    // Instance already has q1='A' and q2='B' from a prior save
    setupBasicMocks({}, {
      settings: { answers: { q1: 'A', q2: 'B' } },
      assignment_id: 'assignment-uuid-1'
    });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' } },
      { id: 'item-2', item_ref: 'q2', answer_type: 'mcq', points: 1, meta: { correct: 'C' } },
      { id: 'item-3', item_ref: 'q3', answer_type: 'mcq', points: 1, meta: { correct: 'D' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q2: 'C', q3: 'D' }, // q2 overridden, q3 new
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers, 'submission_answers should have been upserted');
    const values = capturedSubAnswers.map(r => r.raw_answer.value);
    assert(values.includes('A'), 'Prior q1=A should be preserved in merged answers');
    assert(values.includes('C'), 'New q2=C should override prior q2=B');
    assert(values.includes('D'), 'New q3=D should be included');
    assert(!values.includes('B'), 'Old q2=B should be replaced by new q2=C');
  })();

  await test('new answers override prior answers for the same question key', async () => {
    reset();
    setupBasicMocks({}, {
      settings: { answers: { q1: 'A' } }, // prior answer
      assignment_id: 'assignment-uuid-1'
    });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 2, meta: { correct: 'B' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'B' }, // override prior 'A' with 'B'
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers, 'submission_answers should be upserted');
    assert.strictEqual(capturedSubAnswers.length, 1);
    assert.strictEqual(capturedSubAnswers[0].raw_answer.value, 'B', 'New answer should override prior');
  })();

  // ── Group: Auto-Scoring ────────────────────────────────────────────────────
  console.log('\n--- Auto-Scoring ---');

  await test('MCQ answer matching correct answer → is_correct: true, earned_points equals item points', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 5, meta: { correct: 'A' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0, 'submission_answers should be upserted');
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, true, 'Correct answer should have is_correct: true');
    assert.strictEqual(answer.earned_points, 5, 'Earned points should equal item points');
  })();

  await test('MCQ answer not matching correct answer → is_correct: false, earned_points: 0', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 5, meta: { correct: 'A' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'B' }, // wrong answer
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, false, 'Wrong answer should have is_correct: false');
    assert.strictEqual(answer.earned_points, 0, 'Wrong answer should earn 0 points');
  })();

  await test('case-insensitive comparison: lowercase "a" matches correct answer "A"', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 3, meta: { correct: 'A' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'a' }, // lowercase — should still match
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, true, 'Lowercase answer should match uppercase correct answer');
    assert.strictEqual(answer.earned_points, 3, 'Earned points should equal item points');
  })();

  await test('writing response (constructed type) → is_correct: null, earned_points: null', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-writing', item_ref: 'writing-q1', answer_type: 'constructed', points: 10, meta: {} }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      writing_response: 'This is my essay response with enough content.',
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0, 'Writing response should be added to submission_answers');
    const writingAnswer = capturedSubAnswers.find(
      (r) => r.raw_answer.value === 'This is my essay response with enough content.'
    );
    assert(writingAnswer, 'Writing answer row should be present in submission_answers');
    assert.strictEqual(writingAnswer.is_correct, null, 'Writing answer should have is_correct: null');
    assert.strictEqual(writingAnswer.earned_points, null, 'Writing answer should have earned_points: null');
  })();

  // ── Group: Scoring Results in Response ────────────────────────────────────
  console.log('\n--- Scoring Results in Response ---');

  await test('submit: true with correct MCQ answers → response includes score_total and results', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: '1_1', answer_type: 'mcq', points: 1, meta: { correct: 'A' } },
      { id: 'item-2', item_ref: '1_2', answer_type: 'mcq', points: 1, meta: { correct: 'B' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { '1_1': 'A', '1_2': 'B' }, // both correct
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.score_total, 100, 'score_total should be 100 when all correct');
    assert(Array.isArray(body.results), 'results should be an array');
    assert.strictEqual(body.results.length, 2, 'results should have one entry per scored item');
    body.results.forEach(r => {
      assert(r.item_ref, 'Each result should have item_ref');
      assert.strictEqual(r.is_correct, true, 'All answers are correct');
    });
  })();

  await test('submit: true with one wrong MCQ → results includes is_correct: false for wrong item', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: '1_1', answer_type: 'mcq', points: 1, meta: { correct: 'A' } },
      { id: 'item-2', item_ref: '1_2', answer_type: 'mcq', points: 1, meta: { correct: 'B' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { '1_1': 'A', '1_2': 'C' }, // second is wrong
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.score_total, 50, 'score_total should be 50% when half correct');
    const wrongResult = body.results.find(r => r.item_ref === '1_2');
    assert(wrongResult, 'Result for wrong item should be present');
    assert.strictEqual(wrongResult.is_correct, false, 'Wrong answer item should have is_correct: false');
  })();

  await test('submit: false (auto-save) → response has ok: true with null score_total and empty results', async () => {
    reset();
    setupBasicMocks();
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { '1_1': 'A' },
      submit: false
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.score_total, null, 'score_total should be null for auto-saves');
    assert(Array.isArray(body.results) && body.results.length === 0, 'results should be empty for auto-saves');
  })();

  // ── Group: Goal Progress Auto-Upsert ─────────────────────────────────────
  console.log('\n--- Goal Progress Auto-Upsert ---');

  await test('all-MCQ submission with goal_codes → goal_progress inserted', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 2, meta: { correct: 'A' }, goal_codes: ['MATH.1'] },
      { id: 'item-2', item_ref: 'q2', answer_type: 'mcq', points: 2, meta: { correct: 'B' }, goal_codes: ['MATH.1'] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-uuid-1', code: 'MATH.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A', q2: 'B' }, // both correct
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'One goal_progress entry should be inserted');
    const gp = capturedGoalProgressPosts[0];
    assert.strictEqual(gp.goal_id, 'goal-uuid-1', 'goal_id should be resolved from goals table');
    assert.strictEqual(gp.student_id, 'student-uuid-1', 'student_id should be the student UUID');
    assert.strictEqual(gp.value, 100, 'value should be 100% when all correct');
    assert.strictEqual(gp.source, 'assignment', 'source should be assignment');
    assert.strictEqual(gp.collected_by, 'auto', 'collected_by should be auto');
    assert.strictEqual(
      gp.assignment_instance_id,
      'instance-uuid-1',
      'goal_progress should retain assignment-instance provenance'
    );
  })();

  await test('partial score → goal_progress value reflects percentage', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 2, meta: { correct: 'A' }, goal_codes: ['READ.1'] },
      { id: 'item-2', item_ref: 'q2', answer_type: 'mcq', points: 2, meta: { correct: 'B' }, goal_codes: ['READ.1'] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-uuid-read', code: 'READ.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A', q2: 'C' }, // only first correct
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'One goal_progress entry should be inserted');
    assert.strictEqual(capturedGoalProgressPosts[0].value, 50, 'value should be 50% when half correct');
  })();

  await test('multiple goal_codes → separate goal_progress entry per goal', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: ['MATH.1', 'READ.1'] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([
      { id: 'goal-math', code: 'MATH.1' },
      { id: 'goal-read', code: 'READ.1' }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 2, 'Two goal_progress entries should be inserted (one per goal)');
    const goalIds = capturedGoalProgressPosts.map(gp => gp.goal_id);
    assert(goalIds.includes('goal-math'), 'MATH.1 goal_progress should be inserted');
    assert(goalIds.includes('goal-read'), 'READ.1 goal_progress should be inserted');
  })();

  await test('assignment with constructed item → goal_progress NOT inserted', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: ['MATH.1'] },
      { id: 'item-2', item_ref: 'writing-q1', answer_type: 'constructed', points: 5, meta: {}, goal_codes: [] }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      writing_response: 'My essay.',
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 0, 'No goal_progress should be inserted when constructed items present');
  })();

  await test('submit: false (auto-save) → goal_progress NOT inserted', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: false
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 0, 'No goal_progress for auto-saves');
  })();

  await test('items with no goal_codes → goal_progress NOT inserted', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: [] }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 0, 'No goal_progress when no goal_codes on items');
  })();

  await test('goal_progress insert failure → submission still succeeds (non-fatal)', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: ['MATH.1'] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-uuid-1', code: 'MATH.1' }]);
    fetchHandlers.goalProgressPost = () => makeOkResponse({ error: 'DB error' }, 500);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Submission should succeed even when goal_progress insert fails');
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true, 'Response body should be ok: true');
  })();

  await test('goal not found for student → skipped, submission still succeeds', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: ['NONEXISTENT.1'] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([]); // no matching goal found
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Submission should succeed when goal not found');
    assert.strictEqual(capturedGoalProgressPosts.length, 0, 'No goal_progress inserted when goal not found');
  })();

  // ── Group: assignment_item_mappings enrichment ────────────────────────────
  console.log('\n--- assignment_item_mappings Enrichment ---');

  await test('goal_codes from mappings (empty on items) → goal_progress inserted', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    // Items have goal_codes: [] (pre-PR #703 style — authoritative codes in mappings)
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 2, meta: { correct: 'A' }, goal_codes: [] },
      { id: 'item-2', item_ref: 'q2', answer_type: 'mcq', points: 2, meta: { correct: 'B' }, goal_codes: [] }
    ]);
    // Mappings carry the real goal_codes
    fetchHandlers.itemMappings = () => makeOkResponse([
      { item_id: 'item-1', goal_codes: ['MATH.1'], dese_codes: [] },
      { item_id: 'item-2', goal_codes: ['MATH.1'], dese_codes: [] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-uuid-1', code: 'MATH.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A', q2: 'B' }, // both correct
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'goal_progress should be inserted when goal_codes come from mappings');
    assert.strictEqual(capturedGoalProgressPosts[0].value, 100, 'value should be 100% when all correct');
    assert.strictEqual(capturedGoalProgressPosts[0].collected_by, 'auto');
  })();

  await test('goal_codes from mappings take precedence over stale item-level codes', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    // Item has a stale goal_code — should be overridden by the authoritative mapping
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: ['OLD.1'] }
    ]);
    // Mapping has the correct, authoritative code — should always win
    fetchHandlers.itemMappings = () => makeOkResponse([
      { item_id: 'item-1', goal_codes: ['MATH.1'], dese_codes: [] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-math', code: 'MATH.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'goal_progress should use mapping goal_code');
    assert.strictEqual(capturedGoalProgressPosts[0].goal_id, 'goal-math', 'MATH.1 (from mappings) should take precedence over OLD.1 (stale item-level code)');
  })();

  await test('item-level goal_codes are preserved when mapping row exists but has empty goal_codes', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    // Item has goal codes that should be kept since the mapping has none
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: ['READ.1'] }
    ]);
    // Mapping row exists but goal_codes is empty — item-level codes must not be cleared
    fetchHandlers.itemMappings = () => makeOkResponse([
      { item_id: 'item-1', goal_codes: [], dese_codes: [] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-read', code: 'READ.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'goal_progress should use item-level goal_code when mapping has empty goal_codes');
    assert.strictEqual(capturedGoalProgressPosts[0].goal_id, 'goal-read', 'READ.1 (from items) should be preserved when mapping has empty goal_codes');
  })();

  await test('dese_codes from mappings take precedence over stale item-level dese_codes', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    // Item has a stale dese_code alongside a valid goal_code
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: ['MATH.1'], dese_codes: ['OLD-DESE'] }
    ]);
    // Mapping has the authoritative dese_code — should override the stale item-level one
    fetchHandlers.itemMappings = () => makeOkResponse([
      { item_id: 'item-1', goal_codes: ['MATH.1'], dese_codes: ['ELA.1.A'] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-math', code: 'MATH.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'goal_progress should be inserted for MATH.1 after dese_codes enrichment');
    assert.strictEqual(capturedGoalProgressPosts[0].goal_id, 'goal-math', 'MATH.1 goal_progress created when dese_codes overridden by mapping');
  })();

  await test('item-level dese_codes are preserved when mapping has empty dese_codes', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    // Item has dese_codes that should be kept since the mapping has none
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: ['MATH.1'], dese_codes: ['KEEP-THIS'] }
    ]);
    // Mapping row exists but dese_codes is empty — item-level dese_codes must not be cleared
    fetchHandlers.itemMappings = () => makeOkResponse([
      { item_id: 'item-1', goal_codes: ['MATH.1'], dese_codes: [] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-math', code: 'MATH.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'goal_progress should be inserted for MATH.1 when dese_codes fallback to item-level');
    assert.strictEqual(capturedGoalProgressPosts[0].goal_id, 'goal-math', 'MATH.1 goal_progress created when mapping has empty dese_codes');
  })();

  await test('both goal_codes and dese_codes enriched simultaneously from mappings', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    // Item starts with empty goal_codes and dese_codes
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: [], dese_codes: [] }
    ]);
    // Mapping provides both goal_codes and dese_codes in a single pass
    fetchHandlers.itemMappings = () => makeOkResponse([
      { item_id: 'item-1', goal_codes: ['MATH.1'], dese_codes: ['ELA.1.A'] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-math', code: 'MATH.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'goal_progress should be inserted when both goal_codes and dese_codes come from mappings');
    assert.strictEqual(capturedGoalProgressPosts[0].goal_id, 'goal-math', 'MATH.1 goal_progress created — both fields enriched simultaneously from mappings');
  })();

  await test('mappings lookup failure is non-fatal — items without goal_codes still produce no progress', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    // Items have no goal_codes, mappings call fails
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: [] }
    ]);
    fetchHandlers.itemMappings = () => makeOkResponse({ error: 'DB error' }, 500);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Submission should succeed even when mappings lookup fails');
    assert.strictEqual(capturedGoalProgressPosts.length, 0, 'No goal_progress when enrichment fails and items have no goal_codes');
  })();

  await test('partial mapping coverage — only mapped items contribute to rollup', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 2, meta: { correct: 'A' }, goal_codes: [] },
      { id: 'item-2', item_ref: 'q2', answer_type: 'mcq', points: 2, meta: { correct: 'B' }, goal_codes: [] }
    ]);
    // Only item-1 is in mappings
    fetchHandlers.itemMappings = () => makeOkResponse([
      { item_id: 'item-1', goal_codes: ['MATH.1'], dese_codes: [] }
    ]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-math', code: 'MATH.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A', q2: 'X' }, // q1 correct, q2 wrong
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1);
    // Only item-1 (2 pts earned out of 2 pts) contributes to MATH.1 rollup
    assert.strictEqual(capturedGoalProgressPosts[0].value, 100, 'value should be 100% based on item-1 only');
  })();

  // ─── Per-question data points tests ───────────────────────────────────────

  await test('per-question data points are inserted for each goal-linked item', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1,
        meta: { correct: 'A', text: 'What is 2+2?', choices: ['A) 4', 'B) 3'] },
        goal_codes: ['MATH.1'] },
      { id: 'item-2', item_ref: 'q2', answer_type: 'mcq', points: 1,
        meta: { correct: 'B', text: 'What color is the sky?', choices: ['A) Red', 'B) Blue'] },
        goal_codes: ['MATH.1'] }
    ]);
    fetchHandlers.itemMappings = () => makeOkResponse([]);
    fetchHandlers.goals = () => makeOkResponse([{ id: 'goal-math', code: 'MATH.1' }]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A', q2: 'A' }, // q1 correct, q2 wrong
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'one rollup progress entry');
    assert.strictEqual(capturedGoalDataPointsPosts.length, 2, 'two per-question data points');
    const dp1 = capturedGoalDataPointsPosts.find(dp => dp.student_answer === 'A' && dp.correct_answer === 'A');
    const dp2 = capturedGoalDataPointsPosts.find(dp => dp.student_answer === 'A' && dp.correct_answer === 'B');
    assert.ok(dp1, 'data point for q1 found');
    assert.ok(dp2, 'data point for q2 found');
    assert.strictEqual(dp1.is_correct, true, 'q1 is_correct should be true');
    assert.strictEqual(dp2.is_correct, false, 'q2 is_correct should be false');
    assert.strictEqual(dp1.question_text, 'What is 2+2?', 'q1 question_text stored');
    assert.ok(Array.isArray(dp1.choices), 'q1 choices stored as native array');
    assert.strictEqual(dp1.choices[0], 'A) 4', 'q1 first choice matches');
    assert.strictEqual(dp1.goal_id, 'goal-math', 'q1 linked to correct goal');
  })();

  await test('goal_data_points not inserted when no goal-linked items', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1,
        meta: { correct: 'A' }, goal_codes: [] }
    ]);
    fetchHandlers.itemMappings = () => makeOkResponse([]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(capturedGoalDataPointsPosts.length, 0, 'no data points for items without goal codes');
  })();

  // ── Group: Constructed keyword auto-scoring with case_sensitive ───────────
  console.log('\n--- Constructed Keyword Scoring: case_sensitive ---');

  await test('constructed item with case_sensitive:true → case matters for scoring', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      {
        id: 'item-kw', item_ref: 'q1', answer_type: 'constructed', points: 4,
        meta: { scoring: { keywords: ['DNA', 'RNA'], min_keywords: 1, case_sensitive: true } },
        goal_codes: []
      }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'The cell contains dna and rna.' }, // lowercase — should NOT match when case_sensitive
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, false, 'Lowercase match should fail when case_sensitive: true');
    assert.strictEqual(answer.earned_points, 0, 'No points when keywords not matched case-sensitively');
  })();

  await test('constructed item with case_sensitive:true → uppercase keywords match correctly', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      {
        id: 'item-kw', item_ref: 'q1', answer_type: 'constructed', points: 4,
        meta: { scoring: { keywords: ['DNA', 'RNA'], min_keywords: 1, case_sensitive: true } },
        goal_codes: []
      }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'The cell contains DNA and RNA.' }, // exact case — should match
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, true, 'Exact-case keywords should match when case_sensitive: true');
    assert.strictEqual(answer.earned_points, 4, 'Full points when all keywords matched');
  })();

  await test('constructed item with case_sensitive:false → case-insensitive match succeeds', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      {
        id: 'item-kw', item_ref: 'q1', answer_type: 'constructed', points: 4,
        meta: { scoring: { keywords: ['photosynthesis', 'chlorophyll'], min_keywords: 1, case_sensitive: false } },
        goal_codes: []
      }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'PHOTOSYNTHESIS uses CHLOROPHYLL to capture light.' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, true, 'Uppercase answer should match lowercase keywords when case_sensitive: false');
    assert.strictEqual(answer.earned_points, 4, 'Full points when all keywords matched case-insensitively');
  })();

  await test('constructed item without case_sensitive → defaults to case-insensitive', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      {
        id: 'item-kw', item_ref: 'q1', answer_type: 'constructed', points: 3,
        meta: { scoring: { keywords: ['mitosis', 'meiosis'], min_keywords: 1 } },
        goal_codes: []
      }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'Cells divide by MITOSIS.' }, // uppercase keyword
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, true, 'Should match case-insensitively when case_sensitive is absent');
  })();

  await test('partial credit earned_points is ratio-based (case_sensitive: true)', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      {
        id: 'item-kw', item_ref: 'q1', answer_type: 'constructed', points: 6,
        meta: { scoring: { keywords: ['DNA', 'RNA', 'ATP'], min_keywords: 1, case_sensitive: true } },
        goal_codes: []
      }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'DNA is important.' }, // only 1 of 3 keywords (exact case)
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, true, 'min_keywords=1 met with one matching keyword');
    assert.strictEqual(answer.earned_points, 2, 'Partial credit: 1/3 of 6 pts = 2 pts');
  })();

  await test('partial credit earned_points is ratio-based (case_sensitive: false)', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      {
        id: 'item-kw', item_ref: 'q1', answer_type: 'constructed', points: 6,
        meta: { scoring: { keywords: ['slope', 'intercept', 'linear'], min_keywords: 2, case_sensitive: false } },
        goal_codes: []
      }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'The SLOPE and INTERCEPT define the line.' }, // 2 of 3 keywords
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, true, 'min_keywords=2 met with 2 matching keywords');
    assert.strictEqual(answer.earned_points, 4, 'Partial credit: 2/3 of 6 pts = 4 pts');
  })();

  await test('is_correct false when matched count < min_keywords (case_sensitive: true)', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      {
        id: 'item-kw', item_ref: 'q1', answer_type: 'constructed', points: 4,
        meta: { scoring: { keywords: ['DNA', 'RNA', 'ATP'], min_keywords: 2, case_sensitive: true } },
        goal_codes: []
      }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'DNA carries genetic information.' }, // only 1 of 3 (case-sensitive), need 2
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, false, 'is_correct false when foundCount < min_keywords');
    // 1 out of 3 keywords found → earned = 6*(1/3) but points=4 → 4*(1/3) ≈ 1.33
    assert.ok(answer.earned_points > 0, 'Still earns partial credit even if not is_correct');
  })();

  await test('is_correct false when matched count < min_keywords (case_sensitive: false)', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      {
        id: 'item-kw', item_ref: 'q1', answer_type: 'constructed', points: 6,
        meta: { scoring: { keywords: ['slope', 'intercept', 'linear'], min_keywords: 2, case_sensitive: false } },
        goal_codes: []
      }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'The slope of the function.' }, // only 1 keyword, need 2
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length > 0);
    const answer = capturedSubAnswers[0];
    assert.strictEqual(answer.is_correct, false, 'is_correct false when foundCount < min_keywords');
    assert.strictEqual(answer.earned_points, 2, 'Partial credit: 1/3 of 6 pts = 2 pts');
  })();

  // ── Group: Revision Mode Re-submission ────────────────────────────────────
  console.log('\n--- Revision Mode Re-submission ---');

  await test('revision-mode re-submit: submission_answers refreshed with new scored_at and answers', async () => {
    reset();
    setupBasicMocks({}, {
      assignment_id: 'assignment-uuid-1',
      status: 'Assigned', // teacher set back to Assigned on "Return for Revision"
      settings: {
        retry_config: {
          revision_mode: true,
          locked_question_ids: ['q1'],
          original_answers: { q1: 'A', q2: 'B' },
          original_score: 50
        },
        answers: { q1: 'A', q2: 'C' } // student updated q2 via auto-save
      }
    });
    fetchHandlers.submissionGet = () => makeOkResponse([{ id: 'existing-sub-id' }]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' } },
      { id: 'item-2', item_ref: 'q2', answer_type: 'mcq', points: 1, meta: { correct: 'C' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A', q2: 'C' }, // updated answers
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Revision re-submit should return 200');
    assert(capturedSubAnswers, 'submission_answers should be upserted');
    assert.strictEqual(capturedSubAnswers.length, 2, 'Both MCQ items should be scored');
    const q2Answer = capturedSubAnswers.find(a => a.raw_answer.value === 'C');
    assert(q2Answer, 'Updated q2=C should be in submission_answers');
    assert.strictEqual(q2Answer.is_correct, true, 'q2=C (correct) should now score correctly');
    // Verify both items are present
    const q1Answer = capturedSubAnswers.find(a => a.raw_answer.value === 'A');
    assert(q1Answer, 'q1=A should be in submission_answers');
    assert.strictEqual(q1Answer.is_correct, true, 'q1=A is correct');
  })();

  await test('revision-mode re-submit: review_status reset to pending so teacher can re-review', async () => {
    reset();
    setupBasicMocks({}, {
      assignment_id: 'assignment-uuid-1',
      status: 'Assigned',
      settings: {
        retry_config: { revision_mode: true, locked_question_ids: [], original_answers: {}, original_score: 0 },
        answers: { q1: 'B' }
      }
    });
    fetchHandlers.submissionGet = () => makeOkResponse([{ id: 'existing-sub-id' }]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'B' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'B' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    // The first submission PATCH resets review_status; a second PATCH updates score_auto.
    const reviewStatusPatch = capturedSubmissionPatches.find(p => p.review_status !== undefined);
    assert(reviewStatusPatch, 'A submission PATCH with review_status should have been sent');
    assert.strictEqual(reviewStatusPatch.review_status, 'pending',
      'review_status must be reset to pending so the teacher sees the re-submission');
  })();

  await test('revision-mode re-submit: resubmission_count incremented on instance', async () => {
    reset();
    setupBasicMocks({}, {
      assignment_id: 'assignment-uuid-1',
      status: 'Assigned',
      resubmission_count: 0, // starts at 0
      settings: {
        retry_config: { revision_mode: true, locked_question_ids: ['q1'], original_answers: { q1: 'A' }, original_score: 100 },
        answers: { q1: 'A', q2: 'D' }
      }
    });
    fetchHandlers.submissionGet = () => makeOkResponse([{ id: 'existing-sub-id' }]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' } },
      { id: 'item-2', item_ref: 'q2', answer_type: 'mcq', points: 1, meta: { correct: 'D' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A', q2: 'D' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    // The PATCH to increment resubmission_count is the SECOND patch to assignment_instances
    // (first is the settings/status update, second is the count increment)
    const countPatch = capturedInstancePatches.find(p => p.resubmission_count !== undefined);
    assert(countPatch, 'A PATCH with resubmission_count should have been sent to assignment_instances');
    assert.strictEqual(countPatch.resubmission_count, 1, 'resubmission_count should be incremented to 1');
  })();

  await test('revision-mode re-submit: non-auto-scoreable constructed item NOT overwritten', async () => {
    reset();
    // Instance has retry_config with revision_mode=true. The original answers include a WP_4 writing
    // response stored in settings.answers (pre-populated by "Return for Revision").
    setupBasicMocks({}, {
      assignment_id: 'assignment-uuid-1',
      status: 'Assigned',
      settings: {
        retry_config: { revision_mode: true, locked_question_ids: ['q1'], original_answers: { q1: 'A', WP_4: 'student original essay' }, original_score: 50 },
        answers: { q1: 'A', WP_4: 'student original essay' } // WP_4 in priorAnswers from retry_config pre-population
      }
    });
    fetchHandlers.submissionGet = () => makeOkResponse([{ id: 'existing-sub-id' }]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' } },
      { id: 'item-wp4', item_ref: 'WP_4', answer_type: 'constructed', points: 5, meta: {} }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' }, // MCQ only — student did NOT change the writing response
      // No writing_response field → hasWriting is false
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers, 'submission_answers should be upserted');
    // WP_4 should NOT appear in the upserted rows because it's a non-auto-scoreable
    // constructed item and isRevisionResubmission=true.
    const wp4Row = capturedSubAnswers.find(r => r.assignment_item_id === 'item-wp4');
    assert(!wp4Row, 'WP_4 (non-auto-scoreable constructed item) must NOT be upserted on revision re-submit without new writing_response — preserves teacher manual grade');
    // q1 should still be scored correctly
    const q1Row = capturedSubAnswers.find(r => r.assignment_item_id === 'item-1');
    assert(q1Row, 'q1 MCQ answer should be upserted');
    assert.strictEqual(q1Row.is_correct, true, 'q1=A should score correctly');
  })();

  await test('revision-mode re-submit with new writing_response: writing item IS updated', async () => {
    reset();
    setupBasicMocks({}, {
      assignment_id: 'assignment-uuid-1',
      status: 'Assigned',
      settings: {
        retry_config: { revision_mode: true, locked_question_ids: [], original_answers: { WP_4: 'old essay' }, original_score: 0 },
        answers: { WP_4: 'old essay' }
      }
    });
    fetchHandlers.submissionGet = () => makeOkResponse([{ id: 'existing-sub-id' }]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-wp4', item_ref: 'WP_4', answer_type: 'constructed', points: 5, meta: {} }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      writing_response: 'My improved essay response with much better content.', // student wrote a new response
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers, 'submission_answers should be upserted');
    const wp4Row = capturedSubAnswers.find(r => r.raw_answer.value === 'My improved essay response with much better content.');
    assert(wp4Row, 'New writing_response should be upserted when student provides one on revision re-submit');
  })();

  await test('revision-mode re-submit: score_auto and score_total are recomputed', async () => {
    reset();
    setupBasicMocks({}, {
      assignment_id: 'assignment-uuid-1',
      status: 'Assigned',
      settings: {
        retry_config: { revision_mode: true, locked_question_ids: ['q1'], original_answers: { q1: 'A', q2: 'B' }, original_score: 50 },
        answers: { q1: 'A', q2: 'C' }
      }
    });
    fetchHandlers.submissionGet = () => makeOkResponse([{ id: 'existing-sub-id' }]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' } },
      { id: 'item-2', item_ref: 'q2', answer_type: 'mcq', points: 1, meta: { correct: 'C' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A', q2: 'C' }, // both correct now
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.score_total, 100, 'score_total should be 100% when both MCQ are now correct');
  })();

  await test('first-time submission (no retry_config): review_status NOT set to pending, no resubmission_count increment', async () => {
    reset();
    // Standard first-time submission: no retry_config, no existing submission
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]); // no existing submission
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'First-time submission must still succeed');
    assert.strictEqual(submissionPostCalled, true, 'First-time submission should POST a new submission record');
    // No submission PATCH to reset review_status (no existing submission to update)
    const reviewStatusPatch = capturedSubmissionPatches.find(p => p.review_status !== undefined);
    assert(!reviewStatusPatch, 'First-time submission should not PATCH review_status');
    // Only ONE instance PATCH (settings/status) — no second PATCH for resubmission_count
    const countPatch = capturedInstancePatches.find(p => p.resubmission_count !== undefined);
    assert(!countPatch, 'First-time submission must NOT increment resubmission_count');
  })();

  await test('auto-save (submit: false) with retry_config present: still no submission records or resubmission_count change', async () => {
    reset();
    setupBasicMocks({}, {
      status: 'In Progress',
      settings: {
        retry_config: { revision_mode: true, locked_question_ids: ['q1'], original_answers: { q1: 'A' }, original_score: 100 },
        answers: { q1: 'A', q2: 'B' }
      }
    });
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: 'A', q2: 'C' },
      submit: false // auto-save
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200, 'Auto-save should still succeed with retry_config present');
    assert.strictEqual(submissionGetCalled, false, 'Auto-save must NOT check submissions table');
    assert.strictEqual(submissionPostCalled, false, 'Auto-save must NOT create a submission record');
    assert(!capturedSubmissionPatch, 'Auto-save must NOT PATCH submissions');
    const countPatch = capturedInstancePatches.find(p => p.resubmission_count !== undefined);
    assert(!countPatch, 'Auto-save must NOT increment resubmission_count');
  })();

  // ── Group: Fill-in-Blank Constructed (Counting Money) ─────────────────────
  console.log('\n--- Fill-in-Blank Constructed (Counting Money) ---');

  await test('fill-in-blank: blank answer → scored 0, not in manual bucket', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'constructed', points: 1, meta: { correct: '1.00' } },
      { id: 'item-2', item_ref: 'q2', answer_type: 'constructed', points: 1, meta: { correct: '0.50' } }
    ]);
    // Student only answers q1, leaves q2 blank
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: '1.00' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers, 'submission_answers should be upserted');
    assert.strictEqual(capturedSubAnswers.length, 2, 'Both items must have submission_answer rows');
    const q1 = capturedSubAnswers.find(a => a.assignment_item_id === 'item-1');
    const q2 = capturedSubAnswers.find(a => a.assignment_item_id === 'item-2');
    assert(q1, 'q1 (answered) must be in submission_answers');
    assert.strictEqual(q1.is_correct, true, 'q1=1.00 (correct) must score as correct');
    assert.strictEqual(q1.earned_points, 1);
    assert(q2, 'q2 (blank) must be in submission_answers');
    assert.strictEqual(q2.is_correct, false, 'blank q2 must score as incorrect');
    assert.strictEqual(q2.earned_points, 0, 'blank q2 must earn 0 points');
    assert.deepStrictEqual(q2.raw_answer, { value: '' }, 'blank q2 raw_answer must be empty sentinel');
    // score_total should reflect both items (1 correct out of 2 = 50%)
    const body = JSON.parse(response.body);
    assert.strictEqual(body.score_total, 50, 'score_total should be 50% (1/2 correct)');
  })();

  await test('fill-in-blank: all blank submission → all items scored 0, score_total=0', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    // Simulate a 62-item Counting Money assignment: all fill-in-blank with string correct answers
    const items = Array.from({ length: 62 }, (_, i) => ({
      id: `item-${i + 1}`,
      item_ref: `cm_${i + 1}`,
      answer_type: 'constructed',
      points: 1,
      meta: { correct: (Math.random() * 2).toFixed(2) },
      goal_codes: []
    }));
    fetchHandlers.items = () => makeOkResponse(items);
    // Student submits with NO answers (completely blank)
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: {},
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers, 'submission_answers must be upserted even for blank submission');
    assert.strictEqual(capturedSubAnswers.length, 62, 'All 62 items must have submission_answer rows');
    const allZero = capturedSubAnswers.every(a => a.is_correct === false && a.earned_points === 0);
    assert(allZero, 'All blank items must score 0');
    const body = JSON.parse(response.body);
    assert.strictEqual(body.score_total, 0, 'score_total must be 0 for all-blank submission');
  })();

  await test('fill-in-blank: true writing prompt (no meta.correct) NOT zero-scored', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-wp', item_ref: 'WP_1', answer_type: 'constructed', points: 5, meta: {} }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: {},
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    // True writing prompt with no meta.correct must NOT get a 0-scored row
    // (no submission_answers rows should be written since no answer was provided)
    assert(!capturedSubAnswers || capturedSubAnswers.length === 0,
      'True writing prompt with no meta.correct must NOT get a 0-scored blank row');
  })();

  await test('fill-in-blank: keyword-scored item (array meta.correct) NOT zero-scored', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      {
        id: 'item-kw', item_ref: 'q_kw', answer_type: 'constructed', points: 4,
        meta: { scoring: { keywords: ['DNA', 'RNA'], min_keywords: 1 } },
        goal_codes: []
      }
    ]);
    // Student leaves keyword item blank — should NOT get a 0-row (keyword items have their own path)
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: {},
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(!capturedSubAnswers || capturedSubAnswers.length === 0,
      'Keyword-scored constructed item with blank answer must NOT get a 0-scored blank row');
  })();

  await test('fill-in-blank: revision-mode re-submit does NOT overwrite teacher-graded fill-in-blank rows', async () => {
    reset();
    setupBasicMocks({}, {
      assignment_id: 'assignment-uuid-1',
      status: 'Assigned',
      settings: {
        retry_config: { revision_mode: true, locked_question_ids: [], original_answers: {}, original_score: 50 },
        answers: { q1: '1.00' }
      }
    });
    fetchHandlers.submissionGet = () => makeOkResponse([{ id: 'existing-sub-id' }]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'constructed', points: 1, meta: { correct: '1.00' } },
      { id: 'item-2', item_ref: 'q2', answer_type: 'constructed', points: 1, meta: { correct: '0.50' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { q1: '1.00' }, // q2 still blank on revision re-submit
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    // On revision re-submit, blank fill-in-blank pass is skipped to preserve any teacher grade
    const q2Row = capturedSubAnswers ? capturedSubAnswers.find(a => a.assignment_item_id === 'item-2') : null;
    assert(!q2Row, 'Blank fill-in-blank item must NOT get a 0-row during revision re-submission (preserves teacher grade)');
  })();

  // ── written_response item handling ─────────────────────────────────────────
  console.log('\n--- written_response item handling ---');

  await test('written_response: answer stored with null is_correct and null earned_points (needs manual grading)', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: '1_1', answer_type: 'mcq', points: 1, meta: { correct: 'B' } },
      { id: 'item-25', item_ref: '1_25', answer_type: 'written_response', points: 1, meta: { correct: null, text: 'WRITING PROMPT: Describe your perfect day.' } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { '1_1': 'B', '1_25': 'My perfect day would start with a sunrise...' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    assert(capturedSubAnswers && capturedSubAnswers.length >= 2, 'Both items should have submission_answers');
    const wrAnswer = capturedSubAnswers.find(a => a.assignment_item_id === 'item-25');
    assert(wrAnswer, 'written_response item should have a submission_answer row');
    assert.strictEqual(wrAnswer.is_correct, null, 'written_response should have null is_correct (no auto-grade)');
    assert.strictEqual(wrAnswer.earned_points, null, 'written_response should have null earned_points (needs manual grading)');
    assert.strictEqual(wrAnswer.max_points, 1, 'written_response max_points should equal item.points');
    assert.strictEqual(wrAnswer.raw_answer.value, 'My perfect day would start with a sunrise...', 'Student text preserved');
  })();

  await test('written_response: revision re-submit skips item to preserve teacher grade', async () => {
    reset();
    setupBasicMocks({}, {
      assignment_id: 'assignment-uuid-1',
      status: 'Assigned',
      settings: {
        retry_config: { revision_mode: true, locked_question_ids: [], original_answers: {}, original_score: 50 },
        answers: { '1_25': 'My original essay text.' }
      }
    });
    fetchHandlers.submissionGet = () => makeOkResponse([{ id: 'existing-sub-id' }]);
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-25', item_ref: '1_25', answer_type: 'written_response', points: 1, meta: { correct: null } }
    ]);
    const event = makePostEvent({
      instance_id: 'instance-uuid-1',
      student_code: 'S001',
      answers: { '1_25': 'My original essay text.' },
      submit: true
    });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 200);
    // During revision re-submit, written_response with null scores should be skipped
    const wrRow = capturedSubAnswers ? capturedSubAnswers.find(a => a.assignment_item_id === 'item-25') : null;
    assert(!wrRow, 'written_response item must NOT be re-upserted during revision re-submission (preserves teacher grade)');
  })();

  console.log('\n✓ All student-submit-answer tests passed!');
})();
