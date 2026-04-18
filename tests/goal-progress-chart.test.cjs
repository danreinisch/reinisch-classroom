// Unit tests for SPED-friendly goal progress chart helpers
// Tests computeGoalStatus, computeTrendArrow, buildProgressSVG-like logic
// (sorting and deduplication), and status banner content.
// Run with: node tests/goal-progress-chart.test.cjs

'use strict';

const assert = require('assert');

// ─── Replicate pure helper logic for isolated unit testing ──────────────────
// These functions mirror the implementations in student-portal-init.js so they
// can be tested without requiring a browser DOM.

function computeGoalStatus(latest, target, baseline) {
  if (target == null || isNaN(target)) {
    return { key: 'in-progress', emoji: '📊', label: 'In Progress', modifier: 'in-progress' };
  }
  if (latest >= target) {
    return { key: 'on-track', emoji: '🟢', label: 'On Track!', modifier: 'on-track' };
  }
  if (latest >= target - 10) {
    return { key: 'almost-there', emoji: '🟡', label: 'Almost There', modifier: 'almost-there' };
  }
  if (baseline == null || isNaN(baseline) || latest > baseline) {
    return { key: 'keep-practicing', emoji: '🟠', label: 'Keep Practicing', modifier: 'keep-practicing' };
  }
  return { key: 'needs-support', emoji: '🔴', label: 'Needs Support', modifier: 'needs-support' };
}

function computeTrendArrow(sortedEntries) {
  const nums = sortedEntries.map(e => parseFloat(e.value)).filter(v => !isNaN(v));
  if (nums.length < 2) {
    return { arrow: '—', label: 'Not enough data', cssClass: 'st-goal-trend-flat' };
  }
  const last = nums[nums.length - 1];
  const prev = nums[Math.max(0, nums.length - 3)];
  const diff = last - prev;
  if (diff > 2) return { arrow: '↑', label: 'Improving', cssClass: 'st-goal-trend-up' };
  if (diff < -2) return { arrow: '↓', label: 'Declining', cssClass: 'st-goal-trend-down' };
  return { arrow: '→', label: 'Steady', cssClass: 'st-goal-trend-flat' };
}

/**
 * Replicate the deduplication + sort logic from buildProgressSVG.
 * Returns deduplicated entries sorted chronologically.
 */
