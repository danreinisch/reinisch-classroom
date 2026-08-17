// Unit tests for "Copy as Email Body" feature
// Tests: buildEvidenceEmailBodyText, buildTab1EmailBodyText, button presence,
//        isParent flag (omit raw scores), clipboard wiring, graceful failure.
// Run with: node tests/tc-reporting-email-copy.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load source ────────────────────────────────────────────────────────────────

const rpPath = path.join(__dirname, '..', 'site', 'web', 'tc-reporting.js');
const src = fs.readFileSync(rpPath, 'utf8');

// ── Test runner ────────────────────────────────────────────────────────────────

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

// ── Inline helpers mirroring tc-reporting.js logic ────────────────────────────

function buildEmailBodyTextHelper({
  student,
  goalsData,
  progressData,
  instancesData,
  submissionsData,
  quarterRange,
  isParent,
  periodLabel,
  tab6StateDateRange,
}) {
  // Minimal mirror of buildEvidenceEmailBodyText to validate output structure
  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const studentName = student.name || student.code;
  const lines = [];

  lines.push('Student Progress Update');
  lines.push(`Student: ${studentName}`);
  lines.push(`Report Period: ${periodLabel}`);
  lines.push(`Date: ${todayLabel}`);
  lines.push('');
  lines.push('\u2500'.repeat(50));
  lines.push('');

  const activeGoals = goalsData.filter(g => g.student_code === student.code);
  lines.push('IEP GOAL PROGRESS');
  lines.push('');

  for (const goal of activeGoals) {
    const relevantProgress = progressData.filter(p =>
      p.goal_code === goal.code && p.student_code === student.code
    );
    const values = relevantProgress.map(p => parseFloat(p.value)).filter(v => !isNaN(v));
    const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

    let progressText;
    if (isParent) {
      if (average == null) progressText = 'No data yet';
      else if (average >= 80) progressText = 'On track';
      else if (average >= 60) progressText = 'Making progress';
      else progressText = 'Needs support';
    } else {
      progressText = average != null ? `${average.toFixed(1)}%` : 'No data';
    }

    lines.push(`\u2022 ${goal.code}${goal.goal_area ? ` \u2014 ${goal.goal_area}` : ''}`);
    if (goal.desc) lines.push(`  ${goal.desc}`);
    lines.push(`  Progress: ${progressText}  |  Trend: New data`);
    if (!isParent) lines.push(`  Data points this period: ${values.length}`);
    lines.push('');
  }

  lines.push('\u2500'.repeat(50));
  lines.push('');

  const studentInstances = instancesData.filter(inst => inst.student_code === student.code);
  const scores = studentInstances
    .map(inst => {
      const sub = submissionsData.find(s => s.instance_id === inst.id);
      return sub ? (sub.score_total ?? sub.score ?? null) : null;
    })
    .filter(s => s != null);

  const total = studentInstances.length;
  const graded = scores.length;
  const avg = graded > 0 ? (scores.reduce((a, b) => a + b, 0) / graded).toFixed(1) : null;
  const rate = total > 0 ? Math.round((graded / total) * 100) : null;

  lines.push('ASSIGNMENT SUMMARY');
  lines.push('');
  lines.push(`  Total assignments this period: ${total}`);
  if (rate != null) lines.push(`  Completion rate: ${rate}%`);
  if (!isParent && avg != null) lines.push(`  Average score: ${avg}%`);
  lines.push('');
  lines.push('\u2500'.repeat(50));
  lines.push('');
  lines.push('Please contact me if you have any questions about this progress update.');
  lines.push('');

  return lines.join('\n');
}

// ── Source-level checks ────────────────────────────────────────────────────────

console.log('\n=== tc-reporting-email-copy tests ===\n');

console.log('--- Function declarations ---');

test('buildEvidenceEmailBodyText function is declared', () => {
  assert.ok(
    src.includes('function buildEvidenceEmailBodyText('),
    'buildEvidenceEmailBodyText not found in tc-reporting.js'
  );
});

test('buildTab1EmailBodyText function is declared', () => {
  assert.ok(
    src.includes('function buildTab1EmailBodyText('),
    'buildTab1EmailBodyText not found in tc-reporting.js'
  );
});

// ── Tab 6 button presence ─────────────────────────────────────────────────────

console.log('\n--- Tab 6 export bar button ---');

test('Tab 6 export bar includes Copy as Email Body button', () => {
  assert.ok(
    src.includes('tab6CopyEmailBtn'),
    'tab6CopyEmailBtn not found in tc-reporting.js'
  );
});

test('Tab 6 Copy as Email Body button has correct label', () => {
  assert.ok(
    src.includes('Copy as Email Body'),
    '"Copy as Email Body" text not found in tc-reporting.js'
  );
});

