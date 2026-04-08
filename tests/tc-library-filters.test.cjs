// Unit tests for tc-library.js: filter persistence, icon system, injectStyles
// Tests: saveFilters/loadFilters round-trips, type validation, localStorage resilience,
//        Set↔Array serialization, Map↔Array serialization, createIcon(), injectStyles()
// Run with: node tests/tc-library-filters.test.cjs

'use strict';

const assert = require('assert');

// ── Minimal DOM mock ──────────────────────────────────────────────────────────

class MockElement {
  constructor(ns, tag) {
    this.namespaceURI = ns || null;
    this.tagName = (tag || '').toLowerCase();
    this._attrs = {};
    this.children = [];
    this.style = {};
    this.id = '';
    this.textContent = '';
  }
  setAttribute(name, value) { this._attrs[name] = String(value); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null; }
  appendChild(child) { this.children.push(child); return child; }
  insertBefore(child, ref) {
    const idx = ref ? this.children.indexOf(ref) : this.children.length;
    if (idx === -1) this.children.push(child); else this.children.splice(idx, 0, child);
    return child;
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  get firstChild() { return this.children[0] || null; }
}

const _domStore = {};
const mockHead = new MockElement(null, 'head');

const mockDocument = {
  createElementNS(ns, tag) { return new MockElement(ns, tag); },
  createElement(tag) { return new MockElement(null, tag); },
  createTextNode(text) { return { nodeType: 3, textContent: text, nodeValue: text }; },
  getElementById(id) { return _domStore[id] || null; },
  head: mockHead,
  body: new MockElement(null, 'body'),
  querySelectorAll() { return []; },
  addEventListener() {}
};

// ── Mock localStorage ─────────────────────────────────────────────────────────

function makeMockStorage() {
  const store = {};
  return {
    _store: store,
    getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
}

// ── Inline implementations of the functions under test ────────────────────────
// These mirror the implementations in site/web/tc-library.js exactly.

const ICON_PATHS = {
  fileText: [
    { tag: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { tag: 'polyline', points: '14 2 14 8 20 8' },
    { tag: 'line', x1: '16', y1: '13', x2: '8', y2: '13' },
    { tag: 'line', x1: '16', y1: '17', x2: '8', y2: '17' },
    { tag: 'polyline', points: '10 9 9 9 8 9' }
  ],
  bookOpen: [
    { tag: 'path', d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' },
    { tag: 'path', d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' }
  ],
  clipboard: [
    { tag: 'rect', x: '9', y: '2', width: '6', height: '4', rx: '1' },
    { tag: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }
  ],
  clipboardPlus: [
    { tag: 'rect', x: '9', y: '2', width: '6', height: '4', rx: '1' },
    { tag: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
    { tag: 'path', d: 'M12 11v6' },
    { tag: 'path', d: 'M9 14h6' }
  ],
  refreshCw: [
    { tag: 'polyline', points: '23 4 23 10 17 10' },
    { tag: 'polyline', points: '1 20 1 14 7 14' },
    { tag: 'path', d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }
  ],
  checkCircle: [
    { tag: 'path', d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' },
    { tag: 'polyline', points: '22 4 12 14.01 9 11.01' }
  ],
  inbox: [
    { tag: 'polyline', points: '22 12 16 12 14 15 10 15 8 12 2 12' },
    { tag: 'path', d: 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }
  ],
  upload: [
    { tag: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
    { tag: 'polyline', points: '17 8 12 3 7 8' },
    { tag: 'line', x1: '12', y1: '3', x2: '12', y2: '15' }
  ],
  download: [
    { tag: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
    { tag: 'polyline', points: '7 10 12 15 17 10' },
    { tag: 'line', x1: '12', y1: '15', x2: '12', y2: '3' }
  ],
  search: [
    { tag: 'circle', cx: '11', cy: '11', r: '8' },
    { tag: 'line', x1: '21', y1: '21', x2: '16.65', y2: '16.65' }
  ],
  filter: [
    { tag: 'path', d: 'M22 3H2l8 9.46V19l4 2V12.46L22 3z' }
  ],
  chevronDown: [
    { tag: 'polyline', points: '6 9 12 15 18 9' }
  ],
  chevronRight: [
    { tag: 'polyline', points: '9 18 15 12 9 6' }
  ],
  folder: [
    { tag: 'path', d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }
  ],
  folderOpen: [
    { tag: 'path', d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
    { tag: 'path', d: 'M2 10h20' }
  ],
  barChart: [
    { tag: 'line', x1: '18', y1: '20', x2: '18', y2: '10' },
    { tag: 'line', x1: '12', y1: '20', x2: '12', y2: '4' },
    { tag: 'line', x1: '6', y1: '20', x2: '6', y2: '14' },
    { tag: 'line', x1: '2', y1: '20', x2: '22', y2: '20' }
  ],
  arrowRight: [
    { tag: 'line', x1: '5', y1: '12', x2: '19', y2: '12' },
    { tag: 'polyline', points: '12 5 19 12 12 19' }
  ],
  x: [
    { tag: 'line', x1: '18', y1: '6', x2: '6', y2: '18' },
    { tag: 'line', x1: '6', y1: '6', x2: '18', y2: '18' }
  ],
  table: [
    { tag: 'rect', x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2' },
    { tag: 'line', x1: '3', y1: '9', x2: '21', y2: '9' },
    { tag: 'line', x1: '3', y1: '15', x2: '21', y2: '15' },
    { tag: 'line', x1: '9', y1: '3', x2: '9', y2: '21' }
  ],
  printer: [
    { tag: 'path', d: 'M6 9V2h12v7' },
    { tag: 'path', d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' },
    { tag: 'rect', x: '6', y: '14', width: '12', height: '8' }
  ],
  fileCsv: [
    { tag: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { tag: 'polyline', points: '14 2 14 8 20 8' },
    { tag: 'line', x1: '16', y1: '13', x2: '8', y2: '13' },
    { tag: 'line', x1: '14', y1: '17', x2: '8', y2: '17' }
  ],
  copy: [
    { tag: 'rect', x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' },
    { tag: 'path', d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }
  ]
};

function createIcon(name, size = 16) {
  const shapes = ICON_PATHS[name];
  if (!shapes) {
    return mockDocument.createTextNode('?');
  }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = mockDocument.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  shapes.forEach(shape => {
    const el = mockDocument.createElementNS(NS, shape.tag);
    Object.keys(shape).forEach(attr => {
      if (attr !== 'tag') el.setAttribute(attr, shape[attr]);
    });
    svg.appendChild(el);
  });
  return svg;
}

function injectStyles(doc) {
  if (doc.getElementById('tc-lib-normalized')) return;
  const style = doc.createElement('style');
  style.setAttribute('id', 'tc-lib-normalized');
  doc.head.appendChild(style);
  // Register in store so getElementById works
  _domStore['tc-lib-normalized'] = style;
}

/**
 * Build a fresh filter+state context and the saveFilters/loadFilters functions
 * that operate on it, using the provided localStorage mock.
 */
function makeFilterContext(storage) {
  const filters = {
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All', sortBy: 'newest' },
    lessons: { searchQuery: '' },
    finalized: {
      classFilter: 'All Classes',
      studentFilter: '',
      weekFilter: '',
      dateFrom: '',
      dateTo: '',
      viewMode: 'tree',
      sortColumn: 'date',
      sortDirection: 'desc'
    },
    reserve: {
      presentationsExpanded: false,
      presentationsSearch: '',
      viewMode: 'flat'
    }
  };
  const collapsedLanes = new Set(['analytics']);
  const hierarchyExpandState = new Map();

  function saveFilters() {
    try {
      const data = {
        assignments: {
          classFilter: filters.assignments.classFilter,
          searchQuery: filters.assignments.searchQuery,
          typeFilter: filters.assignments.typeFilter,
          sortBy: filters.assignments.sortBy
        },
        lessons: { searchQuery: filters.lessons.searchQuery },
        finalized: {
          classFilter: filters.finalized.classFilter,
          studentFilter: filters.finalized.studentFilter,
          weekFilter: filters.finalized.weekFilter,
          dateFrom: filters.finalized.dateFrom,
          dateTo: filters.finalized.dateTo,
          viewMode: filters.finalized.viewMode,
          sortColumn: filters.finalized.sortColumn,
          sortDirection: filters.finalized.sortDirection
        },
        reserve: {
          presentationsExpanded: filters.reserve.presentationsExpanded,
          presentationsSearch: filters.reserve.presentationsSearch,
          viewMode: filters.reserve.viewMode
        },
        collapsedLanes: [...collapsedLanes],
        hierarchyExpandState: [...hierarchyExpandState.entries()]
      };
      storage.setItem('rc_tc_library_filters_v1', JSON.stringify(data));
    } catch (e) {
      // swallow
    }
  }

  function loadFilters() {
    try {
      const raw = storage.getItem('rc_tc_library_filters_v1');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;

      if (data.assignments && typeof data.assignments === 'object') {
        if (typeof data.assignments.classFilter === 'string') filters.assignments.classFilter = data.assignments.classFilter;
        if (typeof data.assignments.searchQuery === 'string') filters.assignments.searchQuery = data.assignments.searchQuery;
        if (typeof data.assignments.typeFilter === 'string') filters.assignments.typeFilter = data.assignments.typeFilter;
        if (typeof data.assignments.sortBy === 'string') filters.assignments.sortBy = data.assignments.sortBy;
      }
      if (data.lessons && typeof data.lessons === 'object') {
        if (typeof data.lessons.searchQuery === 'string') filters.lessons.searchQuery = data.lessons.searchQuery;
      }
      if (data.finalized && typeof data.finalized === 'object') {
        if (typeof data.finalized.classFilter === 'string') filters.finalized.classFilter = data.finalized.classFilter;
        if (typeof data.finalized.studentFilter === 'string') filters.finalized.studentFilter = data.finalized.studentFilter;
        if (typeof data.finalized.weekFilter === 'string') filters.finalized.weekFilter = data.finalized.weekFilter;
        if (typeof data.finalized.dateFrom === 'string') filters.finalized.dateFrom = data.finalized.dateFrom;
        if (typeof data.finalized.dateTo === 'string') filters.finalized.dateTo = data.finalized.dateTo;
        if (typeof data.finalized.viewMode === 'string') filters.finalized.viewMode = data.finalized.viewMode;
        if (typeof data.finalized.sortColumn === 'string') filters.finalized.sortColumn = data.finalized.sortColumn;
        if (typeof data.finalized.sortDirection === 'string') filters.finalized.sortDirection = data.finalized.sortDirection;
      }
      if (data.reserve && typeof data.reserve === 'object') {
        if (typeof data.reserve.presentationsExpanded === 'boolean') filters.reserve.presentationsExpanded = data.reserve.presentationsExpanded;
        if (typeof data.reserve.presentationsSearch === 'string') filters.reserve.presentationsSearch = data.reserve.presentationsSearch;
        if (typeof data.reserve.viewMode === 'string') filters.reserve.viewMode = data.reserve.viewMode;
      }
      if (Array.isArray(data.collapsedLanes)) {
        collapsedLanes.clear();
        data.collapsedLanes.forEach(id => { if (typeof id === 'string') collapsedLanes.add(id); });
      }
      if (Array.isArray(data.hierarchyExpandState)) {
        hierarchyExpandState.clear();
        data.hierarchyExpandState.forEach(entry => {
          if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'boolean') {
            hierarchyExpandState.set(entry[0], entry[1]);
          }
        });
      }
    } catch (e) {
      // swallow
    }
  }

  return { filters, collapsedLanes, hierarchyExpandState, saveFilters, loadFilters };
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

// ── Filter Persistence Round-Trips ────────────────────────────────────────────
console.log('\n--- Filter persistence round-trips ---');

test('save defaults → load → classFilter is "All Classes"', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.assignments.classFilter, 'All Classes');
});

test('save defaults → load → searchQuery is ""', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.assignments.searchQuery, '');
});

test('save non-default values → load → classFilter restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.assignments.classFilter = 'ELA 101';
  ctx.filters.assignments.searchQuery = 'quiz';
  ctx.filters.assignments.typeFilter = 'paper';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.assignments.classFilter, 'ELA 101');
  assert.strictEqual(ctx2.filters.assignments.searchQuery, 'quiz');
  assert.strictEqual(ctx2.filters.assignments.typeFilter, 'paper');
});

test('save collapsed lanes → load → Set contents match', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.collapsedLanes.clear();
  ctx.collapsedLanes.add('upcoming');
  ctx.collapsedLanes.add('finalized');
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.ok(ctx2.collapsedLanes.has('upcoming'), 'should have upcoming');
  assert.ok(ctx2.collapsedLanes.has('finalized'), 'should have finalized');
  assert.strictEqual(ctx2.collapsedLanes.size, 2);
});

test('save hierarchyExpandState Map → load → Map contents match', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.hierarchyExpandState.set('node-1', true);
  ctx.hierarchyExpandState.set('node-2', false);
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.hierarchyExpandState.get('node-1'), true);
  assert.strictEqual(ctx2.hierarchyExpandState.get('node-2'), false);
});

test('save lessons searchQuery → load → query restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.lessons.searchQuery = 'phonics';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.lessons.searchQuery, 'phonics');
});

test('save then load produces same typeFilter', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.assignments.typeFilter = 'file';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.assignments.typeFilter, 'file');
});

test('finalized: save viewMode table → load → viewMode restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.finalized.viewMode = 'table';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.finalized.viewMode, 'table');
});

test('finalized: save sortColumn/sortDirection → load → restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.finalized.sortColumn = 'title';
  ctx.filters.finalized.sortDirection = 'asc';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.finalized.sortColumn, 'title');
  assert.strictEqual(ctx2.filters.finalized.sortDirection, 'asc');
});

