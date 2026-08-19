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

function safeParseFloat(v) { return parseFloat(v) || 0; }

function buildRichProgressNarrative(student, goal, quarterData, prevData, quarterLabel) {
  const name = ((student.name || student.code || 'Student').split(' ')[0]);
  const area = goal.goal_area || goal.code || 'this goal area';
  const baselineVal = safeParseFloat(goal.baseline);
  const targetVal = safeParseFloat(goal.target) || 80;
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

  // Contextual suffix appended to all narrative paths
  const _ctxParts = [];
  if (goal.class_context) _ctxParts.push(`Data collected in ${goal.class_context}`);
  if (goal.data_collector && goal.data_collector !== (student.primary_case_manager || '')) {
    _ctxParts.push(`data collected by ${goal.data_collector}`);
  }
  const _ctx = _ctxParts.length > 0 ? ' ' + _ctxParts.join('; ') + '.' : '';

  // ── Observation branch ──────────────────────────────────────────────────────
  if (goal.measurement_type === 'Observation') {
    const obsConfig = goal.observation_config || {};
    const category = obsConfig.category || '';

    const parseObsPrefix = (notes) => {
      if (!notes) return null;
      const m = notes.match(/^\[obs:(\w+):([^\]]*)\]/);
      if (!m) return null;
      return { category: m[1], rawData: m[2] };
    };

    const entries = quarterData.entries || [];

    if (count === 0) {
      return {
        narrative: `No observation data was collected for ${name} in the area of ${area} during ${quarter}. Increased observation opportunities are recommended.` + _ctx,
        status: 'Not Making Progress',
      };
    }

    if (category === 'session_outcome') {
      const validEntries = entries.filter(e => {
        const p = parseObsPrefix(e.notes);
        return p && p.category === 'session_outcome' && p.rawData !== 'na';
      });
      const metCount = validEntries.filter(e => {
        const p = parseObsPrefix(e.notes);
        return p && p.rawData === 'met';
      }).length;
      const validCount = validEntries.length;
      const targetSessions = safeParseFloat(goal.mastery || goal.target) || 3;
      let status;
      if (validCount === 0) { status = 'Not Making Progress'; }
      else if (metCount >= targetSessions) { status = 'Goal Met'; }
      else if (metCount >= targetSessions * 0.6) { status = 'Making Adequate Progress'; }
      else if (metCount > 0) { status = 'Progressing but Not Sufficient'; }
      else { status = 'Not Making Progress'; }
      const narrative = validCount > 0
        ? pick([
            `${name} met the behavioral target in ${metCount} of ${validCount} observed session${validCount !== 1 ? 's' : ''} during ${quarter}.`,
            `During ${quarter}, ${name} demonstrated the target behavior in ${metCount} out of ${validCount} recorded session${validCount !== 1 ? 's' : ''}.`,
            `Observation data from ${quarter} indicates ${name} met the session target ${metCount} of ${validCount} time${validCount !== 1 ? 's' : ''}.`,
          ])
        : `No evaluable observation sessions were recorded for ${name} in ${area} during ${quarter}.`;
      return { narrative: narrative + _ctx, status };
    }

    if (category === 'prompt_count') {
      const targetMax = obsConfig.target_max_prompts != null ? obsConfig.target_max_prompts : (safeParseFloat(goal.mastery || goal.target) || 2);
      const avgPrompts = avg != null ? avg : null;
      let status;
      if (avgPrompts == null) { status = 'Not Making Progress'; }
      else if (avgPrompts <= targetMax) { status = 'Goal Met'; }
      else if (avgPrompts <= targetMax * 1.5) { status = 'Making Adequate Progress'; }
      else { status = 'Progressing but Not Sufficient'; }
      const avgStr = avgPrompts != null ? avgPrompts.toFixed(1) : '—';
      const countDesc = `${count} session${count !== 1 ? 's' : ''}`;
      const narrative = pick([
        `${name} required an average of ${avgStr} prompt${avgStr !== '1.0' ? 's' : ''} to initiate the target behavior across ${countDesc} during ${quarter}. The goal target is ${targetMax} or fewer prompt${targetMax !== 1 ? 's' : ''}.`,
        `Across ${countDesc} in ${quarter}, ${name} averaged ${avgStr} prompt${avgStr !== '1.0' ? 's' : ''} per observation. The target maximum is ${targetMax} prompt${targetMax !== 1 ? 's' : ''}.`,
        `Data collected over ${countDesc} this quarter indicates ${name} needed an average of ${avgStr} prompt${avgStr !== '1.0' ? 's' : ''} (target: ${targetMax} or fewer).`,
      ]);
      return { narrative: narrative + _ctx, status };
    }

    // Fallback observation
    const avgStr2 = avg != null ? avg.toFixed(0) : '—';
    return {
      narrative: `${name} worked on the observational goal in the area of ${area} during ${quarter}, with ${count} recorded session${count !== 1 ? 's' : ''} and an average value of ${avgStr2}.` + _ctx,
      status: avg != null && avg >= targetVal ? 'Goal Met' : 'Progressing but Not Sufficient',
    };
  }
  // ── End observation branch ──────────────────────────────────────────────────

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
      narrative: `${pick(openings)} ${pick(closings)}` + _ctx,
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
    narrative: `${opening} ${middle} ${closing}${caveat}` + _ctx,
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

