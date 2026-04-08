// Unit tests for tc-library.js: Phase 8 features
// Tests: keyboard shortcuts, drag-to-reorder, recall "Create Draft" flow,
//        help modal, clickable pills, empty state tips
// Run with: node tests/tc-library-phase8.test.cjs

'use strict';

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

const assert = require('assert');

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

console.log('\n--- Keyboard shortcuts ---');

test('TAB_KEY_MAP is defined with tab entries', () => {
  assert.ok(src.includes('TAB_KEY_MAP'), 'TAB_KEY_MAP not found in source');
});

test("TAB_KEY_MAP maps '1' to reserve tab", () => {
  assert.ok(src.includes("'1': 'reserve'"), "TAB_KEY_MAP entry '1':'reserve' not found");
});

test("TAB_KEY_MAP maps '6' to recallLibrary tab", () => {
  assert.ok(src.includes("'6': 'recallLibrary'"), "TAB_KEY_MAP entry '6':'recallLibrary' not found");
});

test("keyboard handler checks e.key === '/'  for focus search", () => {
  assert.ok(src.includes("e.key === '/'"), "e.key === '/' handler not found");
});

test("keyboard handler checks e.key === 'Escape'", () => {
  assert.ok(src.includes("e.key === 'Escape'"), "e.key === 'Escape' handler not found");
});

test("keyboard handler checks e.key === '?' for help modal", () => {
  assert.ok(src.includes("e.key === '?'"), "e.key === '?' handler not found");
});

test('keyboard handler has modifier key guard (ctrlKey / metaKey / altKey)', () => {
  assert.ok(
    src.includes('e.ctrlKey || e.metaKey || e.altKey'),
    'modifier key guard (e.ctrlKey || e.metaKey || e.altKey) not found'
  );
});

// ── Help modal ────────────────────────────────────────────────────────────────

console.log('\n--- Help modal ---');

test('showKeyboardShortcutsModal function exists', () => {
  assert.ok(
    src.includes('function showKeyboardShortcutsModal('),
    'showKeyboardShortcutsModal function not found'
  );
});

test('keyboardShortcutsOverlay element ID exists', () => {
  assert.ok(
    src.includes('keyboardShortcutsOverlay'),
    'keyboardShortcutsOverlay element ID not found'
  );
});

test('help modal has focus trap logic (Tab key)', () => {
  const modalIdx = src.indexOf('function showKeyboardShortcutsModal(');
  assert.ok(modalIdx !== -1, 'showKeyboardShortcutsModal not found');
  // Look for Tab key handling after the modal definition
  const modalSection = src.slice(modalIdx, modalIdx + 4000);
  assert.ok(
    modalSection.includes("e.key === 'Tab'"),
    "focus trap (e.key === 'Tab') not found inside showKeyboardShortcutsModal"
  );
});

test('help modal uses aria-modal attribute', () => {
  assert.ok(
    src.includes("aria-modal"),
    'aria-modal attribute not found in source'
  );
});

// ── Drag-to-reorder ───────────────────────────────────────────────────────────

console.log('\n--- Drag-to-reorder ---');

test('card has draggable attribute set', () => {
  assert.ok(
    src.includes("setAttribute('draggable', 'true')"),
    "draggable='true' attribute not found"
  );
});

test('grid has dragstart event listener', () => {
  assert.ok(
    src.includes("addEventListener('dragstart'"),
    "dragstart event listener not found"
  );
});

test('grid has dragover event listener', () => {
  assert.ok(
    src.includes("addEventListener('dragover'"),
    "dragover event listener not found"
  );
});

test('grid has drop event listener', () => {
  assert.ok(
    src.includes("addEventListener('drop'"),
    "drop event listener not found"
  );
});

test('grid has dragend event listener', () => {
  assert.ok(
    src.includes("addEventListener('dragend'"),
    "dragend event listener not found"
  );
});