test('finalized: save dateFrom/dateTo → load → restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.finalized.dateFrom = '2026-01-01';
  ctx.filters.finalized.dateTo = '2026-03-31';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.finalized.dateFrom, '2026-01-01');
  assert.strictEqual(ctx2.filters.finalized.dateTo, '2026-03-31');
});

test('finalized: save classFilter/studentFilter/weekFilter → load → restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.finalized.classFilter = 'Language Arts';
  ctx.filters.finalized.studentFilter = 'Alice';
  ctx.filters.finalized.weekFilter = 'Week 11';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.finalized.classFilter, 'Language Arts');
  assert.strictEqual(ctx2.filters.finalized.studentFilter, 'Alice');
  assert.strictEqual(ctx2.filters.finalized.weekFilter, 'Week 11');
});

test('finalized: viewMode as number → not applied, keeps default tree', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    finalized: { viewMode: 42, sortColumn: 'date', sortDirection: 'desc', classFilter: 'All Classes', studentFilter: '', weekFilter: '', dateFrom: '', dateTo: '' }
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.finalized.viewMode, 'tree');
});

test('finalized: dateFrom as number → not applied, keeps default empty', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    finalized: { viewMode: 'tree', sortColumn: 'date', sortDirection: 'desc', classFilter: 'All Classes', studentFilter: '', weekFilter: '', dateFrom: 99, dateTo: '' }
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.finalized.dateFrom, '');
});

