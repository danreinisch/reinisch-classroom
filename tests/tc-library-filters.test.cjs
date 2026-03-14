// Unit tests for tc-library.js PR5 additions:
//   - Filter persistence (localStorage serialize/deserialize)
//   - Collapsed lanes (Set → Array → Set round-trip)
//   - Hierarchy expand state (Map → Array → Map round-trip)
//   - createIcon() helper (SVG structure validation)
//   - saveFilters / loadFilters resilience against corrupt data
// Run with: node tests/tc-library-filters.test.cjs

'use strict';

const assert = require('assert');

// ── Mirror the FILTERS_KEY constant ──────────────────────────────────────────

const FILTERS_KEY = 'rc_tc_library_filters_v1';

// ── In-memory localStorage mock ───────────────────────────────────────────────

function makeStorage() {
  const store = {};
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
}

// ── Mirror saveFilters / loadFilters logic ────────────────────────────────────

function makeDefaultFilters() {
  return {
    assignments: {
      classFilter: 'All Classes',
      searchQuery: '',
      typeFilter: 'All',
      categoryFilter: 'All'
    },
    lessons: { searchQuery: '' }
  };
}

function saveFilters(storage, filters, collapsedLanes, hierarchyExpandState) {
  try {
    const state = {
      assignments: { ...filters.assignments },
      lessonsSearchQuery: filters.lessons.searchQuery,
      collapsedLanes: Array.from(collapsedLanes),
      hierarchyExpandState: Array.from(hierarchyExpandState.entries())
    };
    storage.setItem(FILTERS_KEY, JSON.stringify(state));
  } catch (_e) { /* storage unavailable */ }
}

function loadFilters(storage, filters, collapsedLanes, hierarchyExpandState) {
  try {
    const raw = storage.getItem(FILTERS_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (state && typeof state === 'object') {
      const a = state.assignments;
      if (a && typeof a === 'object') {
        if (typeof a.classFilter === 'string') filters.assignments.classFilter = a.classFilter;
        if (typeof a.searchQuery === 'string') filters.assignments.searchQuery = a.searchQuery;
        if (typeof a.typeFilter === 'string') filters.assignments.typeFilter = a.typeFilter;
        if (typeof a.categoryFilter === 'string') filters.assignments.categoryFilter = a.categoryFilter;
      }
      if (typeof state.lessonsSearchQuery === 'string') {
        filters.lessons.searchQuery = state.lessonsSearchQuery;
      }
      if (Array.isArray(state.collapsedLanes)) {
        state.collapsedLanes.forEach(id => { if (typeof id === 'string') collapsedLanes.add(id); });
      }
      if (Array.isArray(state.hierarchyExpandState)) {
        state.hierarchyExpandState.forEach(entry => {
          if (
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === 'string' &&
            typeof entry[1] === 'boolean'
          ) {
            hierarchyExpandState.set(entry[0], entry[1]);
          }
        });
      }
    }
  } catch (_e) { /* corrupt data — ignore */ }
}

// ── Mirror ICON_PATHS and createIcon logic (JSDOM-free simulation) ────────────

const ICON_PATHS = {
  pencil:       ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'],
  book:         ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  clipboard:    ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z'],
  refresh:      ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'],
  checkCircle:  ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  barChart:     ['M12 20V10', 'M18 20V4', 'M6 20v-4'],
  inbox:        ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
  upload:       ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12']
};

// Simulate createIcon returning a mock SVG-like object (without a real DOM)
function createIconMock(name, size) {
  const sz = size || 16;
  const paths = ICON_PATHS[name] || [];
  return {
    tagName: 'svg',
    width: String(sz),
    height: String(sz),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.5',
    ariaHidden: 'true',
    pathCount: paths.length,
    name
  };
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── Filter persistence: round-trip ────────────────────────────────────────────

console.log('\n--- Filter persistence round-trip ---');

test('saves and restores assignment classFilter', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  filters.assignments.classFilter = 'Period 1';
  const collapsedLanes = new Set(['analytics']);
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const filters2 = makeDefaultFilters();
  const collapsed2 = new Set();
  const hierarchy2 = new Map();
  loadFilters(storage, filters2, collapsed2, hierarchy2);
  assert.strictEqual(filters2.assignments.classFilter, 'Period 1');
});

test('saves and restores assignment searchQuery', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  filters.assignments.searchQuery = 'reading quiz';
  const collapsedLanes = new Set();
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const filters2 = makeDefaultFilters();
  const collapsed2 = new Set();
  const hierarchy2 = new Map();
  loadFilters(storage, filters2, collapsed2, hierarchy2);
  assert.strictEqual(filters2.assignments.searchQuery, 'reading quiz');
});

