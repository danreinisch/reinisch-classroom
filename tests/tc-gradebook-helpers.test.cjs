// Unit tests for tc-gradebook.js helper logic
// Tests: calculateEarnedPoints, calculateWeightedAverage, calculateRowAverage,
//        buildGradebookData edge cases, localStorage resilience
// Run with: node tests/tc-gradebook-helpers.test.cjs

'use strict';

const assert = require('assert');

// ── Inline helpers (mirror site/web/tc-gradebook.js) ─────────────────────────

function calculateEarnedPoints(score, totalPossible) {
  if (typeof score !== 'number' || typeof totalPossible !== 'number') return 0;
  if (!Number.isFinite(score) || !Number.isFinite(totalPossible)) return 0;
  if (totalPossible === 0) return 0;
  return Math.round(score * totalPossible / 100);
}

function scoreColorClass(score) {
  if (score == null || isNaN(score)) return '';
  if (score >= 80) return 'gb-score-green';
  if (score >= 60) return 'gb-score-amber';
  return 'gb-score-red';
}

function getAssignmentCategory(draft) {
  if (!draft || typeof draft !== 'object') return 'assignment';
  const type = draft.type;
  if (typeof type !== 'string' || !type.trim()) return 'assignment';
  return type.toLowerCase();
}

const DEFAULT_WEIGHTS = { assignment: 1.0, quiz: 1.5, test: 2.0, project: 2.0 };

function getCategoryWeights(stored) {
  // `stored` is the raw string from localStorage (or null)
  const defaults = { ...DEFAULT_WEIGHTS };
  if (!stored) return defaults;
  try {
    const parsed = JSON.parse(stored);
    const validated = { ...defaults };
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
        validated[key] = val;
      }
    }
    return validated;
  } catch {
    return defaults;
  }
}

function calculateRowAverage(studentCode, scoreMap, drafts) {
  const studentScores = scoreMap.get(studentCode);
  if (!studentScores) return null;
  const scores = [];
  for (const draft of drafts) {
    if (studentScores.has(draft.id)) {
      const score = studentScores.get(draft.id);
      if (typeof score === 'number') scores.push(score);
    }
  }
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function calculateWeightedAverage(studentCode, scoreMap, drafts, weights) {
  const studentScores = scoreMap.get(studentCode);
  if (!studentScores) return null;

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const draft of drafts) {
    if (studentScores.has(draft.id)) {
      const score = studentScores.get(draft.id);
      if (typeof score === 'number') {
        const category = getAssignmentCategory(draft);
        const weight = weights[category] !== undefined ? weights[category] : 1.0;
        totalWeightedScore += score * weight;
        totalWeight += weight;
      }
    }
  }

  if (totalWeight === 0) return null;
  const result = totalWeightedScore / totalWeight;
  if (!Number.isFinite(result)) return null;
  return Math.round(result);
}

// Simulate readDrafts validation
function readDrafts(raw) {
  try {
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(item => typeof item === 'object' && item !== null && !Array.isArray(item));
  } catch {
    return [];
  }
}

// ── calculateEarnedPoints ─────────────────────────────────────────────────────

console.log('--- calculateEarnedPoints ---');

{
  // Normal case
  assert.strictEqual(calculateEarnedPoints(80, 50), 40, '80% of 50 = 40');
  console.log('✓ 80% of 50 pts = 40 pts');
}

{
  assert.strictEqual(calculateEarnedPoints(100, 25), 25, '100% of 25 = 25');
  console.log('✓ 100% of 25 pts = 25 pts');
}

{
  assert.strictEqual(calculateEarnedPoints(33, 30), 10, '33% of 30 rounds to 10');
  console.log('✓ 33% of 30 pts rounds to 10 pts');
}

{
  // totalPossible === 0 — must not divide by zero
  assert.strictEqual(calculateEarnedPoints(80, 0), 0, 'totalPossible=0 should return 0');
  console.log('✓ totalPossible=0 returns 0 (no division by zero)');
}

