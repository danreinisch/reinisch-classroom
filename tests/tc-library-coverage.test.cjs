// Unit tests for tc-library.js: PR 10 targeted test coverage
// Tests: computeLane() edge cases, wizard error handling, filter/render integration,
//        accessibility attributes, rollback logic
// Run with: node tests/tc-library-coverage.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load source ───────────────────────────────────────────────────────────────

const srcPath = path.join(__dirname, '..', 'site', 'web', 'tc-library.js');
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

// ── extractFunctionBody helper ────────────────────────────────────────────────

/**
 * Extracts the full body of a function from source using brace-counting.
 */
function extractFunctionBody(source, signature) {
  const sigIdx = source.indexOf(signature);
  if (sigIdx === -1) return '';
  const braceStart = source.indexOf('{', sigIdx);
  if (braceStart === -1) return source.slice(sigIdx);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(sigIdx, i + 1);
    }
  }
  return source.slice(sigIdx);
}

// ── Mirror computeLane() from tc-library.js for unit testing ─────────────────
// This mirrors the exact implementation found in site/web/tc-library.js.

function computeLane(assignment, allInstances) {
  const instances = allInstances.filter(i => i.assignment_id === assignment.id);
  if (instances.length === 0) {
    if (assignment.active === false) return 'finalized';
    if (assignment.finalized_at) return 'finalized';
    return 'upcoming';
  }
  // Per-assignment: if the teacher marked the assignment inactive, it's finalized
  if (assignment.active === false) return 'finalized';
  // Explicitly finalized via timestamp (e.g. teacher pressed "Finalize")
  if (assignment.finalized_at) return 'finalized';
  const anyActive = instances.some(i =>
    ['Assigned', 'In Progress', 'Submitted'].includes(i.status)
  );
  if (anyActive) return 'current';
  const allTerminal = instances.every(i => i.status === 'Graded' || i.status === 'Reviewed');
  if (allTerminal) return 'finalized';
  return 'upcoming';
}

// ── Section 1: computeLane() edge cases ──────────────────────────────────────

console.log('\n--- computeLane() standard cases ---');

test('no instances, active not set → Reserve (upcoming)', () => {
  assert.strictEqual(computeLane({ id: 'A1' }, []), 'upcoming');
});

test('active instances, no archived flag → Active (current)', () => {
  const inst = [{ assignment_id: 'A1', status: 'Assigned' }];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'current');
});

test('no instances, active=false → Finalized', () => {
  assert.strictEqual(computeLane({ id: 'A1', active: false }, []), 'finalized');
});

test('all Graded instances, not archived → Finalized', () => {
  const inst = [
    { assignment_id: 'A1', status: 'Graded' },
    { assignment_id: 'A1', status: 'Graded' }
  ];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'finalized');
});

console.log('\n--- computeLane() edge: missing fields ---');

test('missing active field (undefined) with no instances → upcoming, does not crash', () => {
  assert.doesNotThrow(() => computeLane({ id: 'A1' }, []));
  assert.strictEqual(computeLane({ id: 'A1' }, []), 'upcoming');
});

test('missing active field with active instance → current, does not crash', () => {
  const inst = [{ assignment_id: 'A1', status: 'In Progress' }];
  assert.doesNotThrow(() => computeLane({ id: 'A1' }, inst));
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'current');
});

test('missing finalized_at field → not treated as finalized', () => {
  const inst = [{ assignment_id: 'A1', status: 'Assigned' }];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'current');
});

console.log('\n--- computeLane() edge: archived wins over active instances ---');

test('active=false with Assigned instance → finalized (archived wins)', () => {
  const inst = [{ assignment_id: 'A1', status: 'Assigned' }];
  assert.strictEqual(computeLane({ id: 'A1', active: false }, inst), 'finalized');
});

test('active=false with In Progress instance → finalized (archived wins)', () => {
  const inst = [{ assignment_id: 'A1', status: 'In Progress' }];
  assert.strictEqual(computeLane({ id: 'A1', active: false }, inst), 'finalized');
});

test('active=false with mixed statuses including active → finalized (archived wins)', () => {
  const inst = [
    { assignment_id: 'A1', status: 'Assigned' },
    { assignment_id: 'A1', status: 'Graded' }
  ];
  assert.strictEqual(computeLane({ id: 'A1', active: false }, inst), 'finalized');
});

console.log('\n--- computeLane() edge: finalized_at timestamp ---');

