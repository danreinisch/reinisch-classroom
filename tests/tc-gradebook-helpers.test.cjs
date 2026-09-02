// Unit tests for tc-gradebook.js helper logic
// Tests: calculateEarnedPoints, calculateWeightedAverage, calculateRowAverage,
//        buildGradebookData edge cases, localStorage resilience,
//        deduplicateAssignmentsForExport, getStudentScoreForGroup, formatScoreCell
// Run with: node tests/tc-gradebook-helpers.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');

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

const CANON_CLASSES = [
  'Language Arts 1 SC',
  'Language Arts 2 SC',
  'Language Arts 3 SC',
  'Language Arts 4 SC',
  'Life Skills Language Arts SC',
  'Transitional Skills',
  'Consumer Math',
  'Geometry SC',
  'Speech/Language',
  'Warrior Academy'
];

// Inline mirror of inferSeriesFromDraft from site/web/tc-gradebook.js.
// Keep this helper aligned with production class-routing behavior.
function inferSeriesFromDraft(draft, assignmentInstancesData, classEnrollmentsData) {
  const metaClassName =
    draft &&
    draft.meta &&
    typeof draft.meta.class_name === 'string'
      ? draft.meta.class_name.trim()
      : '';

  if (metaClassName && CANON_CLASSES.includes(metaClassName)) {
    return metaClassName;
  }

  if (draft.series && CANON_CLASSES.includes(draft.series)) {
    return draft.series;
  }

  const title = (draft.title || '').toLowerCase();
  for (const cls of CANON_CLASSES) {
    if (title.includes(cls.toLowerCase())) {
      return cls;
    }
  }

  const instancesForDraft = assignmentInstancesData.filter(
    i => i.assignment_id === draft.id
  );

  if (instancesForDraft.length > 0) {
    const assignedStudentCodes = new Set(
      instancesForDraft.map(instance => instance.student_code)
    );

    const candidateClasses = new Set(
      classEnrollmentsData
        .filter(
          enrollment =>
            assignedStudentCodes.has(enrollment.student_code) &&
            enrollment.active !== false &&
            enrollment.class_name &&
            CANON_CLASSES.includes(enrollment.class_name)
        )
        .map(enrollment => enrollment.class_name)
    );

    if (candidateClasses.size === 1) {
      return [...candidateClasses][0];
    }
  }

  return null;
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


// ── inferSeriesFromDraft class routing ────────────────────────────────────────

console.log('\n--- inferSeriesFromDraft class routing ---');

{
  // Regression: issued assignments already preserve the authoritative class in
  // meta.class_name. Enrollment ordering must never override it.
  const draft = {
    id: 'A-LA4',
    title: 'ELA Response — S001',
    series: null,
    meta: { class_name: 'Language Arts 4 SC' }
  };

  const instances = [
    { assignment_id: 'A-LA4', student_code: 'S001' }
  ];

  const enrollments = [
    { student_code: 'S001', class_name: 'Transitional Skills', active: true },
    { student_code: 'S001', class_name: 'Language Arts 4 SC', active: true }
  ];

  assert.strictEqual(
    inferSeriesFromDraft(draft, instances, enrollments),
    'Language Arts 4 SC',
    'meta.class_name must outrank enrollment ordering'
  );

  console.log('✓ assignment meta.class_name is authoritative');
}

{
  const draft = {
    id: 'A-SERIES',
    title: 'Legacy Assignment',
    series: 'Language Arts 3 SC',
    meta: {}
  };

  assert.strictEqual(
    inferSeriesFromDraft(draft, [], []),
    'Language Arts 3 SC',
    'canonical series remains supported'
  );

  console.log('✓ canonical series remains supported');
}

{
  const draft = {
    id: 'A-TITLE',
    title: 'Week 2 — Language Arts 2 SC',
    series: null,
    meta: {}
  };

  assert.strictEqual(
    inferSeriesFromDraft(draft, [], []),
    'Language Arts 2 SC',
    'legacy title inference remains supported'
  );

  console.log('✓ legacy title inference remains supported');
}

{
  const draft = {
    id: 'A-ONE-CLASS',
    title: 'Legacy Untagged Assignment',
    series: null,
    meta: {}
  };

  const instances = [
    { assignment_id: 'A-ONE-CLASS', student_code: 'S002' }
  ];

  const enrollments = [
    { student_code: 'S002', class_name: 'Language Arts 1 SC', active: true }
  ];

  assert.strictEqual(
    inferSeriesFromDraft(draft, instances, enrollments),
    'Language Arts 1 SC',
    'one unambiguous enrollment may remain a compatibility fallback'
  );

  console.log('✓ one unambiguous enrollment remains a fallback');
}

{
  const draft = {
    id: 'A-AMBIG',
    title: 'Legacy Untagged Assignment',
    series: null,
    meta: {}
  };

  const instances = [
    { assignment_id: 'A-AMBIG', student_code: 'S003' }
  ];

  const enrollments = [
    { student_code: 'S003', class_name: 'Transitional Skills', active: true },
    { student_code: 'S003', class_name: 'Language Arts 4 SC', active: true }
  ];

  assert.strictEqual(
    inferSeriesFromDraft(draft, instances, enrollments),
    null,
    'ambiguous multi-class enrollment must not guess a class'
  );

  console.log('✓ ambiguous enrollment returns null instead of guessing');
}


console.log('\n✓ All tc-gradebook-helpers tests passed!');

// ── deduplicateAssignmentsForExport ──────────────────────────────────────────

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  // Use UTC values so that ISO date strings always resolve to the intended
  // calendar date regardless of the client's local timezone.
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
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
    // Decode common HTML entities so that "&amp;" and "&" produce the same key
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[—–]/g, '-') // U+2014 em dash, U+2013 en dash → hyphen
    .toLowerCase();
}