{
  // Non-numeric score
  assert.strictEqual(calculateEarnedPoints('80', 50), 0, 'string score should return 0');
  assert.strictEqual(calculateEarnedPoints(null, 50), 0, 'null score should return 0');
  assert.strictEqual(calculateEarnedPoints(undefined, 50), 0, 'undefined score should return 0');
  console.log('✓ non-numeric score returns 0');
}

{
  // Non-numeric totalPossible
  assert.strictEqual(calculateEarnedPoints(80, '50'), 0, 'string totalPossible should return 0');
  assert.strictEqual(calculateEarnedPoints(80, null), 0, 'null totalPossible should return 0');
  console.log('✓ non-numeric totalPossible returns 0');
}

{
  // Infinity / NaN inputs
  assert.strictEqual(calculateEarnedPoints(Infinity, 50), 0, 'Infinity score returns 0');
  assert.strictEqual(calculateEarnedPoints(NaN, 50), 0, 'NaN score returns 0');
  assert.strictEqual(calculateEarnedPoints(80, Infinity), 0, 'Infinity totalPossible returns 0');
  assert.strictEqual(calculateEarnedPoints(80, NaN), 0, 'NaN totalPossible returns 0');
  console.log('✓ Infinity/NaN inputs return 0');
}

{
  // Negative score (unusual but valid — e.g., curved grade)
  // Should not throw; just compute the (potentially negative) result
  assert.strictEqual(calculateEarnedPoints(-10, 50), -5, '-10% of 50 = -5 pts');
  console.log('✓ negative score computes without error');
}

// ── calculateWeightedAverage ──────────────────────────────────────────────────

console.log('\n--- calculateWeightedAverage ---');

{
  // Normal case — multiple categories
  const scoreMap = new Map([
    ['STU001', new Map([
      ['assign1', 90],
      ['quiz1', 80],
      ['test1', 70]
    ])]
  ]);
  const drafts = [
    { id: 'assign1', type: 'assignment' },
    { id: 'quiz1', type: 'quiz' },
    { id: 'test1', type: 'test' }
  ];
  const weights = { assignment: 1.0, quiz: 1.5, test: 2.0, project: 2.0 };
  // (90*1 + 80*1.5 + 70*2) / (1+1.5+2) = (90+120+140)/4.5 = 350/4.5 ≈ 77.78 → 78
  const result = calculateWeightedAverage('STU001', scoreMap, drafts, weights);
  assert.strictEqual(result, 78, `expected 78, got ${result}`);
  console.log('✓ multi-category weighted average computes correctly');
}

{
  // Single category
  const scoreMap = new Map([['STU002', new Map([['a1', 85]])]]);
  const drafts = [{ id: 'a1', type: 'quiz' }];
  const weights = { assignment: 1.0, quiz: 1.5, test: 2.0, project: 2.0 };
  assert.strictEqual(calculateWeightedAverage('STU002', scoreMap, drafts, weights), 85);
  console.log('✓ single-category weighted average equals raw score');
}

{
  // Student not in scoreMap
  const scoreMap = new Map();
  const result = calculateWeightedAverage('MISSING', scoreMap, [], { assignment: 1.0 });
  assert.strictEqual(result, null, 'missing student returns null');
  console.log('✓ missing student returns null');
}

{
  // Empty drafts → totalWeight === 0 → returns null
  const scoreMap = new Map([['STU003', new Map()]]);
  const result = calculateWeightedAverage('STU003', scoreMap, [], { assignment: 1.0 });
  assert.strictEqual(result, null, 'empty drafts returns null');
  console.log('✓ empty drafts (totalWeight=0) returns null');
}

{
  // All-zero weights → totalWeight === 0 → returns null (no division by zero)
  const scoreMap = new Map([['STU004', new Map([['a1', 75]])]]);
  const drafts = [{ id: 'a1', type: 'assignment' }];
  const weights = { assignment: 0 };
  const result = calculateWeightedAverage('STU004', scoreMap, drafts, weights);
  assert.strictEqual(result, null, 'zero weight returns null');
  console.log('✓ all-zero weights returns null (no division by zero)');
}

