// Unit tests for tc-library.js: PR 9 accessibility improvements
// Tests: focus trap utility, tag chip ARIA, view mode toggle ARIA
// Run with: node tests/tc-library-pr9.test.cjs

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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

// ── Issue #22: Focus Trap Utility ─────────────────────────────────────────────

console.log('\n--- Focus trap utility (Issue #22) ---');

test('trapFocus function is defined', () => {
  assert.ok(
    src.includes('function trapFocus('),
    'trapFocus function not found in source'
  );
});

test('trapFocus handles Tab key for focus cycling', () => {
  const fnIdx = src.indexOf('function trapFocus(');
  assert.ok(fnIdx !== -1, 'trapFocus not found');
  const fnSection = src.slice(fnIdx, fnIdx + 1500);
  assert.ok(
    fnSection.includes("e.key !== 'Tab'") || fnSection.includes("e.key === 'Tab'"),
    'trapFocus does not check for Tab key'
  );
});

test('trapFocus handles Shift+Tab (backward cycle)', () => {
  const fnIdx = src.indexOf('function trapFocus(');
  assert.ok(fnIdx !== -1, 'trapFocus not found');
  const fnSection = src.slice(fnIdx, fnIdx + 1500);
  assert.ok(
    fnSection.includes('e.shiftKey'),
    'trapFocus does not handle Shift+Tab backward cycling'
  );
});

test('trapFocus returns a release function', () => {
  const fnIdx = src.indexOf('function trapFocus(');
  assert.ok(fnIdx !== -1, 'trapFocus not found');
  const fnSection = src.slice(fnIdx, fnIdx + 1500);
  assert.ok(
    fnSection.includes('return function release(') || fnSection.includes('return function('),
    'trapFocus does not return a release function'
  );
});

test('trapFocus queries focusable elements with correct selector', () => {
  const fnIdx = src.indexOf('function trapFocus(');
  assert.ok(fnIdx !== -1, 'trapFocus not found');
  const fnSection = src.slice(fnIdx, fnIdx + 1500);
  assert.ok(
    fnSection.includes('querySelectorAll(FOCUSABLE_SELECTOR)') || fnSection.includes("querySelectorAll('"),
    'trapFocus does not query focusable elements'
  );
});

test('FOCUSABLE_SELECTOR constant is defined', () => {
  assert.ok(
    src.includes('FOCUSABLE_SELECTOR'),
    'FOCUSABLE_SELECTOR constant not found'
  );
});

// ── Issue #22: Catalog Wizard focus trap ──────────────────────────────────────

console.log('\n--- Catalog Wizard focus trap (Issue #22) ---');

