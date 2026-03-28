// Unit tests for case-sensitive keyword scoring
// Tests: scoreConstructed() with case_sensitive flag
// Run with: node tests/keyword-case-sensitive.test.cjs

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
  let minKeywords = 2;

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

function makeItem(keywords, minKeywords, caseSensitive, points) {
  return {
    answer_type: 'constructed',
    points: points || 3,
    scoring: { keywords, min_keywords: minKeywords, case_sensitive: caseSensitive }
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

// ── Case-insensitive (default) ────────────────────────────────────────────────

console.log('\n--- Case-insensitive (default, case_sensitive=false) ---');

test('Case-insensitive: lowercase keywords match uppercase answer', () => {
  const item = makeItem(['dna', 'rna'], 2, false, 2);
  const result = scoreItem(item, 'DNA and RNA are nucleic acids.');
  assert.strictEqual(result.detail.keywords_found, 2, 'Should find 2 keywords');
  assert.strictEqual(result.is_correct, true);
  assert.strictEqual(result.earned_points, 2.00);
});

test('Case-insensitive: uppercase keywords match lowercase answer', () => {
  const item = makeItem(['DNA', 'RNA'], 2, false, 2);
  const result = scoreItem(item, 'dna and rna are important.');
  assert.strictEqual(result.detail.keywords_found, 2, 'Should find 2 keywords case-insensitively');
  assert.strictEqual(result.is_correct, true);
});

test('Case-insensitive: mixed-case student answer matches', () => {
  const item = makeItem(['slope', 'intercept'], 2, false, 3);
  const result = scoreItem(item, 'The SLOPE and Intercept are key.');
  assert.strictEqual(result.detail.keywords_found, 2, 'Should find both keywords');
  assert.strictEqual(result.is_correct, true);
});

// ── Case-sensitive: correct case ──────────────────────────────────────────────

console.log('\n--- Case-sensitive: correct case ---');

test('Case-sensitive: correct case → all found', () => {
  const item = makeItem(['DNA', 'RNA'], 2, true, 2);
  const result = scoreItem(item, 'DNA and RNA are nucleic acids.');
  assert.strictEqual(result.detail.keywords_found, 2, 'Should find 2 keywords with correct case');
  assert.strictEqual(result.is_correct, true);
  assert.strictEqual(result.earned_points, 2.00);
});

test('Case-sensitive: partial correct case → partial credit', () => {
  const item = makeItem(['DNA', 'protein'], 2, true, 2);
  const result = scoreItem(item, 'DNA and Protein are molecules.');
  // "DNA" matches exactly; "Protein" (capital P) ≠ "protein" (lowercase p)
  assert.strictEqual(result.detail.keywords_found, 1, 'Should find only DNA (Protein ≠ protein)');
  assert.strictEqual(result.is_correct, false, 'is_correct=false (1 < min 2)');
  assert.strictEqual(result.earned_points, 1.00, '1/2 keywords = 1pt on 2pt question');
});

// ── Case-sensitive: wrong case ────────────────────────────────────────────────

console.log('\n--- Case-sensitive: wrong case ---');

test('Case-sensitive: wrong case → 0 found', () => {
  const item = makeItem(['DNA', 'RNA'], 2, true, 2);
  const result = scoreItem(item, 'dna and rna are nucleic acids.');
  assert.strictEqual(result.detail.keywords_found, 0, 'Should find 0 keywords (wrong case)');
  assert.strictEqual(result.is_correct, false);
  assert.strictEqual(result.earned_points, 0.00);
});

test('Case-sensitive: mixed case answer does not match wrong-case keywords', () => {
  const item = makeItem(['DNA', 'RNA'], 1, true, 2);
  const result = scoreItem(item, 'Dna and Rna are molecules.');
  assert.strictEqual(result.detail.keywords_found, 0, 'Dna ≠ DNA in case-sensitive mode');
  assert.strictEqual(result.is_correct, false);
});

// ── Case-sensitive: pH scenario ───────────────────────────────────────────────

console.log('\n--- Case-sensitive: pH scenario ---');

test('Case-sensitive: pH matches exactly', () => {
  const item = makeItem(['pH'], 1, true, 1);
  const result = scoreItem(item, 'The pH level is 7.');
  assert.strictEqual(result.detail.keywords_found, 1, 'pH should match exactly');
  assert.strictEqual(result.is_correct, true);
  assert.strictEqual(result.earned_points, 1.00);
});

test('Case-sensitive: PH does not match pH keyword', () => {
  const item = makeItem(['pH'], 1, true, 1);
  const result = scoreItem(item, 'The PH level is 7.');
  assert.strictEqual(result.detail.keywords_found, 0, 'PH should not match pH in case-sensitive mode');
  assert.strictEqual(result.is_correct, false);
  assert.strictEqual(result.earned_points, 0.00);
});

test('Case-insensitive: PH matches pH keyword', () => {
  const item = makeItem(['pH'], 1, false, 1);
  const result = scoreItem(item, 'The PH level is 7.');
  assert.strictEqual(result.detail.keywords_found, 1, 'PH should match pH case-insensitively');
  assert.strictEqual(result.is_correct, true);
});

// ── Case-sensitive: mixed correct/incorrect case ──────────────────────────────

console.log('\n--- Case-sensitive: mixed match scenarios ---');

test('Case-sensitive: "DNA" found but "protein" (lowercase) not matched by "Protein" in answer', () => {
  const item = makeItem(['DNA', 'protein'], 1, true, 2);
  const result = scoreItem(item, 'DNA and Protein are important.');
  // "DNA" is exact match; "protein" in keyword does NOT match "Protein" in answer
  assert.strictEqual(result.detail.keywords_found, 1, 'Only DNA found');
  const found = result.detail.found_list;
  assert.ok(found.includes('DNA'), 'DNA should be in found list');
  assert.ok(!found.includes('protein'), 'protein should not be in found list');
});

test('Case-sensitive: scoreItem with case_sensitive=undefined behaves as case-insensitive', () => {
  // case_sensitive not set → defaults to false (case-insensitive)
  const item = {
    answer_type: 'constructed',
    points: 2,
    scoring: { keywords: ['DNA', 'RNA'], min_keywords: 2 }
  };
  const result = scoreItem(item, 'dna and rna are present.');
  assert.strictEqual(result.detail.keywords_found, 2, 'Without case_sensitive flag, match is case-insensitive');
  assert.strictEqual(result.is_correct, true);
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