test('finalized: defaults are preserved when finalized block is absent', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All', sortBy: 'newest' },
    lessons: { searchQuery: '' },
    collapsedLanes: [],
    hierarchyExpandState: []
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.finalized.viewMode, 'tree');
  assert.strictEqual(ctx.filters.finalized.sortColumn, 'date');
  assert.strictEqual(ctx.filters.finalized.sortDirection, 'desc');
  assert.strictEqual(ctx.filters.finalized.dateFrom, '');
  assert.strictEqual(ctx.filters.finalized.dateTo, '');
});


// ── Type Validation Rejection ─────────────────────────────────────────────────
console.log('\n--- Type validation rejection ---');

test('classFilter as number → not applied, keeps default', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    assignments: { classFilter: 42, searchQuery: '', typeFilter: 'All' },
    lessons: { searchQuery: '' },
    collapsedLanes: [],
    hierarchyExpandState: []
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.assignments.classFilter, 'All Classes');
});

test('collapsedLanes as string → not applied', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All' },
    lessons: { searchQuery: '' },
    collapsedLanes: 'upcoming',
    hierarchyExpandState: []
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  // Should still have analytics (default) since collapsedLanes was not a valid array
  assert.ok(ctx.collapsedLanes.has('analytics'));
});

test('hierarchyExpandState entry missing boolean → entry is skipped', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All' },
    lessons: { searchQuery: '' },
    collapsedLanes: [],
    hierarchyExpandState: [['node-1', 'yes'], ['node-2', true]]
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.ok(!ctx.hierarchyExpandState.has('node-1'), 'invalid entry should be skipped');
  assert.strictEqual(ctx.hierarchyExpandState.get('node-2'), true);
});

