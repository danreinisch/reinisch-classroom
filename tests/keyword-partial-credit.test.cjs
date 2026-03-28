// Unit tests for keyword partial credit scoring
// Tests: scoreConstructed() and scoreItem() for constructed answer type
// Run with: node tests/keyword-partial-credit.test.cjs

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
  const answerText = String(studentAnswer).toLowerCase();

  let keywords = [];
  let minKeywords = 2;

  if (item.scoring && item.scoring.keywords) {
    keywords = item.scoring.keywords.map(k => String(k).toLowerCase());
    minKeywords = item.scoring.min_keywords || minKeywords;
  } else if (Array.isArray(item.correct)) {
    keywords = item.correct.map(k => String(k).toLowerCase());
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
    if (answerText.includes(keyword)) {
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

function scoreSubmission(items, studentAnswers) {
  const results = [];
  let totalEarned = 0;
  let totalPossible = 0;
  let correctCount = 0;

  for (const item of items) {
    const studentAnswer = studentAnswers[item.ref];
    const result = scoreItem(item, studentAnswer);
    results.push({ item_ref: item.ref, ...result, raw_answer: studentAnswer });
    totalEarned += result.earned_points;
    totalPossible += result.max_points;
    if (result.is_correct) correctCount++;
  }

  const percentCorrect = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
  return {
    results,
    summary: { total_items: items.length, correct_count: correctCount, total_earned: totalEarned, total_possible: totalPossible, percent_correct: percentCorrect }
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(keywords, minKeywords, points) {
  return {
    answer_type: 'constructed',
    points: points || 3,
    scoring: { keywords, min_keywords: minKeywords }
  };
}

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

// ── scoreItem() — partial credit scenarios ────────────────────────────────────

console.log('\n--- Partial Credit: scoreItem() ---');

test('All keywords found → full credit, is_correct=true', () => {
  const item = makeItem(['slope', 'intercept', 'linear'], 2, 3);
  const result = scoreItem(item, 'The slope and intercept define the linear equation.');
  assert.strictEqual(result.is_correct, true, 'is_correct should be true');
  assert.strictEqual(result.earned_points, 3.00, 'earned_points should be 3.00 (3/3)');
  assert.strictEqual(result.max_points, 3);
});

test('Meets threshold (2/3 found) → is_correct=true, 2.00 points', () => {
  const item = makeItem(['slope', 'intercept', 'linear'], 2, 3);
  const result = scoreItem(item, 'The slope and intercept matter here.');
  assert.strictEqual(result.is_correct, true, 'is_correct should be true (2 >= min 2)');
  assert.strictEqual(result.earned_points, 2.00, 'earned_points should be 2.00 (2/3)');
});

test('Below threshold (1/3 found) → is_correct=false, 1.00 point (partial credit)', () => {
  const item = makeItem(['slope', 'intercept', 'linear'], 2, 3);
  const result = scoreItem(item, 'The slope is steep.');
  assert.strictEqual(result.is_correct, false, 'is_correct should be false (1 < min 2)');
  assert.strictEqual(result.earned_points, 1.00, 'earned_points should be 1.00 (1/3) — partial credit');
});

test('No keywords found → is_correct=false, 0.00 points', () => {
  const item = makeItem(['slope', 'intercept', 'linear'], 2, 3);
  const result = scoreItem(item, 'The graph goes up.');
  assert.strictEqual(result.is_correct, false, 'is_correct should be false');
  assert.strictEqual(result.earned_points, 0.00, 'earned_points should be 0.00');
});

test('Single keyword, found → full credit', () => {
  const item = makeItem(['nucleus'], 1, 3);
  const result = scoreItem(item, 'The nucleus controls the cell.');
  assert.strictEqual(result.is_correct, true, 'is_correct should be true');
  assert.strictEqual(result.earned_points, 3.00, 'earned_points should be 3.00 (1/1)');
});

test('Single keyword, not found → is_correct=false, 0.00 points', () => {
  const item = makeItem(['nucleus'], 1, 3);
  const result = scoreItem(item, 'The cell controls everything.');
  assert.strictEqual(result.is_correct, false, 'is_correct should be false');
  assert.strictEqual(result.earned_points, 0.00, 'earned_points should be 0.00');
});

test('5pt question, 2/4 keywords found → 2.50 points', () => {
  const item = makeItem(['slope', 'intercept', 'linear', 'equation'], 2, 5);
  const result = scoreItem(item, 'The slope and intercept are key concepts.');
  assert.strictEqual(result.is_correct, true, 'is_correct should be true (2 >= min 2)');
  assert.strictEqual(result.earned_points, 2.50, 'earned_points should be 2.50 (2/4 * 5)');
});

// ── scoreConstructed() — ratio field ─────────────────────────────────────────

console.log('\n--- scoreConstructed() ratio field ---');

test('ratio is foundCount / total_keywords', () => {
  const item = makeItem(['slope', 'intercept', 'linear'], 2, 3);
  const result = scoreConstructed(item, 'slope and intercept');
  assert.strictEqual(result.ratio, 2 / 3, 'ratio should be 2/3');
  assert.strictEqual(result.detail.ratio, 2 / 3, 'detail.ratio should match');
  assert.strictEqual(result.detail.total_keywords, 3);
  assert.strictEqual(result.detail.keywords_found, 2);
});

test('ratio is capped at 1.0 even if somehow foundCount > keywords.length', () => {
  // This shouldn't happen naturally but verify the Math.min guard
  const item = makeItem(['slope'], 1, 3);
  const result = scoreConstructed(item, 'slope slope slope');
  assert.ok(result.ratio <= 1.0, 'ratio should never exceed 1.0');
});

test('ratio is 0 when no keywords configured', () => {
  const item = { answer_type: 'constructed', points: 3, scoring: { keywords: [], min_keywords: 1 } };
  const result = scoreConstructed(item, 'any answer');
  assert.strictEqual(result.ratio, 0, 'ratio should be 0 when no keywords');
  assert.strictEqual(result.is_correct, false);
});

// ── is_correct semantic: gates on min_keywords ────────────────────────────────

console.log('\n--- is_correct vs earned_points independence ---');

test('is_correct=true when foundCount >= min', () => {
  const item = makeItem(['slope', 'intercept', 'linear'], 2, 3);
  const result = scoreItem(item, 'slope and intercept are the focus');
  assert.strictEqual(result.is_correct, true, 'is_correct=true when 2 >= min 2');
  assert.strictEqual(result.earned_points, 2.00);
});

test('is_correct=false but earned_points > 0 when foundCount < min', () => {
  const item = makeItem(['slope', 'intercept', 'linear'], 2, 3);
  const result = scoreItem(item, 'slope is the key');
  assert.strictEqual(result.is_correct, false, 'is_correct=false when 1 < min 2');
  assert.strictEqual(result.earned_points, 1.00, 'should still earn partial credit');
});

// ── scoreSubmission() — fractional earned_points sum ────────────────────────

console.log('\n--- scoreSubmission() with fractional points ---');

test('scoreSubmission correctly sums fractional earned_points', () => {
  const items = [
    { ref: 'q1', answer_type: 'constructed', points: 3, scoring: { keywords: ['slope', 'intercept', 'linear'], min_keywords: 2 } },
    { ref: 'q2', answer_type: 'constructed', points: 4, scoring: { keywords: ['nucleus', 'membrane', 'mitochondria', 'cytoplasm'], min_keywords: 2 } }
  ];
  const studentAnswers = {
    q1: 'The slope and intercept define the line.',   // 2/3 → 2.00 pts
    q2: 'The nucleus controls the cell membrane.'     // 2/4 → 2.00 pts
  };
  const { summary } = scoreSubmission(items, studentAnswers);
  assert.strictEqual(summary.total_earned, 4.00, 'total should be 2.00 + 2.00 = 4.00');
  assert.strictEqual(summary.total_possible, 7, '3 + 4 = 7');
});

test('scoreSubmission handles mix of partial and full credit', () => {
  const items = [
    { ref: 'q1', answer_type: 'constructed', points: 3, scoring: { keywords: ['slope', 'intercept', 'linear'], min_keywords: 2 } },
    { ref: 'q2', answer_type: 'constructed', points: 3, scoring: { keywords: ['slope', 'intercept', 'linear'], min_keywords: 2 } }
  ];
  const studentAnswers = {
    q1: 'slope intercept linear', // 3/3 → 3.00
    q2: 'slope only'              // 1/3 → 1.00
  };
  const { summary } = scoreSubmission(items, studentAnswers);
  assert.strictEqual(summary.total_earned, 4.00);
  assert.strictEqual(summary.correct_count, 1, 'only q1 is is_correct (q2 found < min 2)');
});

// ── Edge cases ────────────────────────────────────────────────────────────────

console.log('\n--- Edge cases ---');

test('Empty answer → 0 points, no error', () => {
  const item = makeItem(['slope', 'intercept'], 1, 3);
  const result = scoreItem(item, '');
  assert.strictEqual(result.earned_points, 0);
  assert.strictEqual(result.is_correct, false);
  assert.strictEqual(result.detail.reason, 'no_answer');
});

test('Keywords from item.correct array (no scoring config)', () => {
  const item = { answer_type: 'constructed', points: 2, correct: ['slope', 'intercept'] };
  const result = scoreItem(item, 'slope matters');
  // 1/2 found, ratio = 0.5, min defaults to 2
  assert.strictEqual(result.earned_points, 1.00, '1/2 keywords = 1pt on 2pt question');
  assert.strictEqual(result.is_correct, false, 'is_correct=false since 1 < min 2');
});

test('Case-insensitive keyword matching', () => {
  const item = makeItem(['Slope', 'Intercept'], 1, 2);
  const result = scoreItem(item, 'The SLOPE determines steepness.');
  assert.strictEqual(result.earned_points, 1.00, '1/2 keywords found case-insensitively');
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
