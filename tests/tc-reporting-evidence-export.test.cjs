// Unit tests for PR 8: Evidence Report export enhancements
// Tests: ZIP export function, print window helper, output format state,
//        Library modal DOM structure, data source labels, manifest structure,
//        multi-student folder structure, cover page HTML, assignment pages,
//        ESLint compliance (no bare alert/confirm).
// Run with: node tests/tc-reporting-evidence-export.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load sources ──────────────────────────────────────────────────────────────

const rpPath = path.join(__dirname, '..', 'site', 'web', 'tc-reporting.js');
const libPath = path.join(__dirname, '..', 'site', 'web', 'tc-library.js');
const rpHtmlPath = path.join(__dirname, '..', 'site', 'teacher', 'reporting', 'index.html');
const libHtmlPath = path.join(__dirname, '..', 'site', 'teacher', 'library', 'index.html');

const rpSrc = fs.readFileSync(rpPath, 'utf8');
const libSrc = fs.readFileSync(libPath, 'utf8');
const rpHtml = fs.readFileSync(rpHtmlPath, 'utf8');
const libHtml = fs.readFileSync(libHtmlPath, 'utf8');

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

// ── tc-reporting.js — output format state ─────────────────────────────────────

console.log('\n--- outputFormat in tab6State ---');

test('tab6State includes outputFormat field', () => {
  assert.ok(rpSrc.includes("outputFormat: 'print'"), 'tab6State should have outputFormat: \'print\'');
});

test('tab6State includes dataSource field', () => {
  assert.ok(rpSrc.includes("dataSource: 'auto'"), 'tab6State should have dataSource: \'auto\'');
});

// ── tc-reporting.js — ZIP export function ─────────────────────────────────────

console.log('\n--- exportEvidenceZip function ---');

test('exportEvidenceZip function is declared', () => {
  assert.ok(rpSrc.includes('function exportEvidenceZip('), 'exportEvidenceZip not found in tc-reporting.js');
});

test('exportEvidenceZip checks for JSZip availability', () => {
  assert.ok(
    rpSrc.includes("typeof JSZip === 'undefined'"),
    'exportEvidenceZip should check if JSZip is loaded'
  );
});

test('exportEvidenceZip builds manifest.json', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes('manifest.json'), 'exportEvidenceZip should create manifest.json');
});

test('exportEvidenceZip builds index.html', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes('index.html'), 'exportEvidenceZip should create index.html');
});

test('exportEvidenceZip creates per-student folders', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes("root.folder("), 'exportEvidenceZip should call root.folder() for student folders');
});

test('exportEvidenceZip creates cover.html for each student', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes("'cover.html'"), 'exportEvidenceZip should create cover.html');
});

test('exportEvidenceZip creates assignments.html for each student', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes("'assignments.html'"), 'exportEvidenceZip should create assignments.html');
});

test('exportEvidenceZip creates goals.html for each student', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes("'goals.html'"), 'exportEvidenceZip should create goals.html');
});

test('exportEvidenceZip downloads ZIP file', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes('.zip'), 'exportEvidenceZip should download a .zip file');
});

test('exportEvidenceZip creates all-students.html combined document', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes("'all-students.html'"), 'exportEvidenceZip should create all-students.html');
});

test('exportEvidenceZip creates summary.csv', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(fnSection.includes("'summary.csv'"), 'exportEvidenceZip should create summary.csv');
});

test('exportEvidenceZip summary.csv has required columns', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(
    fnSection.includes('Student Name') && fnSection.includes('Student Code') && fnSection.includes('Total Assignments'),
    'exportEvidenceZip summary.csv should include Student Name, Student Code, Total Assignments columns'
  );
});