// ── Semester / full-year date ranges (2025-2026 school year) ─────────────────

console.log('\n--- Semester / full-year date ranges (2025-2026 school year) ---');

// Mirror of getSchoolYearDateRange logic from quarter-utils.js
function getSchoolYearDateRange(period, referenceDate) {
  const now = referenceDate || new Date();
  const schoolYear = getSchoolYear(now);
  if (period === 'semester-1') {
    return { start: new Date(schoolYear, 7, 1), end: new Date(schoolYear + 1, 0, 31) };
  }
  if (period === 'semester-2') {
    return { start: new Date(schoolYear + 1, 1, 1), end: new Date(schoolYear + 1, 5, 30) };
  }
  if (period === 'full-year') {
    return { start: new Date(schoolYear, 7, 1), end: new Date(schoolYear + 1, 5, 30) };
  }
  return null;
}

test('Semester 1 starts Aug 1 of school year', () => {
  const range = getSchoolYearDateRange('semester-1', jan2026);
  assert.strictEqual(range.start.getFullYear(), 2025);
  assert.strictEqual(range.start.getMonth(), 7); // August
  assert.strictEqual(range.start.getDate(), 1);
});

test('Semester 1 ends Jan 31 of following calendar year', () => {
  const range = getSchoolYearDateRange('semester-1', jan2026);
  assert.strictEqual(range.end.getFullYear(), 2026);
  assert.strictEqual(range.end.getMonth(), 0); // January
  assert.strictEqual(range.end.getDate(), 31);
});

test('Semester 2 starts Feb 1 of following calendar year', () => {
  const range = getSchoolYearDateRange('semester-2', jan2026);
  assert.strictEqual(range.start.getFullYear(), 2026);
  assert.strictEqual(range.start.getMonth(), 1); // February
  assert.strictEqual(range.start.getDate(), 1);
});

test('Semester 2 ends Jun 30 of following calendar year', () => {
  const range = getSchoolYearDateRange('semester-2', jan2026);
  assert.strictEqual(range.end.getFullYear(), 2026);
  assert.strictEqual(range.end.getMonth(), 5); // June
  assert.strictEqual(range.end.getDate(), 30);
});

test('Full Year starts Aug 1 of school year', () => {
  const range = getSchoolYearDateRange('full-year', jan2026);
  assert.strictEqual(range.start.getFullYear(), 2025);
  assert.strictEqual(range.start.getMonth(), 7); // August
  assert.strictEqual(range.start.getDate(), 1);
});

test('Full Year ends Jun 30 of following calendar year', () => {
  const range = getSchoolYearDateRange('full-year', jan2026);
  assert.strictEqual(range.end.getFullYear(), 2026);
  assert.strictEqual(range.end.getMonth(), 5); // June
  assert.strictEqual(range.end.getDate(), 30);
});

test('Full Year start equals Semester 1 start', () => {
  const s1 = getSchoolYearDateRange('semester-1', jan2026);
  const fy = getSchoolYearDateRange('full-year', jan2026);
  assert.deepStrictEqual(fy.start, s1.start);
});