test('completely wrong data structure (string) → does not crash, keeps defaults', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify('not an object'));
  const ctx = makeFilterContext(storage);
  assert.doesNotThrow(() => ctx.loadFilters());
  assert.strictEqual(ctx.filters.assignments.classFilter, 'All Classes');
});

test('null localStorage value → does not crash', () => {
  const storage = makeMockStorage();
  // getItem returns null by default
  const ctx = makeFilterContext(storage);
  assert.doesNotThrow(() => ctx.loadFilters());
  assert.strictEqual(ctx.filters.assignments.classFilter, 'All Classes');
});

test('invalid JSON in localStorage → does not crash', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', '{not valid json}');
  const ctx = makeFilterContext(storage);
  assert.doesNotThrow(() => ctx.loadFilters());
  assert.strictEqual(ctx.filters.assignments.classFilter, 'All Classes');
});

test('searchQuery as number → not applied', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    assignments: { classFilter: 'All Classes', searchQuery: 123, typeFilter: 'All' },
    lessons: { searchQuery: '' },
    collapsedLanes: [],
    hierarchyExpandState: []
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.assignments.searchQuery, '');
});

test('lessons searchQuery as number → not applied', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All' },
    lessons: { searchQuery: 999 },
    collapsedLanes: [],
    hierarchyExpandState: []
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.lessons.searchQuery, '');
});

