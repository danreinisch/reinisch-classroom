// Unit tests for Evidence Report print/PDF fixes in tc-reporting.js
// Tests: print button uses generateEvidencePrintWindow (not window.print()),
//        buildEvidenceDocumentHtml white-background default, comprehensive
//        @media print styles, FERPA banner print visibility,
//        generateEvidencePrintWindow setTimeout delay,
//        index.html active-tab print visibility rules.
// Run with: node tests/tc-reporting-evidence-print.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load sources ──────────────────────────────────────────────────────────────

const rpPath = path.join(__dirname, '..', 'site', 'web', 'tc-reporting.js');
const rpHtmlPath = path.join(__dirname, '..', 'site', 'teacher', 'reporting', 'index.html');

const rpSrc = fs.readFileSync(rpPath, 'utf8');
const rpHtml = fs.readFileSync(rpHtmlPath, 'utf8');

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

// Helper: extract the tab6PrintBtn wiring block from the source
function getPrintBtnBlock() {
  // Look for the addEventListener wiring, not the template HTML
  const start = rpSrc.indexOf("const printBtn = $(\"tab6PrintBtn\")");
  return rpSrc.slice(start, start + 400);
}

// Helper: extract the buildEvidenceDocumentHtml body
function getDocHtmlFn() {
  const idx = rpSrc.indexOf('function buildEvidenceDocumentHtml(');
  return rpSrc.slice(idx, idx + 6000);
}

// Helper: extract the generateEvidencePrintWindow body
function getPrintWindowFn() {
  const idx = rpSrc.indexOf('function generateEvidencePrintWindow(');
  return rpSrc.slice(idx, idx + 600);
}

// ── Print button wiring ───────────────────────────────────────────────────────

console.log('\n--- tab6PrintBtn wiring ---');

test('tab6PrintBtn click handler calls generateEvidencePrintWindow, not window.print()', () => {
  const block = getPrintBtnBlock();
  assert.ok(
    block.includes('generateEvidencePrintWindow('),
    'tab6PrintBtn handler must call generateEvidencePrintWindow()'
  );
});

test('tab6PrintBtn click handler does NOT call window.print() directly', () => {
  // Find the printBtn addEventListener block specifically
  const btnIdx = rpSrc.indexOf("const printBtn = $(\"tab6PrintBtn\")");
  const block = rpSrc.slice(btnIdx, btnIdx + 300);
  assert.ok(
    !block.includes('window.print()'),
    'tab6PrintBtn handler must not call window.print() directly'
  );
});

// ── generateEvidencePrintWindow ───────────────────────────────────────────────

console.log('\n--- generateEvidencePrintWindow ---');

test('generateEvidencePrintWindow function is declared', () => {
  assert.ok(
    rpSrc.includes('function generateEvidencePrintWindow('),
    'generateEvidencePrintWindow not found in tc-reporting.js'
  );
});

test('generateEvidencePrintWindow uses setTimeout for delayed print', () => {
  const fn = getPrintWindowFn();
  assert.ok(
    fn.includes('setTimeout('),
    'generateEvidencePrintWindow should use setTimeout to delay print call'
  );
});

test('generateEvidencePrintWindow calls win.print() inside setTimeout', () => {
  const fn = getPrintWindowFn();
  assert.ok(
    fn.includes('win.print()'),
    'generateEvidencePrintWindow should call win.print()'
  );
});

test('generateEvidencePrintWindow calls buildEvidenceDocumentHtml', () => {
  const fn = getPrintWindowFn();
  assert.ok(
    fn.includes('buildEvidenceDocumentHtml('),
    'generateEvidencePrintWindow should call buildEvidenceDocumentHtml()'
  );
});

// ── buildEvidenceDocumentHtml styles ─────────────────────────────────────────

console.log('\n--- buildEvidenceDocumentHtml styles ---');

test('buildEvidenceDocumentHtml uses white background by default (not dark)', () => {
  const fn = getDocHtmlFn();
  assert.ok(
    fn.includes('background: #fff') || fn.includes("background: '#fff'") || fn.includes('background: white'),
    'buildEvidenceDocumentHtml body should default to white background'
  );
  assert.ok(
    !fn.includes('background: #0b1220'),
    'buildEvidenceDocumentHtml must not use dark theme background #0b1220'
  );
});

test('buildEvidenceDocumentHtml uses dark text color by default', () => {
  const fn = getDocHtmlFn();
  assert.ok(
    fn.includes('color: #111') || fn.includes('color: #000'),
    'buildEvidenceDocumentHtml body should use dark text color for print'
  );
  assert.ok(
    !fn.includes('color: #e2e8f0'),
    'buildEvidenceDocumentHtml must not use light text color #e2e8f0 as default'
  );
});

test('buildEvidenceDocumentHtml has @media print block', () => {
  const fn = getDocHtmlFn();
  assert.ok(fn.includes('@media print'), 'buildEvidenceDocumentHtml should have @media print block');
});

test('buildEvidenceDocumentHtml @media print covers .rp-ev-profile-card', () => {
  const fn = getDocHtmlFn();
  const printIdx = fn.indexOf('@media print');
  const printBlock = fn.slice(printIdx, printIdx + 1500);
  assert.ok(
    printBlock.includes('rp-ev-profile-card'),
    'buildEvidenceDocumentHtml @media print should style .rp-ev-profile-card'
  );
});

test('buildEvidenceDocumentHtml @media print covers .rp-ev-assignment-card', () => {
  const fn = getDocHtmlFn();
  const printIdx = fn.indexOf('@media print');
  const printBlock = fn.slice(printIdx, printIdx + 1500);
  assert.ok(
    printBlock.includes('rp-ev-assignment-card'),
    'buildEvidenceDocumentHtml @media print should style .rp-ev-assignment-card'
  );
});