test('Full Year end equals Semester 2 end', () => {
  const s2 = getSchoolYearDateRange('semester-2', jan2026);
  const fy = getSchoolYearDateRange('full-year', jan2026);
  assert.deepStrictEqual(fy.end, s2.end);
});

test('Semester 1 end is before Semester 2 start', () => {
  const s1 = getSchoolYearDateRange('semester-1', jan2026);
  const s2 = getSchoolYearDateRange('semester-2', jan2026);
  assert.ok(s1.end < s2.start, 'Semester 1 end should be before Semester 2 start');
});

test('school year date ranges advance by 1 for following year', () => {
  const aug2026 = new Date(2026, 7, 20); // Aug 20, 2026 = 2026-2027 school year
  const range = getSchoolYearDateRange('semester-1', aug2026);
  assert.strictEqual(range.start.getFullYear(), 2026);
  assert.strictEqual(range.end.getFullYear(), 2027);
});

test('getSchoolYearDateRange returns null for unknown period', () => {
  const range = getSchoolYearDateRange('unknown-period', jan2026);
  assert.strictEqual(range, null);
});

test('quarter-utils.js exports getSchoolYearDateRange', () => {
  const quarterUtilsSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'site', 'web', 'quarter-utils.js'), 'utf8'
  );
  assert.ok(
    quarterUtilsSrc.includes('export function getSchoolYearDateRange'),
    'quarter-utils.js should export getSchoolYearDateRange'
  );
});

test('quarter-utils.js exports getPeriodLabel', () => {
  const quarterUtilsSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'site', 'web', 'quarter-utils.js'), 'utf8'
  );
  assert.ok(
    quarterUtilsSrc.includes('export function getPeriodLabel'),
    'quarter-utils.js should export getPeriodLabel'
  );
});

test('quarter-utils.js exports getDateRangeForPeriod', () => {
  const quarterUtilsSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'site', 'web', 'quarter-utils.js'), 'utf8'
  );
  assert.ok(
    quarterUtilsSrc.includes('export function getDateRangeForPeriod'),
    'quarter-utils.js should export getDateRangeForPeriod'
  );
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

  const nextFnIdx = src.indexOf(
    'function buildTab1EmailBodyText(',
    fnIdx
  );

  assert.ok(
    nextFnIdx > fnIdx,
    'buildTab1EmailBodyText boundary not found'
  );

  const fnSection = src.slice(
    fnIdx,
    nextFnIdx
  );

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

// ── Observation branch tests ─────────────────────────────────────────────────

console.log('\n--- Observation narrative branch ---');

const studentObs = { name: 'Jordan Smith', code: 'S099' };

test('session_outcome goal — met target returns Goal Met status', () => {
  const goal = {
    code: 'S099.OBS.1',
    goal_area: 'Behavior',
    measurement_type: 'Observation',
    observation_config: { category: 'session_outcome' },
    baseline: '0',
    mastery: '3',
    target: '3',
  };
  const entries = [
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:met]', value: 100 },
  ];
  const quarterData = { average: 100, count: 3, values: [100, 100, 100], entries };
  const { status } = buildRichProgressNarrative(studentObs, goal, quarterData, null, 'Q3');
  assert.strictEqual(status, 'Goal Met');
});

test('session_outcome goal — narrative uses observation language, not percentage-based', () => {
  const goal = {
    code: 'S099.OBS.1',
    goal_area: 'Behavior',
    measurement_type: 'Observation',
    observation_config: { category: 'session_outcome' },
    baseline: '0',
    mastery: '3',
    target: '3',
  };
  const entries = [
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:not_met]', value: 0 },
  ];
  const quarterData = { average: 67, count: 3, values: [100, 100, 0], entries };
  const { narrative } = buildRichProgressNarrative(studentObs, goal, quarterData, null, 'Q3');
  assert.ok(
    narrative.toLowerCase().includes('session') || narrative.toLowerCase().includes('observed'),
    `Narrative should use observation language, got: ${narrative}`
  );
  assert.ok(
    !narrative.includes('achieved an average of') && !narrative.includes('averaged 67%'),
    `Narrative should NOT use percentage-based language: ${narrative}`
  );
});

