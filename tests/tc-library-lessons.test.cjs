// Unit tests for tc-library.js: lessons/PR-6 changes
// Tests: emoji safety, innerHTML safety, icon coverage, modal ARIA,
//        no alert/confirm, filter persistence, showToast usage
// Run with: node tests/tc-library-lessons.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Read source file ───────────────────────────────────────────────────────────

const SOURCE_PATH = path.join(__dirname, '..', 'site', 'web', 'tc-library.js');
const src = fs.readFileSync(SOURCE_PATH, 'utf8');

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \u2717 ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── Source-level emoji safety scan ────────────────────────────────────────────

console.log('\n--- Emoji safety scan ---');

test('no \\uD83D surrogate sequences in source', () => {
  // D83D is the high surrogate for many common emoji (face, hand, object emoji)
  assert.ok(!src.includes('\\uD83D'), 'Found \\uD83D escape in source');
});

test('no \\uD83C surrogate sequences in source', () => {
  // D83C is the high surrogate for flags, symbol emoji
  assert.ok(!src.includes('\\uD83C'), 'Found \\uD83C escape in source');
});

test('no \\u2705 (checkmark emoji) in source', () => {
  assert.ok(!src.includes('\\u2705'), 'Found \\u2705 (checkmark) escape in source');
});

test('no \\u274c (cross emoji) in source', () => {
  assert.ok(!src.includes('\\u274c'), 'Found \\u274c (cross emoji) escape in source');
});

test('no \\u26a0 (warning sign) in source', () => {
  assert.ok(!src.includes('\\u26a0'), 'Found \\u26a0 (warning sign) escape in source');
});

test('no \\ufe0f (variation selector-16) in source', () => {
  // fe0f turns text symbols into emoji — should not appear next to emoji escapes
  assert.ok(!src.includes('\\ufe0f'), 'Found \\ufe0f variation selector escape in source');
});

test('series label does not use emoji textContent pattern', () => {
  // Old pattern: seriesEl.textContent = '\\uD83D...' + assignment.series
  assert.ok(
    !src.includes("textContent = '\\uD83D\\uDCDA"),
    'Found old emoji-prefixed series textContent assignment'
  );
});

test('due date label does not use emoji textContent pattern', () => {
  // Old pattern: dueEl.textContent = '\\uD83D\\uDCC5 Due: '
  assert.ok(
    !src.includes("textContent = '\\uD83D\\uDCC5"),
    'Found old emoji-prefixed due date textContent assignment'
  );
});

// ── Source-level innerHTML safety scan ───────────────────────────────────────

console.log('\n--- innerHTML safety scan ---');

test('innerHTML assignments are only static SVG spinner content (upload modal submit btn)', () => {
  // Allowed: submitBtn.innerHTML = '<svg ...' (static, no user data)
  // Allowed: submitBtn.innerHTML = originalBtnHtml (restoring the static SVG)
  // Allowed: container.innerHTML = '' (clearing)
  const innerHtmlMatches = [...src.matchAll(/\.innerHTML\s*=/g)];
  const allowedPatterns = [
    /\.innerHTML\s*=\s*'<svg /,           // static SVG string assignment
    /\.innerHTML\s*=\s*originalBtnHtml/,  // restoring saved static content
    /\.innerHTML\s*=\s*''/,               // clearing
    /\.innerHTML\s*=\s*""/,               // clearing (double-quote variant)
  ];

  const violations = innerHtmlMatches.filter(m => {
    const snippet = src.slice(m.index, m.index + 200);
    return !allowedPatterns.some(p => p.test(snippet));
  });

  assert.strictEqual(violations.length, 0,
    `Found ${violations.length} unexpected innerHTML assignment(s). ` +
    'All innerHTML must be static SVG or empty-string clears.'
  );
});

// ── ICON_PATHS coverage ───────────────────────────────────────────────────────

console.log('\n--- ICON_PATHS coverage ---');

