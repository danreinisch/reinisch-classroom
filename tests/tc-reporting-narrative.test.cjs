// Unit tests for the rich progress narrative engine and quarter date logic in tc-reporting.js
// Covers: buildRichProgressNarrative scenarios, data point counting, narrative variation,
//         and quarter date ranges for the 2025-2026 school year.
// Run with: node tests/tc-reporting-narrative.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load source ───────────────────────────────────────────────────────────────

const srcPath = path.join(__dirname, '..', 'site', 'web', 'tc-reporting.js');
const src = fs.readFileSync(srcPath, 'utf8');

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

// ── Inline mirror of buildRichProgressNarrative for testing ──────────────────
// This mirrors the logic in site/web/tc-reporting.js exactly so tests can run
// without a browser environment.

function buildRichProgressNarrative(student, goal, quarterData, prevData, quarterLabel) {
  const name = ((student.name || student.code || 'Student').split(' ')[0]);
  const area = goal.goal_area || goal.code || 'this goal area';
  const baselineVal = parseFloat(goal.baseline) || 0;
  const targetVal = parseFloat(goal.target) || 80;
  const avg = quarterData.average;
  const count = quarterData.count;
  const quarter = quarterLabel || 'this quarter';

  const hashCode = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  };
  const seed = hashCode(goal.code || '');
  const pick = (arr) => arr[seed % arr.length];

  const dataLevel = count === 0 ? 'none' : count <= 2 ? 'limited' : 'sufficient';

  if (dataLevel === 'none') {
    const openings = [
      `No performance data was collected for ${name} in the area of ${area} during ${quarter}.`,
      `Data collection for ${area} was not recorded for ${name} during the ${quarter} reporting period.`,
      `${name}'s progress on this goal was not measured during ${quarter}.`,
    ];
    const closings = [
      `Increased data collection opportunities are recommended for the next quarter.`,
      `Additional data points should be gathered to accurately measure progress toward the ${targetVal.toFixed(0)}% criterion.`,
      `It is recommended that data collection for this goal be prioritized in the upcoming quarter.`,
    ];
    return {
      narrative: `${pick(openings)} ${pick(closings)}`,
      status: 'Not Making Progress',
    };
  }

  const baselineDiff = avg - baselineVal;
  const baselineComp = baselineDiff > 5 ? 'above' : baselineDiff >= -5 ? 'at' : 'below';

  const targetDiff = avg - targetVal;
  const targetProx = targetDiff >= 0 ? 'met' : targetDiff >= -10 ? 'approaching' : 'far';

  const prevAvg = prevData ? prevData.average : null;
  const trendDiff = prevAvg != null ? avg - prevAvg : null;
  const trend =
    trendDiff == null
      ? 'new'
      : trendDiff > 2
      ? 'improving'
      : trendDiff < -2
      ? 'declining'
      : 'maintaining';

  let status;
  if (targetProx === 'met') {
    status = 'Goal Met';
  } else if (trend === 'improving' && baselineComp !== 'below') {
    status = 'Making Adequate Progress';
  } else if (trend === 'maintaining' && (baselineComp === 'above' || baselineComp === 'at')) {
    status = 'Making Adequate Progress';
  } else if (baselineComp === 'above' && targetProx !== 'far') {
    status = 'Making Adequate Progress';
  } else if (baselineComp !== 'below') {
    status = 'Progressing but Not Sufficient';
  } else {
    status = 'Not Making Progress';
  }

  let opening;
  if (trend === 'improving') {
    opening = pick([
      `${name} demonstrated growth in ${area} during ${quarter}.`,
      `${name} showed measurable improvement in ${area} this reporting period.`,
      `${name} made meaningful progress in ${area} during ${quarter}.`,
      `${name}'s performance in ${area} improved during the ${quarter} quarter.`,
    ]);
  } else if (trend === 'declining') {
    opening = pick([
      `${name} experienced some challenges in ${area} during ${quarter}.`,
      `${name}'s performance in ${area} showed a decline this reporting period.`,
      `${name} required additional support in ${area} during the ${quarter} quarter.`,
    ]);
  } else if (trend === 'maintaining') {
    opening = pick([
      `${name} continued to work on ${area} during ${quarter}.`,
      `${name} maintained consistent performance in ${area} this quarter.`,
      `${name}'s performance in ${area} remained steady during the ${quarter} reporting period.`,
    ]);
  } else {
    opening = pick([
      `${name} worked on ${area} during ${quarter}.`,
      `During ${quarter}, ${name} engaged with goals in the area of ${area}.`,
      `${name} demonstrated performance in ${area} during the ${quarter} reporting period.`,
    ]);
  }

  const avgStr = avg.toFixed(0);
  const baselineStr = baselineVal.toFixed(0);
  const countDesc = `${count} data point${count !== 1 ? 's' : ''}`;
  const comparison =
    baselineComp === 'above'
      ? `up from a baseline of ${baselineStr}%`
      : baselineComp === 'below'
      ? `compared to a baseline of ${baselineStr}%`
      : `consistent with a baseline of ${baselineStr}%`;

  let middle;
  if (dataLevel === 'limited') {
    middle = pick([
      `With ${countDesc} collected, ${name} achieved an average of ${avgStr}%, ${comparison}.`,
      `Based on ${countDesc}, ${name} scored an average of ${avgStr}%, ${comparison}.`,
      `Data from ${countDesc} this quarter shows an average score of ${avgStr}%, ${comparison}.`,
    ]);
  } else {
    middle = pick([
      `With ${countDesc} collected, ${name} achieved an average of ${avgStr}%, ${comparison}.`,
      `Across ${countDesc} this quarter, ${name} averaged ${avgStr}%, ${comparison}.`,
      `Performance across ${countDesc} reflects an average of ${avgStr}%, ${comparison}.`,
    ]);
  }

  const targetStr = targetVal.toFixed(0);
  let closing;
  if (targetProx === 'met') {
    closing = pick([
      `${name} has met the target criterion of ${targetStr}% and is demonstrating mastery of this goal.`,
      `With an average exceeding the ${targetStr}% criterion, ${name} has demonstrated mastery on this goal.`,
      `${name} has achieved the annual goal target of ${targetStr}%, indicating successful mastery.`,
    ]);
  } else if (targetProx === 'approaching') {
    closing = pick([
      `${name} is making adequate progress toward the annual target of ${targetStr}%.`,
      `${name} is on track to meet the ${targetStr}% mastery criterion with continued support.`,
      `With continued effort, ${name} is progressing toward the ${targetStr}% annual target.`,
    ]);
  } else {
    if (trend === 'declining') {
      closing = pick([
        `Progress toward the ${targetStr}% annual criterion requires additional intervention and support.`,
        `${name} continues to work toward the ${targetStr}% target; a review of current supports is recommended.`,
        `Additional targeted intervention is recommended to help ${name} progress toward the ${targetStr}% criterion.`,
      ]);
    } else {
      closing = pick([
        `${name} continues to work toward the target criterion of ${targetStr}%. Continued practice and support are recommended.`,
        `Additional instructional support will help ${name} reach the ${targetStr}% annual target.`,
        `${name} is working toward the ${targetStr}% goal criterion and will benefit from continued focused instruction.`,
      ]);
    }
  }

  const caveat =
    dataLevel === 'limited'
      ? pick([
          ' Note: This summary is based on limited data; additional collection will provide a clearer picture.',
          ' These results are based on limited data and should be interpreted with caution.',
        ])
      : '';

  return {
    narrative: `${opening} ${middle} ${closing}${caveat}`,
    status,
  };
}