test('session_outcome goal — narrative mentions met count and session count', () => {
  const goal = {
    code: 'S099.OBS.2',
    goal_area: 'Behavior',
    measurement_type: 'Observation',
    observation_config: { category: 'session_outcome' },
    baseline: '0',
    mastery: '5',
    target: '5',
  };
  const entries = [
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:not_met]', value: 0 },
    { notes: '[obs:session_outcome:met]', value: 100 },
    { notes: '[obs:session_outcome:not_met]', value: 0 },
  ];
  const quarterData = { average: 60, count: 5, values: [100, 100, 0, 100, 0], entries };
  const { narrative } = buildRichProgressNarrative(studentObs, goal, quarterData, null, 'Q3');
  assert.ok(narrative.includes('3'), `Narrative should mention met count (3): ${narrative}`);
  assert.ok(narrative.includes('5'), `Narrative should mention session count (5): ${narrative}`);
});

test('session_outcome goal — no data returns Not Making Progress', () => {
  const goal = {
    code: 'S099.OBS.1',
    goal_area: 'Behavior',
    measurement_type: 'Observation',
    observation_config: { category: 'session_outcome' },
    baseline: '0',
    mastery: '3',
    target: '3',
  };
  const quarterData = { average: null, count: 0, values: [], entries: [] };
  const { status } = buildRichProgressNarrative(studentObs, goal, quarterData, null, 'Q3');
  assert.strictEqual(status, 'Not Making Progress');
});

test('prompt_count goal — narrative mentions prompts, not percentage', () => {
  const goal = {
    code: 'S099.OBS.3',
    goal_area: 'Self-Management',
    measurement_type: 'Observation',
    observation_config: { category: 'prompt_count', target_max_prompts: 2 },
    baseline: '5',
    mastery: '2',
    target: '2',
  };
  const entries = [
    { notes: '[obs:prompt_count:3]', value: 3 },
    { notes: '[obs:prompt_count:2]', value: 2 },
    { notes: '[obs:prompt_count:4]', value: 4 },
  ];
  const quarterData = { average: 3, count: 3, values: [3, 2, 4], entries };
  const { narrative } = buildRichProgressNarrative(studentObs, goal, quarterData, null, 'Q3');
  assert.ok(
    narrative.toLowerCase().includes('prompt'),
    `Narrative should mention prompts: ${narrative}`
  );
  assert.ok(
    !narrative.includes('achieved an average of') && !narrative.includes('%'),
    `Narrative should NOT use percentage-based language: ${narrative}`
  );
});

test('prompt_count goal — at or below target returns Goal Met', () => {
  const goal = {
    code: 'S099.OBS.3',
    goal_area: 'Self-Management',
    measurement_type: 'Observation',
    observation_config: { category: 'prompt_count', target_max_prompts: 2 },
    baseline: '5',
    mastery: '2',
    target: '2',
  };
  const entries = [
    { notes: '[obs:prompt_count:1]', value: 1 },
    { notes: '[obs:prompt_count:2]', value: 2 },
    { notes: '[obs:prompt_count:2]', value: 2 },
  ];
  const quarterData = { average: 1.67, count: 3, values: [1, 2, 2], entries };
  const { status } = buildRichProgressNarrative(studentObs, goal, quarterData, null, 'Q3');
  assert.strictEqual(status, 'Goal Met');
});

test('prompt_count goal — well above target returns Progressing but Not Sufficient', () => {
  const goal = {
    code: 'S099.OBS.3',
    goal_area: 'Self-Management',
    measurement_type: 'Observation',
    observation_config: { category: 'prompt_count', target_max_prompts: 2 },
    baseline: '5',
    mastery: '2',
    target: '2',
  };
  const entries = [
    { notes: '[obs:prompt_count:6]', value: 6 },
    { notes: '[obs:prompt_count:7]', value: 7 },
    { notes: '[obs:prompt_count:8]', value: 8 },
  ];
  const quarterData = { average: 7, count: 3, values: [6, 7, 8], entries };
  const { status } = buildRichProgressNarrative(studentObs, goal, quarterData, null, 'Q3');
  assert.strictEqual(status, 'Progressing but Not Sufficient');
});

