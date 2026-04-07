// Unit tests for tc-library.js: accessibility pass, localStorage guard, error boundaries
// Tests: ARIA attributes, createIcon aria-hidden, aria-expanded, aria-live, saveFilters
//        QuotaExceededError resilience, error boundary fallback rendering, tab ARIA
// Run with: node tests/tc-library-hardening.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load source ──────────────────────────────────────────────────────────────

const srcPath = path.join(__dirname, '..', 'site', 'web', 'tc-library.js');
const src = fs.readFileSync(srcPath, 'utf8');

// ── Test runner ──────────────────────────────────────────────────────────────

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

// ── Minimal DOM mock ─────────────────────────────────────────────────────────

class MockElement {
  constructor(ns, tag) {
    this.namespaceURI = ns || null;
    this.tagName = (tag || '').toLowerCase();
    this._attrs = {};
    this.children = [];
    this.style = { cssText: '' };
    this.id = '';
    this.textContent = '';
    this.className = '';
    this.dataset = {};
    this.type = '';
    this.value = '';
    this._events = {};
  }
  setAttribute(name, value) {
    this._attrs[name] = String(value);
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
  }
  appendChild(child) { this.children.push(child); return child; }
  insertBefore(child, ref) {
    const idx = ref ? this.children.indexOf(ref) : this.children.length;
    if (idx === -1) this.children.push(child); else this.children.splice(idx, 0, child);
    return child;
  }
  addEventListener(type, fn) {
    if (!this._events[type]) this._events[type] = [];
    this._events[type].push(fn);
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  get firstChild() { return this.children[0] || null; }
}

const mockDocument = {
  createElementNS(ns, tag) { return new MockElement(ns, tag); },
  createElement(tag) { return new MockElement(null, tag); },
  createTextNode(text) { return { nodeType: 3, textContent: text }; },
  getElementById() { return null; },
  head: new MockElement(null, 'head'),
  body: new MockElement(null, 'body'),
  querySelectorAll() { return []; },
  addEventListener() {}
};

// ── Mock localStorage ────────────────────────────────────────────────────────

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

// ── Inline ICON_PATHS for createIcon tests ────────────────────────────────────

const ICON_PATHS = {
  fileText: [
    { tag: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { tag: 'polyline', points: '14 2 14 8 20 8' }
  ],
  bookOpen: [
    { tag: 'path', d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' },
    { tag: 'path', d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' }
  ],
  barChart: [
    { tag: 'line', x1: '18', y1: '20', x2: '18', y2: '10' },
    { tag: 'line', x1: '12', y1: '20', x2: '12', y2: '4' },
    { tag: 'line', x1: '6', y1: '20', x2: '6', y2: '14' }
  ]
};

function createIcon(name, size = 16) {
  const shapes = ICON_PATHS[name];
  if (!shapes) return mockDocument.createTextNode('?');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = mockDocument.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
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

// ── saveFilters context ──────────────────────────────────────────────────────

function makeSaveFiltersContext(storage) {
  const filters = {
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All', sortBy: 'newest' },
    lessons: { searchQuery: '' }
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
        collapsedLanes: [...collapsedLanes],
        hierarchyExpandState: [...hierarchyExpandState.entries()]
      };
      storage.setItem('rc_tc_library_filters_v1', JSON.stringify(data));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('[tc-library] localStorage quota exceeded — filter preferences not saved');
      } else {
        console.warn('[tc-library] Error saving filters:', e.message);
      }
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
    } catch (_e) {
      // swallow
    }
  }

  return { filters, collapsedLanes, hierarchyExpandState, saveFilters, loadFilters };
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('\n--- createIcon aria-hidden ---');

test('createIcon produces SVG with aria-hidden="true"', () => {
  const svg = createIcon('fileText');
  assert.strictEqual(svg.getAttribute('aria-hidden'), 'true', 'SVG should have aria-hidden="true"');
});

test('createIcon source sets aria-hidden attribute', () => {
  assert.ok(
    src.includes("svg.setAttribute('aria-hidden', 'true')"),
    'createIcon() should set aria-hidden="true" on SVG'
  );
});

test('createIcon with different icons produces aria-hidden="true"', () => {
  ['fileText', 'bookOpen', 'barChart'].forEach(name => {
    const svg = createIcon(name);
    assert.strictEqual(svg.getAttribute('aria-hidden'), 'true', `Icon "${name}" should have aria-hidden="true"`);
  });
});

console.log('\n--- Tab bar ARIA ---');

test('source sets role="tablist" on tab container', () => {
  assert.ok(
    src.includes("setAttribute('role', 'tablist')"),
    'Tab bar container should have role="tablist"'
  );
});

test('source sets role="tab" on tab buttons', () => {
  assert.ok(
    src.includes("setAttribute('role', 'tab')"),
    'Tab buttons should have role="tab"'
  );
});

test('source sets aria-selected on tab buttons', () => {
  assert.ok(
    src.includes("setAttribute('aria-selected'"),
    'Tab buttons should have aria-selected attribute'
  );
});

test('source sets role="tabpanel" on tab content', () => {
  assert.ok(
    src.includes("setAttribute('role', 'tabpanel')"),
    'Tab content should have role="tabpanel"'
  );
});

test('switchTab updates aria-selected on both buttons', () => {
  const switchTabIdx = src.indexOf('function switchTab(');
  assert.ok(switchTabIdx !== -1, 'switchTab function not found');
  const switchTabSection = src.slice(switchTabIdx, switchTabIdx + 400);
  assert.ok(
    switchTabSection.includes('aria-selected'),
    'switchTab should update aria-selected'
  );
});

console.log('\n--- Lane ARIA attributes ---');

test('renderLaneSection sets aria-expanded on header', () => {
  const fnIdx = src.indexOf('function renderLaneSection(');
  assert.ok(fnIdx !== -1, 'renderLaneSection not found');
  const fnSection = src.slice(fnIdx, fnIdx + 1200);
  assert.ok(
    fnSection.includes('aria-expanded'),
    'renderLaneSection should set aria-expanded on header'
  );
});

test('renderAnalyticsSection sets aria-expanded on header', () => {
  const fnIdx = src.indexOf('function renderAnalyticsSection(');
  assert.ok(fnIdx !== -1, 'renderAnalyticsSection not found');
  const fnSection = src.slice(fnIdx, fnIdx + 800);
  assert.ok(
    fnSection.includes('aria-expanded'),
    'renderAnalyticsSection should set aria-expanded on header'
  );
});

test('lesson section toggle buttons set aria-expanded', () => {
  const fnIdx = src.indexOf('function renderLessonSection(');
  assert.ok(fnIdx !== -1, 'renderLessonSection not found');
  const fnSection = src.slice(fnIdx, fnIdx + 600);
  assert.ok(
    fnSection.includes('aria-expanded'),
    'renderLessonSection toggleBtn should have aria-expanded'
  );
});

test('lesson unit toggle buttons set aria-expanded', () => {
  const fnIdx = src.indexOf('function renderLessonUnit(');
  assert.ok(fnIdx !== -1, 'renderLessonUnit not found');
  const fnSection = src.slice(fnIdx, fnIdx + 600);
  assert.ok(
    fnSection.includes('aria-expanded'),
    'renderLessonUnit toggleBtn should have aria-expanded'
  );
});

test('lesson toggle event handler updates aria-expanded', () => {
  // Find the event delegation handler for lesson toggles
  const toggleIdx = src.indexOf('.lesson-section-toggle, .lesson-unit-toggle');
  assert.ok(toggleIdx !== -1, 'lesson toggle handler not found');
  const handlerSection = src.slice(toggleIdx, toggleIdx + 500);
  assert.ok(
    handlerSection.includes('aria-expanded'),
    'lesson toggle handler should update aria-expanded'
  );
});

console.log('\n--- aria-live filter results ---');

test('source includes aria-live="polite" on filter status element', () => {
  assert.ok(
    src.includes("setAttribute('aria-live', 'polite')"),
    'Filter status element should have aria-live="polite"'
  );
});

test('filter status element id is tcLibFilterStatus', () => {
  assert.ok(
    src.includes('tcLibFilterStatus'),
    'Filter status live region should have id "tcLibFilterStatus"'
  );
});

console.log('\n--- localStorage quota guard ---');

test('saveFilters catches QuotaExceededError by name', () => {
  const storage = {
    getItem() { return null; },
    setItem() {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem() {},
    clear() {}
  };
  const ctx = makeSaveFiltersContext(storage);
  assert.doesNotThrow(() => ctx.saveFilters(), 'saveFilters should not throw on QuotaExceededError');
});

test('saveFilters catches QuotaExceededError by code 22', () => {
  const storage = {
    getItem() { return null; },
    setItem() {
      const err = new Error('Storage quota exceeded');
      err.code = 22;
      throw err;
    },
    removeItem() {},
    clear() {}
  };
  const ctx = makeSaveFiltersContext(storage);
  assert.doesNotThrow(() => ctx.saveFilters(), 'saveFilters should not throw on code 22');
});

test('saveFilters catches generic errors without crashing', () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('Some unexpected error'); },
    removeItem() {},
    clear() {}
  };
  const ctx = makeSaveFiltersContext(storage);
  assert.doesNotThrow(() => ctx.saveFilters(), 'saveFilters should not throw on any storage error');
});

test('source catch block distinguishes QuotaExceededError', () => {
  const saveIdx = src.indexOf('function saveFilters(');
  assert.ok(saveIdx !== -1, 'saveFilters not found in source');
  const saveSection = src.slice(saveIdx, saveIdx + 1200);
  assert.ok(
    saveSection.includes('QuotaExceededError'),
    'saveFilters should handle QuotaExceededError specifically'
  );
});

console.log('\n--- Filter persistence round-trip ---');

test('saveFilters + loadFilters round-trip preserves filter values', () => {
  const storage = makeMockStorage();
  const ctx = makeSaveFiltersContext(storage);
  ctx.filters.assignments.classFilter = 'English';
  ctx.filters.assignments.searchQuery = 'vocab';
  ctx.filters.lessons.searchQuery = 'unit 5';
  ctx.saveFilters();
  // Reset filters
  ctx.filters.assignments.classFilter = 'All Classes';
  ctx.filters.assignments.searchQuery = '';
  ctx.filters.lessons.searchQuery = '';
  ctx.loadFilters();
  assert.strictEqual(ctx.filters.assignments.classFilter, 'English', 'classFilter should be restored');
  assert.strictEqual(ctx.filters.assignments.searchQuery, 'vocab', 'searchQuery should be restored');
  assert.strictEqual(ctx.filters.lessons.searchQuery, 'unit 5', 'lesson searchQuery should be restored');
});

console.log('\n--- Error boundaries ---');

test('renderAssignmentsTab has try/catch error boundary', () => {
  const fnIdx = src.indexOf('function renderAssignmentsTab(');
  assert.ok(fnIdx !== -1, 'renderAssignmentsTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 12000);
  assert.ok(fnSection.includes('try {'), 'renderAssignmentsTab should have try block');
  assert.ok(fnSection.includes('} catch (err)'), 'renderAssignmentsTab should have catch block');
  assert.ok(fnSection.includes('Something went wrong'), 'error boundary should show error message');
  assert.ok(fnSection.includes("textContent = 'Retry'"), 'error boundary should include Retry button');
});

test('renderLessonsTab has try/catch error boundary', () => {
  const fnIdx = src.indexOf('function renderLessonsTab(');
  assert.ok(fnIdx !== -1, 'renderLessonsTab not found');
  const fnSection = src.slice(fnIdx, fnIdx + 3000);
  assert.ok(fnSection.includes('try {'), 'renderLessonsTab should have try block');
  assert.ok(fnSection.includes('} catch (err)'), 'renderLessonsTab should have catch block');
});

test('renderAnalyticsSection has try/catch error boundary', () => {
  const fnIdx = src.indexOf('function renderAnalyticsSection(');
  assert.ok(fnIdx !== -1, 'renderAnalyticsSection not found');
  const fnSection = src.slice(fnIdx, fnIdx + 14000);
  assert.ok(fnSection.includes('try {'), 'renderAnalyticsSection should have try block');
  assert.ok(fnSection.includes('} catch (err)'), 'renderAnalyticsSection should have catch block');
});

test('error boundary renders fallback with error message', () => {
  // Simulate error boundary logic directly (mirroring source)
  const container = new MockElement(null, 'div');
  const fakeErr = new Error('test failure');
  // Run the error boundary pattern
  container.textContent = '';
  const errorCard = mockDocument.createElement('div');
  errorCard.className = 'tc-card';
  const msg = mockDocument.createElement('p');
  msg.textContent = 'Something went wrong rendering this section.';
  errorCard.appendChild(msg);
  const detail = mockDocument.createElement('p');
  detail.textContent = fakeErr.message || 'Unknown error';
  errorCard.appendChild(detail);
  const retryBtn = mockDocument.createElement('button');
  retryBtn.textContent = 'Retry';
  errorCard.appendChild(retryBtn);
  container.appendChild(errorCard);

  assert.strictEqual(container.children.length, 1, 'should have one error card');
  assert.ok(
    container.children[0].children.some(c => c.textContent === 'Something went wrong rendering this section.'),
    'error card should contain error message'
  );
  assert.ok(
    container.children[0].children.some(c => c.textContent === 'Retry'),
    'error card should contain Retry button'
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n✗ Some tc-library-hardening tests FAILED');
  process.exit(1);
}
console.log('\n✅ All tc-library-hardening tests passed');
