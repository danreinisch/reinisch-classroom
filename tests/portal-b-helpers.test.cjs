// Unit tests for new helper functions in site/web/portal-b-helpers.js
// Tests the pure utility functions: calculateWeekOverWeekTrend, calculateAverageScoreTrend, calculateStreakAbove
// Run with: node tests/portal-b-helpers.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Load the module source (strip ES module syntax for Node CJS eval) ────────

const src = fs.readFileSync(
  path.join(__dirname, '..', 'site', 'web', 'portal-b-helpers.js'),
  'utf8'
);

// Strip `import` statements (browser absolute paths can't be resolved in Node)
// and `export` keyword so we can evaluate the pure functions in a CJS sandbox.
const strippedSrc = src
  .replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^export\s+(function|const|class|let|var)\b/gm, '$1')
  .replace(/^export\s*\{[^}]+\};\s*$/gm, '');

// Provide a minimal stub for _getQuarterForDate (only used by getQuarter(),
// which is NOT one of the functions under test here)
const sandbox = {
  _getQuarterForDate: () => null,
};
vm.runInNewContext(strippedSrc, sandbox);

const {
  calculateWeekOverWeekTrend,
  calculateAverageScoreTrend,
  calculateStreakAbove,
} = sandbox;

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n, base = new Date('2026-03-12T12:00:00Z')) {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const NOW = new Date('2026-03-12T12:00:00Z');

// ── calculateWeekOverWeekTrend ────────────────────────────────────────────────

console.log('--- calculateWeekOverWeekTrend ---');

{
  // 3 submissions last week, 1 in previous week → direction: up
  const submissions = [
    { submitted_at: daysAgo(1, NOW) },
    { submitted_at: daysAgo(3, NOW) },
    { submitted_at: daysAgo(5, NOW) },
    { submitted_at: daysAgo(8, NOW) },   // prev week
  ];
  const result = calculateWeekOverWeekTrend(submissions, NOW);
  assert.strictEqual(result.lastWeekCount, 3, 'last week count should be 3');
  assert.strictEqual(result.prevWeekCount, 1, 'prev week count should be 1');
  assert.strictEqual(result.delta, 2, 'delta should be 2');
  assert.strictEqual(result.direction, 'up', 'direction should be up');
  console.log('✓ 3 last week vs 1 prev week → up');
}

{
  // 1 submission last week, 3 in previous week → direction: down
  const submissions = [
    { submitted_at: daysAgo(2, NOW) },
    { submitted_at: daysAgo(8, NOW) },
    { submitted_at: daysAgo(10, NOW) },
    { submitted_at: daysAgo(12, NOW) },
  ];
  const result = calculateWeekOverWeekTrend(submissions, NOW);
  assert.strictEqual(result.lastWeekCount, 1, 'last week count should be 1');
  assert.strictEqual(result.prevWeekCount, 3, 'prev week count should be 3');
  assert.strictEqual(result.direction, 'down', 'direction should be down');
  console.log('✓ 1 last week vs 3 prev week → down');
}

{
  // 2 submissions each week → direction: flat
  const submissions = [
    { submitted_at: daysAgo(1, NOW) },
    { submitted_at: daysAgo(4, NOW) },
    { submitted_at: daysAgo(8, NOW) },
    { submitted_at: daysAgo(11, NOW) },
  ];
  const result = calculateWeekOverWeekTrend(submissions, NOW);
  assert.strictEqual(result.delta, 0, 'delta should be 0');
  assert.strictEqual(result.direction, 'flat', 'direction should be flat');
  console.log('✓ 2 vs 2 → flat');
}

{
  // Submissions without submitted_at are excluded
  const submissions = [
    { submitted_at: null },
    { submitted_at: daysAgo(2, NOW) },
    { submitted_at: daysAgo(8, NOW) },
  ];
  const result = calculateWeekOverWeekTrend(submissions, NOW);
  assert.strictEqual(result.lastWeekCount, 1, 'null submitted_at should be excluded');
  console.log('✓ null submitted_at submissions are excluded');
}

{
  // Empty array
  const result = calculateWeekOverWeekTrend([], NOW);
  assert.strictEqual(result.lastWeekCount, 0);
  assert.strictEqual(result.prevWeekCount, 0);
  assert.strictEqual(result.delta, 0);
  assert.strictEqual(result.direction, 'flat');
  console.log('✓ empty submissions → all zeros, flat');
}

// ── calculateAverageScoreTrend ────────────────────────────────────────────────

console.log('\n--- calculateAverageScoreTrend ---');

{
  // Recent 5 scores higher than prev 5 → improving
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    // Last 5 (most recent) — high scores
    { score_total: 90, submitted_at: daysAgo(1, now) },
    { score_total: 88, submitted_at: daysAgo(2, now) },
    { score_total: 92, submitted_at: daysAgo(3, now) },
    { score_total: 85, submitted_at: daysAgo(4, now) },
    { score_total: 87, submitted_at: daysAgo(5, now) },
    // Prev 5 (older) — lower scores
    { score_total: 70, submitted_at: daysAgo(6, now) },
    { score_total: 72, submitted_at: daysAgo(7, now) },
    { score_total: 68, submitted_at: daysAgo(8, now) },
    { score_total: 74, submitted_at: daysAgo(9, now) },
    { score_total: 71, submitted_at: daysAgo(10, now) },
  ];
  const result = calculateAverageScoreTrend(submissions);
  assert.strictEqual(result.direction, 'up', 'direction should be up');
  assert.ok(result.delta > 3, `delta should exceed 3% threshold; got ${result.delta}`);
  console.log('✓ high recent scores vs low prev scores → up');
}