test('rc_tc_library_reserve_order_v1 localStorage key exists', () => {
  assert.ok(
    src.includes('rc_tc_library_reserve_order_v1'),
    'rc_tc_library_reserve_order_v1 key not found'
  );
});

test("'custom' sort option is present in ASSIGNMENT_SORT_OPTIONS", () => {
  assert.ok(
    src.includes("'custom'"),
    "'custom' sort option not found in source"
  );
});

test('.dragging CSS class is used', () => {
  assert.ok(src.includes('.dragging'), '.dragging CSS class not found');
});

test('.drag-over CSS class is used', () => {
  assert.ok(src.includes('.drag-over'), '.drag-over CSS class not found');
});

test('drag reorder persists only upcoming (reserve) IDs', () => {
  // The drop handler must filter to upcoming lane before saving order
  assert.ok(
    src.includes("computeLane(a, instancesData) === 'upcoming'") &&
    src.includes('rc_tc_library_reserve_order_v1'),
    'drop handler does not filter to upcoming lane before persisting order'
  );
});

// ── Recall Library improvements ───────────────────────────────────────────────

console.log('\n--- Recall Library improvements ---');

test("Recall button text is 'Create Draft' (not 'Add to Reserve')", () => {
  assert.ok(
    src.includes('Create Draft'),
    "'Create Draft' button text not found"
  );
  assert.ok(
    !src.includes('Add to Reserve'),
    "'Add to Reserve' text still present — should have been renamed to 'Create Draft'"
  );
});

test("Draft created toast message is correct", () => {
  assert.ok(
    src.includes('Draft created'),
    "'Draft created' toast message not found"
  );
  assert.ok(
    !src.includes('Added to Reserve'),
    "'Added to Reserve' toast still present — should say 'Draft created'"
  );
});

test("Error toast says 'Could not create draft'", () => {
  assert.ok(
    src.includes('Could not create draft'),
    "'Could not create draft' error toast not found"
  );
});

test('recallLibraryBadge element ID exists', () => {
  assert.ok(
    src.includes('recallLibraryBadge'),
    'recallLibraryBadge element ID not found'
  );
});

test('updateRecallBadge function exists', () => {
  assert.ok(
    src.includes('function updateRecallBadge('),
    'updateRecallBadge function not found'
  );
});

test('recallLibrarySearch input ID exists', () => {
  assert.ok(
    src.includes('recallLibrarySearch'),
    'recallLibrarySearch input ID not found'
  );
});

// ── Overview clickable pills ──────────────────────────────────────────────────

console.log('\n--- Overview clickable pills ---');

test('makeClickablePill function exists', () => {
  assert.ok(
    src.includes('makeClickablePill'),
    'makeClickablePill function not found'
  );
});

test('clickable pills call switchTab on click', () => {
  const pillIdx = src.indexOf('makeClickablePill');
  assert.ok(pillIdx !== -1, 'makeClickablePill not found');
  // Within the function, switchTab should be called
  const pillSection = src.slice(pillIdx, pillIdx + 1000);
  assert.ok(
    pillSection.includes('switchTab'),
    'switchTab not called within makeClickablePill'
  );
});

// ── Empty state tips ──────────────────────────────────────────────────────────

console.log('\n--- Empty state tips ---');

test("Empty state tip contains 'Press ? to see keyboard shortcuts'", () => {
  assert.ok(
    src.includes('Press ? to see keyboard shortcuts'),
    "'Press ? to see keyboard shortcuts' tip not found"
  );
});

test("Empty state tip contains 'press 1 to switch'", () => {
  assert.ok(
    src.includes('press 1 to switch'),
    "'press 1 to switch' tip not found"
  );
});

// ── esc() deduplication ───────────────────────────────────────────────────────

console.log('\n--- esc() deduplication ---');

test('esc() is defined exactly once (module-level)', () => {
  const matches = src.match(/const esc = \(v\) =>/g) || [];
  assert.strictEqual(
    matches.length,
    1,
    `Expected exactly 1 definition of esc(), found ${matches.length}`
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
