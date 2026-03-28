// Unit tests for html-manifest-to-items.js helper logic
// Tests: manifestQuestionsToItems, summarizeItems
// Run with: node tests/html-manifest-to-items.test.cjs

'use strict';

const assert = require('assert');

// ── Inline helpers (mirror web/html-manifest-to-items.js) ────────────────────

function manifestQuestionsToItems(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }
  var items = [];
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    if (!q.q_ref) {
      continue;
    }
    items.push({
      ref: q.q_ref,
      answer_type: q.answer_type || 'constructed',
      points: (typeof q.points === 'number') ? q.points : 1,
      correct: (q.correct !== undefined && q.correct !== null) ? q.correct : null,
      dese_codes: Array.isArray(q.dese_codes) ? q.dese_codes : [],
      goal_codes: Array.isArray(q.default_goal_codes) ? q.default_goal_codes : [],
      scoring: q.scoring || {},
      notes: q.label || ''
    });
  }
  return items;
}

function summarizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      total_items: 0,
      total_points: 0,
      type_breakdown: {},
      has_dese: false,
      has_goals: false,
      coverage: 0
    };
  }
  var total_points = 0;
  var type_breakdown = {};
  var has_dese = false;
  var has_goals = false;
  var mapped_count = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    total_points += (typeof item.points === 'number') ? item.points : 1;
    var atype = item.answer_type || 'constructed';
    type_breakdown[atype] = (type_breakdown[atype] || 0) + 1;
    if (Array.isArray(item.dese_codes) && item.dese_codes.length > 0) {
      has_dese = true;
    }
    if (Array.isArray(item.goal_codes) && item.goal_codes.length > 0) {
      has_goals = true;
    }
    if (item.correct !== null && item.correct !== undefined) {
      mapped_count++;
    }
  }
  return {
    total_items: items.length,
    total_points: total_points,
    type_breakdown: type_breakdown,
    has_dese: has_dese,
    has_goals: has_goals,
    coverage: Math.round((mapped_count / items.length) * 100)
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;

console.log('--- manifestQuestionsToItems ---');

// Test 1: Basic conversion of a full question with all fields
{
  const questions = [{
    q_ref: 'Q1',
    label: 'What is 2 + 2?',
    skill_tags: [],
    points: 2,
    default_goal_codes: ['MATH.1'],
    dese_codes: ['MA.8.EE.1'],
    correct: 'B',
    answer_type: 'mcq',
    per_student_overrides: {}
  }];
  const items = manifestQuestionsToItems(questions);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].ref, 'Q1');
  assert.strictEqual(items[0].answer_type, 'mcq');
  assert.strictEqual(items[0].points, 2);
  assert.strictEqual(items[0].correct, 'B');
  assert.deepStrictEqual(items[0].dese_codes, ['MA.8.EE.1']);
  assert.deepStrictEqual(items[0].goal_codes, ['MATH.1']);
  assert.deepStrictEqual(items[0].scoring, {});
  assert.strictEqual(items[0].notes, 'What is 2 + 2?');
  console.log('  ✓ Full question with all fields converts correctly');
  passed++;
}

// Test 2: Conversion of a question with only q_ref (all defaults)
{
  const questions = [{ q_ref: 'Q2' }];
  const items = manifestQuestionsToItems(questions);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].ref, 'Q2');
  assert.strictEqual(items[0].answer_type, 'constructed');
  assert.strictEqual(items[0].points, 1);
  assert.strictEqual(items[0].correct, null);
  assert.deepStrictEqual(items[0].dese_codes, []);
  assert.deepStrictEqual(items[0].goal_codes, []);
  assert.deepStrictEqual(items[0].scoring, {});
  assert.strictEqual(items[0].notes, '');
  console.log('  ✓ Question with only q_ref uses all defaults');
  passed++;
}

