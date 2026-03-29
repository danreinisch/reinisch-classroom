// Tests for IEP goal description enrichment in the AI suggest flow.
// Verifies goal lookup, caching, description resolution, and graceful degradation.
// Run with: node tests/teacher-ai-suggest-goals.test.cjs

'use strict';

const assert = require('assert');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Simulate the ensureGoalsLoaded + goalDescriptions logic extracted from tc-review.js
// so it can be tested in isolation without a browser environment.

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
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Accept': 'application/json',
          }
        }
      );
      if (res.ok) {
        const goals = await res.json();
        _reviewGoalsCache = { studentId, goals: Array.isArray(goals) ? goals : [] };
        return _reviewGoalsCache.goals;
      }
    } catch (err) {
      // graceful degradation — swallow error
    }
    return [];
  }

  function resetCache() { _reviewGoalsCache = null; }

  return { ensureGoalsLoaded, resetCache };
}

function resolveGoalDescriptions(goalCodes, goals) {
  return goalCodes.map(code => {
    const goal = goals.find(g => g.code === code);
    if (!goal) return '';
    const desc = goal.description || goal.desc || '';
    const area = goal.area || goal.skill_area || '';
    return area ? `${area} — ${desc}` : desc;
  }).filter(Boolean);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${t.name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// ── Test: goalDescriptions populated from goals data ─────────────────────────

test('resolves goal descriptions when goals are found', () => {
  const goals = [
    { code: 'M.4.1', description: 'Student will identify slope and intercept', area: 'Math Computation', skill_area: null, desc: null },
    { code: 'ELA.3.2', description: null, desc: 'Student will write topic sentences', area: null, skill_area: 'Writing', },
  ];
  const goalCodes = ['M.4.1', 'ELA.3.2'];
  const result = resolveGoalDescriptions(goalCodes, goals);
  assert.strictEqual(result.length, 2);
  assert.ok(result[0].includes('Math Computation'), 'should include area');
  assert.ok(result[0].includes('identify slope and intercept'), 'should include description');
  assert.ok(result[1].includes('Writing'), 'should use skill_area as fallback');
  assert.ok(result[1].includes('write topic sentences'), 'should use desc field as fallback');
});

test('returns empty array when no matching goals found', () => {
  const goals = [{ code: 'M.4.1', description: 'Some goal', area: 'Math', skill_area: null, desc: null }];
  const goalCodes = ['ELA.9.9'];
  const result = resolveGoalDescriptions(goalCodes, goals);
  assert.strictEqual(result.length, 0, 'should return empty array when codes have no match');
});

test('filters out empty descriptions (goal with no description fields)', () => {
  const goals = [
    { code: 'M.4.1', description: '', area: '', skill_area: '', desc: '' },
  ];
  const goalCodes = ['M.4.1'];
  const result = resolveGoalDescriptions(goalCodes, goals);
  assert.strictEqual(result.length, 0, 'should filter out blank descriptions');
});

test('returns empty array when goalCodes is empty', () => {
  const goals = [{ code: 'M.4.1', description: 'Some goal', area: 'Math', skill_area: null, desc: null }];
  const result = resolveGoalDescriptions([], goals);
  assert.strictEqual(result.length, 0);
});

test('description fallback: uses desc when description is missing', () => {
  const goals = [{ code: 'G.1', description: null, desc: 'Fallback desc', area: 'Science', skill_area: null }];
  const result = resolveGoalDescriptions(['G.1'], goals);
  assert.strictEqual(result.length, 1);
  assert.ok(result[0].includes('Fallback desc'));
});

test('area fallback: uses skill_area when area is missing', () => {
  const goals = [{ code: 'G.1', description: 'My desc', area: null, skill_area: 'Reading', desc: null }];
  const result = resolveGoalDescriptions(['G.1'], goals);
  assert.ok(result[0].startsWith('Reading — '));
});

test('no area: returns description without area prefix', () => {
  const goals = [{ code: 'G.1', description: 'Just a description', area: null, skill_area: null, desc: null }];
  const result = resolveGoalDescriptions(['G.1'], goals);
  assert.strictEqual(result[0], 'Just a description');
});

// ── Test: ensureGoalsLoaded fetch and caching ─────────────────────────────────

test('fetches goals from Supabase and caches them', async () => {
  let fetchCallCount = 0;
  const mockGoals = [
    { code: 'M.4.1', description: 'Identify slope', area: 'Math', skill_area: null, desc: null }
  ];
  const fetchImpl = async (_url, _opts) => {
    fetchCallCount++;
    return { ok: true, json: async () => mockGoals };
  };

  const { ensureGoalsLoaded } = makeEnsureGoalsLoaded({ fetchImpl });
  const result = await ensureGoalsLoaded('student-uuid-1', 'https://example.supabase.co', 'anon-key');

  assert.deepStrictEqual(result, mockGoals);
  assert.strictEqual(fetchCallCount, 1, 'should fetch once');
});

test('reuses cache for the same studentId (no redundant fetches)', async () => {
  let fetchCallCount = 0;
  const mockGoals = [{ code: 'M.4.1', description: 'Identify slope', area: 'Math', skill_area: null, desc: null }];
  const fetchImpl = async () => {
    fetchCallCount++;
    return { ok: true, json: async () => mockGoals };
  };

  const { ensureGoalsLoaded } = makeEnsureGoalsLoaded({ fetchImpl });
  await ensureGoalsLoaded('student-uuid-1', 'https://example.supabase.co', 'anon-key');
  await ensureGoalsLoaded('student-uuid-1', 'https://example.supabase.co', 'anon-key');
  await ensureGoalsLoaded('student-uuid-1', 'https://example.supabase.co', 'anon-key');

  assert.strictEqual(fetchCallCount, 1, 'cache should prevent redundant fetches');
});

test('re-fetches when studentId changes', async () => {
  let fetchCallCount = 0;
  const fetchImpl = async (_url) => {
    fetchCallCount++;
    return { ok: true, json: async () => [] };
  };

  const { ensureGoalsLoaded } = makeEnsureGoalsLoaded({ fetchImpl });
  await ensureGoalsLoaded('student-1', 'https://example.supabase.co', 'key');
  await ensureGoalsLoaded('student-2', 'https://example.supabase.co', 'key');

  assert.strictEqual(fetchCallCount, 2, 'should fetch for each distinct studentId');
});

test('returns empty array when fetch response is not ok', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => [] });
  const { ensureGoalsLoaded } = makeEnsureGoalsLoaded({ fetchImpl });
  const result = await ensureGoalsLoaded('student-1', 'https://example.supabase.co', 'key');
  assert.deepStrictEqual(result, [], 'should degrade gracefully on non-ok response');
});

test('returns empty array when fetch throws (network error)', async () => {
  const fetchImpl = async () => { throw new Error('Network error'); };
  const { ensureGoalsLoaded } = makeEnsureGoalsLoaded({ fetchImpl });
  const result = await ensureGoalsLoaded('student-1', 'https://example.supabase.co', 'key');
  assert.deepStrictEqual(result, [], 'should degrade gracefully on fetch error');
});

test('returns empty array when supabaseUrl or supabaseKey is missing', async () => {
  let fetchCalled = false;
  const fetchImpl = async () => { fetchCalled = true; return { ok: true, json: async () => [] }; };
  const { ensureGoalsLoaded } = makeEnsureGoalsLoaded({ fetchImpl });

  const result1 = await ensureGoalsLoaded('student-1', null, 'key');
  const result2 = await ensureGoalsLoaded('student-1', 'https://example.supabase.co', null);

  assert.deepStrictEqual(result1, []);
  assert.deepStrictEqual(result2, []);
  assert.strictEqual(fetchCalled, false, 'should not fetch when config is missing');
});

// ── Run ───────────────────────────────────────────────────────────────────────

runAll();