test('buildEvidenceDocumentHtml @media print covers .rp-ev-stats-card', () => {
  const fn = getDocHtmlFn();
  const printIdx = fn.indexOf('@media print');
  const printBlock = fn.slice(printIdx, printIdx + 1500);
  assert.ok(
    printBlock.includes('rp-ev-stats-card'),
    'buildEvidenceDocumentHtml @media print should style .rp-ev-stats-card'
  );
});

test('buildEvidenceDocumentHtml confidential banner uses print-safe colors', () => {
  const fn = getDocHtmlFn();
  // The banner should NOT use rgba red (dark-mode) as the only color
  assert.ok(
    !fn.includes('color: #f87171'),
    'buildEvidenceDocumentHtml confidential banner must not use dark-mode red #f87171'
  );
});

// ── index.html @media print rules for evidence classes ────────────────────────

console.log('\n--- index.html @media print evidence rules ---');

test('index.html @media print includes .rp-ev-profile-card rule', () => {
  assert.ok(
    rpHtml.includes('rp-ev-profile-card'),
    'index.html @media print should include .rp-ev-profile-card'
  );
});

test('index.html @media print includes .rp-ev-assignment-card rule', () => {
  // Find in a print context
  const printIdx = rpHtml.indexOf('@media print');
  const printBlock = rpHtml.slice(printIdx, printIdx + 3000);
  assert.ok(
    printBlock.includes('rp-ev-assignment-card'),
    'index.html @media print block should include .rp-ev-assignment-card'
  );
});

test('index.html @media print includes .rp-ev-stats-card rule', () => {
  const printIdx = rpHtml.indexOf('@media print');
  const printBlock = rpHtml.slice(printIdx, printIdx + 3000);
  assert.ok(
    printBlock.includes('rp-ev-stats-card'),
    'index.html @media print block should include .rp-ev-stats-card'
  );
});

test('index.html @media print shows active tab content', () => {
  const printIdx = rpHtml.indexOf('@media print');
  const printBlock = rpHtml.slice(printIdx, printIdx + 3000);
  assert.ok(
    printBlock.includes('rp-tab-content.active'),
    'index.html @media print block should ensure .rp-tab-content.active is shown'
  );
});

test('index.html @media print hides non-active tab content', () => {
  const printIdx = rpHtml.indexOf('@media print');
  const printBlock = rpHtml.slice(printIdx, printIdx + 3000);
  assert.ok(
    printBlock.includes('rp-tab-content:not(.active)'),
    'index.html @media print block should hide .rp-tab-content:not(.active)'
  );
});

test('index.html @media print FERPA confidential banner is visible', () => {
  const printIdx = rpHtml.indexOf('@media print');
  const printBlock = rpHtml.slice(printIdx, printIdx + 3000);
  assert.ok(
    printBlock.includes('rp-ev-confidential-banner'),
    'index.html @media print block should make .rp-ev-confidential-banner visible'
  );
});

// ── Answer detail in evidence report ─────────────────────────────────────────

console.log('\n--- Answer detail in evidence report ---');

test('buildStudentEvidenceHtml includes answer detail logic', () => {
  const fnIdx = rpSrc.indexOf('function buildStudentEvidenceHtml(');
  const fn = rpSrc.slice(fnIdx, fnIdx + 10000);
  assert.ok(
    fn.includes('submission.answers') || fn.includes('rawAnswers'),
    'buildStudentEvidenceHtml should use submission.answers for answer detail'
  );
});

test('buildStudentEvidenceHtml shows answer detail table (rp-ev-ans-table)', () => {
  const fnIdx = rpSrc.indexOf('function buildStudentEvidenceHtml(');
  const fn = rpSrc.slice(fnIdx, fnIdx + 10000);
  assert.ok(
    fn.includes('rp-ev-ans-table'),
    'buildStudentEvidenceHtml should render .rp-ev-ans-table for student responses'
  );
});

test('buildEvidenceDocumentHtml has CSS for rp-ev-ans-table', () => {
  const fn = getDocHtmlFn();
  assert.ok(
    fn.includes('rp-ev-ans-table'),
    'buildEvidenceDocumentHtml should include CSS for .rp-ev-ans-table'
  );
});

test('buildEvidenceDocumentHtml @media print covers rp-ev-ans-table', () => {
  const fn = getDocHtmlFn();
  const printIdx = fn.indexOf('@media print');
  const printBlock = fn.slice(printIdx, printIdx + 2500);
  assert.ok(
    printBlock.includes('rp-ev-ans-table'),
    'buildEvidenceDocumentHtml @media print should cover .rp-ev-ans-table'
  );
});

test('index.html has CSS for rp-ev-ans-table (inline display styles)', () => {
  assert.ok(
    rpHtml.includes('rp-ev-ans-table'),
    'index.html should include dark-theme styles for .rp-ev-ans-table'
  );
});

test('index.html @media print covers rp-ev-ans-table', () => {
  const printIdx = rpHtml.indexOf('@media print');
  const printBlock = rpHtml.slice(printIdx, printIdx + 5000);
  assert.ok(
    printBlock.includes('rp-ev-ans-table'),
    'index.html @media print should cover .rp-ev-ans-table'
  );
});

test('answer detail is admin-only (not shown in parent mode)', () => {
  const fnIdx = rpSrc.indexOf('function buildStudentEvidenceHtml(');
  const fn = rpSrc.slice(fnIdx, fnIdx + 10000);
  // The answer detail block should be guarded by !isParent
  assert.ok(
    fn.includes('!isParent') && fn.includes('rp-ev-answers'),
    'answer detail should be guarded by !isParent check'
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
