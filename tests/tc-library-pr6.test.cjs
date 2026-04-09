// Unit tests for tc-library.js: PR 6 features
// Tests: Catalog Wizard Step 3 "Apply All" button, "Clone for Next Week" logic
// Run with: node tests/tc-library-pr6.test.cjs

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

// ── incrementWeekInTitle logic (inline mirror of source) ──────────────────────

// Mirror the incrementWeekInTitle logic from tc-library.js for unit testing
function incrementWeekInTitle(title) {
  const WORD_TO_NUM = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
  };
  const weekRegex = /\b(?:week|wk|w)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi;

  let lastMatch = null;
  let m;
  weekRegex.lastIndex = 0;
  while ((m = weekRegex.exec(title)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) return null;

  const rawNum = lastMatch[1];
  let weekNum;
  let zeroPadded = false;
  let padLen = 0;
  if (/^\d+$/.test(rawNum)) {
    weekNum = parseInt(rawNum, 10);
    if (rawNum.length > 1 && rawNum.startsWith('0')) {
      zeroPadded = true;
      padLen = rawNum.length;
    }
  } else {
    weekNum = WORD_TO_NUM[rawNum.toLowerCase()] || 1;
  }

  const newNum = weekNum + 1;
  const newNumStr = zeroPadded ? String(newNum).padStart(padLen, '0') : String(newNum);
  const matchStart = lastMatch.index;
  const matchEnd = matchStart + lastMatch[0].length;
  const newMatch = lastMatch[0].replace(rawNum, newNumStr);
  return title.slice(0, matchStart) + newMatch + title.slice(matchEnd);
}

// ── Catalog Wizard Step 3 — "Apply All" button ────────────────────────────────

console.log('\n--- Catalog Wizard Step 3: Apply All button ---');

test('renderStep3 function exists in source', () => {
  assert.ok(src.includes('const renderStep3 = ()'), 'renderStep3 function not found');
});

test('step3Picks Map is defined inside renderStep3', () => {
  const step3Idx = src.indexOf('const renderStep3 = ()');
  assert.ok(step3Idx !== -1, 'renderStep3 not found');
  const step3Section = src.slice(step3Idx, step3Idx + 6000);
  assert.ok(step3Section.includes('step3Picks'), 'step3Picks Map not found in renderStep3');
});

test('picker2 change listener updates step3Picks', () => {
  assert.ok(
    src.includes("step3Picks.set(a.id, picker2.value)"),
    'step3Picks.set() not found for picker2 change listener'
  );
  assert.ok(
    src.includes("step3Picks.delete(a.id)"),
    'step3Picks.delete() not found for picker2 change listener'
  );
});

test('"Apply All" button is created in Step 3 footer', () => {
  assert.ok(
    src.includes('Apply All ('),
    '"Apply All (" text not found in source'
  );
  assert.ok(
    src.includes("'aria-label', 'Apply all unit selections'"),
    'aria-label for Apply All button not found'
  );
});

test('"Apply All" button uses checkCircle icon', () => {
  const applyAllIdx = src.indexOf('Apply all unit selections');
  assert.ok(applyAllIdx !== -1, 'Apply all unit selections not found');
  // Look for checkCircle icon near the Apply All button
  const surroundingCode = src.slice(Math.max(0, applyAllIdx - 400), applyAllIdx + 200);
  assert.ok(
    surroundingCode.includes("checkCircle"),
    'checkCircle icon not found near Apply All button'
  );
});

test('"Apply All" button starts disabled', () => {
  const applyAllIdx = src.indexOf('Apply all unit selections');
  assert.ok(applyAllIdx !== -1, 'Apply all unit selections not found');
  const surroundingCode = src.slice(Math.max(0, applyAllIdx - 400), applyAllIdx + 100);
  assert.ok(
    surroundingCode.includes('applyAllBtn.disabled = true'),
    'applyAllBtn.disabled = true not found'
  );
});

test('"Apply All" uses Promise.allSettled() for batch updates', () => {
  // Verify the Apply All handler uses Promise.allSettled
  assert.ok(
    src.includes('Promise.allSettled(chunk.map('),
    'Promise.allSettled batch chunk mapping not found in source (Apply All handler)'
  );
});

test('refreshApplyAllBtn function updates button label and disabled state', () => {
  const refreshIdx = src.indexOf('function refreshApplyAllBtn()');
  assert.ok(refreshIdx !== -1, 'refreshApplyAllBtn function not found');
  const refreshSection = src.slice(refreshIdx, refreshIdx + 500);
  assert.ok(
    refreshSection.includes('applyAllBtn.disabled = count === 0'),
    'applyAllBtn.disabled toggling not found in refreshApplyAllBtn'
  );
  assert.ok(
    refreshSection.includes('Apply All ('),
    "Apply All label text not found in refreshApplyAllBtn"
  );
});