{
  // Recent 5 lower than prev 5 → declining
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 55, submitted_at: daysAgo(1, now) },
    { score_total: 58, submitted_at: daysAgo(2, now) },
    { score_total: 52, submitted_at: daysAgo(3, now) },
    { score_total: 60, submitted_at: daysAgo(4, now) },
    { score_total: 57, submitted_at: daysAgo(5, now) },
    { score_total: 85, submitted_at: daysAgo(6, now) },
    { score_total: 88, submitted_at: daysAgo(7, now) },
    { score_total: 82, submitted_at: daysAgo(8, now) },
    { score_total: 87, submitted_at: daysAgo(9, now) },
    { score_total: 90, submitted_at: daysAgo(10, now) },
  ];
  const result = calculateAverageScoreTrend(submissions);
  assert.strictEqual(result.direction, 'down', 'direction should be down');
  console.log('✓ low recent scores vs high prev scores → down');
}

{
  // Within ±3% threshold → flat
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 80, submitted_at: daysAgo(1, now) },
    { score_total: 82, submitted_at: daysAgo(2, now) },
    { score_total: 79, submitted_at: daysAgo(3, now) },
    { score_total: 81, submitted_at: daysAgo(4, now) },
    { score_total: 80, submitted_at: daysAgo(5, now) },
    { score_total: 80, submitted_at: daysAgo(6, now) },
    { score_total: 79, submitted_at: daysAgo(7, now) },
    { score_total: 81, submitted_at: daysAgo(8, now) },
    { score_total: 80, submitted_at: daysAgo(9, now) },
    { score_total: 82, submitted_at: daysAgo(10, now) },
  ];
  const result = calculateAverageScoreTrend(submissions);
  assert.strictEqual(result.direction, 'flat', 'direction should be flat within threshold');
  console.log('✓ scores within ±3% → flat');
}

{
  // Only 1 graded → flat (not enough data)
  const result = calculateAverageScoreTrend([
    { score_total: 80, submitted_at: daysAgo(1) }
  ]);
  assert.strictEqual(result.direction, 'flat');
  console.log('✓ single submission → flat');
}

{
  // Empty → flat
  const result = calculateAverageScoreTrend([]);
  assert.strictEqual(result.direction, 'flat');
  console.log('✓ empty submissions → flat');
}

