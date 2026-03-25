// Unit tests for assignment type badge helpers in tc-reporting.js
// Tests: getAssignmentTypeLabel(), getAssignmentTypeBadgeHtml(), CSS presence
// Run with: node tests/tc-reporting-type-badge.test.cjs

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

// ── Mirror helper logic from tc-reporting.js ──────────────────────────────────

function getAssignmentTypeLabel(assignment) {
  const t = assignment?.type;
  if (t === 'html') {
    if (assignment.meta?.questions) return 'HTML';
    if (assignment.meta?.days) return 'TXT';
    return 'File';
  }
  if (t === 'link' || t === 'google_form') return 'Link';
  return null;
}

function getAssignmentTypeBadgeHtml(assignment) {
  const label = getAssignmentTypeLabel(assignment);
  if (!label) return '—';
  const cls = label.toLowerCase();
  return `<span class="rp-badge rp-badge-${cls}">${label}</span>`;
}

// ── Tests: getAssignmentTypeLabel ─────────────────────────────────────────────

console.log('\n=== tc-reporting-type-badge tests ===\n');

console.log('--- getAssignmentTypeLabel ---');

test('html + meta.questions → HTML', () => {
  const a = { type: 'html', meta: { questions: [{ q: 'Q1' }] } };
  assert.strictEqual(getAssignmentTypeLabel(a), 'HTML');
});

test('html + meta.days → TXT', () => {
  const a = { type: 'html', meta: { days: [{ day: 1 }] } };
  assert.strictEqual(getAssignmentTypeLabel(a), 'TXT');
});

test('html + meta.questions takes precedence over meta.days', () => {
  const a = { type: 'html', meta: { questions: [{ q: 'Q1' }], days: [{ day: 1 }] } };
  assert.strictEqual(getAssignmentTypeLabel(a), 'HTML');
});

test('html + no meta → File', () => {
  const a = { type: 'html' };
  assert.strictEqual(getAssignmentTypeLabel(a), 'File');
});

test('html + empty meta → File', () => {
  const a = { type: 'html', meta: {} };
  assert.strictEqual(getAssignmentTypeLabel(a), 'File');
});

test('link → Link', () => {
  const a = { type: 'link' };
  assert.strictEqual(getAssignmentTypeLabel(a), 'Link');
});

test('google_form → Link', () => {
  const a = { type: 'google_form' };
  assert.strictEqual(getAssignmentTypeLabel(a), 'Link');
});

test('null type → null', () => {
  const a = { type: null };
  assert.strictEqual(getAssignmentTypeLabel(a), null);
});

test('undefined type → null', () => {
  const a = {};
  assert.strictEqual(getAssignmentTypeLabel(a), null);
});

test('null assignment → null', () => {
  assert.strictEqual(getAssignmentTypeLabel(null), null);
});

test('undefined assignment → null', () => {
  assert.strictEqual(getAssignmentTypeLabel(undefined), null);
});

// ── Tests: getAssignmentTypeBadgeHtml ─────────────────────────────────────────

console.log('\n--- getAssignmentTypeBadgeHtml ---');

test('HTML assignment returns badge with rp-badge-html class', () => {
  const a = { type: 'html', meta: { questions: [{ q: 'Q1' }] } };
  const badge = getAssignmentTypeBadgeHtml(a);
  assert.ok(badge.includes('rp-badge-html'), `expected rp-badge-html, got: ${badge}`);
  assert.ok(badge.includes('>HTML<'), `expected >HTML<, got: ${badge}`);
});

test('TXT assignment returns badge with rp-badge-txt class', () => {
  const a = { type: 'html', meta: { days: [{ day: 1 }] } };
  const badge = getAssignmentTypeBadgeHtml(a);
  assert.ok(badge.includes('rp-badge-txt'), `expected rp-badge-txt, got: ${badge}`);
  assert.ok(badge.includes('>TXT<'), `expected >TXT<, got: ${badge}`);
});

test('Link assignment returns badge with rp-badge-link class', () => {
  const a = { type: 'link' };
  const badge = getAssignmentTypeBadgeHtml(a);
  assert.ok(badge.includes('rp-badge-link'), `expected rp-badge-link, got: ${badge}`);
  assert.ok(badge.includes('>Link<'), `expected >Link<, got: ${badge}`);
});

test('File assignment returns badge with rp-badge-file class', () => {
  const a = { type: 'html' };
  const badge = getAssignmentTypeBadgeHtml(a);
  assert.ok(badge.includes('rp-badge-file'), `expected rp-badge-file, got: ${badge}`);
  assert.ok(badge.includes('>File<'), `expected >File<, got: ${badge}`);
});

test('Unknown type returns dash', () => {
  const a = { type: null };
  assert.strictEqual(getAssignmentTypeBadgeHtml(a), '—');
});

test('All badges use rp-badge base class', () => {
  const assignments = [
    { type: 'html', meta: { questions: [] } },
    { type: 'html', meta: { days: [] } },
    { type: 'html' },
    { type: 'link' },
  ];
  for (const a of assignments) {
    const badge = getAssignmentTypeBadgeHtml(a);
    assert.ok(badge.includes('rp-badge'), `missing rp-badge base class for type=${a.type}`);
  }
});

// ── Tests: source code presence checks ───────────────────────────────────────

console.log('\n--- Source code presence ---');

test('tc-reporting.js defines getAssignmentTypeLabel', () => {
  assert.ok(src.includes('function getAssignmentTypeLabel'), 'missing getAssignmentTypeLabel function');
});

test('tc-reporting.js defines getAssignmentTypeBadgeHtml', () => {
  assert.ok(src.includes('function getAssignmentTypeBadgeHtml'), 'missing getAssignmentTypeBadgeHtml function');
});

test('tc-reporting.js has .rp-badge CSS class', () => {
  assert.ok(src.includes('.rp-badge {') || src.includes('.rp-badge{'), 'missing .rp-badge CSS');
});

test('tc-reporting.js has .rp-badge-html CSS class', () => {
  assert.ok(src.includes('.rp-badge-html'), 'missing .rp-badge-html CSS');
});

test('tc-reporting.js has .rp-badge-txt CSS class', () => {
  assert.ok(src.includes('.rp-badge-txt'), 'missing .rp-badge-txt CSS');
});

test('tc-reporting.js has .rp-badge-link CSS class', () => {
  assert.ok(src.includes('.rp-badge-link'), 'missing .rp-badge-link CSS');
});

test('tc-reporting.js has .rp-badge-file CSS class', () => {
  assert.ok(src.includes('.rp-badge-file'), 'missing .rp-badge-file CSS');
});

test('renderAssignmentPerformanceTable has Type column header', () => {
  assert.ok(src.includes('<th>Type</th>'), 'missing <th>Type</th> in performance table');
});

test('renderAssignmentPerformanceTable has rpTypeFilter dropdown', () => {
  assert.ok(src.includes('id="rpTypeFilter"'), 'missing rpTypeFilter dropdown');
});

test('buildEvidenceAssignmentsHtml uses getAssignmentTypeBadgeHtml', () => {
  assert.ok(src.includes('getAssignmentTypeBadgeHtml(assignment)'), 'buildEvidenceAssignmentsHtml should call getAssignmentTypeBadgeHtml');
});

test('tab3State includes typeFilter', () => {
  assert.ok(
    /typeFilter:\s*["']All Types["']/.test(src),
    'tab3State should include typeFilter: "All Types"'
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