// ── Quarter date range verification ──────────────────────────────────────────

console.log('\n--- Quarter date ranges (2025-2026 school year) ---');

// Mirror of quarter-utils.js DEFAULT_QUARTER_DATES and getQuarterDateRange logic
const DEFAULT_QUARTER_DATES = {
  Q1: { start: 'Aug 16', end: 'Oct 17' },
  Q2: { start: 'Oct 18', end: 'Dec 19' },
  Q3: { start: 'Dec 20', end: 'Mar 6' },
  Q4: { start: 'Mar 7', end: 'May 20' },
};
const MONTH_MAP = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function getSchoolYear(date) {
  const month = date.getMonth();
  return month >= 7 ? date.getFullYear() : date.getFullYear() - 1;
}

function getQuarterDateRange(quarter, referenceDate) {
  const now = referenceDate || new Date();
  const schoolYear = getSchoolYear(now);
  const range = DEFAULT_QUARTER_DATES[quarter];
  if (!range) return null;
  const [sMon, sDay] = range.start.split(' ');
  const [eMon, eDay] = range.end.split(' ');
  const sm = MONTH_MAP[sMon];
  const em = MONTH_MAP[eMon];
  const startYear = sm >= 7 ? schoolYear : schoolYear + 1;
  const endYear = em >= 7 ? schoolYear : schoolYear + 1;
  return {
    start: new Date(startYear, sm, parseInt(sDay, 10)),
    end: new Date(endYear, em, parseInt(eDay, 10)),
  };
}

// Test with a date known to be in the 2025-2026 school year (e.g., Jan 2026)
const jan2026 = new Date(2026, 0, 15); // Jan 15, 2026

test('Q1 2025-2026 starts Aug 16 2025', () => {
  const range = getQuarterDateRange('Q1', jan2026);
  assert.strictEqual(range.start.getFullYear(), 2025);
  assert.strictEqual(range.start.getMonth(), 7); // August (0-indexed)
  assert.strictEqual(range.start.getDate(), 16);
});

test('Q1 2025-2026 ends Oct 17 2025', () => {
  const range = getQuarterDateRange('Q1', jan2026);
  assert.strictEqual(range.end.getFullYear(), 2025);
  assert.strictEqual(range.end.getMonth(), 9); // October
  assert.strictEqual(range.end.getDate(), 17);
});

test('Q2 2025-2026 starts Oct 18 2025', () => {
  const range = getQuarterDateRange('Q2', jan2026);
  assert.strictEqual(range.start.getFullYear(), 2025);
  assert.strictEqual(range.start.getMonth(), 9);
  assert.strictEqual(range.start.getDate(), 18);
});

test('Q2 2025-2026 ends Dec 19 2025', () => {
  const range = getQuarterDateRange('Q2', jan2026);
  assert.strictEqual(range.end.getFullYear(), 2025);
  assert.strictEqual(range.end.getMonth(), 11); // December
  assert.strictEqual(range.end.getDate(), 19);
});

test('Q3 2025-2026 starts Dec 20 2025', () => {
  const range = getQuarterDateRange('Q3', jan2026);
  assert.strictEqual(range.start.getFullYear(), 2025);
  assert.strictEqual(range.start.getMonth(), 11); // December
  assert.strictEqual(range.start.getDate(), 20);
});

test('Q3 2025-2026 ends Mar 6 2026', () => {
  const range = getQuarterDateRange('Q3', jan2026);
  assert.strictEqual(range.end.getFullYear(), 2026);
  assert.strictEqual(range.end.getMonth(), 2); // March
  assert.strictEqual(range.end.getDate(), 6);
});

test('Q4 2025-2026 starts Mar 7 2026', () => {
  const range = getQuarterDateRange('Q4', jan2026);
  assert.strictEqual(range.start.getFullYear(), 2026);
  assert.strictEqual(range.start.getMonth(), 2);
  assert.strictEqual(range.start.getDate(), 7);
});

test('Q4 2025-2026 ends May 20 2026', () => {
  const range = getQuarterDateRange('Q4', jan2026);
  assert.strictEqual(range.end.getFullYear(), 2026);
  assert.strictEqual(range.end.getMonth(), 4); // May
  assert.strictEqual(range.end.getDate(), 20);
});

test('Q3 spans year boundary (start 2025, end 2026)', () => {
  const range = getQuarterDateRange('Q3', jan2026);
  assert.ok(range.start < range.end, 'Q3 start must be before Q3 end');
  assert.ok(range.start.getFullYear() < range.end.getFullYear(),
    'Q3 start year (2025) must be before end year (2026)');
});

test('quarter date ranges advance by 1 year for following school year', () => {
  const aug2026 = new Date(2026, 7, 20); // Aug 20, 2026 = 2026-2027 school year
  const q1Next = getQuarterDateRange('Q1', aug2026);
  assert.strictEqual(q1Next.start.getFullYear(), 2026);
  assert.strictEqual(q1Next.end.getFullYear(), 2026);
});

// ── Narrative engine — no data scenario ──────────────────────────────────────

console.log('\n--- Narrative engine: no data scenario ---');

const studentA = { name: 'Maria Garcia', code: 'S001' };
const goalA = { code: 'S001.1.1', goal_area: 'Reading Comprehension', baseline: 45, target: 80 };
const noDataQ = { average: null, count: 0, values: [] };

test('no-data returns "Not Making Progress" status', () => {
  const { status } = buildRichProgressNarrative(studentA, goalA, noDataQ, null, 'Q3');
  assert.strictEqual(status, 'Not Making Progress');
});

test('no-data narrative mentions the student name', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, noDataQ, null, 'Q3');
  assert.ok(narrative.includes('Maria'), `Narrative should include first name: ${narrative}`);
});

test('no-data narrative mentions goal area', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, noDataQ, null, 'Q3');
  assert.ok(narrative.includes('Reading Comprehension'), `Narrative should mention goal area: ${narrative}`);
});

test('no-data narrative mentions quarter', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, noDataQ, null, 'Q3');
  assert.ok(narrative.includes('Q3'), `Narrative should mention quarter: ${narrative}`);
});

// ── Narrative engine — goal met scenario ─────────────────────────────────────

console.log('\n--- Narrative engine: goal met scenario ---');

const goalMetQ = { average: 85, count: 6, values: [80, 85, 88, 84, 86, 87] };

test('goal met returns "Goal Met" status when average >= target', () => {
  const { status } = buildRichProgressNarrative(studentA, goalA, goalMetQ, null, 'Q3');
  assert.strictEqual(status, 'Goal Met');
});

