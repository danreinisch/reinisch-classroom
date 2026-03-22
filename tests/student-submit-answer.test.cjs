// Unit tests for netlify/functions/student-submit-answer.js
// Tests student answer submission without requiring live Supabase
// Run with: node tests/student-submit-answer.test.cjs

'use strict';

const assert = require('assert');

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
let capturedSubAnswers = null;
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
  capturedSubAnswers = null;
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
    if (options && options.body) capturedInstancePatch = JSON.parse(options.body);
    const h = fetchHandlers.instancePatch;
    return h ? h(urlStr, options) : makeOkResponse([{}]);
  }

  if (urlStr.includes('/assignment_items')) {
    const h = fetchHandlers.items;
    return h ? h(urlStr, options) : makeOkResponse([]);
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

function makePostEvent(body, headers = {}) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
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

  await test('rejects missing student_code with 400', async () => {
    const event = makePostEvent({ instance_id: 'instance-1' });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 400, 'Should return 400 for missing student_code');
    const body = JSON.parse(response.body);
    assert(body.error.includes('student_code'), 'Error should mention student_code');
  })();

  // ── Group: Authentication ──────────────────────────────────────────────────
  console.log('\n--- Authentication ---');

  await test('returns 401 when student code not found', async () => {
    reset();
    fetchHandlers.students = () => makeOkResponse([]); // empty — student not found
    const event = makePostEvent({ instance_id: 'i1', student_code: 'UNKNOWN' });
    const response = await handler(event);
    assert.strictEqual(response.statusCode, 401, 'Should return 401 for unknown student');
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

  console.log('\n✓ All student-submit-answer tests passed!');
})();