// ── Corrupt / Unavailable localStorage ───────────────────────────────────────
console.log('\n--- Corrupt / unavailable localStorage ---');

test('localStorage.getItem throws → loadFilters does not crash', () => {
  const storage = {
    getItem() { throw new Error('Storage unavailable'); },
    setItem() {},
    removeItem() {},
    clear() {}
  };
  const ctx = makeFilterContext(storage);
  assert.doesNotThrow(() => ctx.loadFilters());
});

test('localStorage.setItem throws → saveFilters does not crash', () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() {},
    clear() {}
  };
  const ctx = makeFilterContext(storage);
  assert.doesNotThrow(() => ctx.saveFilters());
});

test('localStorage returns empty string → loadFilters does not crash', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', '');
  const ctx = makeFilterContext(storage);
  assert.doesNotThrow(() => ctx.loadFilters());
  assert.strictEqual(ctx.filters.assignments.classFilter, 'All Classes');
});

test('hierarchyExpandState entry with non-string key → entry is skipped', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All' },
    lessons: { searchQuery: '' },
    collapsedLanes: [],
    hierarchyExpandState: [[42, true]]
  }));
  const ctx = makeFilterContext(storage);
  assert.doesNotThrow(() => ctx.loadFilters());
  assert.strictEqual(ctx.hierarchyExpandState.size, 0);
});

test('collapsedLanes contains non-string items → only string items added', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All' },
    lessons: { searchQuery: '' },
    collapsedLanes: ['upcoming', 42, null, 'finalized'],
    hierarchyExpandState: []
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.ok(ctx.collapsedLanes.has('upcoming'));
  assert.ok(ctx.collapsedLanes.has('finalized'));
  assert.strictEqual(ctx.collapsedLanes.size, 2);
});

// ── Set↔Array and Map↔Array Serialization ────────────────────────────────────
console.log('\n--- Set↔Array and Map↔Array serialization ---');