test('saves and restores typeFilter and categoryFilter', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  filters.assignments.typeFilter = 'paper';
  filters.assignments.categoryFilter = 'Writing';
  const collapsedLanes = new Set();
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const filters2 = makeDefaultFilters();
  const collapsed2 = new Set();
  const hierarchy2 = new Map();
  loadFilters(storage, filters2, collapsed2, hierarchy2);
  assert.strictEqual(filters2.assignments.typeFilter, 'paper');
  assert.strictEqual(filters2.assignments.categoryFilter, 'Writing');
});

test('saves and restores lessons searchQuery', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  filters.lessons.searchQuery = 'phonics';
  const collapsedLanes = new Set();
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const filters2 = makeDefaultFilters();
  const collapsed2 = new Set();
  const hierarchy2 = new Map();
  loadFilters(storage, filters2, collapsed2, hierarchy2);
  assert.strictEqual(filters2.lessons.searchQuery, 'phonics');
});

test('all filter fields round-trip together', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  filters.assignments.classFilter = 'Period 2';
  filters.assignments.searchQuery = 'vocab';
  filters.assignments.typeFilter = 'link';
  filters.assignments.categoryFilter = 'Vocabulary';
  filters.lessons.searchQuery = 'unit 3';
  const collapsedLanes = new Set();
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const filters2 = makeDefaultFilters();
  const collapsed2 = new Set();
  const hierarchy2 = new Map();
  loadFilters(storage, filters2, collapsed2, hierarchy2);
  assert.strictEqual(filters2.assignments.classFilter, 'Period 2');
  assert.strictEqual(filters2.assignments.searchQuery, 'vocab');
  assert.strictEqual(filters2.assignments.typeFilter, 'link');
  assert.strictEqual(filters2.assignments.categoryFilter, 'Vocabulary');
  assert.strictEqual(filters2.lessons.searchQuery, 'unit 3');
});

// ── Filter resilience ─────────────────────────────────────────────────────────

console.log('\n--- Filter resilience (corrupt/malformed data) ---');

test('empty localStorage returns defaults', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  const collapsed = new Set();
  const hierarchy = new Map();
  loadFilters(storage, filters, collapsed, hierarchy); // no data saved
  assert.strictEqual(filters.assignments.classFilter, 'All Classes');
  assert.strictEqual(filters.assignments.searchQuery, '');
  assert.strictEqual(collapsed.size, 0);
  assert.strictEqual(hierarchy.size, 0);
});

test('corrupt JSON in localStorage does not throw', () => {
  const storage = makeStorage();
  storage.setItem(FILTERS_KEY, '{bad json!!!');
  const filters = makeDefaultFilters();
  const collapsed = new Set();
  const hierarchy = new Map();
  assert.doesNotThrow(() => loadFilters(storage, filters, collapsed, hierarchy));
  // Defaults should be preserved
  assert.strictEqual(filters.assignments.classFilter, 'All Classes');
});

test('non-object JSON in localStorage is ignored', () => {
  const storage = makeStorage();
  storage.setItem(FILTERS_KEY, '"just a string"');
  const filters = makeDefaultFilters();
  const collapsed = new Set();
  const hierarchy = new Map();
  loadFilters(storage, filters, collapsed, hierarchy);
  assert.strictEqual(filters.assignments.searchQuery, '');
});

test('numeric classFilter value is ignored (type check)', () => {
  const storage = makeStorage();
  storage.setItem(FILTERS_KEY, JSON.stringify({
    assignments: { classFilter: 42, searchQuery: 'valid' }
  }));
  const filters = makeDefaultFilters();
  const collapsed = new Set();
  const hierarchy = new Map();
  loadFilters(storage, filters, collapsed, hierarchy);
  // classFilter was numeric — should keep default
  assert.strictEqual(filters.assignments.classFilter, 'All Classes');
  // searchQuery was valid string — should be applied
  assert.strictEqual(filters.assignments.searchQuery, 'valid');
});

test('null assignments block is gracefully skipped', () => {
  const storage = makeStorage();
  storage.setItem(FILTERS_KEY, JSON.stringify({ assignments: null, lessonsSearchQuery: 'hi' }));
  const filters = makeDefaultFilters();
  const collapsed = new Set();
  const hierarchy = new Map();
  loadFilters(storage, filters, collapsed, hierarchy);
  assert.strictEqual(filters.assignments.classFilter, 'All Classes'); // unchanged
  assert.strictEqual(filters.lessons.searchQuery, 'hi'); // this one applied
});

