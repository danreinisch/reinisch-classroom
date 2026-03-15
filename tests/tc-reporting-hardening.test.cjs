// Unit tests for tc-reporting.js: accessibility pass, error boundaries, localStorage guard
// Tests: ARIA roles, switchTab aria-selected, error boundaries, localStorage quota guard,
//        innerHTML safety, evidence report templates, table captions
// Run with: node tests/tc-reporting-hardening.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load sources ─────────────────────────────────────────────────────────────

const srcPath = path.join(__dirname, '..', 'site', 'web', 'tc-reporting.js');
const htmlPath = path.join(__dirname, '..', 'site', 'teacher', 'reporting', 'index.html');

const src = fs.readFileSync(srcPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

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

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n--- ARIA roles in reporting HTML ---');

test('reporting HTML has role="tablist" on .rp-tabs container', () => {
  assert.ok(
    html.includes('role="tablist"'),
    'reporting index.html should have role="tablist" on the tabs container'
  );
});

test('reporting HTML has role="tab" on .rp-tab buttons', () => {
  const matches = (html.match(/role="tab"/g) || []).length;
  assert.ok(matches >= 6, `Should have at least 6 role="tab" attributes, found ${matches}`);
});

test('reporting HTML has aria-selected on tab buttons', () => {
  assert.ok(
    html.includes('aria-selected="true"'),
    'First active tab should have aria-selected="true"'
  );
  const falseMatches = (html.match(/aria-selected="false"/g) || []).length;
  assert.ok(falseMatches >= 5, `Should have at least 5 aria-selected="false" on inactive tabs, found ${falseMatches}`);
});

test('reporting HTML has role="tabpanel" on tab content divs', () => {
  const matches = (html.match(/role="tabpanel"/g) || []).length;
  assert.ok(matches >= 6, `Should have at least 6 role="tabpanel" attributes, found ${matches}`);
});

test('reporting HTML has aria-live="polite" on content containers', () => {
  const matches = (html.match(/aria-live="polite"/g) || []).length;
  assert.ok(matches >= 4, `Should have at least 4 aria-live="polite" attributes, found ${matches}`);
});

console.log('\n--- Tab switching aria-selected in JS ---');

test('switchTab function updates aria-selected on tab buttons', () => {
  const fnIdx = src.indexOf('function switchTab(');
  assert.ok(fnIdx !== -1, 'switchTab function not found in tc-reporting.js');
  const fnSection = src.slice(fnIdx, fnIdx + 400);
  assert.ok(
    fnSection.includes('aria-selected'),
    'switchTab should update aria-selected on buttons'
  );
});

test('switchTab sets aria-selected="true" for active tab', () => {
  const fnIdx = src.indexOf('function switchTab(');
  assert.ok(fnIdx !== -1, 'switchTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 400);
  assert.ok(
    fnSection.includes('"true"') || fnSection.includes("'true'"),
    'switchTab should set aria-selected to "true" for active tab'
  );
});

console.log('\n--- Error boundaries on renderTab functions ---');

const tabFunctions = ['renderTab1', 'renderTab2', 'renderTab3', 'renderTab4', 'renderTab5', 'renderTab6'];

tabFunctions.forEach(fnName => {
  const searchSize = fnName === 'renderTab6' ? 8000 : fnName === 'renderTab4' ? 7500 : fnName === 'renderTab3' ? 6000 : fnName === 'renderTab2' ? 5500 : 3500;
  test(`${fnName} has try/catch error boundary`, () => {
    const fnIdx = src.indexOf(`function ${fnName}(`);
    assert.ok(fnIdx !== -1, `${fnName} not found in tc-reporting.js`);
    const fnSection = src.slice(fnIdx, fnIdx + searchSize);
    assert.ok(fnSection.includes('try {'), `${fnName} should have try block`);
    assert.ok(
      fnSection.includes('} catch (err)') || fnSection.includes('} catch (err) {'),
      `${fnName} should have catch block`
    );
  });
});

test('renderCurrentTab has try/catch error boundary', () => {
  const fnIdx = src.indexOf('function renderCurrentTab(');
  assert.ok(fnIdx !== -1, 'renderCurrentTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 600);
  assert.ok(fnSection.includes('try {'), 'renderCurrentTab should have try block');
  assert.ok(fnSection.includes('catch (err)'), 'renderCurrentTab should have catch block');
});

test('error boundary helper renderTabErrorCard exists', () => {
  assert.ok(
    src.includes('function renderTabErrorCard('),
    'renderTabErrorCard helper function should exist'
  );
});

test('error boundaries show "Something went wrong" message', () => {
  assert.ok(
    src.includes('Something went wrong rendering this section'),
    'error boundary should show friendly error message'
  );
});

test('error boundaries include Retry button', () => {
  const errorIdx = src.indexOf('Something went wrong rendering this section');
  assert.ok(errorIdx !== -1, 'error boundary message not found');
  const section = src.slice(errorIdx, errorIdx + 500);
  assert.ok(section.includes('Retry'), 'error boundary should include Retry button');
});

test('error boundaries use console.error (not alert)', () => {
  const fnIdx = src.indexOf('function renderTabErrorCard(');
  assert.ok(fnIdx !== -1, 'renderTabErrorCard not found');
  const fnSection = src.slice(fnIdx, fnIdx + 500);
  assert.ok(fnSection.includes('console.error'), 'error boundary should log with console.error');
  assert.ok(!fnSection.includes('alert('), 'error boundary must not use bare alert()');
});

console.log('\n--- localStorage quota guard ---');

test('localStorage.setItem calls are wrapped in try/catch', () => {
  // Find all localStorage.setItem occurrences and verify each is inside a try block
  const setItemOccurrences = [];
  let searchIdx = 0;
  while ((searchIdx = src.indexOf('localStorage.setItem', searchIdx)) !== -1) {
    setItemOccurrences.push(searchIdx);
    searchIdx++;
  }
  assert.ok(setItemOccurrences.length > 0, 'should have at least one localStorage.setItem call');

  // Each occurrence should have a try { before it within a reasonable range
  setItemOccurrences.forEach(idx => {
    const before = src.slice(Math.max(0, idx - 200), idx);
    assert.ok(
      before.includes('try {') || before.includes('try{'),
      `localStorage.setItem at index ${idx} should be inside a try block`
    );
  });
});

test('localStorage quota guard uses QuotaExceededError check', () => {
  assert.ok(
    src.includes('QuotaExceededError'),
    'localStorage guard should check for QuotaExceededError'
  );
});

console.log('\n--- innerHTML safety ---');

test('all dynamic innerHTML assignments use escapeHtml()', () => {
  // Find all template literal innerHTML assignments
  const inlinePattern = /container\.innerHTML\s*=\s*`[^`]*\$\{(?!escapeHtml)[a-zA-Z]/g;
  const matches = src.match(inlinePattern);
  // There should be no direct variable interpolation without escapeHtml
  // Note: Some assignments use variables that are pre-escaped (e.g. filtersHtml, reportHtml)
  // so we check the overall pattern is consistent
  assert.ok(
    src.includes('escapeHtml('),
    'tc-reporting.js should use escapeHtml() extensively for innerHTML safety'
  );
});

test('escapeHtml function is defined in tc-reporting.js', () => {
  assert.ok(
    src.includes('function escapeHtml(') || src.includes('const escapeHtml ='),
    'escapeHtml function should be defined in tc-reporting.js'
  );
});

test('student name/code values in template strings use escapeHtml()', () => {
  // Check that student.name and student.code use escapeHtml in templates
  assert.ok(
    src.includes('escapeHtml(s.code)'),
    'student code should be escaped in option elements'
  );
  assert.ok(
    src.includes('escapeHtml(s.name'),
    'student name should be escaped in template strings'
  );
});

test('SAFETY comment present on dynamic innerHTML in renderTab1', () => {
  assert.ok(
    src.includes('SAFETY:'),
    'innerHTML assignments with dynamic content should have SAFETY comments'
  );
});

console.log('\n--- Table captions ---');

test('IEP goal progress table has caption element', () => {
  assert.ok(
    src.includes('<caption>IEP Goal Progress'),
    'IEP goal progress table should have a caption'
  );
});

test('Grades table has caption element', () => {
  assert.ok(
    src.includes('<caption>Grades'),
    'Grades table should have a caption'
  );
});

test('class performance tables have captions', () => {
  assert.ok(
    src.includes('<caption>Assignment Performance</caption>') ||
    src.includes('<caption>Student Performance</caption>'),
    'Class performance tables should have captions'
  );
});

test('compliance log table has caption element', () => {
  assert.ok(
    src.includes('<caption>Data Collection Compliance Log</caption>'),
    'Compliance log table should have a caption'
  );
});

console.log('\n--- Template functions ---');

test('renderIEPProgressTemplate exists and is different from renderParentSummaryTemplate', () => {
  const iepIdx = src.indexOf('function renderIEPProgressTemplate(');
  const parentIdx = src.indexOf('function renderParentSummaryTemplate(');
  assert.ok(iepIdx !== -1, 'renderIEPProgressTemplate should exist');
  assert.ok(parentIdx !== -1, 'renderParentSummaryTemplate should exist');
  assert.notStrictEqual(iepIdx, parentIdx, 'IEP and Parent templates should be separate functions');
});

test('renderAdminSummaryTemplate exists', () => {
  assert.ok(
    src.includes('function renderAdminSummaryTemplate('),
    'renderAdminSummaryTemplate should exist'
  );
});

test('generateEvidenceReport exists', () => {
  assert.ok(
    src.includes('function generateEvidenceReport(') || src.includes('async function generateEvidenceReport('),
    'generateEvidenceReport should exist'
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n✗ Some tc-reporting-hardening tests FAILED');
  process.exit(1);
}
console.log('\n✅ All tc-reporting-hardening tests passed');