test('"Apply All" shows progress during batch apply', () => {
  assert.ok(
    src.includes("'Applying ' + toApply.length + ' of ' + remaining.length"),
    'progress text not found for Apply All batch'
  );
});

test('"Apply All" calls rebuildLaneCache() on completion', () => {
  // The Apply All click handler should call rebuildLaneCache()
  const applyAllClickIdx = src.indexOf("step3Picks.entries()");
  assert.ok(applyAllClickIdx !== -1, 'step3Picks.entries() not found in Apply All handler');
  const handlerSection = src.slice(applyAllClickIdx, applyAllClickIdx + 2000);
  assert.ok(
    handlerSection.includes('rebuildLaneCache()'),
    'rebuildLaneCache() not called in Apply All handler'
  );
});

// ── "Clone for Next Week" — incrementWeekInTitle logic ───────────────────────

console.log('\n--- Clone for Next Week: incrementWeekInTitle ---');

test('incrementWeekInTitle function exists in source', () => {
  assert.ok(
    src.includes('function incrementWeekInTitle('),
    'incrementWeekInTitle function not found'
  );
});

test('cloneForNextWeek function exists in source', () => {
  assert.ok(
    src.includes('async function cloneForNextWeek('),
    'cloneForNextWeek function not found'
  );
});

test('"Week 3" → "Week 4"', () => {
  const result = incrementWeekInTitle('Week 3 Reading Quiz');
  assert.strictEqual(result, 'Week 4 Reading Quiz');
});

test('"Wk 7 Assessment" → "Wk 8 Assessment"', () => {
  const result = incrementWeekInTitle('Wk 7 Assessment');
  assert.strictEqual(result, 'Wk 8 Assessment');
});

test('"W3 Homework" → "W4 Homework"', () => {
  const result = incrementWeekInTitle('W3 Homework');
  assert.strictEqual(result, 'W4 Homework');
});

test('case-insensitive: "week 5" → "week 6"', () => {
  const result = incrementWeekInTitle('week 5 assignment');
  assert.strictEqual(result, 'week 6 assignment');
});

test('zero-padded: "Week 03" → "Week 04"', () => {
  const result = incrementWeekInTitle('Week 03 Worksheet');
  assert.strictEqual(result, 'Week 04 Worksheet');
});

test('word form: "Week Three" → "Week 4"', () => {
  const result = incrementWeekInTitle('Week Three Homework');
  assert.strictEqual(result, 'Week 4 Homework');
});

test('word form: "Week one" → "Week 2"', () => {
  const result = incrementWeekInTitle('Week one quiz');
  assert.strictEqual(result, 'Week 2 quiz');
});

test('returns null when no week number in title', () => {
  const result = incrementWeekInTitle('Reading Quiz — No Week');
  assert.strictEqual(result, null);
});

test('increments the LAST week number for titles with multiple', () => {
  // Edge case: two occurrences — last one should be incremented
  const result = incrementWeekInTitle('Week 1 Day — Week 3 Lesson');
  assert.strictEqual(result, 'Week 1 Day — Week 4 Lesson');
});

test('preserves title prefix and suffix', () => {
  const result = incrementWeekInTitle('Reading: Week 10 — Part A');
  assert.strictEqual(result, 'Reading: Week 11 — Part A');
});

// ── "Clone for Next Week" — source-level checks ───────────────────────────────

console.log('\n--- Clone for Next Week: source-level checks ---');

test('cloneForNextWeek calls db.createAssignment()', () => {
  const cloneIdx = src.indexOf('async function cloneForNextWeek(');
  assert.ok(cloneIdx !== -1, 'cloneForNextWeek not found');
  const fnSection = src.slice(cloneIdx, cloneIdx + 3000);
  assert.ok(
    fnSection.includes('db.createAssignment('),
    'db.createAssignment() not called in cloneForNextWeek'
  );
});

test('cloneForNextWeek pushes new assignment to assignmentsData', () => {
  const cloneIdx = src.indexOf('async function cloneForNextWeek(');
  assert.ok(cloneIdx !== -1, 'cloneForNextWeek not found');
  const fnSection = src.slice(cloneIdx, cloneIdx + 3000);
  assert.ok(
    fnSection.includes('assignmentsData.push('),
    'assignmentsData.push() not found in cloneForNextWeek'
  );
});

test('cloneForNextWeek calls rebuildLaneCache()', () => {
  const cloneIdx = src.indexOf('async function cloneForNextWeek(');
  assert.ok(cloneIdx !== -1, 'cloneForNextWeek not found');
  const fnSection = src.slice(cloneIdx, cloneIdx + 3000);
  assert.ok(
    fnSection.includes('rebuildLaneCache()'),
    'rebuildLaneCache() not called in cloneForNextWeek'
  );
});

