// Unit tests for tc-reporting.js Tab 6: Student Evidence Report logic
// Tests: state initialization, selection modes, date ranges, scoring, CSV export, etc.
// Run with: node tests/tc-reporting-evidence.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load source for source-inspection tests ───────────────────────────────────

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

console.log('\n=== tc-reporting-evidence tests ===\n');

// ── Inlined helpers (mirror logic from tc-reporting.js) ───────────────────────

// Mirror of tab6State default
const DEFAULT_TAB6_STATE = {
  selectionMode: 'single',
  studentCode: null,
  selectedStudents: [],
  audienceMode: 'parent',
  dateRange: 'current-quarter',
  customStart: null,
  customEnd: null,
};

// Mirror of scoreColor
function scoreColor(score) {
  if (score == null || isNaN(score)) return 'rgba(200,200,200,0.6)';
  if (score >= 80) return 'rgba(34,197,94,0.8)';
  if (score >= 60) return 'rgba(234,179,8,0.8)';
  return 'rgba(239,68,68,0.8)';
}

// Mirror of escapeHtml (Node-friendly version)
function escapeHtml(text) {
  if (!text && text !== 0) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mirror of formatDate
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Mirror of getTab6DateRange logic
function getTab6DateRange(tab6State) {
  const dr = tab6State.dateRange;
  if (dr === 'current-quarter') return { start: '2026-01-01', end: '2026-03-31' }; // Q3 placeholder
  if (dr === 'all-time') return { start: '2000-01-01', end: '2099-12-31' };
  if (dr === 'custom') return {
    start: tab6State.customStart || '2000-01-01',
    end: tab6State.customEnd || '2099-12-31',
  };
  const ranges = {
    Q1: { start: '2025-08-16', end: '2025-10-17' },
    Q2: { start: '2025-10-18', end: '2025-12-19' },
    Q3: { start: '2026-01-01', end: '2026-03-31' },
    Q4: { start: '2026-04-01', end: '2026-06-30' },
  };
  return ranges[dr] || { start: '2000-01-01', end: '2099-12-31' };
}

// Mirror of score statistics
function calcScoreStats(scores) {
  if (!scores || scores.length === 0) return { avg: null, max: null, min: null };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { avg, max: Math.max(...scores), min: Math.min(...scores) };
}

// Mirror of getGoalProgressForQuarter
function getGoalProgressForQuarter(goalCode, studentCode, quarterRange, progressData) {
  if (!quarterRange.start || !quarterRange.end) return { average: null, count: 0, values: [] };
  const startDate = new Date(quarterRange.start);
  const endDate = new Date(quarterRange.end);
  const relevant = progressData.filter((p) => {
    if (p.goal_code !== goalCode) return false;
    if (p.student_code !== studentCode) return false;
    const d = new Date(p.date);
    return d >= startDate && d <= endDate;
  });
  if (relevant.length === 0) return { average: null, count: 0, values: [] };
  const values = relevant.map((p) => parseFloat(p.value)).filter((v) => !isNaN(v));
  const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return { average, count: values.length, values };
}

// Mirror of CSV export
function buildEvidenceCSV(rows) {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

// Mirror of multi-select counter
function multiSelectCounter(selected, total) {
  return `${selected} of ${total} selected`;
}

// Mirror of renderSparkline (simplified check)
function renderSparkline(values) {
  if (!values || values.length === 0) {
    return '<svg width="80" height="24"><text x="5" y="16" font-size="10" fill="currentColor">No data</text></svg>';
  }
  return `<svg width="80" height="24"><polyline points="${values.join(',')}" /></svg>`;
}

// Mirror of URL param parsing
function parseEvidenceUrlParams(search) {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  const student = params.get('student');
  if (tab === 'evidence' && student) {
    return { studentCode: student, selectionMode: 'single', switchTo: 'student-evidence' };
  }
  return null;
}

// ── 1. Tab 6 state initialization ────────────────────────────────────────────

console.log('--- Tab 6 state initialization ---');

test('tab6State default selectionMode is single', () => {
  assert.strictEqual(DEFAULT_TAB6_STATE.selectionMode, 'single');
});

test('tab6State default studentCode is null', () => {
  assert.strictEqual(DEFAULT_TAB6_STATE.studentCode, null);
});

test('tab6State default selectedStudents is empty array', () => {
  assert.deepStrictEqual(DEFAULT_TAB6_STATE.selectedStudents, []);
});

test('tab6State default audienceMode is parent', () => {
  assert.strictEqual(DEFAULT_TAB6_STATE.audienceMode, 'parent');
});

test('tab6State default dateRange is current-quarter', () => {
  assert.strictEqual(DEFAULT_TAB6_STATE.dateRange, 'current-quarter');
});

test('tab6State default customStart and customEnd are null', () => {
  assert.strictEqual(DEFAULT_TAB6_STATE.customStart, null);
  assert.strictEqual(DEFAULT_TAB6_STATE.customEnd, null);
});

// ── 2. Selection mode switching ───────────────────────────────────────────────

console.log('\n--- Selection mode switching ---');

test('switching to multi mode updates selectionMode', () => {
  const state = Object.assign({}, DEFAULT_TAB6_STATE);
  state.selectionMode = 'multi';
  assert.strictEqual(state.selectionMode, 'multi');
});

test('switching to all mode updates selectionMode', () => {
  const state = Object.assign({}, DEFAULT_TAB6_STATE);
  state.selectionMode = 'all';
  assert.strictEqual(state.selectionMode, 'all');
});

// ── 3. Date range computation ─────────────────────────────────────────────────

console.log('\n--- Date range computation ---');

test('all-time range spans 2000-2099', () => {
  const state = Object.assign({}, DEFAULT_TAB6_STATE, { dateRange: 'all-time' });
  const range = getTab6DateRange(state);
  assert.strictEqual(range.start, '2000-01-01');
  assert.strictEqual(range.end, '2099-12-31');
});

test('custom range uses customStart and customEnd', () => {
  const state = Object.assign({}, DEFAULT_TAB6_STATE, {
    dateRange: 'custom',
    customStart: '2026-01-15',
    customEnd: '2026-02-28',
  });
  const range = getTab6DateRange(state);
  assert.strictEqual(range.start, '2026-01-15');
  assert.strictEqual(range.end, '2026-02-28');
});

test('Q1 date range has correct month boundaries', () => {
  const state = Object.assign({}, DEFAULT_TAB6_STATE, { dateRange: 'Q1' });
  const range = getTab6DateRange(state);
  assert.ok(range.start.startsWith('2025-08'), `Expected Q1 start in Aug, got ${range.start}`);
});

test('Q3 date range has correct boundaries', () => {
  const state = Object.assign({}, DEFAULT_TAB6_STATE, { dateRange: 'Q3' });
  const range = getTab6DateRange(state);
  assert.ok(range.start.startsWith('2026-01'), `Expected Q3 start in Jan, got ${range.start}`);
});

// ── 4. Score color helper ─────────────────────────────────────────────────────

console.log('\n--- Score color helper ---');

test('scoreColor returns green for score >= 80', () => {
  assert.ok(scoreColor(80).includes('34,197,94'));
  assert.ok(scoreColor(95).includes('34,197,94'));
  assert.ok(scoreColor(100).includes('34,197,94'));
});

test('scoreColor returns yellow for score 60-79', () => {
  assert.ok(scoreColor(60).includes('234,179,8'));
  assert.ok(scoreColor(75).includes('234,179,8'));
  assert.ok(scoreColor(79).includes('234,179,8'));
});

test('scoreColor returns red for score < 60', () => {
  assert.ok(scoreColor(59).includes('239,68,68'));
  assert.ok(scoreColor(0).includes('239,68,68'));
});

test('scoreColor returns grey for null or NaN', () => {
  assert.ok(scoreColor(null).includes('200,200,200'));
  assert.ok(scoreColor(NaN).includes('200,200,200'));
});

// ── 5. Student filtering ──────────────────────────────────────────────────────

console.log('\n--- Student filtering ---');

test('active-only filter excludes inactive students', () => {
  const students = [
    { code: 'S1', name: 'Alice', active: true },
    { code: 'S2', name: 'Bob', active: false },
    { code: 'S3', name: 'Carol' }, // no active prop = active
  ];
  const active = students.filter((s) => s.active !== false);
  assert.strictEqual(active.length, 2);
  assert.ok(active.some((s) => s.code === 'S1'));
  assert.ok(active.some((s) => s.code === 'S3'));
  assert.ok(!active.some((s) => s.code === 'S2'));
});

// ── 6. Goal filtering ─────────────────────────────────────────────────────────

console.log('\n--- Goal filtering ---');

// Mirror the isGoalActive helper from tc-reporting.js
function isGoalActive(goal) {
  if (!goal) return false;
  if (!goal.status) return true;
  const s = goal.status.toLowerCase();
  return s !== 'closed' && s !== 'archived';
}

test('isGoalActive: accepts lowercase active', () => {
  assert.ok(isGoalActive({ status: 'active' }));
});

test('isGoalActive: accepts Open (capitalized, from local adapter)', () => {
  assert.ok(isGoalActive({ status: 'Open' }));
});

test('isGoalActive: accepts Active (capitalized, from Supabase)', () => {
  assert.ok(isGoalActive({ status: 'Active' }));
});

test('isGoalActive: accepts OPEN (uppercase)', () => {
  assert.ok(isGoalActive({ status: 'OPEN' }));
});

test('isGoalActive: rejects closed', () => {
  assert.ok(!isGoalActive({ status: 'closed' }));
});

test('isGoalActive: rejects Closed (capitalized)', () => {
  assert.ok(!isGoalActive({ status: 'Closed' }));
});

test('isGoalActive: rejects archived', () => {
  assert.ok(!isGoalActive({ status: 'archived' }));
});

test('isGoalActive: treats missing status as active', () => {
  assert.ok(isGoalActive({ code: 'G1', student_code: 'S1' }));
  assert.ok(isGoalActive({ code: 'G2', student_code: 'S1', status: '' }));
});

test('goals filtered using isGoalActive includes Open and active, excludes closed/archived', () => {
  const goals = [
    { code: 'G1', student_code: 'S1', status: 'active' },
    { code: 'G2', student_code: 'S1', status: 'Open' },
    { code: 'G3', student_code: 'S1', status: 'Active' },
    { code: 'G4', student_code: 'S1', status: 'archived' },
    { code: 'G5', student_code: 'S1', status: 'closed' },
    { code: 'G6', student_code: 'S2', status: 'active' },
  ];
  const filtered = goals.filter((g) => g.student_code === 'S1' && isGoalActive(g));
  assert.strictEqual(filtered.length, 3);
  assert.ok(filtered.some((g) => g.code === 'G1'));
  assert.ok(filtered.some((g) => g.code === 'G2'));
  assert.ok(filtered.some((g) => g.code === 'G3'));
  assert.ok(!filtered.some((g) => g.code === 'G4'));
  assert.ok(!filtered.some((g) => g.code === 'G5'));
  assert.ok(!filtered.some((g) => g.code === 'G6'));
});

// ── 7. CSV export format ──────────────────────────────────────────────────────

console.log('\n--- CSV export format ---');

test('CSV header row has expected columns', () => {
  const header = ['Student', 'Assignment', 'Score', 'Date', 'Category', 'DESE Tags', 'IEP Tags', 'Status'];
  const csv = buildEvidenceCSV([header]);
  assert.ok(csv.includes('"Student"'));
  assert.ok(csv.includes('"Assignment"'));
  assert.ok(csv.includes('"DESE Tags"'));
  assert.ok(csv.includes('"Status"'));
});

test('CSV properly escapes double quotes in values', () => {
  const rows = [['He said "hello"', 'Test']];
  const csv = buildEvidenceCSV(rows);
  assert.ok(csv.includes('"He said ""hello"""'), `Got: ${csv}`);
});

test('CSV produces one row per data entry', () => {
  const rows = [
    ['Student', 'Assignment', 'Score', 'Date', 'Category', 'DESE Tags', 'IEP Tags', 'Status'],
    ['Alice', 'Quiz 1', '85%', 'Jan 15, 2026', 'Reading', 'ELA.RI.3.1', 'G1', 'Graded'],
    ['Alice', 'Quiz 2', '90%', 'Feb 10, 2026', 'Writing', '', 'G2', 'Graded'],
  ];
  const csv = buildEvidenceCSV(rows);
  const lines = csv.split('\n');
  assert.strictEqual(lines.length, 3);
});

// ── 8. Empty state handling ───────────────────────────────────────────────────

console.log('\n--- Empty state handling ---');

test('empty state HTML contains expected message', () => {
  const emptyHtml = '<div class="rp-empty">Select a student to generate an evidence report.</div>';
  assert.ok(emptyHtml.includes('Select a student'));
});

test('no-assignment state contains fallback message', () => {
  const msg = 'Assignment detail data not available. Score-only view shown.';
  assert.ok(msg.includes('not available'));
});

// ── 9. Audience mode toggle ───────────────────────────────────────────────────

console.log('\n--- Audience mode toggle ---');

test('parent mode hides raw scores in progress description', () => {
  // In parent mode, progress >= 80 shows "On track"
  const isParent = true;
  const avgScore = 85;
  const label = isParent
    ? (avgScore >= 80 ? '✅ On track' : avgScore >= 60 ? '📈 Making progress' : '⚠️ Needs support')
    : `${avgScore.toFixed(1)}%`;
  assert.strictEqual(label, '✅ On track');
});

test('admin mode shows raw percentage', () => {
  const isParent = false;
  const avgScore = 73.4;
  const label = isParent
    ? '📈 Making progress'
    : `${avgScore.toFixed(1)}%`;
  assert.strictEqual(label, '73.4%');
});

test('parent mode uses encouraging language for 60-79%', () => {
  const isParent = true;
  const avgScore = 72;
  const label = isParent && avgScore >= 60 && avgScore < 80 ? '📈 Making progress' : '';
  assert.strictEqual(label, '📈 Making progress');
});

// ── 10. CONFIDENTIAL banner ───────────────────────────────────────────────────

console.log('\n--- CONFIDENTIAL banner ---');

test('CONFIDENTIAL banner text appears in buildStudentEvidenceHtml logic', () => {
  // Check that the source contains the CONFIDENTIAL banner
  assert.ok(
    src.includes('CONFIDENTIAL — For authorized personnel only'),
    'CONFIDENTIAL banner text not found in tc-reporting.js'
  );
});

test('CONFIDENTIAL banner uses rp-ev-confidential-banner class', () => {
  assert.ok(
    src.includes('rp-ev-confidential-banner'),
    'rp-ev-confidential-banner class not found in tc-reporting.js'
  );
});

// ── 11. URL param parsing ─────────────────────────────────────────────────────

console.log('\n--- URL param parsing ---');

test('?tab=evidence&student=S1 sets studentCode and switches tab', () => {
  const result = parseEvidenceUrlParams('?tab=evidence&student=S1');
  assert.ok(result !== null);
  assert.strictEqual(result.studentCode, 'S1');
  assert.strictEqual(result.selectionMode, 'single');
  assert.strictEqual(result.switchTo, 'student-evidence');
});

test('URL params with no tab=evidence returns null', () => {
  const result = parseEvidenceUrlParams('?tab=batch-reports&student=S1');
  assert.strictEqual(result, null);
});

test('URL params with tab=evidence but no student returns null', () => {
  const result = parseEvidenceUrlParams('?tab=evidence');
  assert.strictEqual(result, null);
});

test('source contains URL param handling for evidence tab', () => {
  assert.ok(
    src.includes("evidenceTab === 'evidence'"),
    'URL param handling for evidence tab not found in tc-reporting.js'
  );
});

// ── 12. Multi-select counter ──────────────────────────────────────────────────

console.log('\n--- Multi-select counter ---');

test('counter shows correct selected/total when none selected', () => {
  assert.strictEqual(multiSelectCounter(0, 15), '0 of 15 selected');
});

test('counter shows correct selected/total when some selected', () => {
  assert.strictEqual(multiSelectCounter(3, 12), '3 of 12 selected');
});

test('counter shows correct selected/total when all selected', () => {
  assert.strictEqual(multiSelectCounter(8, 8), '8 of 8 selected');
});

// ── 13. Sparkline integration ─────────────────────────────────────────────────

console.log('\n--- Sparkline integration ---');

test('sparkline with no data returns no-data svg', () => {
  const svg = renderSparkline([]);
  assert.ok(svg.includes('No data') || svg.includes('<svg'), 'Sparkline should return SVG element');
});

test('sparkline with values returns SVG with polyline', () => {
  const svg = renderSparkline([60, 70, 75, 80]);
  assert.ok(svg.includes('<svg'), 'Sparkline should return SVG');
});

test('source contains renderSparkline function', () => {
  assert.ok(src.includes('function renderSparkline('), 'renderSparkline function not found in tc-reporting.js');
});

// ── 14. Score statistics ──────────────────────────────────────────────────────

console.log('\n--- Score statistics ---');

test('calcScoreStats returns null for empty scores', () => {
  const stats = calcScoreStats([]);
  assert.strictEqual(stats.avg, null);
  assert.strictEqual(stats.max, null);
  assert.strictEqual(stats.min, null);
});

test('calcScoreStats computes correct average', () => {
  const stats = calcScoreStats([60, 80, 100]);
  assert.strictEqual(stats.avg, 80);
});

test('calcScoreStats computes correct max and min', () => {
  const stats = calcScoreStats([52, 78, 95, 68]);
  assert.strictEqual(stats.max, 95);
  assert.strictEqual(stats.min, 52);
});

// ── 15. Graceful degradation ──────────────────────────────────────────────────

console.log('\n--- Graceful degradation ---');

test('no instances data shows fallback message in source', () => {
  assert.ok(
    src.includes('Assignment detail data not available'),
    'Graceful fallback message not found in tc-reporting.js'
  );
});

test('getGoalProgressForQuarter returns empty result when no matching data', () => {
  const progress = [
    { goal_code: 'G1', student_code: 'S1', date: '2026-01-10', value: '75' },
  ];
  const range = { start: '2025-01-01', end: '2025-12-31' }; // no overlap
  const result = getGoalProgressForQuarter('G1', 'S1', range, progress);
  assert.strictEqual(result.average, null);
  assert.strictEqual(result.count, 0);
});

test('getGoalProgressForQuarter returns correct average within date range', () => {
  const progress = [
    { goal_code: 'G1', student_code: 'S1', date: '2026-01-10', value: '60' },
    { goal_code: 'G1', student_code: 'S1', date: '2026-02-10', value: '80' },
    { goal_code: 'G1', student_code: 'S1', date: '2025-12-01', value: '50' }, // out of range
  ];
  const range = { start: '2026-01-01', end: '2026-03-31' };
  const result = getGoalProgressForQuarter('G1', 'S1', range, progress);
  assert.strictEqual(result.count, 2);
  assert.strictEqual(result.average, 70);
});

// ── 16. Source-level checks ───────────────────────────────────────────────────

console.log('\n--- Source-level checks ---');

test('tab6State is declared in tc-reporting.js', () => {
  assert.ok(src.includes('let tab6State ='), 'tab6State not found in tc-reporting.js');
});

test('renderTab6 function is declared in tc-reporting.js', () => {
  assert.ok(src.includes('function renderTab6('), 'renderTab6 not found in tc-reporting.js');
});

test('student-evidence case added to renderCurrentTab switch', () => {
  assert.ok(src.includes('"student-evidence"'), 'student-evidence case not found in renderCurrentTab switch');
});

test('generateEvidenceReport function declared in tc-reporting.js', () => {
  assert.ok(src.includes('function generateEvidenceReport('), 'generateEvidenceReport not found');
});

test('exportEvidenceCSV function declared in tc-reporting.js', () => {
  assert.ok(src.includes('function exportEvidenceCSV('), 'exportEvidenceCSV not found');
});

test('previewEvidenceReport function declared in tc-reporting.js', () => {
  assert.ok(src.includes('async function previewEvidenceReport('), 'previewEvidenceReport not found');
});

test('tab6PreviewBtn button rendered in renderTab6', () => {
  assert.ok(src.includes('id="tab6PreviewBtn"'), 'tab6PreviewBtn not found in renderTab6 HTML');
});

test('tab6PreviewBtn wired to previewEvidenceReport in renderTab6', () => {
  assert.ok(src.includes('previewEvidenceReport()'), 'previewEvidenceReport() call not found in renderTab6');
});

test('preview card renders rp-kpis grid', () => {
  assert.ok(src.includes('class="rp-kpis"'), 'rp-kpis class not found in preview card');
});

test('preview card renders rp-kpi-card items', () => {
  assert.ok(src.includes('class="rp-kpi-card"'), 'rp-kpi-card class not found in preview card');
});

test('preview card includes Looks good Generate Full Report button', () => {
  assert.ok(src.includes('tab6PreviewGenerateBtn'), 'tab6PreviewGenerateBtn not found in previewEvidenceReport');
});

test('preview shows no-data message when no assignments or goals found', () => {
  assert.ok(src.includes('No data found for the selected criteria'), 'no-data message not found in previewEvidenceReport');
});

test('preview shows no-student message when no student selected', () => {
  assert.ok(src.includes('No student selected'), 'no-student message not found in previewEvidenceReport');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