test('Tab 6 button wires up buildEvidenceEmailBodyText call', () => {
  // Search from the $ handler declaration (second occurrence), not the HTML button
  const firstIdx = src.indexOf('tab6CopyEmailBtn');
  assert.ok(firstIdx > -1, 'tab6CopyEmailBtn not found');
  const handlerIdx = src.indexOf('tab6CopyEmailBtn', firstIdx + 1);
  assert.ok(handlerIdx > -1, 'tab6CopyEmailBtn handler not found');
  const section = src.slice(handlerIdx, handlerIdx + 1500);
  assert.ok(
    section.includes('buildEvidenceEmailBodyText'),
    'buildEvidenceEmailBodyText not called in tab6CopyEmailBtn handler'
  );
});

test('Tab 6 button uses navigator.clipboard.writeText', () => {
  const firstIdx = src.indexOf('tab6CopyEmailBtn');
  const handlerIdx = src.indexOf('tab6CopyEmailBtn', firstIdx + 1);
  assert.ok(handlerIdx > -1, 'tab6CopyEmailBtn handler not found');
  const section = src.slice(handlerIdx, handlerIdx + 1500);
  assert.ok(
    section.includes('navigator.clipboard.writeText'),
    'navigator.clipboard.writeText not used in tab6CopyEmailBtn handler'
  );
});

test('Tab 6 button shows Copied feedback on success', () => {
  const firstIdx = src.indexOf('tab6CopyEmailBtn');
  const handlerIdx = src.indexOf('tab6CopyEmailBtn', firstIdx + 1);
  assert.ok(handlerIdx > -1, 'tab6CopyEmailBtn handler not found');
  const section = src.slice(handlerIdx, handlerIdx + 1500);
  assert.ok(
    section.includes('Copied'),
    'No "Copied" confirmation text in tab6CopyEmailBtn handler'
  );
});

test('Tab 6 button handles clipboard failure gracefully', () => {
  const firstIdx = src.indexOf('tab6CopyEmailBtn');
  const handlerIdx = src.indexOf('tab6CopyEmailBtn', firstIdx + 1);
  assert.ok(handlerIdx > -1, 'tab6CopyEmailBtn handler not found');
  const section = src.slice(handlerIdx, handlerIdx + 1500);
  assert.ok(
    section.includes('.catch('),
    'No .catch() error handler in tab6CopyEmailBtn handler'
  );
  assert.ok(
    section.includes('Copy failed'),
    'No "Copy failed" fallback message in tab6CopyEmailBtn handler'
  );
});

// ── Tab 1 button presence ─────────────────────────────────────────────────────

console.log('\n--- Tab 1 export actions button ---');

test('Tab 1 IEP Progress template includes btnCopyEmailBody button', () => {
  // Inspect the complete template function rather than an arbitrary
  // character window; the template grows as report features are added.
  const iepIdx = src.indexOf('function renderIEPProgressTemplate(');
  assert.ok(iepIdx > -1, 'renderIEPProgressTemplate not found');

  const parentIdx = src.indexOf(
    'function renderParentSummaryTemplate(',
    iepIdx
  );

  assert.ok(
    parentIdx > iepIdx,
    'renderParentSummaryTemplate boundary not found'
  );

  const iepSection = src.slice(
    iepIdx,
    parentIdx
  );

  assert.ok(
    iepSection.includes('btnCopyEmailBody'),
    'btnCopyEmailBody not found in renderIEPProgressTemplate'
  );
});

test('Tab 1 Parent Summary template includes btnCopyEmailBody button', () => {
  const parentIdx = src.indexOf('function renderParentSummaryTemplate(');
  assert.ok(parentIdx > -1, 'renderParentSummaryTemplate not found');
  const parentSection = src.slice(parentIdx, parentIdx + 6000);
  assert.ok(
    parentSection.includes('btnCopyEmailBody'),
    'btnCopyEmailBody not found in renderParentSummaryTemplate'
  );
});

test('Tab 1 Admin Summary template includes btnCopyEmailBody button', () => {
  const adminIdx = src.indexOf('function renderAdminSummaryTemplate(');
  assert.ok(adminIdx > -1, 'renderAdminSummaryTemplate not found');
  const adminSection = src.slice(adminIdx, adminIdx + 5000);
  assert.ok(
    adminSection.includes('btnCopyEmailBody'),
    'btnCopyEmailBody not found in renderAdminSummaryTemplate'
  );
});

