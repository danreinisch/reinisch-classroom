// Unit tests for tc-library.js: PR 7 smart automation features
// Tests: suggestTags(), findSimilarAssignments(), getSuggestedFinalizations(),
//        nudge banner, duplicate detection UI, auto-tag suggestions
// Run with: node tests/tc-library-pr7.test.cjs

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ── Read source file ───────────────────────────────────────────────────────────

const SOURCE_PATH = path.join(__dirname, '..', 'site', 'web', 'tc-library.js');
const src = fs.readFileSync(SOURCE_PATH, 'utf8');

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \u2717 ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── Mirror helpers for unit testing ──────────────────────────────────────────

const CATALOG_STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'from', 'this', 'that', 'have', 'will', 'been', 'then', 'them', 'they', 'each', 'were', 'some', 'such', 'when', 'your', 'week', 'chapter', 'chapters', 'day', 'days', 'part']);
const extractCatalogKeywords = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4 && !CATALOG_STOP_WORDS.has(w));

const AUTOTAG_PATTERNS = [
  { pattern: /\bweek\s*(\d+)\b/i,      tag: m => `week-${m[1]}` },
  { pattern: /\bquiz\b/i,              tag: () => 'quiz' },
  { pattern: /\btest\b/i,              tag: () => 'test' },
  { pattern: /\bessay\b/i,             tag: () => 'essay' },
  { pattern: /\bvocabulary\b/i,        tag: () => 'vocabulary' },
  { pattern: /\breading\b/i,           tag: () => 'reading' },
  { pattern: /\bwriting\b/i,           tag: () => 'writing' },
  { pattern: /\bhomework\b/i,          tag: () => 'homework' },
  { pattern: /\bproject\b/i,           tag: () => 'project' },
  { pattern: /\bpresentation\b/i,      tag: () => 'presentation' },
  { pattern: /\bworksheet\b/i,         tag: () => 'worksheet' },
  { pattern: /\breview\b/i,            tag: () => 'review' },
  { pattern: /\bpractice\b/i,          tag: () => 'practice' },
  { pattern: /\bjournal\b/i,           tag: () => 'journal' },
  { pattern: /\bassessment\b/i,        tag: () => 'assessment' },
];

const CANON_CLASSES = [
  'Language Arts 1 SC', 'Language Arts 2 SC', 'Language Arts 3 SC', 'Language Arts 4 SC',
  'Life Skills Language Arts SC', 'Life Skills', 'Consumer Math', 'Geometry SC',
  'Speech/Language', 'Warrior Academy'
];

