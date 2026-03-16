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
  const fnSection = src.slice(fnIdx, fnIdx + 3500);
  assert.ok(
    fnSection.includes('rp-quarter-summary'),
    'renderIEPProgressTemplate should include quarterly summary panel'
  );
});

test('renderIEPProgressTemplate pre-selects status in dropdown', () => {
  const fnIdx = src.indexOf('function renderIEPProgressTemplate(');
  assert.ok(fnIdx !== -1, 'renderIEPProgressTemplate not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('statusValueMap') || fnSection.includes('selectedStatusValue'),
    'renderIEPProgressTemplate should pre-select status based on narrative engine'
  );
});

test('generateBatchReports uses buildRichProgressNarrative', () => {
  const fnIdx = src.indexOf('async function generateBatchReports(');
  assert.ok(fnIdx !== -1, 'generateBatchReports not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('buildRichProgressNarrative'),
    'generateBatchReports should use buildRichProgressNarrative'
  );
});

test('generateBatchReports includes quarterly summary panel HTML', () => {
  const fnIdx = src.indexOf('async function generateBatchReports(');
  assert.ok(fnIdx !== -1, 'generateBatchReports not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('Quarterly IEP Progress Summary'),
    'generateBatchReports should include a quarterly summary panel'
  );
});

test('four canonical progress statuses are defined', () => {
  assert.ok(src.includes('"Goal Met"'), 'Goal Met status should be used');
  assert.ok(src.includes('"Making Adequate Progress"'), 'Making Adequate Progress status should be used');
  assert.ok(src.includes('"Progressing but Not Sufficient"'), 'Progressing but Not Sufficient status should be used');
  assert.ok(src.includes('"Not Making Progress"'), 'Not Making Progress status should be used');
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n✗ Some tc-reporting-narrative tests FAILED');
  process.exit(1);
}
console.log('\n✅ All tc-reporting-narrative tests passed');