{
  // NaN scores should be skipped (typeof NaN === 'number' is true, but we test the guard)
  const scoreMap = new Map([['STU005', new Map([['a1', null], ['a2', 80]])]]);
  const drafts = [{ id: 'a1', type: 'assignment' }, { id: 'a2', type: 'assignment' }];
  const weights = { assignment: 1.0 };
  // null score should be skipped (typeof null !== 'number')
  const result = calculateWeightedAverage('STU005', scoreMap, drafts, weights);
  assert.strictEqual(result, 80, 'null scores are skipped');
  console.log('✓ null scores are skipped in weighted average');
}

{
  // Malformed draft (no type) — getAssignmentCategory should return 'assignment'
  const scoreMap = new Map([['STU006', new Map([['a1', 60]])]]);
  const drafts = [{ id: 'a1' /* no type */ }];
  const weights = { assignment: 1.0 };
  assert.doesNotThrow(() => calculateWeightedAverage('STU006', scoreMap, drafts, weights));
  assert.strictEqual(calculateWeightedAverage('STU006', scoreMap, drafts, weights), 60);
  console.log('✓ malformed draft (no type) defaults to assignment category');
}

// ── calculateRowAverage ───────────────────────────────────────────────────────

console.log('\n--- calculateRowAverage ---');

{
  // Normal case
  const scoreMap = new Map([
    ['STU001', new Map([['a1', 90], ['a2', 70], ['a3', 80]])]
  ]);
  const drafts = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
  assert.strictEqual(calculateRowAverage('STU001', scoreMap, drafts), 80);
  console.log('✓ row average computes correctly');
}

{
  // No scores for student
  const scoreMap = new Map([['STU002', new Map()]]);
  assert.strictEqual(calculateRowAverage('STU002', scoreMap, [{ id: 'a1' }]), null);
  console.log('✓ no scores returns null');
}

{
  // All null scores should return null
  const scoreMap = new Map([['STU003', new Map([['a1', null], ['a2', null]])]]);
  const drafts = [{ id: 'a1' }, { id: 'a2' }];
  assert.strictEqual(calculateRowAverage('STU003', scoreMap, drafts), null);
  console.log('✓ all-null scores returns null');
}

{
  // Student not in map
  assert.strictEqual(calculateRowAverage('GHOST', new Map(), []), null);
  console.log('✓ student not in map returns null');
}

// ── getAssignmentCategory ─────────────────────────────────────────────────────

console.log('\n--- getAssignmentCategory ---');

{
  assert.strictEqual(getAssignmentCategory({ type: 'Quiz' }), 'quiz', 'lowercased');
  assert.strictEqual(getAssignmentCategory({ type: 'TEST' }), 'test', 'lowercased');
  assert.strictEqual(getAssignmentCategory({ type: 'assignment' }), 'assignment');
  console.log('✓ valid type is lowercased');
}

{
  assert.strictEqual(getAssignmentCategory({}), 'assignment', 'missing type defaults to assignment');
  assert.strictEqual(getAssignmentCategory({ type: '' }), 'assignment', 'empty type defaults');
  assert.strictEqual(getAssignmentCategory({ type: '   ' }), 'assignment', 'whitespace-only type defaults');
  console.log('✓ missing/empty type defaults to assignment');
}

{
  assert.strictEqual(getAssignmentCategory(null), 'assignment', 'null draft defaults');
  assert.strictEqual(getAssignmentCategory(undefined), 'assignment', 'undefined draft defaults');
  assert.strictEqual(getAssignmentCategory('bad'), 'assignment', 'non-object draft defaults');
  console.log('✓ malformed draft (null/non-object) defaults to assignment');
}

// ── getCategoryWeights (localStorage resilience) ──────────────────────────────

console.log('\n--- getCategoryWeights localStorage resilience ---');

{
  // Valid stored weights — should be used
  const stored = JSON.stringify({ assignment: 1.5, quiz: 2.0, test: 3.0, project: 2.5 });
  const result = getCategoryWeights(stored);
  assert.strictEqual(result.assignment, 1.5);
  assert.strictEqual(result.quiz, 2.0);
  assert.strictEqual(result.test, 3.0);
  console.log('✓ valid stored weights are loaded');
}

{
  // Null stored — returns defaults
  const result = getCategoryWeights(null);
  assert.deepStrictEqual(result, DEFAULT_WEIGHTS);
  console.log('✓ null stored value returns defaults');
}

