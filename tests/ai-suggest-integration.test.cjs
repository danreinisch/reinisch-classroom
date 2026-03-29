// Integration tests for AI-assisted grading — end-to-end data flow.
// Covers: full flow with/without IEP goals, score clamping, graceful degradation,
// rubric tier generation, and response format validation.
// Run with: node tests/ai-suggest-integration.test.cjs

'use strict';

const assert = require('assert');
const crypto = require('crypto');

// ── JWT helper (mirrors auth.js sign()) ───────────────────────────────────────

function makeTeacherToken(secret, role = 'teacher') {
  const b64url = (buf) =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jsonb64 = (obj) => b64url(JSON.stringify(obj));
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { role, username: 'testteacher', iat: now, exp: now + 3600 };
  const data = `${jsonb64(header)}.${jsonb64(payload)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

// ── Backend handler setup ─────────────────────────────────────────────────────

const SESSION_SECRET = 'test-session-secret-32-chars-long!!';
const OPENAI_API_KEY = 'sk-test-fake-key';
const validToken = makeTeacherToken(SESSION_SECRET);

const mockHttpLib = {
  generateRequestId: () => 'test-req-id',
  jsonResponse: (_event, status, body) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
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
  validateBodySize: (_body, _maxKb) => ({ valid: true }),
  safeJsonParse: (str) => {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

const realAuth = require('../netlify/functions/_lib/auth');

// Inject mocks before loading handler
require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: realAuth };

process.env.SESSION_SECRET = SESSION_SECRET;
process.env.OPENAI_API_KEY = OPENAI_API_KEY;

const { handler } = require('../netlify/functions/teacher-ai-suggest');

// ── Frontend logic helpers (extracted from tc-review.js for standalone testing) ──

/**
 * Mirrors generateRubricTiers() from tc-review.js.
 */
function generateRubricTiers(maxPoints) {
  if (maxPoints === 5) {
    return [
      { points: 5, label: 'Exemplary', desc: 'Thorough, evidence-based' },
      { points: 4, label: 'Proficient', desc: 'Clear, mostly complete' },
      { points: 3, label: 'Developing', desc: 'Adequate, lacks detail' },
      { points: 2, label: 'Beginning', desc: 'Partial understanding' },
      { points: 1, label: 'Minimal', desc: 'Attempted but incomplete' },
      { points: 0, label: 'No response', desc: 'No response / off-topic' },
    ];
  } else if (maxPoints === 3) {
    return [
      { points: 3, label: 'Complete', desc: 'Full understanding demonstrated' },
      { points: 2, label: 'Partial', desc: 'Some understanding shown' },
      { points: 1, label: 'Minimal', desc: 'Limited understanding' },
      { points: 0, label: 'No response', desc: 'No response / off-topic' },
    ];
  } else {
    const tiers = [];
    for (let i = maxPoints; i >= 0; i--) {
      if (i === maxPoints) {
        tiers.push({ points: i, label: 'Full credit', desc: 'Meets all requirements' });
      } else if (i === 0) {
        tiers.push({ points: 0, label: 'No response', desc: 'No response / off-topic' });
      } else {
        tiers.push({ points: i, label: `${i}/${maxPoints}`, desc: 'Partial credit' });
      }
    }
    return tiers;
  }
}

/**
 * Mirrors resolveGoalDescriptions logic from handleAiSuggest() in tc-review.js.
 */
function resolveGoalDescriptions(goalCodes, goals) {
  return goalCodes.map(code => {
    const goal = goals.find(g => g.code === code);
    if (!goal) return '';
    const desc = goal.description || goal.desc || '';
    const area = goal.area || goal.skill_area || '';
    return area ? `${area} — ${desc}` : desc;
  }).filter(Boolean);
}

/**
 * Mirrors ensureGoalsLoaded() from tc-review.js.
 */
function makeEnsureGoalsLoaded({ fetchImpl } = {}) {
  let _reviewGoalsCache = null;

  async function ensureGoalsLoaded(studentId, supabaseUrl, supabaseKey) {
    if (_reviewGoalsCache && _reviewGoalsCache.studentId === studentId) {
      return _reviewGoalsCache.goals;
    }
    if (!supabaseUrl || !supabaseKey) return [];
    try {
      const res = await fetchImpl(
        `${supabaseUrl}/rest/v1/goals?student_id=eq.${encodeURIComponent(studentId)}&select=code,description,area,skill_area,desc`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Accept: 'application/json',
          },
        }
      );
      if (res.ok) {
        const goals = await res.json();
        _reviewGoalsCache = { studentId, goals: Array.isArray(goals) ? goals : [] };
        return _reviewGoalsCache.goals;
      }
    } catch (_err) {
      // graceful degradation
    }
    return [];
  }

  return { ensureGoalsLoaded };
}

// ── Test runner ───────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
  console.log('Running ai-suggest-integration tests...\n');
  let failed = 0;
  for (const { name, fn } of tests) {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.OPENAI_API_KEY = OPENAI_API_KEY;
    global.fetch = null;
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      console.error(`✗ ${name}`);
      console.error('  Error:', e.message);
      if (e.stack) console.error('  Stack:', e.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  }
  console.log('\n✓ All ai-suggest-integration tests passed!');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function authedEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', cookie: `tc=${validToken}` },
    body: JSON.stringify(body),
  };
}

function makeOpenAiResponse(content, status = 200) {
  return async (_url, _opts) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    text: async () => JSON.stringify({ error: 'OpenAI error' }),
  });
}

// ── Test 1: Full flow with IEP goals ─────────────────────────────────────────

test('full flow with IEP goals — payload includes goal_codes and goal_descriptions', async () => {
  // Simulate the goals cache loaded from Supabase
  const goalsInCache = [
    { code: 'M.4.1', description: 'Student will identify slope and intercept', area: 'Math Computation', skill_area: null, desc: null },
    { code: 'ELA.3.2', description: null, desc: 'Student will write topic sentences', area: null, skill_area: 'Writing' },
  ];

  // Simulate item with goal_codes
  const item = { id: 'item-1', points: 5, item_ref: 'Q6', goal_codes: ['M.4.1', 'ELA.3.2'] };
  const goalCodes = item.goal_codes;

  // Resolve descriptions the same way handleAiSuggest does
  const goalDescriptions = resolveGoalDescriptions(goalCodes, goalsInCache);

  assert.strictEqual(goalCodes.length, 2, 'should have 2 goal codes');
  assert.strictEqual(goalDescriptions.length, 2, 'should have 2 resolved descriptions');
  assert.ok(goalDescriptions[0].includes('Math Computation'), 'first description should include area');
  assert.ok(goalDescriptions[0].includes('slope and intercept'), 'first description should include text');
  assert.ok(goalDescriptions[1].includes('Writing'), 'second description should include skill_area');

  // Now call the backend handler with the assembled payload
  let capturedPrompt = null;
  global.fetch = async (_url, opts) => {
    capturedPrompt = JSON.parse(opts.body).messages[0].content;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ suggested_score: 4, suggested_note: 'Good work.', rationale: 'Met goal.' }) } }],
      }),
    };
  };

  const rubricTiers = generateRubricTiers(item.points);
  const res = await handler(authedEvent({
    student_response: 'The slope is 2 and the y-intercept is 3.',
    rubric_tiers: rubricTiers,
    max_points: item.points,
    item_label: item.item_ref,
    goal_codes: goalCodes,
    goal_descriptions: goalDescriptions,
  }));

  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);

  // Verify the prompt included goal context
  assert.ok(capturedPrompt !== null, 'fetch should have been called');
  assert.ok(capturedPrompt.includes('M.4.1'), 'prompt should include goal code');
  assert.ok(capturedPrompt.includes('IEP Goal'), 'prompt should mention IEP Goal');
  assert.ok(capturedPrompt.includes('slope and intercept'), 'prompt should include goal description');
});

// ── Test 2: Full flow without IEP goals ──────────────────────────────────────

test('full flow without IEP goals — payload sends empty arrays', async () => {
  // Item with no goal_codes
  const item = { id: 'item-2', points: 3, item_ref: 'Q2', goal_codes: [] };
  const goalCodes = item.goal_codes || [];
  const goalDescriptions = resolveGoalDescriptions(goalCodes, []);

  assert.strictEqual(goalCodes.length, 0, 'goal_codes should be empty');
  assert.strictEqual(goalDescriptions.length, 0, 'goal_descriptions should be empty');

  let capturedPayload = null;
  global.fetch = async (_url, opts) => {
    capturedPayload = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ suggested_score: 2, suggested_note: 'Partial answer.', rationale: 'Missing key details.' }) } }],
      }),
    };
  };

  const rubricTiers = generateRubricTiers(item.points);
  const res = await handler(authedEvent({
    student_response: 'The slope is steep.',
    rubric_tiers: rubricTiers,
    max_points: item.points,
    item_label: item.item_ref,
    goal_codes: goalCodes,
    goal_descriptions: goalDescriptions,
  }));

  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);

  // Verify no IEP section appears in the prompt when no goals are present
  const prompt = capturedPayload.messages[0].content;
  assert.ok(!prompt.includes('IEP Goal'), 'prompt should not mention IEP Goal when none mapped');
});

// ── Test 3: Score clamping round-trip ─────────────────────────────────────────

test('score clamping — backend clamps score > max_points to max_points', async () => {
  global.fetch = makeOpenAiResponse({ suggested_score: 99, suggested_note: 'Perfect.', rationale: 'Score too high.' });

  const res = await handler(authedEvent({
    student_response: 'A well-written answer.',
    rubric_tiers: generateRubricTiers(5),
    max_points: 5,
    item_label: 'Q1',
    goal_codes: [],
    goal_descriptions: [],
  }));

  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.suggested_score, 5, 'score should be clamped to max_points (5)');
});

test('score clamping — backend clamps negative score to 0', async () => {
  global.fetch = makeOpenAiResponse({ suggested_score: -5, suggested_note: 'No attempt.', rationale: 'Negative.' });

  const res = await handler(authedEvent({
    student_response: 'No answer provided.',
    rubric_tiers: generateRubricTiers(3),
    max_points: 3,
    item_label: 'Q2',
    goal_codes: [],
    goal_descriptions: [],
  }));

  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.suggested_score, 0, 'score should be clamped to 0');
});

// ── Test 4: Graceful degradation when goals fetch fails ───────────────────────

test('graceful degradation — goals fetch failure does not block AI suggest', async () => {
  // Simulate Supabase failing
  const failingFetch = async () => { throw new Error('Network error'); };
  const { ensureGoalsLoaded } = makeEnsureGoalsLoaded({ fetchImpl: failingFetch });

  const goals = await ensureGoalsLoaded('student-1', 'https://example.supabase.co', 'anon-key');
  assert.deepStrictEqual(goals, [], 'should return empty array on fetch failure');

  // With empty goals, the AI suggest should still work
  const goalDescriptions = resolveGoalDescriptions(['M.4.1'], goals);
  assert.deepStrictEqual(goalDescriptions, [], 'should have no descriptions when goals unavailable');

  global.fetch = makeOpenAiResponse({ suggested_score: 3, suggested_note: 'Good attempt.', rationale: 'Partial credit.' });

  const res = await handler(authedEvent({
    student_response: 'The slope is the ratio of rise to run.',
    rubric_tiers: generateRubricTiers(5),
    max_points: 5,
    item_label: 'Q6',
    goal_codes: ['M.4.1'],
    goal_descriptions: [], // empty due to failed fetch
  }));

  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.suggested_score, 3);
});

// ── Test 5: Rubric tier generation ────────────────────────────────────────────

test('generateRubricTiers — produces valid tiers for max_points=1', () => {
  const tiers = generateRubricTiers(1);
  assert.ok(Array.isArray(tiers), 'should return an array');
  assert.ok(tiers.length >= 2, 'should have at least 2 tiers');
  for (const tier of tiers) {
    assert.ok('points' in tier, 'tier should have points field');
    assert.ok('label' in tier, 'tier should have label field');
    assert.ok('desc' in tier, 'tier should have desc field');
    assert.ok(typeof tier.points === 'number', 'tier.points should be a number');
    assert.ok(typeof tier.label === 'string' && tier.label.length > 0, 'tier.label should be a non-empty string');
    assert.ok(typeof tier.desc === 'string' && tier.desc.length > 0, 'tier.desc should be a non-empty string');
  }
  // max tier should equal max_points
  assert.strictEqual(tiers[0].points, 1);
  // min tier should be 0
  assert.strictEqual(tiers[tiers.length - 1].points, 0);
});

test('generateRubricTiers — produces valid tiers for max_points=3', () => {
  const tiers = generateRubricTiers(3);
  assert.strictEqual(tiers.length, 4, 'should produce exactly 4 tiers for max_points=3');
  assert.strictEqual(tiers[0].points, 3);
  assert.strictEqual(tiers[0].label, 'Complete');
  assert.strictEqual(tiers[tiers.length - 1].points, 0);
  for (const tier of tiers) {
    assert.ok('points' in tier && 'label' in tier && 'desc' in tier, 'each tier should have points, label, desc');
  }
});

test('generateRubricTiers — produces valid tiers for max_points=5', () => {
  const tiers = generateRubricTiers(5);
  assert.strictEqual(tiers.length, 6, 'should produce exactly 6 tiers for max_points=5');
  assert.strictEqual(tiers[0].label, 'Exemplary');
  assert.strictEqual(tiers[tiers.length - 1].points, 0);
  for (const tier of tiers) {
    assert.ok('points' in tier && 'label' in tier && 'desc' in tier, 'each tier should have points, label, desc');
  }
});

test('generateRubricTiers — produces valid tiers for max_points=10', () => {
  const tiers = generateRubricTiers(10);
  assert.strictEqual(tiers.length, 11, 'should produce 11 tiers (0 through 10) for max_points=10');
  assert.strictEqual(tiers[0].points, 10);
  assert.strictEqual(tiers[0].label, 'Full credit');
  assert.strictEqual(tiers[tiers.length - 1].points, 0);
  for (const tier of tiers) {
    assert.ok('points' in tier && 'label' in tier && 'desc' in tier, 'each tier should have points, label, desc');
  }
});

// ── Test 6: Response format validation ────────────────────────────────────────

test('response format — backend returns { ok, suggested_score, suggested_note, rationale }', async () => {
  const suggestion = {
    suggested_score: 4,
    suggested_note: 'Good explanation of slope.',
    rationale: 'Correct definition provided.',
  };
  global.fetch = makeOpenAiResponse(suggestion);

  const res = await handler(authedEvent({
    student_response: 'The slope is 2, meaning it rises 2 units for every 1 unit run.',
    rubric_tiers: generateRubricTiers(5),
    max_points: 5,
    item_label: 'Q3',
    goal_codes: [],
    goal_descriptions: [],
  }));

  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);

  assert.strictEqual(body.ok, true, 'ok should be true');
  assert.ok(typeof body.suggested_score === 'number', 'suggested_score should be a number');
  assert.ok(typeof body.suggested_note === 'string', 'suggested_note should be a string');
  assert.ok(typeof body.rationale === 'string', 'rationale should be a string');
  assert.strictEqual(body.suggested_score, 4);
  assert.strictEqual(body.suggested_note, 'Good explanation of slope.');
  assert.strictEqual(body.rationale, 'Correct definition provided.');
});

test('response format — suggested_score is always a number within [0, max_points]', async () => {
  const maxPoints = 5;
  const testCases = [
    { input: 3, expected: 3 },
    { input: 0, expected: 0 },
    { input: 5, expected: 5 },
    { input: 10, expected: 5 },  // clamped to max
    { input: -1, expected: 0 },  // clamped to 0
  ];

  for (const { input, expected } of testCases) {
    global.fetch = makeOpenAiResponse({ suggested_score: input, suggested_note: 'Note.', rationale: 'Reason.' });
    const res = await handler(authedEvent({
      student_response: 'Some response.',
      rubric_tiers: generateRubricTiers(maxPoints),
      max_points: maxPoints,
      item_label: 'Q1',
      goal_codes: [],
      goal_descriptions: [],
    }));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.suggested_score, expected, `input ${input} should clamp to ${expected}`);
  }
});

// ── Run ───────────────────────────────────────────────────────────────────────

runAll();