test('Tab 1 renderTab1 wires up btnCopyEmailBody', () => {
  const renderIdx = src.indexOf('function renderTab1()');
  assert.ok(renderIdx > -1, 'renderTab1 not found');
  const renderSection = src.slice(renderIdx, renderIdx + 8000);
  assert.ok(
    renderSection.includes('btnCopyEmailBody'),
    'btnCopyEmailBody not wired up in renderTab1'
  );
});

test('Tab 1 button calls buildTab1EmailBodyText', () => {
  const renderIdx = src.indexOf('function renderTab1()');
  assert.ok(renderIdx > -1, 'renderTab1 not found');
  const renderSection = src.slice(renderIdx, renderIdx + 8000);
  const copyEmailIdx = renderSection.indexOf('btnCopyEmailBody');
  assert.ok(copyEmailIdx > -1, 'btnCopyEmailBody not found in renderTab1');
  const handlerSection = renderSection.slice(copyEmailIdx, copyEmailIdx + 800);
  assert.ok(
    handlerSection.includes('buildTab1EmailBodyText'),
    'buildTab1EmailBodyText not called in btnCopyEmailBody handler'
  );
});

test('Tab 1 button uses navigator.clipboard.writeText', () => {
  const renderIdx = src.indexOf('function renderTab1()');
  const renderSection = src.slice(renderIdx, renderIdx + 8000);
  const copyEmailIdx = renderSection.indexOf('btnCopyEmailBody');
  const handlerSection = renderSection.slice(copyEmailIdx, copyEmailIdx + 800);
  assert.ok(
    handlerSection.includes('navigator.clipboard.writeText'),
    'navigator.clipboard.writeText not used in btnCopyEmailBody handler'
  );
});

test('Tab 1 button shows Copied feedback on success', () => {
  const renderIdx = src.indexOf('function renderTab1()');
  const renderSection = src.slice(renderIdx, renderIdx + 8000);
  const copyEmailIdx = renderSection.indexOf('btnCopyEmailBody');
  const handlerSection = renderSection.slice(copyEmailIdx, copyEmailIdx + 800);
  assert.ok(
    handlerSection.includes('Copied'),
    'No "Copied" confirmation in btnCopyEmailBody handler'
  );
});

test('Tab 1 button handles clipboard failure gracefully', () => {
  const renderIdx = src.indexOf('function renderTab1()');
  const renderSection = src.slice(renderIdx, renderIdx + 8000);
  const copyEmailIdx = renderSection.indexOf('btnCopyEmailBody');
  const handlerSection = renderSection.slice(copyEmailIdx, copyEmailIdx + 800);
  assert.ok(
    handlerSection.includes('.catch('),
    'No .catch() error handler in btnCopyEmailBody handler'
  );
  assert.ok(
    handlerSection.includes('Copy failed'),
    'No "Copy failed" fallback message in btnCopyEmailBody handler'
  );
});

// ── isParent flag ─────────────────────────────────────────────────────────────

console.log('\n--- isParent flag (parent-friendly output) ---');