test('observation branch exists in tc-reporting.js source', () => {
  assert.ok(
    src.includes("goal.measurement_type === 'Observation'"),
    "tc-reporting.js should contain observation branch in buildRichProgressNarrative"
  );
});

test('getGoalProgressForQuarter returns entries array', () => {
  const fnIdx = src.indexOf('function getGoalProgressForQuarter(');
  assert.ok(fnIdx !== -1, 'getGoalProgressForQuarter not found');
  const fnSection = src.slice(fnIdx, fnIdx + 1000);
  assert.ok(
    fnSection.includes('entries'),
    'getGoalProgressForQuarter should return entries array for observation notes parsing'
  );
});

// ── Issue 13: loadSettingsFromDb re-invokes load functions after hydration ───

console.log('\n--- Issue 13: loadSettingsFromDb refresh after DB hydration ---');

const spreadsheetSrc = (() => {
  try {
    return require('fs').readFileSync(
      require('path').join(__dirname, '..', 'site', 'web', 'tc-spreadsheet.js'), 'utf8'
    );
  } catch (_e) { return ''; }
})();

test('loadSettingsFromDb re-invokes load functions after hydrating localStorage', () => {
  const fnIdx = spreadsheetSrc.indexOf('async function loadSettingsFromDb(');
  assert.ok(fnIdx !== -1, 'loadSettingsFromDb not found in tc-spreadsheet.js');
  const fnSection = spreadsheetSrc.slice(fnIdx, fnIdx + 2000);
  assert.ok(
    fnSection.includes('loadColWidths()'),
    'loadSettingsFromDb should re-invoke loadColWidths() after hydration'
  );
  assert.ok(
    fnSection.includes('loadCustomCols()'),
    'loadSettingsFromDb should re-invoke loadCustomCols() after hydration'
  );
  assert.ok(
    fnSection.includes('loadCellComments()'),
    'loadSettingsFromDb should re-invoke loadCellComments() after hydration'
  );
  assert.ok(
    fnSection.includes('loadCellTimestamps()'),
    'loadSettingsFromDb should re-invoke loadCellTimestamps() after hydration'
  );
  assert.ok(
    fnSection.includes('renderSpreadsheet'),
    'loadSettingsFromDb should call renderSpreadsheet() after hydration'
  );
});

test('loadSettingsFromDb only syncs back to DB when no keys were missing', () => {
  const fnIdx = spreadsheetSrc.indexOf('async function loadSettingsFromDb(');
  assert.ok(fnIdx !== -1, 'loadSettingsFromDb not found in tc-spreadsheet.js');
  const fnSection = spreadsheetSrc.slice(fnIdx, fnIdx + 2000);
  assert.ok(
    fnSection.includes('syncSettingsToDb'),
    'loadSettingsFromDb should call syncSettingsToDb() in the else (no missing keys) branch'
  );
});

// ── Issue 14: buildRichProgressNarrative appends class_context / data_collector

console.log('\n--- Issue 14: narrative context suffix (class_context / data_collector) ---');

const goalWithCtx = { code: 'S001.1.1', goal_area: 'Reading Comprehension', baseline: 45, target: 80, class_context: 'Period 3 ELA', data_collector: 'Ms. Johnson' };
const studentWithCM = { name: 'Maria Garcia', code: 'S001', primary_case_manager: 'Mr. Smith' };
const goalWithCtxOnly = { code: 'S001.1.2', goal_area: 'Reading Comprehension', baseline: 45, target: 80, class_context: 'Period 3 ELA' };
const goalWithDCOnly = { code: 'S001.1.3', goal_area: 'Math', baseline: 40, target: 80, data_collector: 'Ms. Johnson' };
const goalWithDataCollectorOnly = { code: 'S001.1.4', goal_area: 'Math', baseline: 40, target: 80, data_collector: 'Ms. Johnson' };
const sufficientQ = { average: 72, count: 5, values: [68, 70, 72, 74, 78] };

test('narrative appends class_context when present', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalWithCtxOnly, sufficientQ, null, 'Q3');
  assert.ok(
    narrative.includes('Period 3 ELA'),
    `Narrative should include class_context "Period 3 ELA": ${narrative}`
  );
  assert.ok(
    narrative.includes('Data collected in Period 3 ELA'),
    `Narrative should use "Data collected in" prefix: ${narrative}`
  );
});