test('ICON_PATHS contains calendar icon', () => {
  assert.ok(src.includes("calendar: ["), 'ICON_PATHS missing calendar entry');
});

test('calendar icon has rect element', () => {
  // The calendar icon has a rect as its first shape
  const calIdx = src.indexOf("calendar: [");
  assert.ok(calIdx !== -1, 'calendar key not found');
  const calSection = src.slice(calIdx, calIdx + 300);
  assert.ok(calSection.includes("tag: 'rect'"), 'calendar icon missing rect shape');
});

test('ICON_PATHS contains folderOpen icon', () => {
  assert.ok(src.includes("folderOpen: ["), 'ICON_PATHS missing folderOpen entry');
});

test('ICON_PATHS contains folder icon', () => {
  assert.ok(src.includes("folder: ["), 'ICON_PATHS missing folder entry');
});

test('ICON_PATHS contains bookOpen icon', () => {
  assert.ok(src.includes("bookOpen: ["), 'ICON_PATHS missing bookOpen entry');
});

test('createIcon is called with calendar in source', () => {
  assert.ok(
    src.includes("createIcon('calendar'"),
    "createIcon('calendar') not found — calendar icon not used in source"
  );
});

test('createIcon is called with folderOpen in source', () => {
  assert.ok(
    src.includes("createIcon(syExpanded ? 'folderOpen' : 'folder'") ||
    src.includes("createIcon('folderOpen'"),
    "createIcon with folderOpen not found in source"
  );
});

test('createIcon is called with bookOpen for series labels', () => {
  assert.ok(
    src.includes("createIcon('bookOpen'"),
    "createIcon('bookOpen') not found — series icon not set up"
  );
});

// ── Modal ARIA verification ───────────────────────────────────────────────────

console.log('\n--- Modal ARIA verification ---');

test('detail modal has role="dialog"', () => {
  // The detail overlay must set role="dialog"
  assert.ok(
    src.includes('setAttribute(\'role\', \'dialog\')') ||
    src.includes('setAttribute("role", "dialog")'),
    'Detail overlay missing setAttribute role=dialog'
  );
});

test('detail modal has aria-modal="true"', () => {
  assert.ok(
    src.includes('setAttribute(\'aria-modal\', \'true\')') ||
    src.includes('setAttribute("aria-modal", "true")'),
    'Detail overlay missing setAttribute aria-modal=true'
  );
});

test('detail modal has aria-labelledby="detailModalTitle"', () => {
  assert.ok(
    src.includes("'detailModalTitle'") || src.includes('"detailModalTitle"'),
    'Detail overlay missing aria-labelledby=detailModalTitle'
  );
});

test('detail modal title element has id="detailModalTitle"', () => {
  assert.ok(
    src.includes("'detailModalTitle'"),
    'detailModalTitle id not found in source'
  );
});

test('smart suggest modal has aria-labelledby="smartSuggestTitle"', () => {
  assert.ok(
    src.includes("'smartSuggestTitle'") || src.includes('"smartSuggestTitle"'),
    'Smart suggest modal missing aria-labelledby=smartSuggestTitle'
  );
});

test('smart suggest modal sets role="dialog"', () => {
  // showSmartSuggestModal must set role dialog on overlay
  assert.ok(
    src.includes('setAttribute(\'role\', \'dialog\')'),
    'Smart suggest modal missing role=dialog'
  );
});

test('upload paper modal has role="dialog" set', () => {
  // The upload overlay must set role=dialog
  const uploadIdx = src.indexOf('async function openUploadPaperModal(');
  assert.ok(uploadIdx !== -1, 'openUploadPaperModal not found');
  const uploadSection = src.slice(uploadIdx, uploadIdx + 1500);
  assert.ok(
    uploadSection.includes("setAttribute('role', 'dialog')") ||
    uploadSection.includes('setAttribute("role", "dialog")'),
    'Upload paper overlay missing role=dialog'
  );
});