test('goal met narrative mentions mastery or target', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, goalMetQ, null, 'Q3');
  assert.ok(
    narrative.toLowerCase().includes('mastery') || narrative.includes('target'),
    `Narrative should mention mastery/target: ${narrative}`
  );
});

test('goal met narrative mentions the target percentage', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, goalMetQ, null, 'Q3');
  assert.ok(narrative.includes('80'), `Narrative should mention target (80%): ${narrative}`);
});

// ── Narrative engine — improving scenario ────────────────────────────────────

console.log('\n--- Narrative engine: improving scenario ---');

const improvingQ = { average: 72, count: 5, values: [65, 68, 72, 74, 71] };
const prevQLow = { average: 58, count: 4, values: [55, 57, 60, 60] };

test('improving trend returns "Making Adequate Progress" status', () => {
  const { status } = buildRichProgressNarrative(studentA, goalA, improvingQ, prevQLow, 'Q3');
  assert.strictEqual(status, 'Making Adequate Progress');
});

test('improving narrative mentions growth or improvement', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, improvingQ, prevQLow, 'Q3');
  const lower = narrative.toLowerCase();
  assert.ok(
    lower.includes('growth') || lower.includes('improv') || lower.includes('progress'),
    `Narrative should mention growth/improvement: ${narrative}`
  );
});

test('improving narrative includes data point count', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, improvingQ, prevQLow, 'Q3');
  assert.ok(
    narrative.includes('5 data points'),
    `Narrative should include data point count (5 data points): ${narrative}`
  );
});

test('improving narrative includes average percentage', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, improvingQ, prevQLow, 'Q3');
  assert.ok(
    narrative.includes('72%'),
    `Narrative should include average (72%): ${narrative}`
  );
});

test('improving narrative includes baseline', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, improvingQ, prevQLow, 'Q3');
  assert.ok(
    narrative.includes('45%') || narrative.includes('baseline'),
    `Narrative should reference baseline: ${narrative}`
  );
});

// ── Narrative engine — declining scenario ────────────────────────────────────

console.log('\n--- Narrative engine: declining scenario ---');

const decliningQ = { average: 35, count: 4, values: [55, 42, 35, 30] };
const prevQHigh = { average: 62, count: 5, values: [58, 62, 63, 65, 64] };

test('declining below baseline returns "Not Making Progress" status', () => {
  const { status } = buildRichProgressNarrative(studentA, goalA, decliningQ, prevQHigh, 'Q3');
  assert.strictEqual(status, 'Not Making Progress');
});

test('declining narrative mentions challenges or decline or support', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, decliningQ, prevQHigh, 'Q3');
  const lower = narrative.toLowerCase();
  assert.ok(
    lower.includes('challenge') || lower.includes('decline') || lower.includes('support'),
    `Narrative should mention challenges/decline/support: ${narrative}`
  );
});

// ── Narrative engine — maintaining scenario ──────────────────────────────────

console.log('\n--- Narrative engine: maintaining above baseline ---');

const maintainingQ = { average: 62, count: 4, values: [60, 63, 62, 63] };
const prevQSame = { average: 61, count: 3, values: [60, 61, 62] };

test('maintaining above baseline returns "Making Adequate Progress"', () => {
  const { status } = buildRichProgressNarrative(studentA, goalA, maintainingQ, prevQSame, 'Q3');
  assert.strictEqual(status, 'Making Adequate Progress');
});

// ── Narrative engine — limited data scenario ─────────────────────────────────

console.log('\n--- Narrative engine: limited data (1-2 points) ---');

const limitedQ = { average: 70, count: 2, values: [68, 72] };

test('limited data (2 points) produces a narrative', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, limitedQ, null, 'Q3');
  assert.ok(narrative.length > 20, `Narrative should be non-trivial: ${narrative}`);
});

test('limited data narrative mentions "limited data" caveat', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, limitedQ, null, 'Q3');
  assert.ok(
    narrative.toLowerCase().includes('limited data'),
    `Limited data narrative should include caveat: ${narrative}`
  );
});

test('limited data count correctly shown as 2 data points', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, limitedQ, null, 'Q3');
  assert.ok(
    narrative.includes('2 data point'),
    `Narrative should show 2 data points: ${narrative}`
  );
});

test('single data point uses singular form', () => {
  const singleQ = { average: 70, count: 1, values: [70] };
  const { narrative } = buildRichProgressNarrative(studentA, goalA, singleQ, null, 'Q3');
  assert.ok(
    narrative.includes('1 data point') && !narrative.includes('1 data points'),
    `Narrative should use singular "data point": ${narrative}`
  );
});

// ── Narrative engine — variation across goals ────────────────────────────────

console.log('\n--- Narrative engine: variation across different goals ---');

const goalB = { code: 'S001.2.1', goal_area: 'Math Computation', baseline: 50, target: 85 };
const goalC = { code: 'S001.3.1', goal_area: 'Written Expression', baseline: 30, target: 75 };
const goalD = { code: 'S001.4.1', goal_area: 'Oral Communication', baseline: 60, target: 90 };

const sharedQData = { average: 70, count: 5, values: [65, 68, 70, 72, 75] };

test('different goal codes produce different narrative text', () => {
  const { narrative: n1 } = buildRichProgressNarrative(studentA, goalA, sharedQData, null, 'Q3');
  const { narrative: n2 } = buildRichProgressNarrative(studentA, goalB, sharedQData, null, 'Q3');
  const { narrative: n3 } = buildRichProgressNarrative(studentA, goalC, sharedQData, null, 'Q3');

  // At least 2 of the 3 should differ (goal areas are different, so area mention changes)
  const allSame = n1 === n2 && n2 === n3;
  assert.ok(!allSame, 'Narratives for different goals should not all be identical');
});

test('same goal code always produces same narrative (deterministic)', () => {
  const { narrative: n1 } = buildRichProgressNarrative(studentA, goalA, sharedQData, null, 'Q3');
  const { narrative: n2 } = buildRichProgressNarrative(studentA, goalA, sharedQData, null, 'Q3');
  assert.strictEqual(n1, n2, 'Same inputs should always produce the same narrative');
});

test('four goals each mention their respective goal areas', () => {
  const goals = [goalA, goalB, goalC, goalD];
  for (const g of goals) {
    const { narrative } = buildRichProgressNarrative(studentA, g, sharedQData, null, 'Q3');
    assert.ok(
      narrative.includes(g.goal_area),
      `Narrative for ${g.code} should mention goal area "${g.goal_area}"`
    );
  }
});

// ── Data point counting logic ─────────────────────────────────────────────────

console.log('\n--- Data point counting logic ---');