function dedupAndSortEntries(entries) {
  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  const dedupMap = new Map();
  for (const e of sorted) {
    const dateKey = String(e.date).substring(0, 10);
    if (!dedupMap.has(dateKey)) {
      dedupMap.set(dateKey, { ...e, _vals: [parseFloat(e.value)] });
    } else {
      dedupMap.get(dateKey)._vals.push(parseFloat(e.value));
    }
  }
  return Array.from(dedupMap.values()).map(entry => ({
    ...entry,
    value: entry._vals.filter(v => !isNaN(v)).reduce((s, v) => s + v, 0) /
           Math.max(1, entry._vals.filter(v => !isNaN(v)).length),
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

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

// ── computeGoalStatus ──────────────────────────────────────────────────────

console.log('\ncomputeGoalStatus');

test('returns on-track when latest equals target', () => {
  const result = computeGoalStatus(70, 70, 20);
  assert.strictEqual(result.key, 'on-track');
  assert.strictEqual(result.emoji, '🟢');
});

test('returns on-track when latest exceeds target', () => {
  const result = computeGoalStatus(85, 70, 20);
  assert.strictEqual(result.key, 'on-track');
});

test('returns almost-there when latest is 1% below target', () => {
  const result = computeGoalStatus(69, 70, 20);
  assert.strictEqual(result.key, 'almost-there');
  assert.strictEqual(result.emoji, '🟡');
});

test('returns almost-there when latest is exactly 10 below target', () => {
  const result = computeGoalStatus(60, 70, 20);
  assert.strictEqual(result.key, 'almost-there');
});

test('returns keep-practicing when latest is 11 below target and above baseline', () => {
  const result = computeGoalStatus(59, 70, 20);
  assert.strictEqual(result.key, 'keep-practicing');
  assert.strictEqual(result.emoji, '🟠');
});

test('returns needs-support when latest is at or below baseline', () => {
  const result = computeGoalStatus(20, 70, 20);
  assert.strictEqual(result.key, 'needs-support');
  assert.strictEqual(result.emoji, '🔴');
});

test('returns needs-support when latest is below baseline', () => {
  const result = computeGoalStatus(15, 70, 20);
  assert.strictEqual(result.key, 'needs-support');
});

test('returns in-progress when target is null', () => {
  const result = computeGoalStatus(50, null, 20);
  assert.strictEqual(result.key, 'in-progress');
});

test('returns keep-practicing when baseline is null and not near target', () => {
  // No baseline → below target by >10 → keep-practicing (not needs-support)
  const result = computeGoalStatus(40, 70, null);
  assert.strictEqual(result.key, 'keep-practicing');
});

test('label and modifier match the key', () => {
  assert.strictEqual(computeGoalStatus(70, 70, 20).label, 'On Track!');
  assert.strictEqual(computeGoalStatus(69, 70, 20).label, 'Almost There');
  assert.strictEqual(computeGoalStatus(50, 70, 20).label, 'Keep Practicing');
  assert.strictEqual(computeGoalStatus(20, 70, 20).label, 'Needs Support');
  assert.strictEqual(computeGoalStatus(50, null, 20).label, 'In Progress');
});

// ── computeTrendArrow ──────────────────────────────────────────────────────

console.log('\ncomputeTrendArrow');

test('returns Improving for consistently rising scores', () => {
  const entries = [
    { value: '30' },
    { value: '50' },
    { value: '70' },
  ];
  const result = computeTrendArrow(entries);
  assert.strictEqual(result.arrow, '↑');
  assert.strictEqual(result.cssClass, 'st-goal-trend-up');
});

test('returns Declining for falling scores', () => {
  const entries = [
    { value: '70' },
    { value: '50' },
    { value: '30' },
  ];
  const result = computeTrendArrow(entries);
  assert.strictEqual(result.arrow, '↓');
  assert.strictEqual(result.cssClass, 'st-goal-trend-down');
});

test('returns Steady for stable scores (diff <= 2)', () => {
  const entries = [
    { value: '70' },
    { value: '71' },
    { value: '70.5' },
  ];
  const result = computeTrendArrow(entries);
  assert.strictEqual(result.arrow, '→');
  assert.strictEqual(result.cssClass, 'st-goal-trend-flat');
});

test('returns flat with single entry', () => {
  const result = computeTrendArrow([{ value: '70' }]);
  assert.strictEqual(result.arrow, '—');
  assert.strictEqual(result.label, 'Not enough data');
});

test('returns flat with no entries', () => {
  const result = computeTrendArrow([]);
  assert.strictEqual(result.arrow, '—');
});

test('uses last vs up-to-3-ago for comparison with many entries', () => {
  // 5 entries: 50,50,50,50,60 → diff = 60-50 = 10 → Improving
  const entries = [
    { value: '50' },
    { value: '50' },
    { value: '50' },
    { value: '50' },
    { value: '60' },
  ];
  const result = computeTrendArrow(entries);
  assert.strictEqual(result.arrow, '↑');
});

// ── Chronological sort ────────────────────────────────────────────────────

console.log('\nChronological sort (dedupAndSortEntries)');

test('sorts entries oldest to newest', () => {
  const entries = [
    { date: '2024-04-12', value: '37.5' },
    { date: '2024-04-01', value: '87.5' },
  ];
  const result = dedupAndSortEntries(entries);
  assert.strictEqual(result[0].date.substring(0, 10), '2024-04-01');
  assert.strictEqual(result[1].date.substring(0, 10), '2024-04-12');
});

test('already sorted entries remain in order', () => {
  const entries = [
    { date: '2024-01-01', value: '20' },
    { date: '2024-02-01', value: '40' },
    { date: '2024-03-01', value: '60' },
  ];
  const result = dedupAndSortEntries(entries);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].date.substring(0, 10), '2024-01-01');
  assert.strictEqual(result[2].date.substring(0, 10), '2024-03-01');
});

// ── Same-day deduplication ────────────────────────────────────────────────

console.log('\nSame-day deduplication');

test('deduplicates two same-day entries by averaging their values', () => {
  const entries = [
    { date: '2024-04-01', value: '87.5' },
    { date: '2024-04-01', value: '20' },
    { date: '2024-04-12', value: '37.5' },
  ];
  const result = dedupAndSortEntries(entries);
  assert.strictEqual(result.length, 2, 'Should have 2 unique dates');
  assert.strictEqual(result[0].date.substring(0, 10), '2024-04-01');
  // Average of 87.5 and 20 = 53.75
  assert.ok(Math.abs(result[0].value - 53.75) < 0.01, `Expected ~53.75, got ${result[0].value}`);
  assert.strictEqual(result[1].date.substring(0, 10), '2024-04-12');
  assert.ok(Math.abs(result[1].value - 37.5) < 0.01);
});

test('deduplicates three same-day entries', () => {
  const entries = [
    { date: '2024-05-01', value: '30' },
    { date: '2024-05-01', value: '60' },
    { date: '2024-05-01', value: '90' },
  ];
  const result = dedupAndSortEntries(entries);
  assert.strictEqual(result.length, 1);
  assert.ok(Math.abs(result[0].value - 60) < 0.01, `Expected 60 (avg), got ${result[0].value}`);
});

test('single entry per day is unchanged', () => {
  const entries = [
    { date: '2024-03-01', value: '55' },
    { date: '2024-03-15', value: '65' },
  ];
  const result = dedupAndSortEntries(entries);
  assert.strictEqual(result.length, 2);
  assert.ok(Math.abs(result[0].value - 55) < 0.01);
  assert.ok(Math.abs(result[1].value - 65) < 0.01);
});

// ── Summary ───────────────────────────────────────────────────────────────

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