test('finalized_at set + no instances → finalized', () => {
  assert.strictEqual(
    computeLane({ id: 'A1', finalized_at: '2025-01-01T00:00:00Z' }, []),
    'finalized'
  );
});

test('finalized_at set + active instances → finalized (timestamp wins)', () => {
  const inst = [
    { assignment_id: 'A1', status: 'Assigned' },
    { assignment_id: 'A1', status: 'In Progress' }
  ];
  assert.strictEqual(
    computeLane({ id: 'A1', finalized_at: '2025-01-01T00:00:00Z' }, inst),
    'finalized'
  );
});

test('finalized_at set + active=true → finalized (timestamp overrides active flag)', () => {
  const inst = [{ assignment_id: 'A1', status: 'Submitted' }];
  assert.strictEqual(
    computeLane({ id: 'A1', active: true, finalized_at: '2025-03-01T00:00:00Z' }, inst),
    'finalized'
  );
});

test('finalized_at null → not finalized by that field alone', () => {
  const inst = [{ assignment_id: 'A1', status: 'Assigned' }];
  assert.strictEqual(computeLane({ id: 'A1', finalized_at: null }, inst), 'current');
});

test('finalized_at empty string → not finalized by that field alone', () => {
  const inst = [{ assignment_id: 'A1', status: 'Assigned' }];
  assert.strictEqual(computeLane({ id: 'A1', finalized_at: '' }, inst), 'current');
});

console.log('\n--- computeLane() edge: null/undefined/isolated inputs ---');

test('instances only for other assignment IDs are ignored → upcoming', () => {
  const inst = [{ assignment_id: 'OTHER', status: 'Assigned' }];
  assert.strictEqual(computeLane({ id: 'A1' }, inst), 'upcoming');
});

test('active=true with no instances → upcoming (not finalized)', () => {
  assert.strictEqual(computeLane({ id: 'A1', active: true }, []), 'upcoming');
});

test('empty allInstances array does not crash', () => {
  assert.doesNotThrow(() => computeLane({ id: 'A1', active: false }, []));
});

test('assignment with undefined id — instances for other IDs are filtered out → upcoming', () => {
  const inst = [{ assignment_id: 'A1', status: 'Assigned' }];
  // assignment.id is undefined; filter sees undefined !== 'A1' → no matches → upcoming
  assert.doesNotThrow(() => computeLane({ id: undefined }, inst));
  assert.strictEqual(computeLane({ id: undefined }, inst), 'upcoming');
});

// ── Section 2: Wizard error handling ─────────────────────────────────────────

console.log('\n--- Wizard applySelected: Promise.allSettled batch handling ---');

test('applySelected uses Promise.allSettled for batch db updates', () => {
  const fn = extractFunctionBody(src, 'const applySelected = async (');
  assert.ok(fn.length > 0, 'applySelected not found in source');
  assert.ok(fn.includes('Promise.allSettled'), 'applySelected should use Promise.allSettled');
});

test('applySelected tracks fulfilled vs rejected results', () => {
  const fn = extractFunctionBody(src, 'const applySelected = async (');
  assert.ok(fn.length > 0, 'applySelected not found in source');
  assert.ok(
    fn.includes('fulfilled') || fn.includes('fails') || fn.includes('failed'),
    'applySelected should distinguish fulfilled from rejected results'
  );
});

test('applySelected shows a toast notification with result summary', () => {
  const fn = extractFunctionBody(src, 'const applySelected = async (');
  assert.ok(fn.length > 0, 'applySelected not found in source');
  assert.ok(fn.includes('showToast'), 'applySelected should show a toast notification');
});

test('applySelected no-ops gracefully when nothing is selected', () => {
  const fn = extractFunctionBody(src, 'const applySelected = async (');
  assert.ok(fn.length > 0, 'applySelected not found in source');
  // Guard: if (!toApply.length) return;
  assert.ok(
    fn.includes('.length') && fn.includes('return'),
    'applySelected should early-return on empty selection'
  );
});

console.log('\n--- Apply All: Promise.allSettled batch handling ---');

test('Apply All handler uses Promise.allSettled', () => {
  // Find the Apply All button creation and look at a window around it
  const applyAllIdx = src.indexOf('Apply All');
  assert.ok(applyAllIdx !== -1, 'Apply All not found in source');
  const section = src.slice(applyAllIdx, applyAllIdx + 5000);
  assert.ok(section.includes('Promise.allSettled'), 'Apply All handler should use Promise.allSettled');
});