test('buildEvidenceEmailBodyText uses isParent to decide score display', () => {
  const fnIdx = src.indexOf('function buildEvidenceEmailBodyText(');
  assert.ok(fnIdx > -1, 'buildEvidenceEmailBodyText not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(fnSection.includes('isParent'), 'isParent flag not used in buildEvidenceEmailBodyText');
});

test('buildTab1EmailBodyText uses isParent to decide score display', () => {
  const fnIdx = src.indexOf('function buildTab1EmailBodyText(');
  assert.ok(fnIdx > -1, 'buildTab1EmailBodyText not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(fnSection.includes('isParent'), 'isParent flag not used in buildTab1EmailBodyText');
});

test('parent view omits raw scores in email body helper', () => {
  const student = { code: 'S1', name: 'Alice Test' };
  const goalsData = [{ code: 'G1', student_code: 'S1', goal_area: 'Math', desc: 'Count to 10' }];
  const progressData = [{ goal_code: 'G1', student_code: 'S1', value: '75', date: '2026-01-15' }];
  const instancesData = [{ id: 'I1', student_code: 'S1', assigned_at: '2026-01-10' }];
  const submissionsData = [{ instance_id: 'I1', score_total: 85 }];
  const quarterRange = { start: '2026-01-01', end: '2026-03-31' };

  const parentResult = buildEmailBodyTextHelper({
    student, goalsData, progressData, instancesData, submissionsData,
    quarterRange, isParent: true, periodLabel: 'Q3',
  });
  // Parent view should NOT include percentage/raw score in progress
  assert.ok(!parentResult.includes('75%'), 'Parent view should not show raw score 75%');
  assert.ok(!parentResult.includes('Average score:'), 'Parent view should not show average score line');
  assert.ok(
    parentResult.includes('Making progress') || parentResult.includes('On track') || parentResult.includes('Needs support') || parentResult.includes('No data'),
    'Parent view should show friendly status'
  );
});

test('admin view includes raw scores in email body helper', () => {
  const student = { code: 'S1', name: 'Alice Test' };
  const goalsData = [{ code: 'G1', student_code: 'S1', goal_area: 'Math', desc: 'Count to 10' }];
  const progressData = [{ goal_code: 'G1', student_code: 'S1', value: '75', date: '2026-01-15' }];
  const instancesData = [{ id: 'I1', student_code: 'S1', assigned_at: '2026-01-10' }];
  const submissionsData = [{ instance_id: 'I1', score_total: 85 }];
  const quarterRange = { start: '2026-01-01', end: '2026-03-31' };

  const adminResult = buildEmailBodyTextHelper({
    student, goalsData, progressData, instancesData, submissionsData,
    quarterRange, isParent: false, periodLabel: 'Q3',
  });
  // Admin view should show raw score
  assert.ok(adminResult.includes('75.0%') || adminResult.includes('75%'), 'Admin view should show raw score');
  assert.ok(adminResult.includes('Average score: 85.0%'), 'Admin view should show average score');
  assert.ok(adminResult.includes('Data points this period: 1'), 'Admin view should show data point count');
});

// ── Content structure checks ──────────────────────────────────────────────────

console.log('\n--- Email body content structure ---');

test('email body includes professional closing line', () => {
  const fnIdx = src.indexOf('function buildEvidenceEmailBodyText(');
  assert.ok(fnIdx > -1, 'buildEvidenceEmailBodyText not found');

  const nextFnIdx = src.indexOf(
    'function generateTab6Preview(',
    fnIdx
  );

  assert.ok(
    nextFnIdx > fnIdx,
    'generateTab6Preview boundary not found'
  );

  const fnSection = src.slice(
    fnIdx,
    nextFnIdx
  );

  assert.ok(
    fnSection.includes('Please contact me if you have any questions about this progress update.'),
    'Professional closing line not found in buildEvidenceEmailBodyText'
  );
});

test('Tab 1 email body includes professional closing line', () => {
  const fnIdx = src.indexOf('function buildTab1EmailBodyText(');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('Please contact me if you have any questions about this progress update.'),
    'Professional closing line not found in buildTab1EmailBodyText'
  );
});

test('email body helper produces correct header for student', () => {
  const student = { code: 'S99', name: 'Jane Example' };
  const result = buildEmailBodyTextHelper({
    student,
    goalsData: [],
    progressData: [],
    instancesData: [],
    submissionsData: [],
    quarterRange: { start: '2026-01-01', end: '2026-03-31' },
    isParent: true,
    periodLabel: 'Q3',
  });
  assert.ok(result.includes('Jane Example'), 'Student name not in output');
  assert.ok(result.includes('Q3'), 'Report period not in output');
  assert.ok(result.includes('Student Progress Update'), 'Header not in output');
});

test('email body helper includes assignment summary section', () => {
  const student = { code: 'S1', name: 'Alice' };
  const result = buildEmailBodyTextHelper({
    student,
    goalsData: [],
    progressData: [],
    instancesData: [{ id: 'I1', student_code: 'S1', assigned_at: '2026-01-10' }],
    submissionsData: [{ instance_id: 'I1', score_total: 90 }],
    quarterRange: { start: '2026-01-01', end: '2026-03-31' },
    isParent: false,
    periodLabel: 'Q3',
  });
  assert.ok(result.includes('ASSIGNMENT SUMMARY'), 'ASSIGNMENT SUMMARY section not in output');
  assert.ok(result.includes('Total assignments this period: 1'), 'Total assignments count not in output');
});

test('FERPA: buildEvidenceEmailBodyText filters goals by student.code', () => {
  const fnIdx = src.indexOf('function buildEvidenceEmailBodyText(');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  // Must filter goalsData by student.code to avoid cross-student leakage
  assert.ok(
    fnSection.includes('g.student_code === student.code'),
    'buildEvidenceEmailBodyText should filter goals by student.code (FERPA)'
  );
});

// ── Tab 1 isParent derived from template ─────────────────────────────────────

console.log('\n--- Tab 1 isParent derived from template ---');

test('renderTab1 derives isParent from parent-summary template', () => {
  const renderIdx = src.indexOf('function renderTab1()');
  const renderSection = src.slice(renderIdx, renderIdx + 8000);
  const copyEmailIdx = renderSection.indexOf('btnCopyEmailBody');
  const handlerSection = renderSection.slice(Math.max(0, copyEmailIdx - 200), copyEmailIdx + 200);
  assert.ok(
    handlerSection.includes('parent-summary'),
    'isParentView should be derived from parent-summary template in renderTab1'
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