test('cloneForNextWeek copies unit_id and section_id from original', () => {
  const cloneIdx = src.indexOf('async function cloneForNextWeek(');
  assert.ok(cloneIdx !== -1, 'cloneForNextWeek not found');
  const fnSection = src.slice(cloneIdx, cloneIdx + 3000);
  assert.ok(
    fnSection.includes('unit_id: assignment.unit_id'),
    'unit_id not copied in cloneForNextWeek'
  );
  assert.ok(
    fnSection.includes('section_id: assignment.section_id'),
    'section_id not copied in cloneForNextWeek'
  );
});

test('cloneForNextWeek copies tags from original', () => {
  const cloneIdx = src.indexOf('async function cloneForNextWeek(');
  assert.ok(cloneIdx !== -1, 'cloneForNextWeek not found');
  const fnSection = src.slice(cloneIdx, cloneIdx + 3000);
  assert.ok(
    fnSection.includes('assignment.tags'),
    'tags not copied in cloneForNextWeek'
  );
});

test('cloneForNextWeek calculates suggested due date (+7 days)', () => {
  const cloneIdx = src.indexOf('async function cloneForNextWeek(');
  assert.ok(cloneIdx !== -1, 'cloneForNextWeek not found');
  const fnSection = src.slice(cloneIdx, cloneIdx + 3000);
  assert.ok(
    fnSection.includes('7 * 24 * 60 * 60 * 1000'),
    '+7 days calculation not found in cloneForNextWeek'
  );
});

test('cloneForNextWeek falls back to window.prompt when no week number', () => {
  const cloneIdx = src.indexOf('async function cloneForNextWeek(');
  assert.ok(cloneIdx !== -1, 'cloneForNextWeek not found');
  const fnSection = src.slice(cloneIdx, cloneIdx + 3000);
  assert.ok(
    fnSection.includes('window.prompt('),
    'window.prompt() fallback not found in cloneForNextWeek'
  );
});

test('cloneForNextWeek shows "View in Reserve tab" toast button', () => {
  const cloneIdx = src.indexOf('async function cloneForNextWeek(');
  assert.ok(cloneIdx !== -1, 'cloneForNextWeek not found');
  const fnSection = src.slice(cloneIdx, cloneIdx + 3000);
  assert.ok(
    fnSection.includes('View in Reserve tab'),
    '"View in Reserve tab" text not found in cloneForNextWeek toast'
  );
});

// ── "Clone for Next Week" button in renderUpcomingCard ────────────────────────

console.log('\n--- Clone for Next Week: button placement ---');

test('"Clone for Next Week" button added to renderUpcomingCard', () => {
  const cardIdx = src.indexOf('function renderUpcomingCard(');
  assert.ok(cardIdx !== -1, 'renderUpcomingCard not found');
  // Use a large enough window to cover the full function (~9000 chars)
  const cardSection = src.slice(cardIdx, cardIdx + 10000);
  assert.ok(
    cardSection.includes('cloneForNextWeek(assignment)'),
    'cloneForNextWeek(assignment) not called in renderUpcomingCard'
  );
});

test('"Clone for Next Week" button has aria-label in renderUpcomingCard', () => {
  const cardIdx = src.indexOf('function renderUpcomingCard(');
  assert.ok(cardIdx !== -1, 'renderUpcomingCard not found');
  const cardSection = src.slice(cardIdx, cardIdx + 10000);
  assert.ok(
    cardSection.includes("'aria-label', 'Clone for next week:"),
    'aria-label for Clone for Next Week not found in renderUpcomingCard'
  );
});

test('"Clone for Next Week" button added to renderFinalizedEntry', () => {
  const finIdx = src.indexOf('function renderFinalizedEntry(');
  assert.ok(finIdx !== -1, 'renderFinalizedEntry not found');
  // Use a large enough window to cover the full function (~7000 chars)
  const finSection = src.slice(finIdx, finIdx + 8000);
  assert.ok(
    finSection.includes('cloneForNextWeek(assignment)'),
    'cloneForNextWeek(assignment) not called in renderFinalizedEntry'
  );
});

test('"Clone for Next Week" button has aria-label in renderFinalizedEntry', () => {
  const finIdx = src.indexOf('function renderFinalizedEntry(');
  assert.ok(finIdx !== -1, 'renderFinalizedEntry not found');
  const finSection = src.slice(finIdx, finIdx + 8000);
  assert.ok(
    finSection.includes("'aria-label', 'Clone for next week:"),
    'aria-label for Clone for Next Week not found in renderFinalizedEntry'
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