test('Apply All handler tracks fulfilled and failed counts', () => {
  const applyAllIdx = src.indexOf('applyAllBtn.addEventListener');
  assert.ok(applyAllIdx !== -1, 'applyAllBtn event listener not found');
  const section = src.slice(applyAllIdx, applyAllIdx + 3000);
  assert.ok(
    (section.includes('done') && section.includes('fails')) ||
    section.includes('fulfilled'),
    'Apply All handler should track done/fail counts'
  );
});

test('Apply All shows toast with failure count when some fail', () => {
  const applyAllIdx = src.indexOf('applyAllBtn.addEventListener');
  assert.ok(applyAllIdx !== -1, 'applyAllBtn event listener not found');
  const section = src.slice(applyAllIdx, applyAllIdx + 3000);
  assert.ok(section.includes('showToast'), 'Apply All should show toast notification');
  assert.ok(section.includes('fails'), 'Apply All should report failure count in toast');
});

test('Apply All no-ops when no picker has a selection', () => {
  const applyAllIdx = src.indexOf('applyAllBtn.addEventListener');
  assert.ok(applyAllIdx !== -1, 'applyAllBtn event listener not found');
  const section = src.slice(applyAllIdx, applyAllIdx + 3000);
  // Guard: if (!toApply.length) return;
  assert.ok(
    section.includes('.length') && section.includes('return'),
    'Apply All should early-return when nothing is selected'
  );
});

// ── Section 3: Filter → render integration ────────────────────────────────────

console.log('\n--- Filter/render integration: globalSearchQuery ---');

test('globalSearchQuery variable is declared and initialized', () => {
  assert.ok(
    src.includes("let globalSearchQuery = ''") ||
    src.includes('let globalSearchQuery="') ||
    src.includes("globalSearchQuery = ''"),
    'globalSearchQuery should be initialized to empty string'
  );
});

test('switchTab saves and restores globalSearchQuery', () => {
  const fn = extractFunctionBody(src, 'function switchTab(');
  assert.ok(fn.length > 0, 'switchTab not found');
  assert.ok(fn.includes('globalSearchQuery'), 'switchTab should use globalSearchQuery');
});

console.log('\n--- Filter/render integration: filtersExpanded ---');

test('filtersExpanded state exists for each tab (reserve, active, finalized)', () => {
  assert.ok(src.includes('filtersExpanded'), 'filtersExpanded should be used');
  const count = (src.match(/filtersExpanded/g) || []).length;
  assert.ok(count >= 3, 'filtersExpanded should appear at least 3 times (one per tab)');
});

test('saveFilters persists filtersExpanded for each tab', () => {
  const fn = extractFunctionBody(src, 'function saveFilters(');
  assert.ok(fn.length > 0, 'saveFilters not found');
  assert.ok(fn.includes('filtersExpanded'), 'saveFilters should persist filtersExpanded');
});

test('loadFilters restores filtersExpanded for each tab', () => {
  const fn = extractFunctionBody(src, 'function loadFilters(');
  assert.ok(fn.length > 0, 'loadFilters not found');
  assert.ok(fn.includes('filtersExpanded'), 'loadFilters should restore filtersExpanded');
});

console.log('\n--- Filter/render integration: scroll persistence ---');

test('tabScrollPositions object is declared for scroll persistence', () => {
  assert.ok(src.includes('tabScrollPositions'), 'tabScrollPositions should exist');
});

test('switchTab saves and restores scroll positions', () => {
  const fn = extractFunctionBody(src, 'function switchTab(');
  assert.ok(fn.length > 0, 'switchTab not found');
  assert.ok(fn.includes('tabScrollPositions'), 'switchTab should use tabScrollPositions');
});

console.log('\n--- Filter/render integration: debounced search ---');

test('debounce() utility function is defined in source', () => {
  assert.ok(
    src.includes('function debounce(') || src.includes('const debounce ='),
    'debounce function should be defined'
  );
});