// Test 3: Questions with falsy q_ref are skipped
{
  const questions = [
    { q_ref: 'Q1', label: 'Valid', points: 1 },
    { q_ref: '', label: 'No ref', points: 1 },
    { q_ref: null, label: 'Null ref', points: 1 },
    { q_ref: undefined, label: 'Undefined ref', points: 1 },
    { q_ref: 'Q5', label: 'Also valid', points: 1 }
  ];
  const items = manifestQuestionsToItems(questions);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].ref, 'Q1');
  assert.strictEqual(items[1].ref, 'Q5');
  console.log('  ✓ Questions with falsy q_ref are skipped');
  passed++;
}

// Test 4: Empty input returns empty output
{
  assert.deepStrictEqual(manifestQuestionsToItems([]), []);
  assert.deepStrictEqual(manifestQuestionsToItems(null), []);
  assert.deepStrictEqual(manifestQuestionsToItems(undefined), []);
  assert.deepStrictEqual(manifestQuestionsToItems('not an array'), []);
  console.log('  ✓ Empty/invalid input returns empty array');
  passed++;
}

console.log('--- summarizeItems ---');

// Test 5: summarizeItems returns correct counts
{
  const items = [
    { ref: 'Q1', answer_type: 'mcq', points: 2, correct: 'B', dese_codes: ['MA.8.EE.1'], goal_codes: ['MATH.1'], scoring: {}, notes: 'Q1' },
    { ref: 'Q2', answer_type: 'mcq', points: 1, correct: 'A', dese_codes: [], goal_codes: [], scoring: {}, notes: 'Q2' },
    { ref: 'Q3', answer_type: 'constructed', points: 3, correct: null, dese_codes: [], goal_codes: ['READ.1'], scoring: {}, notes: 'Q3' }
  ];
  const summary = summarizeItems(items);
  assert.strictEqual(summary.total_items, 3);
  assert.strictEqual(summary.total_points, 6);
  assert.deepStrictEqual(summary.type_breakdown, { mcq: 2, constructed: 1 });
  assert.strictEqual(summary.has_dese, true);
  assert.strictEqual(summary.has_goals, true);
  assert.strictEqual(summary.coverage, 67); // 2/3 have non-null correct
  console.log('  ✓ summarizeItems returns correct counts');
  passed++;
}

// Test 6: summarizeItems with empty items
{
  const summary = summarizeItems([]);
  assert.strictEqual(summary.total_items, 0);
  assert.strictEqual(summary.total_points, 0);
  assert.deepStrictEqual(summary.type_breakdown, {});
  assert.strictEqual(summary.has_dese, false);
  assert.strictEqual(summary.has_goals, false);
  assert.strictEqual(summary.coverage, 0);
  console.log('  ✓ summarizeItems handles empty array correctly');
  passed++;
}

// Test 7: scoring is passed through from q.scoring when present
{
  const questions = [{
    q_ref: 'Q5',
    label: 'Fill in blank',
    skill_tags: [],
    points: 1,
    default_goal_codes: ['MATH.1'],
    dese_codes: ['MA.8.EE.1'],
    correct: ['slope', 'intercept'],
    answer_type: 'constructed',
    scoring: { keywords: ['slope', 'intercept'], min_keywords: 2 },
    per_student_overrides: {}
  }];
  const items = manifestQuestionsToItems(questions);
  assert.deepStrictEqual(items[0].scoring, { keywords: ['slope', 'intercept'], min_keywords: 2 });
  assert.deepStrictEqual(items[0].correct, ['slope', 'intercept']);
  console.log('  ✓ scoring is passed through from q.scoring when present');
  passed++;
}

// Test 8: scoring defaults to {} when q.scoring is absent
{
  const questions = [{ q_ref: 'Q1', answer_type: 'mcq', correct: 'B', points: 1, default_goal_codes: [], label: 'Q1' }];
  const items = manifestQuestionsToItems(questions);
  assert.deepStrictEqual(items[0].scoring, {});
  console.log('  ✓ scoring defaults to {} when q.scoring is absent');
  passed++;
}

console.log(`\nAll ${passed} tests passed.`);