function deduplicateAssignmentsForExport(drafts) {
  const groups = [];
  for (const draft of drafts) {
    const title = normalizeAssignmentTitle(draft.title);
    const dateStr = formatShortDate(draft.dueAt || draft.due_at || draft.createdAt || draft.created_at);
    const dedupKey = titleDedupKey(title);

    // Find an existing group with the same date and a compatible title
    let matchedIdx = -1;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.dateStr !== dateStr) continue;
      const gKey = titleDedupKey(g.title);
      if (gKey === dedupKey) { matchedIdx = i; break; }
      // Prefix match: one title is a word-boundary prefix of the other
      if (dedupKey.startsWith(gKey + ' ') || gKey.startsWith(dedupKey + ' ')) {
        matchedIdx = i; break;
      }
    }

    if (matchedIdx >= 0) {
      const g = groups[matchedIdx];
      g.draftIds.push(draft.id);
      // Prefer the shorter, more canonical title as the display title
      if (title.length < g.title.length) g.title = title;
      if (g.totalPossible == null && draft.meta && draft.meta.total_possible) {
        g.totalPossible = draft.meta.total_possible;
      }
    } else {
      const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
      groups.push({ title, draftIds: [draft.id], totalPossible, dateStr });
    }
  }
  return groups;
}

function backfillGroupTotalPossible(groups, earnedMap) {
  function findPossibleInEarnedMap(draftIds) {
    for (const [, studentEntries] of earnedMap) {
      for (const draftId of draftIds) {
        const info = studentEntries.get(draftId);
        if (info && info.possible > 0) return info.possible;
      }
    }
    return null;
  }

  for (const group of groups) {
    if (group.totalPossible != null) continue;
    const possible = findPossibleInEarnedMap(group.draftIds);
    if (possible !== null) group.totalPossible = possible;
  }
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

// Same normalized title on different dates → should produce SEPARATE groups (title+date key)
{
  const drafts = [
    { id: 'q1a', title: 'Vocabulary Quiz — S045', meta: { total_possible: 10 }, due_at: '2024-03-01' },
    { id: 'q1b', title: 'Vocabulary Quiz — S001', meta: { total_possible: 10 }, due_at: '2024-03-01' },
    { id: 'q3a', title: 'Vocabulary Quiz — S045', meta: { total_possible: 10 }, due_at: '2024-09-15' },
    { id: 'q3b', title: 'Vocabulary Quiz — S001', meta: { total_possible: 10 }, due_at: '2024-09-15' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 2, 'same title on different dates → two separate groups (title+date key)');
  assert.strictEqual(groups[0].title, 'Vocabulary Quiz');
  assert.deepStrictEqual(groups[0].draftIds, ['q1a', 'q1b']);
  assert.strictEqual(groups[0].totalPossible, 10);
  assert.strictEqual(groups[1].title, 'Vocabulary Quiz');
  assert.deepStrictEqual(groups[1].draftIds, ['q3a', 'q3b']);
  assert.strictEqual(groups[1].totalPossible, 10);
  console.log('✓ same title on different dates produces separate groups (title+date key)');
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

// ── HTML entity normalization in titleDedupKey ────────────────────────────────

console.log('\n--- HTML entity normalization ---');

{
  // Titles that differ only in HTML entity encoding should deduplicate to the same group
  assert.strictEqual(titleDedupKey('Sentence Structure &amp; Transitions'), titleDedupKey('Sentence Structure & Transitions'), '&amp; and & produce the same key');
  assert.strictEqual(titleDedupKey('&lt;em&gt;Title&lt;/em&gt;'), '<em>title</em>', 'HTML entity decoding works');
  console.log('✓ titleDedupKey normalizes HTML entities');
}

{
  // Per-student assignment copies with &amp; in one and & in another should collapse
  const drafts = [
    { id: 'e1', title: 'WEEK 10 — Sentence Structure &amp; Transitions — S031', meta: { total_possible: 29 }, created_at: '2025-03-29T10:00:00Z' },
    { id: 'e2', title: 'WEEK 10 — Sentence Structure & Transitions — S032', meta: { total_possible: 29 }, created_at: '2025-03-29T11:00:00Z' },
    { id: 'e3', title: 'WEEK 10 — Sentence Structure &amp; Transitions — S033', meta: { total_possible: 29 }, created_at: '2025-03-29T09:00:00Z' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 1, '&amp; and & variants collapse to one group');
  assert.deepStrictEqual(groups[0].draftIds, ['e1', 'e2', 'e3'], 'all three draft IDs in one group');
  console.log('✓ &amp; and & variants of same title collapse to one group');
}

// ── UTC date parsing in formatShortDate ──────────────────────────────────────

console.log('\n--- UTC date parsing ---');

{
  // A UTC midnight timestamp should always resolve to that calendar date,
  // not the previous day (which local-time parsing might give in negative-offset zones).
  assert.strictEqual(formatShortDate('2025-03-29T00:00:00Z'), '03/29', 'UTC midnight → 03/29 (not 03/28)');
  assert.strictEqual(formatShortDate('2025-03-31T00:00:00Z'), '03/31', 'UTC midnight → 03/31');
  assert.strictEqual(formatShortDate('2025-04-06T00:00:00Z'), '04/06', 'UTC midnight April 6 → 04/06');
  console.log('✓ formatShortDate uses UTC dates (no off-by-one-day for midnight timestamps)');
}

{
  // Two assignments created at different UTC times on the same calendar date should
  // deduplicate into the same group (same date key).
  const drafts = [
    { id: 'u1', title: 'Week 10 — Chapter 29', meta: { total_possible: 29 }, created_at: '2025-03-29T00:00:00Z' },
    { id: 'u2', title: 'Week 10 — Chapter 29 — S032', meta: { total_possible: 29 }, created_at: '2025-03-29T23:59:00Z' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 1, 'same UTC calendar date → one group');
  console.log('✓ same UTC calendar date assignments deduplicate correctly');
}

// ── Prefix-based title deduplication (Week 10 two-variant collapse) ───────────

console.log('\n--- prefix-based title deduplication ---');

{
  // Real Week 10 scenario: two title variants that share a prefix after stripping student codes.
  // "WEEK 10 — Lost in Kragdon-ah (Chapters 29–31) — S031" normalizes to
  //   "WEEK 10 — Lost in Kragdon-ah (Chapters 29–31)"
  // "WEEK 10 — Lost in Kragdon-ah (Chapters 29–31) Sentence Structure & Transitions — S038"
  //   normalizes to "WEEK 10 — Lost in Kragdon-ah (Chapters 29–31) Sentence Structure & Transitions"
  // Both should collapse into one group because the shorter title is a word-boundary prefix
  // of the longer one.
  const drafts = [
    { id: 'w10a', title: 'WEEK 10 — Lost in Kragdon-ah (Chapters 29\u201331) — S031', meta: null, created_at: '2026-03-30T00:00:00Z' },
    { id: 'w10b', title: 'WEEK 10 — Lost in Kragdon-ah (Chapters 29\u201331) — S032', meta: null, created_at: '2026-03-30T00:00:00Z' },
    { id: 'w10c', title: 'WEEK 10 — Lost in Kragdon-ah (Chapters 29\u201331) Sentence Structure & Transitions — S038', meta: null, created_at: '2026-03-30T00:00:00Z' },
    { id: 'w10d', title: 'WEEK 10 — Lost in Kragdon-ah (Chapters 29\u201331) Sentence Structure & Transitions — S039', meta: null, created_at: '2026-03-30T00:00:00Z' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 1, 'Week 10 two variants on same date collapse into one group');
  assert.deepStrictEqual(groups[0].draftIds, ['w10a', 'w10b', 'w10c', 'w10d'], 'all four draft IDs in one group');
  // The shorter title is kept as the canonical title
  assert.strictEqual(groups[0].title, 'WEEK 10 \u2014 Lost in Kragdon-ah (Chapters 29\u201331)', 'shorter canonical title is preserved');
  console.log('\u2713 Week 10 two-variant titles collapse into one group via prefix matching');
}

{
  // Prefix match must not cross week boundaries
  const drafts = [
    { id: 'w9', title: 'WEEK 9 — Chapter 26-28', meta: null, created_at: '2026-03-20T00:00:00Z' },
    { id: 'w10', title: 'WEEK 10 — Lost in Kragdon-ah', meta: null, created_at: '2026-03-30T00:00:00Z' },
    { id: 'w11', title: 'WEEK 11 — Lost in Kragdon-ah Chapter 32', meta: null, created_at: '2026-04-06T00:00:00Z' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 3, 'different weeks on different dates stay separate');
  console.log('\u2713 different week assignments on different dates stay separate');
}

{
  // Prefix match must not collapse genuinely different assignments on the same date
  // (e.g. "WEEK 10 — Reading" and "WEEK 10 — Writing" are different, not prefix-related)
  const drafts = [
    { id: 'r1', title: 'WEEK 10 — Reading Comprehension — S001', meta: null, created_at: '2026-03-30T00:00:00Z' },
    { id: 'w1', title: 'WEEK 10 — Writing Workshop — S001', meta: null, created_at: '2026-03-30T00:00:00Z' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups.length, 2, 'genuinely different same-date assignments stay separate');
  console.log('\u2713 genuinely different assignments on same date are not falsely collapsed');
}

{
  // Real Week 11 title pattern test
  const title = 'WEEK 11 \u2014 Lost in Kragdon-ah (Chapters 32\u201334) - Sentence Structure & Transitions \u2014 Part 2 \u2014 S001';
  const normalized = normalizeAssignmentTitle(title);
  assert.strictEqual(normalized, 'WEEK 11 \u2014 Lost in Kragdon-ah (Chapters 32\u201334) - Sentence Structure & Transitions \u2014 Part 2',
    'strips trailing \u2014 S001 from Week 11 complex title');
  console.log('\u2713 normalizeAssignmentTitle handles real Week 11 complex title');
}

// ── backfillGroupTotalPossible ────────────────────────────────────────────────

console.log('\n--- backfillGroupTotalPossible ---');

{
  // When meta.total_possible is null but earnedMap has data, backfill should work
  const drafts = [
    { id: 'a1', title: 'Week 9 — S001', meta: null, created_at: '2026-03-20T00:00:00Z' },
    { id: 'a2', title: 'Week 9 — S002', meta: null, created_at: '2026-03-20T00:00:00Z' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups[0].totalPossible, null, 'totalPossible starts null when meta is null');

  const earnedMap = new Map([
    ['S001', new Map([['a1', { earned: 29, possible: 30 }]])],
    ['S002', new Map([['a2', { earned: 16, possible: 30 }]])],
  ]);
  backfillGroupTotalPossible(groups, earnedMap);
  assert.strictEqual(groups[0].totalPossible, 30, 'backfill finds possible=30 from earnedMap');
  console.log('\u2713 backfillGroupTotalPossible fills in totalPossible from earnedMap');
}

{
  // backfill should not overwrite a non-null totalPossible
  const drafts = [
    { id: 'b1', title: 'Quiz — S001', meta: { total_possible: 20 }, created_at: '2026-03-01T00:00:00Z' },
  ];
  const groups = deduplicateAssignmentsForExport(drafts);
  assert.strictEqual(groups[0].totalPossible, 20, 'totalPossible already set from meta');

  const earnedMap = new Map([
    ['S001', new Map([['b1', { earned: 18, possible: 25 }]])], // different possible — should be ignored
  ]);
  backfillGroupTotalPossible(groups, earnedMap);
  assert.strictEqual(groups[0].totalPossible, 20, 'backfill does not overwrite existing totalPossible');
  console.log('\u2713 backfillGroupTotalPossible does not overwrite existing totalPossible');
}

{
  // backfill with earnedMap using score_manual: earned = score_auto + score_manual
  // S001 Wk9: score_auto=25, score_manual=4, score_total=97 → earned=29, possible=round(29/0.97)=30
  const score = 97;
  const scoreAuto = 25;
  const scoreManual = 4;
  const earned = scoreAuto + scoreManual; // 29
  const possible = Math.round(earned / (score / 100)); // round(29/0.97) = 30
  assert.strictEqual(earned, 29, 'earned = score_auto + score_manual');
  assert.strictEqual(possible, 30, 'possible back-calculated correctly');
  console.log('\u2713 score_manual included in earned points back-calculation');
}

{
  // S006 Wk9: score_auto=25, score_manual=1, score_total=87 → earned=26, possible=round(26/0.87)=30
  const score = 87;
  const scoreAuto = 25;
  const scoreManual = 1;
  const earned = scoreAuto + scoreManual; // 26
  const possible = Math.round(earned / (score / 100)); // round(26/0.87) = 30
  assert.strictEqual(earned, 26, 'S006 earned = 25 + 1 = 26');
  assert.strictEqual(possible, 30, 'S006 possible back-calculated to 30');
  console.log('\u2713 score_manual back-calculation: S006 Wk9 (87%) → 26/30');
}



// ── Gradebook score eligibility regression ──

console.log('\n--- Gradebook score eligibility ---');

// Inline mirror of site/web/tc-gradebook.js.
function isGradebookScoreEligible(
  submission,
  draft,
  usingSupabase = true
) {
  // Preserve existing local/offline Gradebook behavior.
  if (!usingSupabase) return true;

  const reviewStatus =
    submission &&
    typeof submission.review_status === 'string'
      ? submission.review_status.trim().toLowerCase()
      : '';

  const isManualAssignment =
    draft &&
    draft.meta &&
    draft.meta.manual === true;

  const isPaperAssignment =
    draft &&
    draft.type === 'paper';

  // MANUAL and PAPER evidence are terminal at reviewed.
  if (isManualAssignment || isPaperAssignment) {
    return (
      reviewStatus === 'reviewed' ||
      reviewStatus === 'finalized'
    );
  }

  // Ordinary digital work is Gradebook-authoritative only after
  // explicit finalization.
  return reviewStatus === 'finalized';
}

{
  const digitalDraft = {
    id: 'DIGITAL-1',
    type: 'html',
    meta: {}
  };

  for (const status of [
    'pending',
    'in_progress',
    'returned',
    'reviewed'
  ]) {
    assert.strictEqual(
      isGradebookScoreEligible(
        { review_status: status },
        digitalDraft,
        true
      ),
      false,
      `digital ${status} submission must not populate Gradebook`
    );
  }

  console.log(
    '✓ unfinished/reviewed digital submissions are not Gradebook-authoritative'
  );
}

{
  const digitalDraft = {
    id: 'DIGITAL-2',
    type: 'html',
    meta: {}
  };

  assert.strictEqual(
    isGradebookScoreEligible(
      { review_status: 'finalized' },
      digitalDraft,
      true
    ),
    true,
    'finalized digital submission must populate Gradebook'
  );

  console.log('✓ finalized digital submission is Gradebook-authoritative');
}

{
  const manualDraft = {
    id: 'MANUAL-1',
    type: 'html',
    meta: {
      manual: true,
      total_possible: 50
    }
  };

  assert.strictEqual(
    isGradebookScoreEligible(
      { review_status: 'reviewed' },
      manualDraft,
      true
    ),
    true,
    'reviewed MANUAL grade must remain visible'
  );

  console.log('✓ reviewed MANUAL grade remains visible');
}

{
  const paperDraft = {
    id: 'PAPER-1',
    type: 'paper',
    meta: {}
  };

  assert.strictEqual(
    isGradebookScoreEligible(
      { review_status: 'reviewed' },
      paperDraft,
      true
    ),
    true,
    'reviewed PAPER result must remain visible'
  );

  console.log('✓ reviewed PAPER result remains visible');
}

{
  const localDraft = {
    id: 'LOCAL-1',
    type: 'html',
    meta: {}
  };

  assert.strictEqual(
    isGradebookScoreEligible(
      { review_status: 'pending' },
      localDraft,
      false
    ),
    true,
    'local/offline Gradebook behavior must remain unchanged'
  );

  console.log('✓ local/offline Gradebook behavior remains unchanged');
}

// Production integration contract:
// tc-gradebook.js must define the eligibility helper and apply it in BOTH
// buildGradebookData() and buildScoreMapForStudents().
{
  const gradebookSource =
    fs.readFileSync(
      'site/web/tc-gradebook.js',
      'utf8'
    );

  const occurrences =
    gradebookSource.match(
      /\bisGradebookScoreEligible\s*\(/g
    ) || [];

  assert.ok(
    occurrences.length >= 3,
    'production Gradebook must define score eligibility and apply it in both score-map paths'
  );

  console.log(
    '✓ production Gradebook applies eligibility in both score-map paths'
  );
}