// ── No alert() or confirm() calls ────────────────────────────────────────────

console.log('\n--- No bare alert/confirm ---');

test('no bare alert() calls in source', () => {
  // Must not contain alert( that is not part of rcAlert
  const alertMatches = src.match(/(?<![a-zA-Z0-9_$])alert\s*\(/g);
  assert.ok(
    !alertMatches || alertMatches.length === 0,
    `Found ${(alertMatches || []).length} bare alert() call(s) — use rcAlert() instead`
  );
});

test('no bare confirm() calls in source', () => {
  // Must not contain confirm( that is not part of rcConfirm or a comment
  // We look for confirm( that is not preceded by rc
  const confirmMatches = src.match(/(?<![a-zA-Z0-9_$])confirm\s*\(/g);
  assert.ok(
    !confirmMatches || confirmMatches.length === 0,
    `Found ${(confirmMatches || []).length} bare confirm() call(s) — use rcConfirm() instead`
  );
});

// ── Filter persistence ────────────────────────────────────────────────────────

console.log('\n--- Filter persistence ---');

test('saveFilters function exists in source', () => {
  assert.ok(
    src.includes('function saveFilters(') || src.includes('saveFilters ='),
    'saveFilters function not found in source'
  );
});

test('loadFilters function exists in source', () => {
  assert.ok(
    src.includes('function loadFilters(') || src.includes('loadFilters ='),
    'loadFilters function not found in source'
  );
});

test('saveFilters uses localStorage', () => {
  const saveIdx = src.indexOf('function saveFilters(');
  assert.ok(saveIdx !== -1, 'saveFilters function not found');
  const saveSection = src.slice(saveIdx, saveIdx + 1500);
  assert.ok(
    saveSection.includes('localStorage'),
    'saveFilters does not use localStorage'
  );
});

test('loadFilters uses localStorage', () => {
  const loadIdx = src.indexOf('function loadFilters(');
  assert.ok(loadIdx !== -1, 'loadFilters function not found');
  const loadSection = src.slice(loadIdx, loadIdx + 500);
  assert.ok(
    loadSection.includes('localStorage'),
    'loadFilters does not use localStorage'
  );
});

// ── showToast usage ───────────────────────────────────────────────────────────

console.log('\n--- showToast ---');

test('showToast function exists in source', () => {
  assert.ok(
    src.includes('function showToast('),
    'showToast function not found in source'
  );
});

test('showToast is called for user notifications (not alert)', () => {
  // The file should call showToast multiple times, not alert
  const toastCalls = (src.match(/showToast\s*\(/g) || []).length;
  assert.ok(
    toastCalls >= 3,
    `showToast called only ${toastCalls} time(s); expected at least 3 notification uses`
  );
});

test('showToast function accepts bg and color parameters', () => {
  const fnIdx = src.indexOf('function showToast(');
  assert.ok(fnIdx !== -1, 'showToast function not found');
  const fnSignature = src.slice(fnIdx, fnIdx + 100);
  // Should have at least 2 params (text + bg or color)
  assert.ok(
    /function showToast\s*\(\s*\w+\s*,/.test(fnSignature),
    'showToast does not appear to accept additional parameters (bg, color)'
  );
});

// ── Keyboard accessibility ────────────────────────────────────────────────────

console.log('\n--- Keyboard accessibility ---');

test('detail modal has Escape key handler', () => {
  // onDetailKeyDown must check for Escape
  assert.ok(
    src.includes("'Escape'"),
    'No Escape key check found in source'
  );
});

test('detail modal has Tab focus trap', () => {
  // onDetailKeyDown must check for Tab
  assert.ok(
    src.includes("'Tab'"),
    'No Tab key check found in source'
  );
});

test('detail modal has unified closeModal function', () => {
  assert.ok(
    src.includes('function closeModal('),
    'closeModal function not found — close paths should go through a unified function'
  );
});

test('upload modal has unified closeUploadModal function', () => {
  assert.ok(
    src.includes('function closeUploadModal('),
    'closeUploadModal function not found — close paths should go through a unified function'
  );
});

test('smart suggest modal has unified closeSmartModal function', () => {
  assert.ok(
    src.includes('function closeSmartModal('),
    'closeSmartModal function not found'
  );
});

test('smart suggest modal has keyboard handler function handleSmartKeydown', () => {
  assert.ok(
    src.includes('function handleSmartKeydown('),
    'handleSmartKeydown function not found'
  );
});

// ── Focus restore ─────────────────────────────────────────────────────────────

console.log('\n--- Focus restore ---');

test('showAssignmentDetail saves trigger element for focus restore', () => {
  const fnIdx = src.indexOf('function showAssignmentDetail(');
  assert.ok(fnIdx !== -1, 'showAssignmentDetail not found');
  const fnSection = src.slice(fnIdx, fnIdx + 300);
  assert.ok(
    fnSection.includes('document.activeElement'),
    'showAssignmentDetail does not save document.activeElement for focus restore'
  );
});

test('openUploadPaperModal saves trigger element for focus restore', () => {
  const fnIdx = src.indexOf('async function openUploadPaperModal(');
  assert.ok(fnIdx !== -1, 'openUploadPaperModal not found');
  const fnSection = src.slice(fnIdx, fnIdx + 300);
  assert.ok(
    fnSection.includes('document.activeElement'),
    'openUploadPaperModal does not save document.activeElement for focus restore'
  );
});

test('showSmartSuggestModal saves trigger element for focus restore', () => {
  const fnIdx = src.indexOf('function showSmartSuggestModal(');
  assert.ok(fnIdx !== -1, 'showSmartSuggestModal not found');
  const fnSection = src.slice(fnIdx, fnIdx + 400);
  assert.ok(
    fnSection.includes('document.activeElement'),
    'showSmartSuggestModal does not save document.activeElement for focus restore'
  );
});

// ── Loading shimmer in detail modal ──────────────────────────────────────────

console.log('\n--- Detail modal shimmer ---');

test('showAssignmentDetail uses tc-lib-shimmer class for loading state', () => {
  const fnIdx = src.indexOf('function showAssignmentDetail(');
  assert.ok(fnIdx !== -1, 'showAssignmentDetail not found');
  const fnSection = src.slice(fnIdx, fnIdx + 3000);
  assert.ok(
    fnSection.includes('tc-lib-shimmer'),
    'Detail modal missing loading shimmer (tc-lib-shimmer class)'
  );
});

test('showAssignmentDetail uses requestAnimationFrame to defer stats rendering', () => {
  const fnIdx = src.indexOf('function showAssignmentDetail(');
  assert.ok(fnIdx !== -1, 'showAssignmentDetail not found');
  const fnSection = src.slice(fnIdx, fnIdx + 3000);
  assert.ok(
    fnSection.includes('requestAnimationFrame'),
    'Detail modal does not use requestAnimationFrame to defer stats computation'
  );
});

// ── MutationObserver removal ──────────────────────────────────────────────────

console.log('\n--- Upload modal cleanup ---');

test('upload paper modal does not use MutationObserver for cleanup', () => {
  const fnIdx = src.indexOf('async function openUploadPaperModal(');
  assert.ok(fnIdx !== -1, 'openUploadPaperModal not found');
  // Find the end of the function roughly (next top-level function)
  const nextFnIdx = src.indexOf('\n  async function ', fnIdx + 1);
  const fnEnd = nextFnIdx !== -1 ? nextFnIdx : fnIdx + 5000;
  const fnSection = src.slice(fnIdx, fnEnd);
  assert.ok(
    !fnSection.includes('MutationObserver'),
    'openUploadPaperModal still uses MutationObserver — replace with explicit closeUploadModal()'
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