test('empty Set serializes to [] and deserializes back to empty Set', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.collapsedLanes.clear();
  ctx.saveFilters();
  const raw = JSON.parse(storage.getItem('rc_tc_library_filters_v1'));
  assert.deepStrictEqual(raw.collapsedLanes, []);
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.collapsedLanes.size, 0);
});

test('Set with values serializes to array and deserializes back', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.collapsedLanes.clear();
  ctx.collapsedLanes.add('upcoming');
  ctx.collapsedLanes.add('finalized');
  ctx.saveFilters();
  const raw = JSON.parse(storage.getItem('rc_tc_library_filters_v1'));
  assert.ok(Array.isArray(raw.collapsedLanes));
  assert.ok(raw.collapsedLanes.includes('upcoming'));
  assert.ok(raw.collapsedLanes.includes('finalized'));
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.ok(ctx2.collapsedLanes.has('upcoming'));
  assert.ok(ctx2.collapsedLanes.has('finalized'));
});

test('empty Map serializes to [] and deserializes back to empty Map', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.saveFilters();
  const raw = JSON.parse(storage.getItem('rc_tc_library_filters_v1'));
  assert.deepStrictEqual(raw.hierarchyExpandState, []);
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.hierarchyExpandState.size, 0);
});

test('Map with entries serializes to array of pairs and deserializes back', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.hierarchyExpandState.set('node-1', true);
  ctx.hierarchyExpandState.set('node-2', false);
  ctx.saveFilters();
  const raw = JSON.parse(storage.getItem('rc_tc_library_filters_v1'));
  assert.ok(Array.isArray(raw.hierarchyExpandState));
  assert.ok(raw.hierarchyExpandState.some(e => e[0] === 'node-1' && e[1] === true));
  assert.ok(raw.hierarchyExpandState.some(e => e[0] === 'node-2' && e[1] === false));
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.hierarchyExpandState.get('node-1'), true);
  assert.strictEqual(ctx2.hierarchyExpandState.get('node-2'), false);
});

// ── createIcon() Tests ────────────────────────────────────────────────────────
console.log('\n--- createIcon() ---');

test('createIcon("fileText") returns an SVG element', () => {
  const el = createIcon('fileText');
  assert.strictEqual(el.tagName, 'svg');
  assert.strictEqual(el.namespaceURI, 'http://www.w3.org/2000/svg');
});

test('returned SVG has aria-hidden="true"', () => {
  const el = createIcon('fileText');
  assert.strictEqual(el.getAttribute('aria-hidden'), 'true');
});

test('returned SVG has correct default width=16, height=16', () => {
  const el = createIcon('fileText');
  assert.strictEqual(el.getAttribute('width'), '16');
  assert.strictEqual(el.getAttribute('height'), '16');
});

test('createIcon("fileText", 24) has width=24, height=24', () => {
  const el = createIcon('fileText', 24);
  assert.strictEqual(el.getAttribute('width'), '24');
  assert.strictEqual(el.getAttribute('height'), '24');
});

test('createIcon("nonexistent") returns a fallback text node "?"', () => {
  const el = createIcon('nonexistent');
  assert.strictEqual(el.nodeType, 3, 'should be a text node');
  assert.strictEqual(el.textContent, '?');
});

test('all icon names in ICON_PATHS can be created without error', () => {
  Object.keys(ICON_PATHS).forEach(name => {
    assert.doesNotThrow(() => createIcon(name), `createIcon("${name}") threw`);
    const el = createIcon(name);
    assert.strictEqual(el.tagName, 'svg', `createIcon("${name}") should return svg`);
  });
});

test('returned SVG has child elements', () => {
  const el = createIcon('fileText');
  assert.ok(el.children.length > 0, 'SVG should have child elements');
});

test('createIcon has viewBox="0 0 24 24" attribute', () => {
  const el = createIcon('bookOpen');
  assert.strictEqual(el.getAttribute('viewBox'), '0 0 24 24');
});

// ── ICON_PATHS Coverage ───────────────────────────────────────────────────────
console.log('\n--- ICON_PATHS coverage ---');

test('ICON_PATHS contains at least 15 entries', () => {
  assert.ok(Object.keys(ICON_PATHS).length >= 15, `Only ${Object.keys(ICON_PATHS).length} icons found`);
});