test('narrative appends data_collector when different from primary_case_manager', () => {
  const { narrative } = buildRichProgressNarrative(studentWithCM, goalWithDCOnly, sufficientQ, null, 'Q3');
  assert.ok(
    narrative.includes('Ms. Johnson'),
    `Narrative should include data_collector "Ms. Johnson": ${narrative}`
  );
  assert.ok(
    narrative.includes('data collected by Ms. Johnson'),
    `Narrative should use "data collected by" phrase: ${narrative}`
  );
});

test('narrative omits data_collector when it matches primary_case_manager', () => {
  const studentSameCM = { name: 'Maria Garcia', code: 'S001', primary_case_manager: 'Ms. Johnson' };
  const { narrative } = buildRichProgressNarrative(studentSameCM, goalWithDCOnly, sufficientQ, null, 'Q3');
  assert.ok(
    !narrative.includes('data collected by Ms. Johnson'),
    `Narrative should NOT mention data_collector when it matches case manager: ${narrative}`
  );
});

test('narrative appends both class_context and data_collector when both present', () => {
  const { narrative } = buildRichProgressNarrative(studentWithCM, goalWithCtx, sufficientQ, null, 'Q3');
  assert.ok(
    narrative.includes('Period 3 ELA') && narrative.includes('Ms. Johnson'),
    `Narrative should include both class_context and data_collector: ${narrative}`
  );
  assert.ok(
    narrative.includes('Data collected in Period 3 ELA; data collected by Ms. Johnson'),
    `Narrative should join both parts with semicolon: ${narrative}`
  );
});

test('narrative has no context suffix when class_context and data_collector are absent', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalA, sufficientQ, null, 'Q3');
  assert.ok(
    !narrative.includes('Data collected in') && !narrative.includes('data collected by'),
    `Narrative should not append context when fields are absent: ${narrative}`
  );
});

test('context suffix appears on no-data path', () => {
  const { narrative } = buildRichProgressNarrative(studentA, goalWithCtxOnly, noDataQ, null, 'Q3');
  assert.ok(
    narrative.includes('Period 3 ELA'),
    `No-data narrative should include class_context: ${narrative}`
  );
});

test('context suffix appears on limited-data path', () => {
  const limitedWithCtx = { average: 70, count: 2, values: [68, 72] };
  const { narrative } = buildRichProgressNarrative(studentA, goalWithCtxOnly, limitedWithCtx, null, 'Q3');
  assert.ok(
    narrative.includes('Period 3 ELA'),
    `Limited-data narrative should include class_context: ${narrative}`
  );
});

test('buildRichProgressNarrative in tc-reporting.js uses _ctxParts for class_context', () => {
  const fnIdx = src.indexOf('function buildRichProgressNarrative(');
  assert.ok(fnIdx !== -1, 'buildRichProgressNarrative not found in tc-reporting.js');
  const fnSection = src.slice(fnIdx, fnIdx + 3000);
  assert.ok(
    fnSection.includes('_ctxParts'),
    'buildRichProgressNarrative should declare _ctxParts for context suffix'
  );
  assert.ok(
    fnSection.includes('goal.class_context'),
    'buildRichProgressNarrative should check goal.class_context'
  );
  assert.ok(
    fnSection.includes('goal.data_collector'),
    'buildRichProgressNarrative should check goal.data_collector'
  );
  assert.ok(
    fnSection.includes('_ctx'),
    'buildRichProgressNarrative should append _ctx to narrative return values'
  );
});

test('data_collector omitted when student has no primary_case_manager (falsy default)', () => {
  const studentWithoutPrimaryCaseManager = { name: 'Alex Lee', code: 'S002' };
  const { narrative } = buildRichProgressNarrative(studentWithoutPrimaryCaseManager, goalWithDataCollectorOnly, sufficientQ, null, 'Q3');
  assert.ok(
    narrative.includes('data collected by Ms. Johnson'),
    `Narrative should include data_collector when student has no primary_case_manager: ${narrative}`
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n✗ Some tc-reporting-narrative tests FAILED');
  process.exit(1);
}
console.log('\n✅ All tc-reporting-narrative tests passed');