test('exportEvidenceZip index.html TOC includes assignment counts', () => {
  const fnIdx = rpSrc.indexOf('function exportEvidenceZip(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 8000);
  assert.ok(
    fnSection.includes('totalAssignments') || fnSection.includes('Total Assignments'),
    'exportEvidenceZip index.html TOC should include assignment count per student'
  );
});

// ── tc-reporting.js — print window function ───────────────────────────────────

console.log('\n--- generateEvidencePrintWindow function ---');

test('generateEvidencePrintWindow function is declared', () => {
  assert.ok(rpSrc.includes('function generateEvidencePrintWindow('), 'generateEvidencePrintWindow not found');
});

test('generateEvidencePrintWindow opens new window', () => {
  const fnIdx = rpSrc.indexOf('function generateEvidencePrintWindow(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 600);
  assert.ok(fnSection.includes("window.open("), 'generateEvidencePrintWindow should open new window');
});

test('generateEvidencePrintWindow calls print', () => {
  const fnIdx = rpSrc.indexOf('function generateEvidencePrintWindow(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 600);
  assert.ok(fnSection.includes('.print()'), 'generateEvidencePrintWindow should call print()');
});

// ── tc-reporting.js — cover page builder ─────────────────────────────────────

console.log('\n--- buildEvidenceCoverHtml function ---');

test('buildEvidenceCoverHtml function is declared', () => {
  assert.ok(rpSrc.includes('function buildEvidenceCoverHtml('), 'buildEvidenceCoverHtml not found');
});

test('buildEvidenceCoverHtml includes student code', () => {
  const fnIdx = rpSrc.indexOf('function buildEvidenceCoverHtml(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('student.code'), 'cover page should reference student.code');
});

test('buildEvidenceCoverHtml includes CONFIDENTIAL banner', () => {
  const fnIdx = rpSrc.indexOf('function buildEvidenceCoverHtml(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('CONFIDENTIAL'), 'cover page should include CONFIDENTIAL notice');
});

test('buildEvidenceCoverHtml includes period/date range', () => {
  const fnIdx = rpSrc.indexOf('function buildEvidenceCoverHtml(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('periodLabel'), 'cover page should include period label');
});

test('buildEvidenceCoverHtml uses escapeHtml for dynamic data', () => {
  const fnIdx = rpSrc.indexOf('function buildEvidenceCoverHtml(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('escapeHtml('), 'cover page must use escapeHtml for XSS prevention');
});

// ── tc-reporting.js — assignment evidence page builder ────────────────────────

console.log('\n--- buildEvidenceAssignmentsHtml function ---');

test('buildEvidenceAssignmentsHtml function is declared', () => {
  assert.ok(rpSrc.includes('function buildEvidenceAssignmentsHtml('), 'buildEvidenceAssignmentsHtml not found');
});

test('buildEvidenceAssignmentsHtml includes assignment title', () => {
  const fnIdx = rpSrc.indexOf('function buildEvidenceAssignmentsHtml(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('title'), 'assignment page should include title');
});

test('buildEvidenceAssignmentsHtml handles paper upload URL', () => {
  const fnIdx = rpSrc.indexOf('function buildEvidenceAssignmentsHtml(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('paper_upload_url'), 'assignment page should handle paper_upload_url');
});

// ── tc-reporting.js — goal progress page builder ──────────────────────────────

console.log('\n--- buildEvidenceGoalsHtml function ---');

test('buildEvidenceGoalsHtml function is declared', () => {
  assert.ok(rpSrc.includes('function buildEvidenceGoalsHtml('), 'buildEvidenceGoalsHtml not found');
});

test('buildEvidenceGoalsHtml includes goal code and area', () => {
  const fnIdx = rpSrc.indexOf('function buildEvidenceGoalsHtml(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('goal.code'), 'goals page should include goal code');
  assert.ok(fnSection.includes('goal.area'), 'goals page should include goal area');
});

// ── tc-reporting.js — data source labels ─────────────────────────────────────

console.log('\n--- Data source labels (no "Supabase" on output) ---');

test('tc-reporting.js uses "School Database" label (not "Supabase")', () => {
  // The pill mode text and source labels should use friendly names
  assert.ok(
    rpSrc.includes('"School Database"') || rpSrc.includes("'School Database'"),
    'tc-reporting.js should use "School Database" label'
  );
});

test('tc-reporting.js uses "My Device" label (not "Local (browser)")', () => {
  assert.ok(
    rpSrc.includes('"My Device"') || rpSrc.includes("'My Device'"),
    'tc-reporting.js should use "My Device" label'
  );
});

test('updateSyncStatus does not show "Supabase" or "Local (browser)" text', () => {
  const fnIdx = rpSrc.indexOf('function updateSyncStatus(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 300);
  assert.ok(!fnSection.includes('"Supabase"') && !fnSection.includes("'Supabase'"), 'updateSyncStatus should not use "Supabase"');
  assert.ok(!fnSection.includes('"Local (browser)"') && !fnSection.includes("'Local (browser)'"), 'updateSyncStatus should not use "Local (browser)"');
});

// ── tc-reporting.js — output format UI in renderTab6 ─────────────────────────

console.log('\n--- Output format UI in renderTab6 ---');

test('renderTab6 renders output format toggle buttons', () => {
  const fnIdx = rpSrc.indexOf('function renderTab6(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 10000);
  assert.ok(fnSection.includes('tab6FormatGroup'), 'renderTab6 should include tab6FormatGroup');
});

test('renderTab6 renders data source toggle buttons', () => {
  const fnIdx = rpSrc.indexOf('function renderTab6(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 10000);
  assert.ok(fnSection.includes('tab6DataSourceGroup'), 'renderTab6 should include tab6DataSourceGroup');
});

// ── tc-reporting.js — generateEvidenceReport uses outputFormat ───────────────

console.log('\n--- generateEvidenceReport ZIP vs print logic ---');

test('generateEvidenceReport checks outputFormat for zip mode', () => {
  const fnIdx = rpSrc.indexOf('async function generateEvidenceReport(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes("outputFormat === 'zip'") || fnSection.includes("outputFormat==='zip'"),
    'generateEvidenceReport should branch on zip outputFormat');
});

test('generateEvidenceReport calls exportEvidenceZip for ZIP mode', () => {
  const fnIdx = rpSrc.indexOf('async function generateEvidenceReport(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('exportEvidenceZip('), 'generateEvidenceReport should call exportEvidenceZip');
});

test('generateEvidenceReport calls generateEvidencePrintWindow for print mode', () => {
  const fnIdx = rpSrc.indexOf('async function generateEvidenceReport(');
  const fnSection = rpSrc.slice(fnIdx, fnIdx + 7000);
  assert.ok(fnSection.includes('generateEvidencePrintWindow('), 'generateEvidenceReport should call generateEvidencePrintWindow');
});

// ── tc-library.js — evidence report button ────────────────────────────────────

console.log('\n--- Library page Evidence Report button ---');

test('tc-library.js has evidenceReportBtn element', () => {
  assert.ok(libSrc.includes("evidenceReportBtn"), 'tc-library.js should create evidenceReportBtn');
});

test('tc-library.js wires evidenceReportBtn to openEvidenceReportModal', () => {
  assert.ok(
    libSrc.includes("openEvidenceReportModal"),
    'tc-library.js should call openEvidenceReportModal'
  );
});

// ── tc-library.js — modal ARIA attributes ─────────────────────────────────────

console.log('\n--- Library evidence modal ARIA ---');

test('openEvidenceReportModal sets role="dialog"', () => {
  const fnIdx = libSrc.indexOf('async function openEvidenceReportModal(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 1000);
  assert.ok(fnSection.includes('role\', \'dialog\'') || fnSection.includes('"role", "dialog"') || fnSection.includes("setAttribute('role', 'dialog')"),
    'evidenceReportOverlay should have role="dialog"');
});

test('openEvidenceReportModal sets aria-modal="true"', () => {
  const fnIdx = libSrc.indexOf('async function openEvidenceReportModal(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 1000);
  assert.ok(fnSection.includes('aria-modal') && fnSection.includes("'true'"),
    'evidenceReportOverlay should have aria-modal="true"');
});

test('openEvidenceReportModal sets aria-labelledby', () => {
  const fnIdx = libSrc.indexOf('async function openEvidenceReportModal(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 1000);
  assert.ok(fnSection.includes('aria-labelledby'),
    'evidenceReportOverlay should have aria-labelledby');
});

test('openEvidenceReportModal has Escape key handler', () => {
  const fnIdx = libSrc.indexOf('async function openEvidenceReportModal(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 2500);
  assert.ok(fnSection.includes("e.key === 'Escape'") || fnSection.includes('Escape'),
    'evidence modal should close on Escape key');
});

test('openEvidenceReportModal has Tab focus trap', () => {
  const fnIdx = libSrc.indexOf('async function openEvidenceReportModal(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 2500);
  assert.ok(fnSection.includes("e.key === 'Tab'") || fnSection.includes("key === 'Tab'"),
    'evidence modal should have Tab focus trap');
});

test('openEvidenceReportModal restores focus on close', () => {
  const fnIdx = libSrc.indexOf('async function openEvidenceReportModal(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('triggerEl') && fnSection.includes('focus()'),
    'evidence modal should restore focus to trigger element on close');
});

// ── tc-library.js — form fields ───────────────────────────────────────────────

console.log('\n--- Library evidence modal form fields ---');

test('evidence form has student multi-select', () => {
  assert.ok(libSrc.includes('selectedStudents'), 'evidence form should have selectedStudents state');
});

test('evidence form has date range selector', () => {
  assert.ok(libSrc.includes("'current-quarter'") && libSrc.includes('ev_dateRange'),
    'evidence form should have date range selector');
});

test('evidence form has audience selector (parent/admin)', () => {
  const formFnIdx = libSrc.indexOf('function _buildEvidenceReportForm(');
  const formSection = libSrc.slice(formFnIdx, formFnIdx + 8000);
  assert.ok(formSection.includes("'parent'") && formSection.includes("'admin'"),
    'evidence form should have parent/admin audience selector');
});

test('evidence form has output format selector (print/zip)', () => {
  const formFnIdx = libSrc.indexOf('function _buildEvidenceReportForm(');
  const formSection = libSrc.slice(formFnIdx, formFnIdx + 10000);
  assert.ok(formSection.includes("'print'") && formSection.includes("'zip'"),
    'evidence form should have print/zip output format selector');
});

// ── tc-library.js — ZIP export ────────────────────────────────────────────────

console.log('\n--- Library ZIP export function ---');

test('_generateLibraryEvidenceZip function is declared', () => {
  assert.ok(libSrc.includes('function _generateLibraryEvidenceZip('), '_generateLibraryEvidenceZip not found');
});

test('_generateLibraryEvidenceZip creates manifest.json', () => {
  const fnIdx = libSrc.indexOf('function _generateLibraryEvidenceZip(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 4000);
  assert.ok(fnSection.includes('manifest.json'), '_generateLibraryEvidenceZip should create manifest.json');
});

test('_generateLibraryEvidenceZip creates index.html', () => {
  const fnIdx = libSrc.indexOf('function _generateLibraryEvidenceZip(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 4000);
  assert.ok(fnSection.includes('index.html'), '_generateLibraryEvidenceZip should create index.html');
});

test('_generateLibraryEvidenceZip checks JSZip availability', () => {
  const fnIdx = libSrc.indexOf('function _generateLibraryEvidenceZip(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 600);
  assert.ok(fnSection.includes("typeof JSZip === 'undefined'"), 'should check JSZip is available');
});

// ── tc-library.js — print window ──────────────────────────────────────────────

console.log('\n--- Library print window function ---');

test('_generateLibraryEvidencePrintWindow function is declared', () => {
  assert.ok(libSrc.includes('function _generateLibraryEvidencePrintWindow('), '_generateLibraryEvidencePrintWindow not found');
});

test('_generateLibraryEvidencePrintWindow opens new window', () => {
  const fnIdx = libSrc.indexOf('function _generateLibraryEvidencePrintWindow(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 4000);
  assert.ok(fnSection.includes("window.open("), 'should open new window');
});

// ── tc-library.js — data source labels ────────────────────────────────────────

console.log('\n--- Library data source labels ---');

test('tc-library.js uses "School Database" label (not "Supabase")', () => {
  // _runEvidenceGeneration should produce school-friendly labels
  assert.ok(
    libSrc.includes('"School Database"') || libSrc.includes("'School Database'"),
    'tc-library.js should use "School Database" label'
  );
});

test('tc-library.js uses "My Device" label', () => {
  assert.ok(
    libSrc.includes('"My Device"') || libSrc.includes("'My Device'"),
    'tc-library.js should use "My Device" label'
  );
});

// ── tc-library.js — cover page builder ───────────────────────────────────────

console.log('\n--- Library cover page builder ---');

test('_buildLibraryCoverHtml function is declared', () => {
  assert.ok(libSrc.includes('function _buildLibraryCoverHtml('), '_buildLibraryCoverHtml not found');
});

test('_buildLibraryCoverHtml includes CONFIDENTIAL notice', () => {
  const fnIdx = libSrc.indexOf('function _buildLibraryCoverHtml(');
  const fnSection = libSrc.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('CONFIDENTIAL'), 'cover page should include CONFIDENTIAL notice');
});

// ── HTML files — JSZip CDN ────────────────────────────────────────────────────

console.log('\n--- JSZip CDN in HTML files ---');

test('reporting/index.html includes JSZip CDN script', () => {
  assert.ok(rpHtml.includes('jszip') || rpHtml.includes('JSZip'), 'reporting/index.html should load JSZip from CDN');
});

test('library/index.html includes JSZip CDN script', () => {
  assert.ok(libHtml.includes('jszip') || libHtml.includes('JSZip'), 'library/index.html should load JSZip from CDN');
});

test('reporting/index.html JSZip script has crossorigin', () => {
  assert.ok(rpHtml.includes('crossorigin'), 'JSZip script tag should have crossorigin attribute');
});

test('library/index.html JSZip script has crossorigin', () => {
  assert.ok(libHtml.includes('crossorigin'), 'JSZip script tag should have crossorigin attribute');
});

test('reporting/index.html JSZip script does not have a broken SRI integrity hash', () => {
  // The wrong sha384-OLBgp1G... hash (for JSZip 3.1.3) must not be present since it blocks loading
  assert.ok(
    !rpHtml.includes('integrity="sha384-OLBgp1GsljhM2TJ'),
    'reporting/index.html must not include the wrong JSZip 3.1.3 SRI hash'
  );
  assert.ok(rpHtml.includes('jszip'), 'JSZip script tag should still be present');
});

test('library/index.html JSZip script does not have a broken SRI integrity hash', () => {
  assert.ok(
    !libHtml.includes('integrity="sha384-OLBgp1GsljhM2TJ'),
    'library/index.html must not include the wrong JSZip 3.1.3 SRI hash'
  );
  assert.ok(libHtml.includes('jszip'), 'JSZip script tag should still be present');
});

// ── ESLint compliance ─────────────────────────────────────────────────────────

console.log('\n--- ESLint compliance (no bare alert/confirm) ---');

test('tc-reporting.js does not use bare window.alert()', () => {
  // Should not contain alert( without being inside a string or comment about rcAlert
  const matches = rpSrc.match(/(?<![./*'"`])alert\s*\(/g) || [];
  assert.strictEqual(matches.length, 0, `tc-reporting.js should not use bare alert(), found: ${matches.length}`);
});

test('tc-library.js does not use bare window.alert()', () => {
  const matches = libSrc.match(/(?<![./*'"`])alert\s*\(/g) || [];
  assert.strictEqual(matches.length, 0, `tc-library.js should not use bare alert(), found: ${matches.length}`);
});

test('tc-reporting.js does not use bare window.confirm()', () => {
  const matches = rpSrc.match(/(?<![./*'"`])confirm\s*\(/g) || [];
  assert.strictEqual(matches.length, 0, `tc-reporting.js should not use bare confirm(), found: ${matches.length}`);
});

test('tc-library.js does not use bare window.confirm()', () => {
  const matches = libSrc.match(/(?<![./*'"`])confirm\s*\(/g) || [];
  assert.strictEqual(matches.length, 0, `tc-library.js should not use bare confirm(), found: ${matches.length}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