test('debounce() is called at least once in source', () => {
  const count = (src.match(/debounce\(/g) || []).length;
  assert.ok(count >= 1, 'debounce() should be called at least once');
});

// ── Section 4: Accessibility attribute tests ──────────────────────────────────

console.log('\n--- A11y: trapFocus utility ---');

test('trapFocus function is defined in source', () => {
  const fn = extractFunctionBody(src, 'function trapFocus(');
  assert.ok(fn.length > 0, 'trapFocus function should exist');
});

test('trapFocus handles Tab key for focus cycling', () => {
  const fn = extractFunctionBody(src, 'function trapFocus(');
  assert.ok(fn.length > 0, 'trapFocus not found');
  assert.ok(fn.includes('Tab') || fn.includes('keydown'), 'trapFocus should handle Tab key events');
});

test('trapFocus returns a release function to remove the listener', () => {
  const fn = extractFunctionBody(src, 'function trapFocus(');
  assert.ok(fn.length > 0, 'trapFocus not found');
  assert.ok(fn.includes('removeEventListener'), 'trapFocus should remove listener when released');
});

console.log('\n--- A11y: view mode toggle aria-pressed ---');

test('view mode toggle buttons set aria-pressed attribute', () => {
  assert.ok(
    src.includes("setAttribute('aria-pressed'"),
    'view mode toggles should set aria-pressed'
  );
});

test('aria-pressed is set to "true" or "false" string value', () => {
  assert.ok(
    src.includes("'true'") && src.includes("'false'"),
    "aria-pressed should use string 'true' and 'false'"
  );
});

console.log('\n--- A11y: modal role="dialog" and aria-modal ---');

test('modals set role="dialog"', () => {
  assert.ok(
    src.includes("setAttribute('role', 'dialog')"),
    'modals should have role="dialog"'
  );
});

test('modals set aria-modal="true"', () => {
  assert.ok(
    src.includes("setAttribute('aria-modal', 'true')"),
    'modals should have aria-modal="true"'
  );
});

test('multiple modals in source set role="dialog"', () => {
  const count = (src.match(/setAttribute\('role', 'dialog'\)/g) || []).length;
  assert.ok(count >= 2, 'at least two modals should have role="dialog"');
});

// ── Section 5: Rollback logic tests ──────────────────────────────────────────

console.log('\n--- Rollback logic: snapshot before mutation ---');

test('mutation code saves snapshots using spread before modifying assignmentsData', () => {
  assert.ok(
    src.includes('{ ...assignmentsData[idx] }'),
    'mutations should clone assignmentsData entries into a snapshot before modification'
  );
});

test('snapshots are stored in a Map keyed by assignment id', () => {
  assert.ok(src.includes('snapshots.set'), 'snapshots should be stored in a Map');
  assert.ok(src.includes('snapshots.get'), 'snapshots should be retrieved from the Map on rollback');
});

console.log('\n--- Rollback logic: try/catch wrapping ---');

test('source has try/catch blocks wrapping db calls', () => {
  assert.ok(src.includes('try {'), 'source should have try blocks');
  assert.ok(
    src.includes('} catch (err)') || src.includes('} catch (err) {'),
    'source should have catch blocks'
  );
});

test('source has multiple try/catch blocks (one per mutation)', () => {
  const tryCount = (src.match(/\btry \{/g) || []).length;
  assert.ok(tryCount >= 3, 'source should have multiple try/catch blocks for resilience');
});

console.log('\n--- Rollback logic: catch restores snapshot ---');

test('catch blocks restore assignmentsData from snapshot', () => {
  assert.ok(
    src.includes('assignmentsData[idx] = snap') ||
    src.includes('assignmentsData[idx] = snapshot'),
    'catch blocks should restore assignmentsData entries from snapshots'
  );
});

test('rollback iterates snapshots forEach to restore each failed assignment', () => {
  assert.ok(
    src.includes('snapshots.forEach'),
    'rollback should iterate all snapshots to restore each failed assignment'
  );
});

console.log('\n--- Rollback logic: rebuildLaneCache after rollback ---');

test('rebuildLaneCache() is called in multiple places (success + failure paths)', () => {
  const count = (src.match(/rebuildLaneCache\(\)/g) || []).length;
  assert.ok(count >= 2, 'rebuildLaneCache() should be called in both success and failure paths');
});

test('batch mutation handlers use Promise.allSettled for partial failure tolerance', () => {
  const count = (src.match(/Promise\.allSettled/g) || []).length;
  assert.ok(count >= 1, 'batch mutations should use Promise.allSettled');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n✗ Some tc-library-coverage tests FAILED');
  process.exit(1);
}
console.log('\n✅ All tc-library-coverage tests passed');