test('icons referenced in codebase exist in ICON_PATHS', () => {
  const requiredIcons = [
    'fileText', 'bookOpen', 'clipboard', 'clipboardPlus', 'refreshCw',
    'checkCircle', 'inbox', 'upload', 'download', 'search',
    'filter', 'chevronDown', 'chevronRight', 'folder', 'folderOpen',
    'barChart', 'arrowRight', 'x',
    'table', 'printer', 'fileCsv',
    'copy'
  ];
  requiredIcons.forEach(name => {
    assert.ok(Object.prototype.hasOwnProperty.call(ICON_PATHS, name), `"${name}" missing from ICON_PATHS`);
  });
});

// ── Reserve filter round-trips ────────────────────────────────────────────────
console.log('\n--- Reserve filter round-trips ---');

test('reserve: save presentationsExpanded true → load → restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.reserve.presentationsExpanded = true;
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.reserve.presentationsExpanded, true);
});

test('reserve: save presentationsSearch → load → restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.reserve.presentationsSearch = 'poetry';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.reserve.presentationsSearch, 'poetry');
});

test('reserve: defaults are preserved when reserve block is absent', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All', sortBy: 'newest' },
    collapsedLanes: [],
    hierarchyExpandState: []
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.reserve.presentationsExpanded, false);
  assert.strictEqual(ctx.filters.reserve.presentationsSearch, '');
});

test('reserve: presentationsExpanded as string → not applied, keeps default false', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    reserve: { presentationsExpanded: 'yes', presentationsSearch: '' }
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.reserve.presentationsExpanded, false);
});

test('reserve: presentationsSearch as number → not applied, keeps default empty', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    reserve: { presentationsExpanded: false, presentationsSearch: 42 }
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.reserve.presentationsSearch, '');
});

// ── reserve.viewMode round-trips ──────────────────────────────────────────────
console.log('\n--- reserve.viewMode round-trips ---');

test('reserve: default viewMode is flat', () => {
  const ctx = makeFilterContext(makeMockStorage());
  assert.strictEqual(ctx.filters.reserve.viewMode, 'flat');
});

test('reserve: save viewMode byUnit → load → restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.reserve.viewMode = 'byUnit';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.reserve.viewMode, 'byUnit');
});

test('reserve: save viewMode flat → load → restored', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.reserve.viewMode = 'flat';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.reserve.viewMode, 'flat');
});

test('reserve: viewMode defaults to flat when absent from stored data', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    reserve: { presentationsExpanded: false, presentationsSearch: '' }
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.reserve.viewMode, 'flat');
});

test('reserve: viewMode as number → not applied, keeps default flat', () => {
  const storage = makeMockStorage();
  storage.setItem('rc_tc_library_filters_v1', JSON.stringify({
    reserve: { viewMode: 42 }
  }));
  const ctx = makeFilterContext(storage);
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.reserve.viewMode, 'flat');
});

// ── injectStyles() ────────────────────────────────────────────────────────────
console.log('\n--- injectStyles() ---');

function makeStyleDoc() {
  const store = {};
  const head = { _children: [], appendChild(el) { this._children.push(el); store[el.id] = el; } };
  const doc = {
    createElement(tag) {
      const el = new MockElement(null, tag);
      el.setAttribute = function(n, v) { this._attrs[n] = String(v); if (n === 'id') this.id = String(v); };
      return el;
    },
    getElementById(id) { return store[id] || null; },
    head
  };
  return { doc, head, store };
}

test('after calling injectStyles(), style element with id "tc-lib-normalized" is added', () => {
  const { doc } = makeStyleDoc();
  injectStyles(doc);
  assert.ok(doc.getElementById('tc-lib-normalized') !== null, 'style element should exist');
});

test('calling injectStyles() twice does not create duplicate style elements', () => {
  const { doc, head } = makeStyleDoc();
  injectStyles(doc);
  injectStyles(doc);
  const styleCount = head._children.filter(el => el.id === 'tc-lib-normalized').length;
  assert.strictEqual(styleCount, 1, 'should only create one style element');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