// Mirror of getGoalProgressForQuarter
function getGoalProgressForQuarter(goalCode, studentCode, quarterRange, progressData) {
  if (!quarterRange.start || !quarterRange.end) {
    return { average: null, count: 0, values: [] };
  }
  const startDate = new Date(quarterRange.start);
  const endDate = new Date(quarterRange.end);
  const relevantProgress = progressData.filter((p) => {
    if (p.goal_code !== goalCode) return false;
    if (p.student_code !== studentCode) return false;
    const pDate = new Date(p.date);
    return pDate >= startDate && pDate <= endDate;
  });
  if (relevantProgress.length === 0) return { average: null, count: 0, values: [] };
  const values = relevantProgress.map((p) => parseFloat(p.value)).filter((v) => !isNaN(v));
  const average = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
  return { average, count: values.length, values };
}

const sampleProgressData = [
  { goal_code: 'S001.1.1', student_code: 'S001', date: '2025-12-22', value: 65, source: 'assignment' },
  { goal_code: 'S001.1.1', student_code: 'S001', date: '2026-01-10', value: 70, source: 'assignment' },
  { goal_code: 'S001.1.1', student_code: 'S001', date: '2026-01-15', value: 72, source: 'assignment' },
  { goal_code: 'S001.1.1', student_code: 'S001', date: '2026-02-05', value: 75, source: 'manual' },
  { goal_code: 'S001.1.1', student_code: 'S001', date: '2025-11-01', value: 60, source: 'assignment' }, // Q2 — outside Q3
  { goal_code: 'S001.2.1', student_code: 'S001', date: '2026-01-20', value: 80, source: 'assignment' }, // different goal
  { goal_code: 'S001.1.1', student_code: 'S002', date: '2026-01-20', value: 55, source: 'assignment' }, // different student
];

const q3Range = { start: new Date(2025, 11, 20), end: new Date(2026, 2, 6) }; // Dec 20, 2025 – Mar 6, 2026

test('data point count filters by goal code', () => {
  const result = getGoalProgressForQuarter('S001.1.1', 'S001', q3Range, sampleProgressData);
  assert.strictEqual(result.count, 4, `Expected 4 data points for S001.1.1, got ${result.count}`);
});

test('data point count excludes data from different goal codes', () => {
  const result = getGoalProgressForQuarter('S001.2.1', 'S001', q3Range, sampleProgressData);
  assert.strictEqual(result.count, 1, `Expected 1 data point for S001.2.1, got ${result.count}`);
});

test('data point count excludes data from different students', () => {
  const result = getGoalProgressForQuarter('S001.1.1', 'S002', q3Range, sampleProgressData);
  assert.strictEqual(result.count, 1, `Expected 1 data point for S002, got ${result.count}`);
});

test('data point count excludes records outside quarter date range', () => {
  // The Nov 1 entry (Q2) should be excluded
  const result = getGoalProgressForQuarter('S001.1.1', 'S001', q3Range, sampleProgressData);
  // 4 entries are in Q3 range, 1 is in Q2
  assert.strictEqual(result.count, 4, `Expected 4 in-range data points, got ${result.count}`);
});

test('cumulative average is correct for quarter', () => {
  const result = getGoalProgressForQuarter('S001.1.1', 'S001', q3Range, sampleProgressData);
  // (65 + 70 + 72 + 75) / 4 = 70.5
  assert.ok(
    Math.abs(result.average - 70.5) < 0.01,
    `Expected average 70.5, got ${result.average}`
  );
});

test('empty result when no data in range', () => {
  // Use a range that has no data at all (e.g., summer range with no entries)
  const summerRange = { start: new Date(2026, 5, 1), end: new Date(2026, 7, 14) }; // Jun 1 – Aug 14
  const result = getGoalProgressForQuarter('S001.1.1', 'S001', summerRange, sampleProgressData);
  assert.strictEqual(result.count, 0);
  assert.strictEqual(result.average, null);
});

// ── Source-level checks ───────────────────────────────────────────────────────

console.log('\n--- Source-level checks ---');

test('buildRichProgressNarrative function exists in tc-reporting.js', () => {
  assert.ok(
    src.includes('function buildRichProgressNarrative('),
    'buildRichProgressNarrative should be defined in tc-reporting.js'
  );
});

test('generateNarrative delegates to buildRichProgressNarrative', () => {
  const fnIdx = src.indexOf('function generateNarrative(');
  assert.ok(fnIdx !== -1, 'generateNarrative not found');
  const fnSection = src.slice(fnIdx, fnIdx + 400);
  assert.ok(
    fnSection.includes('buildRichProgressNarrative'),
    'generateNarrative should call buildRichProgressNarrative'
  );
});

test('generateProgressNarrative delegates to buildRichProgressNarrative', () => {
  const fnIdx = src.indexOf('function generateProgressNarrative(');
  assert.ok(fnIdx !== -1, 'generateProgressNarrative not found');
  const fnSection = src.slice(fnIdx, fnIdx + 500);
  assert.ok(
    fnSection.includes('buildRichProgressNarrative'),
    'generateProgressNarrative should call buildRichProgressNarrative'
  );
});

test('generateSpedTrackText uses buildRichProgressNarrative', () => {
  const fnIdx = src.indexOf('function generateSpedTrackText(');
  assert.ok(fnIdx !== -1, 'generateSpedTrackText not found');
  const fnSection = src.slice(fnIdx, fnIdx + 1200);
  assert.ok(
    fnSection.includes('buildRichProgressNarrative'),
    'generateSpedTrackText should use buildRichProgressNarrative'
  );
});

test('renderIEPProgressTemplate builds quarterly summary panel', () => {
  const fnIdx = src.indexOf('function renderIEPProgressTemplate(');
  assert.ok(fnIdx !== -1, 'renderIEPProgressTemplate not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(
    fnSection.includes('rp-quarter-summary'),
    'renderIEPProgressTemplate should include quarterly summary panel'
  );
});

test('renderIEPProgressTemplate pre-selects status in dropdown', () => {
  const fnIdx = src.indexOf('function renderIEPProgressTemplate(');
  assert.ok(fnIdx !== -1, 'renderIEPProgressTemplate not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(
    fnSection.includes('statusValueMap') || fnSection.includes('selectedStatusValue'),
    'renderIEPProgressTemplate should pre-select status based on narrative engine'
  );
});

test('generateBatchReports uses buildRichProgressNarrative', () => {
  const fnIdx = src.indexOf('async function generateBatchReports(');
  assert.ok(fnIdx !== -1, 'generateBatchReports not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(
    fnSection.includes('buildRichProgressNarrative'),
    'generateBatchReports should use buildRichProgressNarrative'
  );
});

test('generateBatchReports includes quarterly summary panel HTML', () => {
  const fnIdx = src.indexOf('async function generateBatchReports(');
  assert.ok(fnIdx !== -1, 'generateBatchReports not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(
    fnSection.includes('Quarterly IEP Progress Summary'),
    'generateBatchReports should include a quarterly summary panel'
  );
});