// ── calculateStreakAbove ──────────────────────────────────────────────────────

console.log('\n--- calculateStreakAbove ---');

{
  // Three most recent ≥ 80, then one below → streak of 3
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 90, submitted_at: daysAgo(1, now) },
    { score_total: 85, submitted_at: daysAgo(2, now) },
    { score_total: 82, submitted_at: daysAgo(3, now) },
    { score_total: 70, submitted_at: daysAgo(4, now) }, // below threshold — breaks streak
    { score_total: 95, submitted_at: daysAgo(5, now) },
  ];
  const result = calculateStreakAbove(submissions, 80);
  assert.strictEqual(result.streak, 3, `streak should be 3; got ${result.streak}`);
  assert.strictEqual(result.threshold, 80);
  console.log('✓ 3 consecutive above 80 then one below → streak 3');
}

{
  // All above threshold → full streak
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 88, submitted_at: daysAgo(1, now) },
    { score_total: 91, submitted_at: daysAgo(2, now) },
    { score_total: 84, submitted_at: daysAgo(3, now) },
  ];
  const result = calculateStreakAbove(submissions, 80);
  assert.strictEqual(result.streak, 3);
  console.log('✓ all 3 above threshold → streak 3');
}

{
  // Most recent is below threshold → streak 0
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 60, submitted_at: daysAgo(1, now) },
    { score_total: 90, submitted_at: daysAgo(2, now) },
    { score_total: 92, submitted_at: daysAgo(3, now) },
  ];
  const result = calculateStreakAbove(submissions, 80);
  assert.strictEqual(result.streak, 0, `streak should be 0 when most recent is below threshold`);
  console.log('✓ most recent below threshold → streak 0');
}

{
  // Empty submissions → streak 0
  const result = calculateStreakAbove([], 80);
  assert.strictEqual(result.streak, 0);
  console.log('✓ empty submissions → streak 0');
}

{
  // submissions without submitted_at are excluded from streak calculation
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 90, submitted_at: daysAgo(1, now) },
    { score_total: 85, submitted_at: null },            // no date — excluded
    { score_total: 60, submitted_at: daysAgo(3, now) }, // below → stops streak
  ];
  const result = calculateStreakAbove(submissions, 80);
  // After excluding null-date, order is: 90 (recent), 60 (older) → streak of 1
  assert.strictEqual(result.streak, 1, `expected streak 1; got ${result.streak}`);
  console.log('✓ null submitted_at entries excluded; streak counted from valid entries');
}

{
  // Default threshold is 80
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 81, submitted_at: daysAgo(1, now) },
    { score_total: 79, submitted_at: daysAgo(2, now) },
  ];
  const result = calculateStreakAbove(submissions); // threshold defaults to 80
  assert.strictEqual(result.threshold, 80, 'default threshold should be 80');
  assert.strictEqual(result.streak, 1, 'only one score ≥ 80 from the front');
  console.log('✓ default threshold is 80');
}

console.log('\n✓ All portal-b-helpers tests passed!');

// ── Invalid-date guard tests ──────────────────────────────────────────────────

console.log('\n--- Invalid date guard: calculateAverageScoreTrend ---');

{
  // Submissions with invalid submitted_at should be filtered out; result should be deterministic
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 90, submitted_at: 'not-a-date' },    // invalid — must be excluded
    { score_total: 85, submitted_at: '' },               // empty — must be excluded
    { score_total: 80, submitted_at: null },             // null — must be excluded
    { score_total: 75, submitted_at: daysAgo(1, now) },  // valid
    { score_total: 70, submitted_at: daysAgo(2, now) },  // valid
  ];
  // With only 2 valid entries, should return flat (not enough data for up/down)
  const result = calculateAverageScoreTrend(submissions);
  assert.strictEqual(result.direction, 'flat', 'invalid dates excluded → only 2 valid → flat');
  assert.ok(!isNaN(result.currentAvg), 'currentAvg should be a number, not NaN');
  console.log('✓ invalid submitted_at values excluded; result deterministic');
}