// ── Collapsed lanes: Set → Array → Set round-trip ─────────────────────────────

console.log('\n--- Collapsed lanes round-trip ---');

test('empty Set saves and restores as empty Set', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  const collapsedLanes = new Set();
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const collapsed2 = new Set();
  const hierarchy2 = new Map();
  const filters2 = makeDefaultFilters();
  loadFilters(storage, filters2, collapsed2, hierarchy2);
  assert.strictEqual(collapsed2.size, 0);
});

test('Set with multiple lanes serializes and deserializes correctly', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  const collapsedLanes = new Set(['upcoming', 'finalized', 'analytics']);
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const collapsed2 = new Set();
  const hierarchy2 = new Map();
  const filters2 = makeDefaultFilters();
  loadFilters(storage, filters2, collapsed2, hierarchy2);
  assert.ok(collapsed2.has('upcoming'), 'upcoming missing');
  assert.ok(collapsed2.has('finalized'), 'finalized missing');
  assert.ok(collapsed2.has('analytics'), 'analytics missing');
  assert.strictEqual(collapsed2.size, 3);
});

test('non-string entries in collapsedLanes array are ignored', () => {
  const storage = makeStorage();
  storage.setItem(FILTERS_KEY, JSON.stringify({
    collapsedLanes: ['upcoming', 42, null, 'finalized']
  }));
  const filters = makeDefaultFilters();
  const collapsed = new Set();
  const hierarchy = new Map();
  loadFilters(storage, filters, collapsed, hierarchy);
  assert.ok(collapsed.has('upcoming'));
  assert.ok(collapsed.has('finalized'));
  assert.strictEqual(collapsed.size, 2); // 42 and null are ignored
});

// ── Hierarchy expand state: Map → Array → Map round-trip ──────────────────────

console.log('\n--- Hierarchy expand state round-trip ---');

test('empty Map saves and restores as empty Map', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  const collapsedLanes = new Set();
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const collapsed2 = new Set();
  const hierarchy2 = new Map();
  const filters2 = makeDefaultFilters();
  loadFilters(storage, filters2, collapsed2, hierarchy2);
  assert.strictEqual(hierarchy2.size, 0);
});

test('Map with entries serializes and deserializes correctly', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  const collapsedLanes = new Set();
  const hierarchyExpandState = new Map([
    ['sy-2024_2025', true],
    ['sy-2024_2025-m-January_2025', false],
    ['sy-2024_2025-m-January_2025-w-Week_of_Jan_6', true]
  ]);
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const collapsed2 = new Set();
  const hierarchy2 = new Map();
  const filters2 = makeDefaultFilters();
  loadFilters(storage, filters2, collapsed2, hierarchy2);
  assert.strictEqual(hierarchy2.get('sy-2024_2025'), true);
  assert.strictEqual(hierarchy2.get('sy-2024_2025-m-January_2025'), false);
  assert.strictEqual(hierarchy2.get('sy-2024_2025-m-January_2025-w-Week_of_Jan_6'), true);
  assert.strictEqual(hierarchy2.size, 3);
});

test('hierarchy entries with non-string key are ignored', () => {
  const storage = makeStorage();
  storage.setItem(FILTERS_KEY, JSON.stringify({
    hierarchyExpandState: [
      ['valid-key', true],
      [42, false],       // numeric key — ignored
      ['another', false]
    ]
  }));
  const filters = makeDefaultFilters();
  const collapsed = new Set();
  const hierarchy = new Map();
  loadFilters(storage, filters, collapsed, hierarchy);
  assert.ok(hierarchy.has('valid-key'));
  assert.ok(hierarchy.has('another'));
  assert.strictEqual(hierarchy.size, 2);
});

test('hierarchy entries with non-boolean value are ignored', () => {
  const storage = makeStorage();
  storage.setItem(FILTERS_KEY, JSON.stringify({
    hierarchyExpandState: [
      ['key-a', true],
      ['key-b', 'yes'],    // string value — ignored
      ['key-c', false]
    ]
  }));
  const filters = makeDefaultFilters();
  const collapsed = new Set();
  const hierarchy = new Map();
  loadFilters(storage, filters, collapsed, hierarchy);
  assert.ok(hierarchy.has('key-a'));
  assert.ok(hierarchy.has('key-c'));
  assert.strictEqual(hierarchy.size, 2); // 'key-b' ignored
});