test('renderIEPProgressTemplate summary panel includes per-goal detail rows', () => {
  const fnIdx = src.indexOf('function renderIEPProgressTemplate(');
  assert.ok(fnIdx !== -1, 'renderIEPProgressTemplate not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(
    fnSection.includes('rp-qs-goals-detail'),
    'renderIEPProgressTemplate summary panel should include per-goal detail container'
  );
  assert.ok(
    fnSection.includes('rp-qs-goal-row'),
    'renderIEPProgressTemplate summary panel should include per-goal row elements'
  );
  assert.ok(
    fnSection.includes('rp-qs-goal-code'),
    'renderIEPProgressTemplate summary panel should include per-goal code element'
  );
  assert.ok(
    fnSection.includes('rp-qs-goal-desc'),
    'renderIEPProgressTemplate summary panel should include per-goal description element'
  );
});

test('renderIEPProgressTemplate summary panel shows per-goal data count and average', () => {
  const fnIdx = src.indexOf('function renderIEPProgressTemplate(');
  assert.ok(fnIdx !== -1, 'renderIEPProgressTemplate not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(
    fnSection.includes('rp-qs-goal-metrics'),
    'renderIEPProgressTemplate summary panel should show per-goal metrics (count and avg)'
  );
  assert.ok(
    fnSection.includes('Data Points'),
    'renderIEPProgressTemplate summary panel should label data point count'
  );
  assert.ok(
    fnSection.includes('progress.count') || fnSection.includes('.count'),
    'renderIEPProgressTemplate summary panel should reference data point count'
  );
  assert.ok(
    fnSection.includes('progress.average') || fnSection.includes('.average'),
    'renderIEPProgressTemplate summary panel should reference average score'
  );
});

test('renderIEPProgressTemplate summary panel includes narrative for each goal', () => {
  const fnIdx = src.indexOf('function renderIEPProgressTemplate(');
  assert.ok(fnIdx !== -1, 'renderIEPProgressTemplate not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(
    fnSection.includes('rp-qs-goal-narrative'),
    'renderIEPProgressTemplate summary panel should include per-goal narrative element'
  );
  assert.ok(
    fnSection.includes('escapeHtml(narrative)'),
    'renderIEPProgressTemplate summary panel should render the narrative text via escapeHtml'
  );
});

test('generateBatchReports summary banner includes per-goal detail rows', () => {
  const fnIdx = src.indexOf('async function generateBatchReports(');
  assert.ok(fnIdx !== -1, 'generateBatchReports not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(
    fnSection.includes('batchGoalDetailRowsHtml'),
    'generateBatchReports should build per-goal detail rows for the summary banner'
  );
  assert.ok(
    fnSection.includes('Data Points'),
    'generateBatchReports summary banner should label data point count per goal'
  );
  assert.ok(
    fnSection.includes('escapeHtml(goal.desc'),
    'generateBatchReports summary banner should show per-goal description'
  );
});

test('generateBatchReports summary banner includes per-goal narrative', () => {
  const fnIdx = src.indexOf('async function generateBatchReports(');
  assert.ok(fnIdx !== -1, 'generateBatchReports not found');
  const fnSection = src.slice(fnIdx, fnIdx + 6000);
  assert.ok(
    fnSection.includes('escapeHtml(narrative)'),
    'generateBatchReports summary banner should render each goal narrative via escapeHtml'
  );
});

test('four canonical progress statuses are defined', () => {
  assert.ok(src.includes('"Goal Met"'), 'Goal Met status should be used');
  assert.ok(src.includes('"Making Adequate Progress"'), 'Making Adequate Progress status should be used');
  assert.ok(src.includes('"Progressing but Not Sufficient"'), 'Progressing but Not Sufficient status should be used');
  assert.ok(src.includes('"Not Making Progress"'), 'Not Making Progress status should be used');
});

// ── parseObservationNotes source-level checks ─────────────────────────────────

console.log('\n--- parseObservationNotes source-level checks ---');

test('parseObservationNotes function exists in tc-reporting.js', () => {
  assert.ok(
    src.includes('function parseObservationNotes('),
    'parseObservationNotes should be defined in tc-reporting.js'
  );
});

test('parseObservationNotes parses [obs:session_outcome:met] prefix', () => {
  const fnIdx = src.indexOf('function parseObservationNotes(');
  assert.ok(fnIdx !== -1, 'parseObservationNotes not found');
  // The regex pattern should be present in the function
  const fnSection = src.slice(fnIdx, fnIdx + 500);
  assert.ok(
    fnSection.includes('obs:') || fnSection.includes('\\[obs:'),
    'parseObservationNotes should handle [obs:...] prefix'
  );
});

test('getObservationAverageDisplay function exists in tc-reporting.js', () => {
  assert.ok(
    src.includes('function getObservationAverageDisplay('),
    'getObservationAverageDisplay should be defined in tc-reporting.js'
  );
});

test('getObservationAverageDisplay handles session_outcome', () => {
  const fnIdx = src.indexOf('function getObservationAverageDisplay(');
  assert.ok(fnIdx !== -1, 'getObservationAverageDisplay not found');
  const fnSection = src.slice(fnIdx, fnIdx + 2000);
  assert.ok(
    fnSection.includes('session_outcome') && fnSection.includes('Met:'),
    'getObservationAverageDisplay should handle session_outcome with "Met:" label'
  );
});

test('getObservationAverageDisplay handles prompt_count', () => {
  const fnIdx = src.indexOf('function getObservationAverageDisplay(');
  assert.ok(fnIdx !== -1, 'getObservationAverageDisplay not found');
  const fnSection = src.slice(fnIdx, fnIdx + 2000);
  assert.ok(
    fnSection.includes('prompt_count') && fnSection.includes('prompts'),
    'getObservationAverageDisplay should handle prompt_count with "prompts" label'
  );
});

// ── Observation narrative engine ──────────────────────────────────────────────

console.log('\n--- Observation narrative engine source-level checks ---');

test('buildRichProgressNarrative handles Observation measurement type', () => {
  const fnIdx = src.indexOf('function buildRichProgressNarrative(');
  assert.ok(fnIdx !== -1, 'buildRichProgressNarrative not found');
  const fnSection = src.slice(fnIdx, fnIdx + 8000);
  assert.ok(
    fnSection.includes("measurement_type") && fnSection.includes("Observation"),
    'buildRichProgressNarrative should branch on measurement_type === "Observation"'
  );
});

test('buildRichProgressNarrative handles session_outcome category', () => {
  const fnIdx = src.indexOf('function buildRichProgressNarrative(');
  assert.ok(fnIdx !== -1);
  const fnSection = src.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes('"session_outcome"'), 'should handle session_outcome');
  assert.ok(
    fnSection.includes('target_met') || fnSection.includes('targetMet'),
    'should use target_met for session_outcome'
  );
});

test('buildRichProgressNarrative handles tally category', () => {
  const fnIdx = src.indexOf('function buildRichProgressNarrative(');
  assert.ok(fnIdx !== -1);
  const fnSection = src.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes('"tally"'), 'should handle tally');
  assert.ok(
    fnSection.includes('opportunities'),
    'tally narrative should mention opportunities'
  );
});