{
  // Mix of invalid and valid dates, enough to determine trend
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 90, submitted_at: daysAgo(1, now) },
    { score_total: 88, submitted_at: 'garbage-date' },   // invalid — excluded
    { score_total: 85, submitted_at: daysAgo(2, now) },
    { score_total: 82, submitted_at: undefined },         // undefined — excluded
    { score_total: 80, submitted_at: daysAgo(3, now) },
    { score_total: 78, submitted_at: daysAgo(4, now) },
    { score_total: 76, submitted_at: daysAgo(5, now) },
    { score_total: 50, submitted_at: daysAgo(6, now) },
    { score_total: 48, submitted_at: daysAgo(7, now) },
    { score_total: 45, submitted_at: daysAgo(8, now) },
    { score_total: 47, submitted_at: daysAgo(9, now) },
    { score_total: 49, submitted_at: daysAgo(10, now) },
  ];
  const result = calculateAverageScoreTrend(submissions);
  // Valid recent scores are high (90, 85, 80, 78, 76), prev are low (50, 48, 45, 47, 49)
  assert.strictEqual(result.direction, 'up', 'valid entries produce correct up trend');
  console.log('✓ mixed valid/invalid dates → correct trend from valid entries only');
}

{
  // All invalid dates → flat (zero entries after filter)
  const result = calculateAverageScoreTrend([
    { score_total: 90, submitted_at: 'not-a-date' },
    { score_total: 85, submitted_at: '' },
  ]);
  assert.strictEqual(result.direction, 'flat', 'all invalid dates → flat');
  console.log('✓ all invalid submitted_at → flat (graceful)');
}

console.log('\n--- Invalid date guard: calculateStreakAbove ---');

{
  // Invalid dates should be filtered; streak counted only from valid entries
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { score_total: 90, submitted_at: daysAgo(1, now) },
    { score_total: 88, submitted_at: 'not-a-date' },     // invalid — excluded
    { score_total: 85, submitted_at: '' },               // invalid — excluded
    { score_total: 60, submitted_at: daysAgo(3, now) },  // below threshold — breaks streak
    { score_total: 92, submitted_at: daysAgo(4, now) },
  ];
  const result = calculateStreakAbove(submissions, 80);
  // After filtering: [90@day1, 60@day3, 92@day4] sorted desc → [90, 60, 92]
  // streak from front: 90 ≥ 80 → streak 1; 60 < 80 → stop
  assert.strictEqual(result.streak, 1, 'invalid dates excluded; streak from valid entries');
  console.log('✓ invalid submitted_at values excluded from streak calculation');
}

{
  // All invalid submitted_at → streak 0 (no valid entries)
  const result = calculateStreakAbove([
    { score_total: 95, submitted_at: 'not-a-date' },
    { score_total: 90, submitted_at: '' },
  ], 80);
  assert.strictEqual(result.streak, 0, 'all invalid dates → streak 0');
  console.log('✓ all invalid submitted_at → streak 0 (graceful)');
}

console.log('\n--- Invalid date guard: calculateWeekOverWeekTrend ---');

{
  // Invalid dates should not count toward last week or prev week
  const now = new Date('2026-03-12T12:00:00Z');
  const submissions = [
    { submitted_at: daysAgo(1, now) },         // last week — valid
    { submitted_at: 'not-a-date' },            // invalid — must not count
    { submitted_at: '' },                      // invalid — must not count
    { submitted_at: daysAgo(8, now) },         // prev week — valid
    { submitted_at: null },                    // null — must not count
  ];
  const result = calculateWeekOverWeekTrend(submissions, now);
  assert.strictEqual(result.lastWeekCount, 1, 'invalid dates not counted in last week');
  assert.strictEqual(result.prevWeekCount, 1, 'invalid dates not counted in prev week');
  console.log('✓ invalid submitted_at values excluded from week-over-week counts');
}

console.log('\n✓ All invalid-date-guard tests passed!');