{
  // Corrupted JSON — returns defaults
  const result = getCategoryWeights('not-valid-json{{{');
  assert.deepStrictEqual(result, DEFAULT_WEIGHTS);
  console.log('✓ corrupted JSON returns defaults');
}

{
  // Partially invalid weights — valid ones kept, invalid ones fall back to defaults
  const stored = JSON.stringify({ assignment: 'not-a-number', quiz: 2.0, test: Infinity, project: -1 });
  const result = getCategoryWeights(stored);
  // assignment: invalid string → falls back to default 1.0
  assert.strictEqual(result.assignment, 1.0, 'string weight falls back to default');
  // quiz: valid → kept
  assert.strictEqual(result.quiz, 2.0, 'valid weight is kept');
  // test: Infinity is NOT finite → falls back to default 2.0
  assert.strictEqual(result.test, 2.0, 'Infinity weight falls back to default');
  // project: -1 is negative — per spec val >= 0 so exactly 0 passes, but -1 fails
  assert.strictEqual(result.project, 2.0, 'negative weight falls back to default');
  console.log('✓ partially invalid weights fall back to defaults per-entry');
}

{
  // Zero weight is valid (>= 0 check)
  const stored = JSON.stringify({ assignment: 0 });
  const result = getCategoryWeights(stored);
  assert.strictEqual(result.assignment, 0, 'zero weight is valid');
  console.log('✓ zero weight is accepted (valid boundary)');
}

// ── readDrafts resilience ─────────────────────────────────────────────────────

console.log('\n--- readDrafts localStorage resilience ---');

{
  // Valid array of objects
  const raw = JSON.stringify([{ id: 'a1', title: 'Test 1' }, { id: 'a2', title: 'Test 2' }]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].id, 'a1');
  console.log('✓ valid drafts array is returned');
}

{
  // Non-array top-level value
  const raw = JSON.stringify({ id: 'a1' }); // object, not array
  const result = readDrafts(raw);
  assert.deepStrictEqual(result, [], 'non-array returns empty array');
  console.log('✓ non-array JSON returns empty array');
}

{
  // Array with mixed types — non-objects are filtered out
  const raw = JSON.stringify([
    { id: 'a1', title: 'Valid' },
    null,
    'string-entry',
    42,
    [1, 2, 3], // nested array — should be filtered
    { id: 'a2', title: 'Also Valid' }
  ]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 2, 'only plain objects survive filter');
  assert.strictEqual(result[0].id, 'a1');
  assert.strictEqual(result[1].id, 'a2');
  console.log('✓ non-object entries (null, string, number, array) are filtered out');
}

{
  // Corrupted JSON
  const result = readDrafts('{not json at all[[[');
  assert.deepStrictEqual(result, [], 'corrupted JSON returns empty array');
  console.log('✓ corrupted JSON returns empty array');
}

{
  // Empty/null raw value
  assert.deepStrictEqual(readDrafts(null), [], 'null raw returns empty array');
  assert.deepStrictEqual(readDrafts(''), [], 'empty string returns empty array');
  console.log('✓ null/empty raw returns empty array');
}

// ── scoreColorClass ───────────────────────────────────────────────────────────

console.log('\n--- scoreColorClass ---');

{
  assert.strictEqual(scoreColorClass(95), 'gb-score-green');
  assert.strictEqual(scoreColorClass(80), 'gb-score-green');
  assert.strictEqual(scoreColorClass(79), 'gb-score-amber');
  assert.strictEqual(scoreColorClass(60), 'gb-score-amber');
  assert.strictEqual(scoreColorClass(59), 'gb-score-red');
  assert.strictEqual(scoreColorClass(0), 'gb-score-red');
  console.log('✓ score color thresholds are correct');
}

{
  assert.strictEqual(scoreColorClass(null), '', 'null returns empty string');
  assert.strictEqual(scoreColorClass(undefined), '', 'undefined returns empty string');
  assert.strictEqual(scoreColorClass(NaN), '', 'NaN returns empty string');
  console.log('✓ null/undefined/NaN return empty string');
}

console.log('\n✓ All tc-gradebook-helpers tests passed!');