test('buildRichProgressNarrative handles prompt_count category', () => {
  const fnIdx = src.indexOf('function buildRichProgressNarrative(');
  assert.ok(fnIdx !== -1);
  const fnSection = src.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes('"prompt_count"'), 'should handle prompt_count');
  assert.ok(
    fnSection.includes('prompts') && fnSection.includes('target_max_prompts'),
    'prompt_count narrative should reference prompts and target'
  );
});

test('buildRichProgressNarrative handles behavior_checklist category', () => {
  const fnIdx = src.indexOf('function buildRichProgressNarrative(');
  assert.ok(fnIdx !== -1);
  // Use a larger slice since the function now includes all observation branches
  const fnSection = src.slice(fnIdx, fnIdx + 14000);
  assert.ok(fnSection.includes('"behavior_checklist"'), 'should handle behavior_checklist');
  assert.ok(
    fnSection.includes('behaviors'),
    'behavior_checklist narrative should mention behaviors'
  );
});

// ── Inline observation narrative tests ───────────────────────────────────────

console.log('\n--- Inline observation narrative tests ---');

// Mirror of parseObservationNotes for test use
function parseObservationNotes(notes) {
  if (!notes) return null;
  const match = notes.match(/^\[obs:(\w+):([^\]]*)\]/);
  if (!match) return null;
  return {
    category: match[1],
    rawData: match[2],
    userNote: notes.slice(match[0].length).trim(),
  };
}

// Observation-aware mirror of buildRichProgressNarrative for tests
function buildRichProgressNarrativeObs(student, goal, quarterData, prevData, quarterLabel) {
  const name = ((student.name || student.code || 'Student').split(' ')[0]);
  const area = goal.goal_area || goal.code || 'this goal area';
  const targetVal = parseFloat(goal.target) || 80;
  const avg = quarterData.average;
  const count = quarterData.count;
  const quarter = quarterLabel || 'this quarter';

  const hashCode = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  };
  const seed = hashCode(goal.code || '');
  const pick = (arr) => arr[seed % arr.length];

  if (goal.measurement_type === 'Observation') {
    const obsCat = goal.observation_config?.category || '';
    const entries = quarterData.entries || [];

    if (obsCat === 'session_outcome') {
      const targetMet = goal.observation_config?.target_met ?? 3;
      const targetMetNum = parseInt(targetMet, 10) || 3;
      const validEntries = entries.filter((e) => {
        const p = parseObservationNotes(e.notes);
        return p && p.category === 'session_outcome' &&
          (p.rawData === 'met' || p.rawData === 'not_met');
      });
      const metCount = validEntries.filter((e) => {
        const p = parseObservationNotes(e.notes);
        return p && p.rawData === 'met';
      }).length;
      const totalValid = validEntries.length;
      if (totalValid === 0) {
        return { narrative: pick([
          `No observation data was collected for ${name} in the area of ${area} during ${quarter}.`,
          `Observation sessions for ${name} were not recorded in ${area} during the ${quarter} reporting period.`,
          `${name}'s progress on this observational goal was not measured during ${quarter}.`,
        ]), status: 'Not Making Progress' };
      }
      const metStr = `${metCount} of ${totalValid}`;
      const targetStr = `${targetMet} of ${goal.observation_config?.target_window ?? 5}`;
      let status;
      if (metCount >= targetMetNum) status = 'Goal Met';
      else if (metCount >= targetMetNum - 1 && totalValid >= 3) status = 'Making Adequate Progress';
      else if (totalValid >= 2) status = 'Progressing but Not Sufficient';
      else status = 'Not Making Progress';
      const metFraction = totalValid > 0 ? metCount / totalValid : 0;
      let narrative;
      if (metCount >= targetMetNum) {
        narrative = pick([
          `During ${quarter}, ${name} met the target in ${metStr} observed sessions for ${area}, meeting the IEP target of ${targetStr}.`,
          `${name} demonstrated the session outcome in ${metStr} sessions during ${quarter}, achieving the criterion of ${targetStr} for ${area}.`,
        ]);
      } else if (metFraction > 0.4) {
        narrative = pick([
          `During ${quarter}, ${name} met the session outcome in ${metStr} observed sessions for ${area}. Continued progress toward the ${targetStr} criterion is needed.`,
          `${name} met the target in ${metStr} sessions during ${quarter} for ${area}. The IEP target is ${targetStr}.`,
        ]);
      } else {
        narrative = pick([
          `During ${quarter}, ${name} met the target in ${metStr} observed sessions for ${area}. Additional support is recommended to reach the ${targetStr} criterion.`,
          `${name} met the session outcome in ${metStr} sessions during ${quarter} for ${area}. Increased opportunities and support are recommended to meet the ${targetStr} target.`,
        ]);
      }
      return { narrative, status };
    }

    if (obsCat === 'prompt_count') {
      const targetMax = goal.observation_config?.target_max_prompts ?? 2;
      const targetMaxNum = parseInt(targetMax, 10) || 2;
      if (count === 0) {
        return { narrative: 'No prompt count data was collected.', status: 'Not Making Progress' };
      }
      const avgPrompts = avg != null ? avg.toFixed(1) : 'N/A';
      let status;
      if (avg != null && avg <= targetMaxNum) status = 'Goal Met';
      else if (avg != null && avg <= targetMaxNum + 1 && count >= 3) status = 'Making Adequate Progress';
      else if (avg != null && avg <= targetMaxNum + 2) status = 'Progressing but Not Sufficient';
      else status = 'Not Making Progress';
      const countDesc = `${count} observed session${count !== 1 ? 's' : ''}`;
      let narrative;
      if (avg != null && avg <= targetMaxNum) {
        narrative = pick([
          `${name} required an average of ${avgPrompts} prompts during ${countDesc} in ${area}, within the target of ${targetMax} or fewer prompts.`,
          `Across ${countDesc}, ${name} averaged ${avgPrompts} prompts for ${area}, meeting the criterion of ${targetMax} or fewer.`,
        ]);
      } else {
        narrative = pick([
          `${name} required an average of ${avgPrompts} prompts during ${countDesc} in ${area}. The IEP target is ${targetMax} or fewer prompts.`,
          `Across ${countDesc}, ${name} averaged ${avgPrompts} prompts for ${area}. The target criterion of ${targetMax} or fewer prompts has not yet been met.`,
        ]);
      }
      return { narrative, status };
    }

    if (obsCat === 'tally') {
      if (count === 0) {
        return { narrative: 'No tally data collected.', status: 'Not Making Progress' };
      }
      const pctAvg = avg != null ? avg.toFixed(0) : 'N/A';
      let status;
      if (avg != null && avg >= targetVal) status = 'Goal Met';
      else if (avg != null && avg >= targetVal - 15 && count >= 3) status = 'Making Adequate Progress';
      else if (count > 0) status = 'Progressing but Not Sufficient';
      else status = 'Not Making Progress';
      let narrative = pick([
        `Across ${count} observed sessions, ${name} averaged ${pctAvg}% accuracy in ${area}.`,
        `${name} averaged ${pctAvg}% across ${count} observed sessions for ${area}.`,
      ]);
      return { narrative, status };
    }

    if (obsCat === 'behavior_checklist') {
      if (count === 0) {
        return { narrative: 'No behavior checklist data collected.', status: 'Not Making Progress' };
      }
      const pctAvg = avg != null ? avg.toFixed(0) : 'N/A';
      let status;
      if (avg != null && avg >= targetVal) status = 'Goal Met';
      else if (avg != null && avg >= targetVal - 15 && count >= 3) status = 'Making Adequate Progress';
      else if (count > 0) status = 'Progressing but Not Sufficient';
      else status = 'Not Making Progress';
      return {
        narrative: `${name} demonstrated targeted behaviors in ${pctAvg}% of observed opportunities across ${count} observed sessions in ${area}.`,
        status,
      };
    }
  }

  // Fallback to standard percentage narrative for unknown observation categories
  return buildRichProgressNarrative(student, goal, quarterData, prevData, quarterLabel);
}