// ── createIcon helper (mock validation) ───────────────────────────────────────

console.log('\n--- createIcon mock validation ---');

test('createIcon returns object with svg tagName', () => {
  const icon = createIconMock('clipboard', 18);
  assert.strictEqual(icon.tagName, 'svg');
});

test('createIcon sets width and height from size param', () => {
  const icon = createIconMock('pencil', 16);
  assert.strictEqual(icon.width, '16');
  assert.strictEqual(icon.height, '16');
});

test('createIcon defaults to size 16 when no size given', () => {
  const icon = createIconMock('book');
  assert.strictEqual(icon.width, '16');
  assert.strictEqual(icon.height, '16');
});

test('createIcon sets viewBox 0 0 24 24', () => {
  const icon = createIconMock('refresh', 24);
  assert.strictEqual(icon.viewBox, '0 0 24 24');
});

test('createIcon sets aria-hidden true', () => {
  const icon = createIconMock('checkCircle', 20);
  assert.strictEqual(icon.ariaHidden, 'true');
});

test('createIcon for unknown name returns 0 paths', () => {
  const icon = createIconMock('nonexistent', 16);
  assert.strictEqual(icon.pathCount, 0);
});

test('createIcon for clipboard has correct path count', () => {
  const icon = createIconMock('clipboard', 16);
  assert.strictEqual(icon.pathCount, ICON_PATHS.clipboard.length);
});

test('createIcon for barChart has correct path count', () => {
  const icon = createIconMock('barChart', 16);
  assert.strictEqual(icon.pathCount, 3);
});

// ── ICON_PATHS coverage check ─────────────────────────────────────────────────

console.log('\n--- ICON_PATHS coverage ---');

const REQUIRED_ICONS = [
  'pencil', 'book', 'clipboard', 'refresh', 'checkCircle',
  'barChart', 'inbox', 'upload'
];

REQUIRED_ICONS.forEach(name => {
  test(`ICON_PATHS has entry for '${name}'`, () => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ICON_PATHS, name),
      `ICON_PATHS missing: ${name}`
    );
    assert.ok(ICON_PATHS[name].length > 0, `ICON_PATHS['${name}'] is empty`);
  });
});

// ── Storage serialization edge cases ──────────────────────────────────────────

console.log('\n--- Storage serialization edge cases ---');

test('saveFilters handles storage full error gracefully', () => {
  // Simulate a storage that always throws on setItem
  const brokenStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); }
  };
  const filters = makeDefaultFilters();
  const collapsedLanes = new Set();
  const hierarchyExpandState = new Map();
  assert.doesNotThrow(() => saveFilters(brokenStorage, filters, collapsedLanes, hierarchyExpandState));
});

test('loadFilters handles storage read error gracefully', () => {
  const brokenStorage = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { /* noop */ }
  };
  const filters = makeDefaultFilters();
  const collapsed = new Set();
  const hierarchy = new Map();
  assert.doesNotThrow(() => loadFilters(brokenStorage, filters, collapsed, hierarchy));
  assert.strictEqual(filters.assignments.classFilter, 'All Classes'); // defaults intact
});

test('saves and reloads correctly when collapsedLanes is empty Set', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  filters.assignments.searchQuery = 'test';
  const collapsedLanes = new Set();
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const raw = storage.getItem(FILTERS_KEY);
  const parsed = JSON.parse(raw);
  assert.ok(Array.isArray(parsed.collapsedLanes), 'collapsedLanes should be array');
  assert.strictEqual(parsed.collapsedLanes.length, 0);
});

test('saves and reloads correctly when hierarchyExpandState is empty Map', () => {
  const storage = makeStorage();
  const filters = makeDefaultFilters();
  const collapsedLanes = new Set(['analytics']);
  const hierarchyExpandState = new Map();
  saveFilters(storage, filters, collapsedLanes, hierarchyExpandState);

  const raw = storage.getItem(FILTERS_KEY);
  const parsed = JSON.parse(raw);
  assert.ok(Array.isArray(parsed.hierarchyExpandState), 'hierarchyExpandState should be array');
  assert.strictEqual(parsed.hierarchyExpandState.length, 0);
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('✗ Some tc-library-filters tests FAILED');
  process.exit(1);
} else {
  console.log('✓ All tc-library-filters tests passed!');
}