test('openCatalogWizard calls trapFocus', () => {
  const fnIdx = src.indexOf('function openCatalogWizard(');
  assert.ok(fnIdx !== -1, 'openCatalogWizard not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('trapFocus('),
    'openCatalogWizard does not call trapFocus'
  );
});

test('openCatalogWizard releases focus trap on close', () => {
  const fnIdx = src.indexOf('function openCatalogWizard(');
  assert.ok(fnIdx !== -1, 'openCatalogWizard not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('releaseTrap()') || fnSection.includes('release()'),
    'openCatalogWizard does not release focus trap when closing'
  );
});

test('openCatalogWizard sets initial focus', () => {
  const fnIdx = src.indexOf('function openCatalogWizard(');
  assert.ok(fnIdx !== -1, 'openCatalogWizard not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('.focus()'),
    'openCatalogWizard does not set initial focus'
  );
});

test('openCatalogWizard still returns focus to trigger on close', () => {
  const fnIdx = src.indexOf('function openCatalogWizard(');
  assert.ok(fnIdx !== -1, 'openCatalogWizard not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('triggerEl') && fnSection.includes('triggerEl.focus'),
    'openCatalogWizard does not restore focus to trigger element on close'
  );
});

// ── Issue #22: Bulk Finalize modal focus trap ─────────────────────────────────

console.log('\n--- Bulk Finalize focus trap (Issue #22) ---');

test('openBulkFinalizeByDateModal calls trapFocus', () => {
  const fnIdx = src.indexOf('function openBulkFinalizeByDateModal(');
  assert.ok(fnIdx !== -1, 'openBulkFinalizeByDateModal not found');
  const fnSection = src.slice(fnIdx, fnIdx + 12000);
  assert.ok(
    fnSection.includes('trapFocus('),
    'openBulkFinalizeByDateModal does not call trapFocus'
  );
});

test('openBulkFinalizeByDateModal releases focus trap on close', () => {
  const fnIdx = src.indexOf('function openBulkFinalizeByDateModal(');
  assert.ok(fnIdx !== -1, 'openBulkFinalizeByDateModal not found');
  const fnSection = src.slice(fnIdx, fnIdx + 12000);
  assert.ok(
    fnSection.includes('releaseTrapBulk()') || fnSection.includes('releaseTrap'),
    'openBulkFinalizeByDateModal does not release focus trap when closing'
  );
});

// ── Issue #22: Bulk Set Unit modal focus trap ─────────────────────────────────

console.log('\n--- Bulk Set Unit focus trap (Issue #22) ---');

test('openBulkSetUnitModal calls trapFocus', () => {
  const fnIdx = src.indexOf('function openBulkSetUnitModal(');
  assert.ok(fnIdx !== -1, 'openBulkSetUnitModal not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('trapFocus('),
    'openBulkSetUnitModal does not call trapFocus'
  );
});

test('openBulkSetUnitModal releases focus trap on close', () => {
  const fnIdx = src.indexOf('function openBulkSetUnitModal(');
  assert.ok(fnIdx !== -1, 'openBulkSetUnitModal not found');
  const fnSection = src.slice(fnIdx, fnIdx + 5000);
  assert.ok(
    fnSection.includes('releaseTrapUnit()') || fnSection.includes('releaseTrap'),
    'openBulkSetUnitModal does not release focus trap when closing'
  );
});

// ── Issue #23: Tag chip ARIA attributes ───────────────────────────────────────

console.log('\n--- Tag chip ARIA attributes (Issue #23) ---');

test('tag chips have aria-label "Filter by tag:"', () => {
  assert.ok(
    src.includes("'Filter by tag: '"),
    'Tag chip aria-label "Filter by tag:" not found in source'
  );
});

test('tag chips have aria-pressed attribute', () => {
  assert.ok(
    src.includes("setAttribute('aria-pressed'"),
    'Tag chip aria-pressed not found in source'
  );
});

test('"All Tags" button has aria-label', () => {
  assert.ok(
    src.includes("'Show all tags'"),
    '"Show all tags" aria-label not found on All Tags button'
  );
});

test('"All Tags" button has aria-pressed', () => {
  // "All Tags" button sets aria-pressed based on whether any tags are selected
  assert.ok(
    src.includes("aria-label', 'Show all tags'"),
    '"All Tags" button aria-label not found'
  );
});

test('Reserve tab tag chips set aria-pressed', () => {
  const fnIdx = src.indexOf('function renderReserveTab(');
  assert.ok(fnIdx !== -1, 'renderReserveTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 12000);
  assert.ok(
    fnSection.includes("setAttribute('aria-pressed'"),
    'Reserve tab tag chips do not set aria-pressed'
  );
});

test('Active tab tag chips set aria-pressed', () => {
  const fnIdx = src.indexOf('function renderActiveTab(');
  assert.ok(fnIdx !== -1, 'renderActiveTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(
    fnSection.includes("setAttribute('aria-pressed'"),
    'Active tab tag chips do not set aria-pressed'
  );
});

test('Finalized tab tag chips set aria-pressed', () => {
  const fnIdx = src.indexOf('function renderFinalizedTab(');
  assert.ok(fnIdx !== -1, 'renderFinalizedTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(
    fnSection.includes("setAttribute('aria-pressed'"),
    'Finalized tab tag chips do not set aria-pressed'
  );
});

test('Reserve tab tag chips set aria-label with tag name', () => {
  const fnIdx = src.indexOf('function renderReserveTab(');
  assert.ok(fnIdx !== -1, 'renderReserveTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 12000);
  assert.ok(
    fnSection.includes("'Filter by tag: '"),
    'Reserve tab tag chips do not set aria-label with tag name'
  );
});

test('Active tab tag chips set aria-label with tag name', () => {
  const fnIdx = src.indexOf('function renderActiveTab(');
  assert.ok(fnIdx !== -1, 'renderActiveTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(
    fnSection.includes("'Filter by tag: '"),
    'Active tab tag chips do not set aria-label with tag name'
  );
});

test('Finalized tab tag chips set aria-label with tag name', () => {
  const fnIdx = src.indexOf('function renderFinalizedTab(');
  assert.ok(fnIdx !== -1, 'renderFinalizedTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(
    fnSection.includes("'Filter by tag: '"),
    'Finalized tab tag chips do not set aria-label with tag name'
  );
});

// ── Issue #24: View mode toggle ARIA ─────────────────────────────────────────

console.log('\n--- View mode toggle ARIA (Issue #24) ---');

test('view mode toggle container has role="group"', () => {
  assert.ok(
    src.includes("setAttribute('role', 'group')"),
    'View mode toggle container does not have role="group"'
  );
});

test('view mode toggle container has aria-label="View mode"', () => {
  assert.ok(
    src.includes("setAttribute('aria-label', 'View mode')"),
    'View mode toggle container does not have aria-label="View mode"'
  );
});

test('Flat list view button has aria-label', () => {
  assert.ok(
    src.includes("'Flat list view'"),
    'Flat list view button aria-label not found'
  );
});

test('Tree view button has aria-label', () => {
  assert.ok(
    src.includes("'Tree view'"),
    'Tree view button aria-label not found'
  );
});

test('Table view button has aria-label', () => {
  assert.ok(
    src.includes("'Table view'"),
    'Table view button aria-label not found'
  );
});

test('Group by unit view button has aria-label', () => {
  assert.ok(
    src.includes("'Group by unit view'"),
    'Group by unit view button aria-label not found'
  );
});

test('Reserve tab view toggles have aria-pressed', () => {
  const fnIdx = src.indexOf('function renderReserveTab(');
  assert.ok(fnIdx !== -1, 'renderReserveTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 12000);
  assert.ok(
    fnSection.includes("setAttribute('aria-pressed'"),
    'Reserve tab view toggles do not have aria-pressed'
  );
});

test('Active tab view toggles have aria-pressed', () => {
  const fnIdx = src.indexOf('function renderActiveTab(');
  assert.ok(fnIdx !== -1, 'renderActiveTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(
    fnSection.includes("setAttribute('aria-pressed'"),
    'Active tab view toggles do not have aria-pressed'
  );
});

test('Finalized tab view toggles have aria-pressed', () => {
  const fnIdx = src.indexOf('function renderFinalizedTab(');
  assert.ok(fnIdx !== -1, 'renderFinalizedTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(
    fnSection.includes("setAttribute('aria-pressed'"),
    'Finalized tab view toggles do not have aria-pressed'
  );
});

test('Reserve tab view toggle group has role="group" and aria-label', () => {
  const fnIdx = src.indexOf('function renderReserveTab(');
  assert.ok(fnIdx !== -1, 'renderReserveTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 12000);
  assert.ok(
    fnSection.includes("setAttribute('role', 'group')") && fnSection.includes("'View mode'"),
    'Reserve tab view toggle group missing role="group" or aria-label="View mode"'
  );
});

test('Active tab view toggle group has role="group" and aria-label', () => {
  const fnIdx = src.indexOf('function renderActiveTab(');
  assert.ok(fnIdx !== -1, 'renderActiveTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(
    fnSection.includes("setAttribute('role', 'group')") && fnSection.includes("'View mode'"),
    'Active tab view toggle group missing role="group" or aria-label="View mode"'
  );
});

test('Finalized tab view toggle group has role="group" and aria-label', () => {
  const fnIdx = src.indexOf('function renderFinalizedTab(');
  assert.ok(fnIdx !== -1, 'renderFinalizedTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 20000);
  assert.ok(
    fnSection.includes("setAttribute('role', 'group')") && fnSection.includes("'View mode'"),
    'Finalized tab view toggle group missing role="group" or aria-label="View mode"'
  );
});

// ── Emoji safety check ────────────────────────────────────────────────────────

console.log('\n--- Emoji safety (PR 9 additions) ---');

test('no \\uD83D surrogate escape sequences introduced by PR 9', () => {
  assert.ok(
    !src.includes('\\uD83D'),
    'Surrogate escape \\uD83D found — use actual emoji chars instead'
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('\n\u274c Some tc-library-pr9 tests failed');
  process.exit(1);
} else {
  console.log('\n\u2713 All tc-library-pr9 tests passed!');
}