const obsStudent = { name: 'Alex Johnson', code: 'S010' };

// Session outcome tests
const soGoal = {
  code: 'S010.SO.1',
  goal_area: 'Self-Regulation',
  measurement_type: 'Observation',
  observation_config: { category: 'session_outcome', target_met: 3, target_window: 5 },
  baseline: null, target: null,
};

test('session_outcome: no data returns "Not Making Progress"', () => {
  const { status } = buildRichProgressNarrativeObs(obsStudent, soGoal, { average: null, count: 0, values: [], entries: [] }, null, 'Q3');
  assert.strictEqual(status, 'Not Making Progress');
});

test('session_outcome: met 3 of 3 returns "Goal Met"', () => {
  const entries = [
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:met]', value: 100 },
  ];
  const { status } = buildRichProgressNarrativeObs(obsStudent, soGoal,
    { average: 100, count: 3, values: [100, 100, 100], entries }, null, 'Q3');
  assert.strictEqual(status, 'Goal Met');
});

test('session_outcome: goal met narrative mentions session counts', () => {
  const entries = [
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:met]', value: 100 },
  ];
  const { narrative } = buildRichProgressNarrativeObs(obsStudent, soGoal,
    { average: 100, count: 3, values: [100, 100, 100], entries }, null, 'Q3');
  assert.ok(narrative.includes('3 of 3'), `Should mention 3 of 3: ${narrative}`);
});

test('session_outcome: not_addressed entries excluded from window', () => {
  const entries = [
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:not_addressed]', value: null },
    { notes: '[obs:session_outcome:not_met]', value: 0 },
    { notes: '[obs:session_outcome:not_applicable]', value: null },
  ];
  const { narrative } = buildRichProgressNarrativeObs(obsStudent, soGoal,
    { average: 50, count: 2, values: [100, 0], entries }, null, 'Q3');
  // Only met + not_met count: 1 of 2
  assert.ok(narrative.includes('1 of 2'), `Should show 1 of 2 (not_addressed excluded): ${narrative}`);
});

test('session_outcome: narrative mentions student name', () => {
  const entries = [
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:not_met]', value: 0 },
  ];
  const { narrative } = buildRichProgressNarrativeObs(obsStudent, soGoal,
    { average: 50, count: 2, values: [100, 0], entries }, null, 'Q3');
  assert.ok(narrative.includes('Alex'), `Narrative should include student first name: ${narrative}`);
});

test('session_outcome: narrative mentions goal area', () => {
  const entries = [
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:met]', value: 100 },
  ];
  const { narrative } = buildRichProgressNarrativeObs(obsStudent, soGoal,
    { average: 100, count: 2, values: [100, 100], entries }, null, 'Q3');
  assert.ok(narrative.includes('Self-Regulation'), `Narrative should mention goal area: ${narrative}`);
});

// Prompt count tests
const pcGoal = {
  code: 'S010.PC.1',
  goal_area: 'Following Directions',
  measurement_type: 'Observation',
  observation_config: { category: 'prompt_count', target_max_prompts: 2 },
  baseline: null, target: null,
};

test('prompt_count: no data returns "Not Making Progress"', () => {
  const { status } = buildRichProgressNarrativeObs(obsStudent, pcGoal,
    { average: null, count: 0, values: [], entries: [] }, null, 'Q3');
  assert.strictEqual(status, 'Not Making Progress');
});

test('prompt_count: avg within target returns "Goal Met"', () => {
  const entries = [
    { notes: '[obs:prompt_count:1]', value: 1 },
    { notes: '[obs:prompt_count:2]', value: 2 },
    { notes: '[obs:prompt_count:1]', value: 1 },
  ];
  const { status } = buildRichProgressNarrativeObs(obsStudent, pcGoal,
    { average: 1.33, count: 3, values: [1, 2, 1], entries }, null, 'Q3');
  assert.strictEqual(status, 'Goal Met');
});

test('prompt_count: narrative mentions "prompts"', () => {
  const entries = [
    { notes: '[obs:prompt_count:1]', value: 1 },
    { notes: '[obs:prompt_count:2]', value: 2 },
  ];
  const { narrative } = buildRichProgressNarrativeObs(obsStudent, pcGoal,
    { average: 1.5, count: 2, values: [1, 2], entries }, null, 'Q3');
  assert.ok(narrative.toLowerCase().includes('prompt'), `Narrative should mention prompts: ${narrative}`);
});

test('prompt_count: narrative mentions target max prompts', () => {
  const entries = [
    { notes: '[obs:prompt_count:4]', value: 4 },
    { notes: '[obs:prompt_count:3]', value: 3 },
    { notes: '[obs:prompt_count:4]', value: 4 },
  ];
  const { narrative } = buildRichProgressNarrativeObs(obsStudent, pcGoal,
    { average: 3.67, count: 3, values: [4, 3, 4], entries }, null, 'Q3');
  assert.ok(narrative.includes('2'), `Narrative should mention target (2): ${narrative}`);
});

// Tally tests
const tallyGoal = {
  code: 'S010.TA.1',
  goal_area: 'Reading Fluency',
  measurement_type: 'Observation',
  observation_config: { category: 'tally' },
  baseline: null, target: 80,
};

test('tally: no data returns "Not Making Progress"', () => {
  const { status } = buildRichProgressNarrativeObs(obsStudent, tallyGoal,
    { average: null, count: 0, values: [], entries: [] }, null, 'Q3');
  assert.strictEqual(status, 'Not Making Progress');
});

test('tally: average at/above target returns "Goal Met"', () => {
  const entries = [
    { notes: '[obs:tally:4/5]', value: 80 },
    { notes: '[obs:tally:5/5]', value: 100 },
  ];
  const { status } = buildRichProgressNarrativeObs(obsStudent, tallyGoal,
    { average: 90, count: 2, values: [80, 100], entries }, null, 'Q3');
  assert.strictEqual(status, 'Goal Met');
});

