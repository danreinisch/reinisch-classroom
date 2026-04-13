// Unit tests for tc-gradebook.js helper logic
// Tests: calculateEarnedPoints, calculateWeightedAverage, calculateRowAverage,
//        buildGradebookData edge cases, localStorage resilience,
//        deduplicateAssignmentsForExport, getStudentScoreForGroup, formatScoreCell
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
  // Negative score (unusual but handled — e.g., curved grade or score override).
  // The function does not clamp negative values; callers are responsible for
  // ensuring scores are within a valid range before calling calculateEarnedPoints.
  assert.strictEqual(calculateEarnedPoints(-10, 50), -5, '-10% of 50 = -5 pts');
  console.log('✓ negative score computes without error (callers must validate range)');
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

// ── deduplicateAssignmentsForExport ──────────────────────────────────────────

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function normalizeAssignmentTitle(rawTitle) {
  return (rawTitle || '(untitled)')
    .trim()
    // Remove trailing " — S045", " – S001", " - S044" etc.
    .replace(/\s*[—–-]\s*S\d+\s*$/, '')
    // Remove "for SXXX" or "for SXXX #N" patterns (e.g. "Worksheets for S015", "Worksheets for S015 #1")
    .replace(/\s+for\s+S\d+(\s+#\d+)?\s*$/i, '')
    // Collapse multiple whitespace to single space
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function titleDedupKey(normalizedTitle) {
  return normalizedTitle
    .replace(/[—–]/g, '-')
    .toLowerCase();
}

function deduplicateAssignmentsForExport(drafts) {
  const groups = [];
  const keyMap = new Map(); // title-only dedup key → group index
  for (const draft of drafts) {
    const title = normalizeAssignmentTitle(draft.title);
    const dateStr = formatShortDate(draft.dueAt || draft.due_at || draft.createdAt || draft.created_at);
    const key = titleDedupKey(title);
    if (keyMap.has(key)) {
      const g = groups[keyMap.get(key)];
      g.draftIds.push(draft.id);
      if (g.totalPossible == null && draft.meta && draft.meta.total_possible) {
        g.totalPossible = draft.meta.total_possible;
      }
    } else {
      const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
      keyMap.set(key, groups.length);
      groups.push({ title, draftIds: [draft.id], totalPossible, dateStr });
    }
  }
  return groups;
}

function getStudentScoreForGroup(studentCode, group, scoreMap) {
  const studentScores = scoreMap.get(studentCode);
  if (!studentScores) return null;
  for (const draftId of group.draftIds) {
    if (studentScores.has(draftId)) {
      const score = studentScores.get(draftId);
      if (typeof score === 'number') return score;
    }
  }
  return null;
}

function formatScoreCell(score, totalPossible) {
  if (score === null) return '—';
  if (totalPossible) {
    const earned = Math.round(score * totalPossible / 100);
    return `${earned}/${totalPossible} (${score}%)`;
  }
  return `${score}%`;
}

console.log('\n--- deduplicateAssignmentsForExport ---');

{
  const drafts = [
    { id: 'a1', title: 'WEEK 9 — Chapter 18-20', meta: { total_possible: 20 }, due_at: '2024-03-20' },
    { id: 'a2', title: 'WEEK 9 — Chapter 18-20', meta: { total_possible: 20 }, due_at: '2024-03-20' },
    { id: 'b1', title: 'WEEK 10 — Chapter 21-24', meta: { total_possible: 15 }, due_at: '2024-03-27' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 2, 'two unique titles → two groups');
  assert.strictEqual(groups[0].title, 'WEEK 9 — Chapter 18-20');
  assert.deepStrictEqual(groups[0].draftIds, ['a1', 'a2'], 'both draft IDs in first group');
  assert.strictEqual(groups[0].totalPossible, 20);
  assert.strictEqual(groups[1].title, 'WEEK 10 — Chapter 21-24');
  assert.deepStrictEqual(groups[1].draftIds, ['b1']);
  assert.strictEqual(groups[1].totalPossible, 15);
  console.log('✓ deduplicates by title and collects all draft IDs');
}

{
  const drafts = [
    { id: 'x1', title: '  Trimmed Title  ', meta: null },
    { id: 'x2', title: 'Trimmed Title', meta: { total_possible: 10 } },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 1, 'titles should be trimmed before comparison');
  assert.strictEqual(groups[0].totalPossible, 10, 'picks up total_possible from second draft');
  console.log('✓ trims whitespace from titles and picks up totalPossible from any draft');
}

{
  const groups = deduplicateAssignmentsForExport([]);
  assert.deepStrictEqual(groups, [], 'empty drafts → empty groups');
  console.log('✓ handles empty drafts array');
}

// ── normalizeAssignmentTitle ──────────────────────────────────────────────────

console.log('\n--- normalizeAssignmentTitle ---');

{
  // em dash variants
  assert.strictEqual(normalizeAssignmentTitle('Week 9: Context Clues — S045'), 'Week 9: Context Clues', 'strips em dash + S045');
  assert.strictEqual(normalizeAssignmentTitle('Week 9: Context Clues — S001'), 'Week 9: Context Clues', 'strips em dash + S001');
  assert.strictEqual(normalizeAssignmentTitle('Week 9: Context Clues – S012'), 'Week 9: Context Clues', 'strips en dash + S012');
  assert.strictEqual(normalizeAssignmentTitle('Week 9: Context Clues - S033'), 'Week 9: Context Clues', 'strips hyphen + S033');
  console.log('✓ strips em/en/hyphen-dash student code suffixes');
}

{
  // Titles without suffixes should be unchanged
  assert.strictEqual(normalizeAssignmentTitle('Week 9: Context Clues'), 'Week 9: Context Clues', 'no suffix → unchanged');
  assert.strictEqual(normalizeAssignmentTitle('WEEK 9 — Chapter 18-20'), 'WEEK 9 — Chapter 18-20', 'em dash not followed by S+digits → unchanged');
  assert.strictEqual(normalizeAssignmentTitle('  Trimmed  '), 'Trimmed', 'whitespace trimmed');
  assert.strictEqual(normalizeAssignmentTitle(''), '(untitled)', 'empty string → (untitled)');
  assert.strictEqual(normalizeAssignmentTitle(null), '(untitled)', 'null → (untitled)');
  // Hyphenated word at end (not S###) should NOT be stripped
  assert.strictEqual(normalizeAssignmentTitle('Reading — Context-Clues'), 'Reading — Context-Clues', 'hyphenated word (not S###) → unchanged');
  // Multiple internal whitespace should be collapsed
  assert.strictEqual(normalizeAssignmentTitle('WEEK  9   Chapter'), 'WEEK 9 Chapter', 'multiple internal whitespace collapsed to single space');
  console.log('✓ leaves titles without suffixes unchanged and handles edge cases');
}

// deduplicateAssignmentsForExport with per-student suffixes (the core fix)
{
  const drafts = [
    { id: 'w1', title: 'Week 9: Ch. 26-28 — S045', meta: { total_possible: 20 }, due_at: '2024-03-20' },
    { id: 'w2', title: 'Week 9: Ch. 26-28 — S044', meta: { total_possible: 20 }, due_at: '2024-03-20' },
    { id: 'w3', title: 'Week 9: Ch. 26-28 — S001', meta: { total_possible: 20 }, due_at: '2024-03-20' },
    { id: 'x1', title: 'Week 10: Vocabulary — S045', meta: { total_possible: 10 }, due_at: '2024-03-27' },
    { id: 'x2', title: 'Week 10: Vocabulary — S001', meta: { total_possible: 10 }, due_at: '2024-03-27' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 2, 'three per-student Week 9 drafts → one group; two per-student Week 10 drafts → one group');
  assert.strictEqual(groups[0].title, 'Week 9: Ch. 26-28', 'normalized title strips — S045 suffix');
  assert.deepStrictEqual(groups[0].draftIds, ['w1', 'w2', 'w3'], 'all three Week 9 draft IDs in one group');
  assert.strictEqual(groups[0].totalPossible, 20);
  assert.strictEqual(groups[1].title, 'Week 10: Vocabulary', 'normalized title strips — S045 suffix');
  assert.deepStrictEqual(groups[1].draftIds, ['x1', 'x2'], 'both Week 10 draft IDs in one group');
  console.log('✓ collapses per-student suffixed drafts into one group per assignment');
}

// "for SXXX" mid-title deduplication
{
  const drafts = [
    { id: 'ws1', title: 'Worksheets for S015', meta: { total_possible: 10 }, due_at: '2024-03-20' },
    { id: 'ws2', title: 'Worksheets for S020', meta: { total_possible: 10 }, due_at: '2024-03-20' },
    { id: 'ws3', title: 'Worksheets for S015 #1', meta: { total_possible: 10 }, due_at: '2024-03-20' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 1, 'all "Worksheets for SXXX" variants → one group');
  assert.strictEqual(groups[0].title, 'Worksheets', 'normalized to base title');
  assert.deepStrictEqual(groups[0].draftIds, ['ws1', 'ws2', 'ws3'], 'all three draft IDs in group');
  console.log('✓ collapses "for SXXX" mid-title per-student drafts into one group');
}

// normalizeAssignmentTitle — "for SXXX" variants
{
  assert.strictEqual(normalizeAssignmentTitle('Worksheets for S015'), 'Worksheets', 'strips "for S015"');
  assert.strictEqual(normalizeAssignmentTitle('Worksheets for S020'), 'Worksheets', 'strips "for S020"');
  assert.strictEqual(normalizeAssignmentTitle('Worksheets for S015 #1'), 'Worksheets', 'strips "for S015 #1"');
  assert.strictEqual(normalizeAssignmentTitle('Worksheets for S015 #2'), 'Worksheets', 'strips "for S015 #2"');
  // Should NOT strip "for" when not followed by SXXX
  assert.strictEqual(normalizeAssignmentTitle('Reading for Context'), 'Reading for Context', '"for" not followed by SXXX → unchanged');
  console.log('✓ strips "for SXXX" and "for SXXX #N" mid-title patterns');
}

// Same normalized title on different dates → should merge into ONE group (title-only key)
{
  const drafts = [
    { id: 'q1a', title: 'Vocabulary Quiz — S045', meta: { total_possible: 10 }, due_at: '2024-03-01' },
    { id: 'q1b', title: 'Vocabulary Quiz — S001', meta: { total_possible: 10 }, due_at: '2024-03-01' },
    { id: 'q3a', title: 'Vocabulary Quiz — S045', meta: { total_possible: 10 }, due_at: '2024-09-15' },
    { id: 'q3b', title: 'Vocabulary Quiz — S001', meta: { total_possible: 10 }, due_at: '2024-09-15' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 1, 'same title on different dates → one merged group (title-only key)');
  assert.strictEqual(groups[0].title, 'Vocabulary Quiz');
  assert.deepStrictEqual(groups[0].draftIds, ['q1a', 'q1b', 'q3a', 'q3b']);
  assert.strictEqual(groups[0].totalPossible, 10);
  console.log('✓ same title on different dates merges into one group (title-only key)');
}

console.log('\n--- getStudentScoreForGroup ---');

{
  const scoreMap = new Map([
    ['S001', new Map([['a1', 85], ['b1', 70]])],
    ['S002', new Map([['a2', 90]])],
  ]);
  const group = { draftIds: ['a1', 'a2'] };
  assert.strictEqual(getStudentScoreForGroup('S001', group, scoreMap), 85, 'S001 has score via a1');
  assert.strictEqual(getStudentScoreForGroup('S002', group, scoreMap), 90, 'S002 has score via a2');
  assert.strictEqual(getStudentScoreForGroup('S003', group, scoreMap), null, 'unknown student → null');
  console.log('✓ finds score across any draft ID in the group');
}

{
  const scoreMap = new Map([['S001', new Map()]]);
  const group = { draftIds: ['x1', 'x2'] };
  assert.strictEqual(getStudentScoreForGroup('S001', group, scoreMap), null, 'no matching draft → null');
  console.log('✓ returns null when student has no score for any draft in group');
}

console.log('\n--- formatScoreCell ---');

{
  assert.strictEqual(formatScoreCell(null, 20), '—', 'null score → em dash');
  assert.strictEqual(formatScoreCell(85, 20), '17/20 (85%)', '85% of 20 = 17 pts');
  assert.strictEqual(formatScoreCell(90, 20), '18/20 (90%)', '90% of 20 = 18 pts');
  assert.strictEqual(formatScoreCell(50, 10), '5/10 (50%)', '50% of 10 = 5 pts');
  assert.strictEqual(formatScoreCell(75, null), '75%', 'no totalPossible → percentage only');
  assert.strictEqual(formatScoreCell(100, 0), '100%', 'totalPossible=0 is falsy → percentage only');
  console.log('✓ formatScoreCell formats correctly in all cases');
}

console.log('\n✓ All deduplication export helper tests passed!');

// ── titleDedupKey ──────────────────────────────────────────────────────────────

console.log('\n--- titleDedupKey ---');

{
  assert.strictEqual(titleDedupKey('WEEK 9 — Chapter 18-20'), 'week 9 - chapter 18-20', 'em dash → hyphen, lowercase');
  assert.strictEqual(titleDedupKey('WEEK 9 – Chapter'), 'week 9 - chapter', 'en dash → hyphen, lowercase');
  assert.strictEqual(titleDedupKey('Week 9: Context Clues'), 'week 9: context clues', 'lowercase only');
  console.log('✓ titleDedupKey normalizes dashes and lowercases');
}

// ── case-insensitive deduplication ───────────────────────────────────────────

console.log('\n--- case-insensitive deduplication ---');

{
  const drafts = [
    { id: 'd1', title: 'WEEK 10 — Chapter 29', meta: { total_possible: 20 }, due_at: '2024-03-25' },
    { id: 'd2', title: 'Week 10 — Chapter 29 — S045', meta: { total_possible: 20 }, due_at: '2024-03-25' },
    { id: 'd3', title: 'week 10 – Chapter 29', meta: { total_possible: 20 }, due_at: '2024-03-25' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 1, 'case/dash variants of same title on same date → one group');
  assert.deepStrictEqual(groups[0].draftIds, ['d1', 'd2', 'd3']);
  console.log('✓ case and dash variants collapse to one group');
}

{
  // Multiple internal whitespace variants
  const drafts = [
    { id: 'ws1', title: 'WEEK  9   Sentence  Structure', meta: null, due_at: '2024-03-20' },
    { id: 'ws2', title: 'WEEK 9 Sentence Structure — S045', meta: { total_possible: 10 }, due_at: '2024-03-20' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 1, 'extra whitespace variants collapse to one group');
  assert.strictEqual(groups[0].totalPossible, 10, 'picks up totalPossible from second draft');
  console.log('✓ extra whitespace variants collapse to one group');
}

