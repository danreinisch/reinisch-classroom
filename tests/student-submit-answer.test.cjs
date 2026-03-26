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
let capturedGoalProgressPosts = [];
let capturedGoalDataPointsPosts = [];
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
  capturedGoalProgressPosts = [];
  capturedGoalDataPointsPosts = [];
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
    assert.strictEqual(gp.assignment_instance_id, 'instance-uuid-1', 'assignment_instance_id should be set');
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

  await test('goal_codes on items take precedence over mappings', async () => {
    reset();
    setupBasicMocks({}, { assignment_id: 'assignment-uuid-1' });
    fetchHandlers.submissionGet = () => makeOkResponse([]);
    // Item already has a goal_code
    fetchHandlers.items = () => makeOkResponse([
      { id: 'item-1', item_ref: 'q1', answer_type: 'mcq', points: 1, meta: { correct: 'A' }, goal_codes: ['READ.1'] }
    ]);
    // Mapping has a different code — should NOT override the existing one
    fetchHandlers.itemMappings = () => makeOkResponse([
      { item_id: 'item-1', goal_codes: ['MATH.1'], dese_codes: [] }
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
    assert.strictEqual(capturedGoalProgressPosts.length, 1, 'goal_progress should use existing item goal_code');
    assert.strictEqual(capturedGoalProgressPosts[0].goal_id, 'goal-read', 'READ.1 (from items) should take precedence over MATH.1 (from mappings)');
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

  console.log('\n✓ All student-submit-answer tests passed!');
})();
