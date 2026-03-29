// Unit tests verifying min_keywords default alignment
// Verifies that scoreConstructed() defaults min_keywords to 1 (not 2)
// Run with: node tests/keyword-scoring-defaults.test.cjs

'use strict';

const assert = require('assert');

// ── Inline scoring functions (mirrors web/assignment-scoring.js) ──────────────

function scoreItem(item, studentAnswer) {
  const maxPoints = item.points || 1;

  if (studentAnswer === null || studentAnswer === undefined || studentAnswer === '') {
    return {
      is_correct: false,
      earned_points: 0,
      max_points: maxPoints,
      detail: { reason: 'no_answer' }
    };
  }

  switch (item.answer_type) {
    case 'constructed': {
      const constructedResult = scoreConstructed(item, studentAnswer);
      return {
        is_correct: constructedResult.is_correct,
        earned_points: Math.round(maxPoints * constructedResult.ratio * 100) / 100,
        max_points: maxPoints,
        detail: { type: 'constructed', ...constructedResult.detail }
      };
    }
    default:
      return {
        is_correct: false,
        earned_points: 0,
        max_points: maxPoints,
        detail: { reason: 'unknown_type', type: item.answer_type }
      };
  }
}

function scoreConstructed(item, studentAnswer) {
  const caseSensitive = item.scoring?.case_sensitive === true;
  const answerText = caseSensitive
    ? String(studentAnswer)
    : String(studentAnswer).toLowerCase();

  let keywords = [];
  let minKeywords = 1;

  if (item.scoring && item.scoring.keywords) {
    keywords = item.scoring.keywords.map(k => String(k));
    minKeywords = item.scoring.min_keywords || minKeywords;
  } else if (Array.isArray(item.correct)) {
    keywords = item.correct.map(k => String(k));
  }

  if (keywords.length === 0) {
    return {
      is_correct: false,
      ratio: 0,
      detail: {
        reason: 'no_keywords_configured',
        keywords_found: 0,
        keywords_required: minKeywords,
        ratio: 0
      }
    };
  }

  let foundCount = 0;
  const foundKeywords = [];

  for (const keyword of keywords) {
    const kw = caseSensitive ? keyword : keyword.toLowerCase();
    if (answerText.includes(kw)) {
      foundCount++;
      foundKeywords.push(keyword);
    }
  }

  const ratio = keywords.length > 0 ? Math.min(1, foundCount / keywords.length) : 0;
  const isCorrect = foundCount >= minKeywords;

  return {
    is_correct: isCorrect,
    ratio,
    detail: {
      keywords_found: foundCount,
      keywords_required: minKeywords,
      total_keywords: keywords.length,
      found_list: foundKeywords,
      ratio
    }
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── Default min_keywords tests ────────────────────────────────────────────────

console.log('\n--- Default min_keywords = 1 ---');

test('When min_keywords not specified, scoreConstructed() uses default of 1', () => {
  const item = {
    answer_type: 'constructed',
    points: 3,
    scoring: { keywords: ['slope', 'intercept', 'linear'] }
  };
  const result = scoreConstructed(item, 'slope is important');
  assert.strictEqual(result.detail.keywords_required, 1, 'default min_keywords should be 1');
});

test('1 keyword found out of 3, no min_keywords specified → is_correct=true (default=1)', () => {
  const item = {
    answer_type: 'constructed',
    points: 3,
    scoring: { keywords: ['slope', 'intercept', 'linear'] }
  };
  const result = scoreItem(item, 'The slope is important.');
  assert.strictEqual(result.is_correct, true, '1 found >= default min of 1 → is_correct=true');
  assert.strictEqual(result.earned_points, 1.00, '1/3 keywords = 1pt on 3pt question');
});

test('0 keywords found, no min_keywords specified → is_correct=false', () => {
  const item = {
    answer_type: 'constructed',
    points: 3,
    scoring: { keywords: ['slope', 'intercept', 'linear'] }
  };
  const result = scoreItem(item, 'The graph goes up and to the right.');
  assert.strictEqual(result.is_correct, false, '0 found < default min of 1 → is_correct=false');
  assert.strictEqual(result.earned_points, 0.00, '0/3 keywords = 0pts');
});

test('Explicit min_keywords=2 still overrides default: 1 found → is_correct=false', () => {
  const item = {
    answer_type: 'constructed',
    points: 3,
    scoring: { keywords: ['slope', 'intercept', 'linear'], min_keywords: 2 }
  };
  const result = scoreItem(item, 'The slope is important.');
  assert.strictEqual(result.is_correct, false, '1 found < explicit min 2 → is_correct=false');
  assert.strictEqual(result.earned_points, 1.00, 'partial credit still earned');
});

test('Explicit min_keywords=2: 2 found → is_correct=true', () => {
  const item = {
    answer_type: 'constructed',
    points: 3,
    scoring: { keywords: ['slope', 'intercept', 'linear'], min_keywords: 2 }
  };
  const result = scoreItem(item, 'slope and intercept define the line');
  assert.strictEqual(result.is_correct, true, '2 found >= explicit min 2 → is_correct=true');
});

test('item.correct array with no scoring config: 1 found → is_correct=true (default=1)', () => {
  const item = { answer_type: 'constructed', points: 2, correct: ['slope', 'intercept'] };
  const result = scoreItem(item, 'slope matters');
  assert.strictEqual(result.is_correct, true, '1 found >= default min 1 → is_correct=true');
  assert.strictEqual(result.earned_points, 1.00, '1/2 keywords = 1pt on 2pt question');
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