function suggestTags(title) {
  if (!title || typeof title !== 'string') return [];
  try {
    const tags = new Set();
    for (const { pattern, tag } of AUTOTAG_PATTERNS) {
      const m = title.match(pattern);
      if (m) tags.add(tag(m).toLowerCase());
    }
    const lc = title.toLowerCase();
    CANON_CLASSES.forEach(cls => {
      const significant = cls.toLowerCase().split(/\s+/).filter(w => w.length >= 4 && !CATALOG_STOP_WORDS.has(w));
      if (significant.length > 0 && significant.some(w => lc.includes(w))) {
        tags.add(cls.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
      }
    });
    return [...tags];
  } catch (_e) {
    return [];
  }
}

function _normalizeTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function _normalizeWeekRef(t) {
  const ordinals = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
  let r = t.replace(/\bwk\.?\s*(\d+)\b/gi, 'week $1')
           .replace(/\bw(\d+)\b/gi, 'week $1');
  ordinals.forEach((word, n) => {
    r = r.replace(new RegExp(`\\bweek\\s+${word}\\b`, 'gi'), `week ${n}`);
  });
  return r;
}

function findSimilarAssignments(title, excludeId, assignmentsData) {
  if (!title || !assignmentsData || assignmentsData.length === 0) return [];
  try {
    const norm = _normalizeWeekRef(_normalizeTitle(title));
    const titleKws = new Set(extractCatalogKeywords(norm));
    const results = [];
    for (const a of assignmentsData) {
      if (a.id === excludeId) continue;
      if (!a.title) continue;
      const aNorm = _normalizeWeekRef(_normalizeTitle(a.title));
      if (aNorm === norm) {
        results.push({ assignment: a, similarity: 'high', reason: 'Identical title (after normalization)' });
        continue;
      }
      if (titleKws.size === 0) continue;
      const aKws = new Set(extractCatalogKeywords(aNorm));
      if (aKws.size === 0) continue;
      const intersection = [...titleKws].filter(w => aKws.has(w));
      const union = new Set([...titleKws, ...aKws]);
      const jaccard = intersection.length / union.size;
      if (jaccard >= 0.6) {
        results.push({ assignment: a, similarity: 'medium', reason: `Similar keywords (${Math.round(jaccard * 100)}% match)` });
      }
    }
    return results;
  } catch (_e) {
    return [];
  }
}

// ── Issue #13: getSuggestedFinalizations ──────────────────────────────────────

console.log('\n--- Issue #13: getSuggestedFinalizations (source checks) ---');

test('getSuggestedFinalizations function exists in source', () => {
  assert.ok(src.includes('function getSuggestedFinalizations('), 'getSuggestedFinalizations not found');
});

test('getSuggestedFinalizations uses staleDays and longActiveDays parameters', () => {
  const fnIdx = src.indexOf('function getSuggestedFinalizations(');
  const fnSection = src.slice(fnIdx, fnIdx + 2000);
  assert.ok(fnSection.includes('staleDays') && fnSection.includes('longActiveDays'),
    'getSuggestedFinalizations missing staleDays/longActiveDays parameters');
});

test('dismissedSuggestions flag declared at module level', () => {
  assert.ok(src.includes('let dismissedSuggestions = false'), 'dismissedSuggestions flag not found');
});

test('_activeTabSuggestionsChecked flag declared at module level', () => {
  assert.ok(src.includes('let _activeTabSuggestionsChecked = false'), '_activeTabSuggestionsChecked not found');
});

test('nudge banner appears in renderActiveTab', () => {
  const fnIdx = src.indexOf('function renderActiveTab(');
  assert.ok(fnIdx !== -1, 'renderActiveTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes('dismissedSuggestions'), 'Nudge banner not wired to dismissedSuggestions');
  assert.ok(fnSection.includes('getSuggestedFinalizations'), 'Nudge banner does not call getSuggestedFinalizations');
});

test('nudge banner text includes "may be ready to finalize"', () => {
  assert.ok(src.includes('may be ready to finalize'), 'Nudge banner text missing');
});

test('nudge banner has Review & Finalize button', () => {
  assert.ok(src.includes('Review & Finalize') || src.includes('Review &amp; Finalize'),
    '"Review & Finalize" button text not found');
});

test('nudge banner has Dismiss link', () => {
  assert.ok(src.includes('dismissedSuggestions = true'), 'Dismiss logic not found');
});

test('nudge banner has Finalize Selected button', () => {
  assert.ok(src.includes('Finalize Selected'), '"Finalize Selected" button text not found');
});

test('getSuggestedFinalizations filters by lane === current', () => {
  const fnIdx = src.indexOf('function getSuggestedFinalizations(');
  const fnSection = src.slice(fnIdx, fnIdx + 2000);
  assert.ok(fnSection.includes("'current'"), 'getSuggestedFinalizations does not filter by current lane');
});

test('getSuggestedFinalizations handles 0 instances gracefully', () => {
  const fnIdx = src.indexOf('function getSuggestedFinalizations(');
  const fnSection = src.slice(fnIdx, fnIdx + 2000);
  assert.ok(fnSection.includes('instanceCount === 0'), 'No guard for 0-instance case');
});

// ── Issue #14: suggestTags ────────────────────────────────────────────────────

console.log('\n--- Issue #14: suggestTags function ---');

test('suggestTags function exists in source', () => {
  assert.ok(src.includes('function suggestTags('), 'suggestTags function not found');
});

test('AUTOTAG_PATTERNS constant defined in source', () => {
  assert.ok(src.includes('const AUTOTAG_PATTERNS'), 'AUTOTAG_PATTERNS not found');
});

test('suggestTags: quiz title returns quiz tag', () => {
  const tags = suggestTags('Week 3 Reading Quiz');
  assert.ok(tags.includes('quiz'), `Expected 'quiz' in ${JSON.stringify(tags)}`);
});

test('suggestTags: week number extracted correctly', () => {
  const tags = suggestTags('Week 3 Reading Quiz');
  assert.ok(tags.includes('week-3'), `Expected 'week-3' in ${JSON.stringify(tags)}`);
});

test('suggestTags: vocabulary tag from vocabulary keyword', () => {
  const tags = suggestTags('Vocabulary Practice Sheet');
  assert.ok(tags.includes('vocabulary'), `Expected 'vocabulary' in ${JSON.stringify(tags)}`);
});

test('suggestTags: assessment tag from assessment keyword', () => {
  const tags = suggestTags('Unit Assessment Test');
  assert.ok(tags.includes('assessment'), `Expected 'assessment' in ${JSON.stringify(tags)}`);
});

test('suggestTags: empty string returns empty array', () => {
  const tags = suggestTags('');
  assert.deepStrictEqual(tags, []);
});

test('suggestTags: null/undefined returns empty array', () => {
  assert.deepStrictEqual(suggestTags(null), []);
  assert.deepStrictEqual(suggestTags(undefined), []);
});

test('suggestTags: deduplicates tags', () => {
  const tags = suggestTags('Quiz Quiz Quiz');
  const quizTags = tags.filter(t => t === 'quiz');
  assert.strictEqual(quizTags.length, 1, 'quiz should appear only once');
});

test('suggestTags: week-N not in stop words check', () => {
  const tags = suggestTags('Week 5 Essay Writing');
  assert.ok(tags.includes('week-5'), `Expected 'week-5' in ${JSON.stringify(tags)}`);
});

test('detail modal uses suggestTags() for dynamic tag suggestions', () => {
  const fnIdx = src.indexOf('function showAssignmentDetail(');
  assert.ok(fnIdx !== -1, 'showAssignmentDetail not found');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(fnSection.includes('suggestTags('), 'Detail modal does not use suggestTags()');
});

test('detail modal tag chips use dashed border style', () => {
  const fnIdx = src.indexOf('function showAssignmentDetail(');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(fnSection.includes('border-style:dashed'), 'Suggested tag chips do not have dashed border');
});

test('detail modal has Suggested: label for tag suggestions', () => {
  const fnIdx = src.indexOf('function showAssignmentDetail(');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(fnSection.includes('Suggested:'), 'Missing "Suggested:" label for tag suggestions');
});

test('Catalog Wizard Step 3 shows tag suggestions per assignment', () => {
  const fnIdx = src.indexOf('const renderStep3 = () => {');
  assert.ok(fnIdx !== -1, 'renderStep3 not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(fnSection.includes('suggestTags('), 'Catalog Wizard Step 3 does not use suggestTags()');
});

// ── Issue #15: findSimilarAssignments ─────────────────────────────────────────

console.log('\n--- Issue #15: findSimilarAssignments function ---');

test('findSimilarAssignments function exists in source', () => {
  assert.ok(src.includes('function findSimilarAssignments('), 'findSimilarAssignments not found');
});

test('_normalizeTitle function exists in source', () => {
  assert.ok(src.includes('function _normalizeTitle('), '_normalizeTitle not found');
});

test('_normalizeWeekRef function exists in source', () => {
  assert.ok(src.includes('function _normalizeWeekRef('), '_normalizeWeekRef not found');
});

test('findSimilarAssignments: exact match returns high similarity', () => {
  const data = [{ id: 'A1', title: 'Week 3 Reading Quiz' }];
  const results = findSimilarAssignments('Week 3 Reading Quiz', null, data);
  assert.ok(results.length > 0, 'Should find exact match');
  assert.strictEqual(results[0].similarity, 'high');
});

test('findSimilarAssignments: normalized exact match also returns high', () => {
  const data = [{ id: 'A1', title: 'Week 3 Reading Quiz!' }];
  const results = findSimilarAssignments('week 3 reading quiz', null, data);
  assert.ok(results.length > 0, 'Should find normalized match');
  assert.strictEqual(results[0].similarity, 'high');
});

test('findSimilarAssignments: week number normalization (Wk 3 vs Week 3)', () => {
  const data = [{ id: 'A1', title: 'Wk 3 Reading Quiz' }];
  const results = findSimilarAssignments('Week 3 Reading Quiz', null, data);
  assert.ok(results.length > 0, 'Wk 3 vs Week 3 should match');
});

test('findSimilarAssignments: W3 normalized to week 3', () => {
  const data = [{ id: 'A1', title: 'W3 Reading Quiz' }];
  const results = findSimilarAssignments('Week 3 Reading Quiz', null, data);
  assert.ok(results.length > 0, 'W3 vs Week 3 should match');
});

test('findSimilarAssignments: Jaccard >= 0.6 returns medium', () => {
  // "Week 3 Reading Quiz History" vs "Week 3 Reading Quiz"
  // keywords of short title: reading, quiz (2)
  // keywords of long title: reading, quiz, history (3)
  // Jaccard = 2/3 = 0.667 >= 0.6 → medium match
  const data = [{ id: 'A1', title: 'Week 3 Reading Quiz History' }];
  const results = findSimilarAssignments('Week 3 Reading Quiz', null, data);
  // Should find at least a medium match
  assert.ok(results.length > 0, 'Should find similar keywords match');
});

test('findSimilarAssignments: excludeId is excluded from results', () => {
  const data = [{ id: 'A1', title: 'Week 3 Reading Quiz' }];
  const results = findSimilarAssignments('Week 3 Reading Quiz', 'A1', data);
  assert.strictEqual(results.length, 0, 'Excluded assignment should not appear');
});

test('findSimilarAssignments: completely different title returns no results', () => {
  const data = [{ id: 'A1', title: 'Math Geometry Homework' }];
  const results = findSimilarAssignments('Language Arts Essay Week 1', null, data);
  assert.strictEqual(results.length, 0, 'Unrelated titles should not match');
});

test('findSimilarAssignments: empty assignmentsData returns empty', () => {
  const results = findSimilarAssignments('Week 3 Quiz', null, []);
  assert.deepStrictEqual(results, []);
});

test('findSimilarAssignments: empty title returns empty', () => {
  const data = [{ id: 'A1', title: 'Week 3 Quiz' }];
  const results = findSimilarAssignments('', null, data);
  assert.deepStrictEqual(results, []);
});

test('duplicate detection wired to title input in upload paper modal', () => {
  const fnIdx = src.indexOf('async function openUploadPaperModal(');
  assert.ok(fnIdx !== -1, 'openUploadPaperModal not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(fnSection.includes('findSimilarAssignments'), 'Duplicate detection not in upload modal');
});

test('duplicate detection uses debounce() with 500ms', () => {
  const fnIdx = src.indexOf('async function openUploadPaperModal(');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(fnSection.includes('debounce(') && fnSection.includes('500'), 'Debounce with 500ms not found in upload modal');
});

test('high-similarity warning shows ⚠️ indicator', () => {
  assert.ok(src.includes('\u26A0'), '⚠️ warning indicator not found for high-similarity match');
});

test('medium-similarity warning shows 💡 indicator', () => {
  assert.ok(src.includes('💡'), '💡 indicator not found for medium-similarity match');
});

test('detail modal has inline title edit for upcoming assignments', () => {
  const fnIdx = src.indexOf('function showAssignmentDetail(');
  const fnSection = src.slice(fnIdx, fnIdx + 12000);
  assert.ok(
    fnSection.includes("'upcoming'") && fnSection.includes('findSimilarAssignments'),
    'Detail modal title edit with duplicate detection not found'
  );
});

test('duplicate warning in detail modal uses debounce()', () => {
  const fnIdx = src.indexOf('function showAssignmentDetail(');
  const fnSection = src.slice(fnIdx, fnIdx + 12000);
  assert.ok(fnSection.includes('debounce(') && fnSection.includes('findSimilarAssignments'),
    'Debounce not used with findSimilarAssignments in detail modal');
});

// ── No surrogate sequences ─────────────────────────────────────────────────────

console.log('\n--- Emoji safety (PR 7 additions) ---');

test('no \\uD83D surrogate escape sequences introduced by PR 7 additions', () => {
  // Check that no literal \uD83D escape sequence text was added by PR 7
  // (Actual emoji characters in UTF-8 are fine; escape sequences are not)
  assert.ok(!src.includes('\\uD83D'), 'Found \\uD83D escape sequence in source — use actual emoji characters');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ All tc-library-pr7 tests passed!');
}