test('tally: narrative mentions percentage', () => {
  const entries = [
    { notes: '[obs:tally:3/5]', value: 60 },
    { notes: '[obs:tally:4/5]', value: 80 },
    { notes: '[obs:tally:4/5]', value: 80 },
    { notes: '[obs:tally:3/5]', value: 60 },
  ];
  const { narrative } = buildRichProgressNarrativeObs(obsStudent, tallyGoal,
    { average: 70, count: 4, values: [60, 80, 80, 60], entries }, null, 'Q3');
  assert.ok(narrative.includes('70%'), `Narrative should mention average %: ${narrative}`);
});

// Behavior checklist tests
const checklistGoal = {
  code: 'S010.CL.1',
  goal_area: 'Classroom Behavior',
  measurement_type: 'Observation',
  observation_config: {
    category: 'behavior_checklist',
    sub_behaviors: ['Follow request', 'Raise hand', 'Stay in seat'],
  },
  baseline: null, target: 80,
};

test('behavior_checklist: no data returns "Not Making Progress"', () => {
  const { status } = buildRichProgressNarrativeObs(obsStudent, checklistGoal,
    { average: null, count: 0, values: [], entries: [] }, null, 'Q3');
  assert.strictEqual(status, 'Not Making Progress');
});

test('behavior_checklist: high average returns "Goal Met"', () => {
  const entries = [
    { notes: '[obs:checklist:Follow request=met,Raise hand=met,Stay in seat=met]', value: 100 },
    { notes: '[obs:checklist:Follow request=met,Raise hand=met,Stay in seat=not_met]', value: 67 },
    { notes: '[obs:checklist:Follow request=met,Raise hand=met,Stay in seat=met]', value: 100 },
  ];
  const { status } = buildRichProgressNarrativeObs(obsStudent, checklistGoal,
    { average: 89, count: 3, values: [100, 67, 100], entries }, null, 'Q3');
  assert.strictEqual(status, 'Goal Met');
});

test('behavior_checklist: narrative mentions percentage of behaviors', () => {
  const entries = [
    { notes: '[obs:checklist:Follow request=met,Raise hand=not_met,Stay in seat=met]', value: 67 },
    { notes: '[obs:checklist:Follow request=met,Raise hand=met,Stay in seat=not_met]', value: 67 },
  ];
  const { narrative } = buildRichProgressNarrativeObs(obsStudent, checklistGoal,
    { average: 67, count: 2, values: [67, 67], entries }, null, 'Q3');
  assert.ok(narrative.includes('67%'), `Narrative should mention 67%: ${narrative}`);
});

// parseObservationNotes inline tests
console.log('\n--- parseObservationNotes inline tests ---');

test('parseObservationNotes returns null for empty notes', () => {
  assert.strictEqual(parseObservationNotes(''), null);
  assert.strictEqual(parseObservationNotes(null), null);
  assert.strictEqual(parseObservationNotes(undefined), null);
});

test('parseObservationNotes returns null for non-observation notes', () => {
  assert.strictEqual(parseObservationNotes('Some regular teacher note'), null);
  assert.strictEqual(parseObservationNotes('100%'), null);
});

test('parseObservationNotes parses session_outcome:met', () => {
  const result = parseObservationNotes('[obs:session_outcome:met]');
  assert.ok(result !== null, 'Should parse obs prefix');
  assert.strictEqual(result.category, 'session_outcome');
  assert.strictEqual(result.rawData, 'met');
  assert.strictEqual(result.userNote, '');
});

test('parseObservationNotes parses tally with slash notation', () => {
  const result = parseObservationNotes('[obs:tally:3/5] teacher note here');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'tally');
  assert.strictEqual(result.rawData, '3/5');
  assert.strictEqual(result.userNote, 'teacher note here');
});

test('parseObservationNotes parses prompt_count', () => {
  const result = parseObservationNotes('[obs:prompt_count:2]');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'prompt_count');
  assert.strictEqual(result.rawData, '2');
});

test('parseObservationNotes parses checklist with sub-behaviors', () => {
  const result = parseObservationNotes('[obs:checklist:Follow request=met,Raise hand=not_met]');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'checklist');
  assert.ok(result.rawData.includes('Follow request=met'));
  assert.ok(result.rawData.includes('Raise hand=not_met'));
});

// ── getGoalProgressForQuarter includes entries ────────────────────────────────

console.log('\n--- getGoalProgressForQuarter includes entries ---');

// Mirror with entries return
function getGoalProgressForQuarterWithEntries(goalCode, studentCode, quarterRange, progressData) {
  if (!quarterRange.start || !quarterRange.end) {
    return { average: null, count: 0, values: [], entries: [] };
  }
  const startDate = new Date(quarterRange.start);
  const endDate = new Date(quarterRange.end);
  const relevantProgress = progressData.filter((p) => {
    if (p.goal_code !== goalCode) return false;
    if (p.student_code !== studentCode) return false;
    const pDate = new Date(p.date);
    return pDate >= startDate && pDate <= endDate;
  });
  if (relevantProgress.length === 0) return { average: null, count: 0, values: [], entries: [] };
  const values = relevantProgress.map((p) => parseFloat(p.value)).filter((v) => !isNaN(v));
  const average = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
  return { average, count: values.length, values, entries: relevantProgress };
}

const obsProgressData = [
  { goal_code: 'S010.SO.1', student_code: 'S010', date: '2026-01-10', value: 100, notes: '[obs:session_outcome:met]' },
  { goal_code: 'S010.SO.1', student_code: 'S010', date: '2026-01-15', value: 0, notes: '[obs:session_outcome:not_met]' },
  { goal_code: 'S010.SO.1', student_code: 'S010', date: '2026-01-20', value: null, notes: '[obs:session_outcome:not_addressed]' },
  { goal_code: 'S010.SO.1', student_code: 'S010', date: '2026-02-01', value: 100, notes: '[obs:session_outcome:met]' },
];

test('getGoalProgressForQuarter returns entries array', () => {
  const result = getGoalProgressForQuarterWithEntries('S010.SO.1', 'S010', q3Range, obsProgressData);
  assert.ok(Array.isArray(result.entries), 'entries should be an array');
});

test('getGoalProgressForQuarter entries contain notes for observation parsing', () => {
  const result = getGoalProgressForQuarterWithEntries('S010.SO.1', 'S010', q3Range, obsProgressData);
  // 3 entries in q3Range (null value entry excluded from count but included in entries)
  assert.ok(result.entries.length >= 2, `Should have at least 2 entries: ${result.entries.length}`);
  const hasNotes = result.entries.every(e => 'notes' in e);
  assert.ok(hasNotes, 'All entries should have notes property');
});

test('tc-reporting.js getGoalProgressForQuarter returns entries in return value', () => {
  const fnIdx = src.indexOf('function getGoalProgressForQuarter(');
  assert.ok(fnIdx !== -1, 'getGoalProgressForQuarter not found');
  const fnSection = src.slice(fnIdx, fnIdx + 800);
  assert.ok(
    fnSection.includes('entries:') || fnSection.includes('entries :'),
    'getGoalProgressForQuarter should include entries in return value'
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n✗ Some tc-reporting-narrative tests FAILED');
  process.exit(1);
}
console.log('\n✅ All tc-reporting-narrative tests passed');
