// Unit tests for tc-library.js: lessons tab, modal accessibility, innerHTML safety
// Tests: empty state DOM, search persistence, detail modal a11y, focus trap,
//        innerHTML sweep, createIcon integration (calendar, folderOpen)
// Run with: node tests/tc-library-lessons.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Source for scanning ───────────────────────────────────────────────────────

const libSrc = fs.readFileSync(
  path.join(__dirname, '..', 'site', 'web', 'tc-library.js'),
  'utf8'
);

// ── Minimal DOM mock ──────────────────────────────────────────────────────────

class MockElement {
  constructor(ns, tag) {
    this.namespaceURI = ns || null;
    this.tagName = (tag || '').toLowerCase();
    this._attrs = {};
    this.children = [];
    this.style = { cssText: '' };
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.value = '';
    this.dataset = {};
    this._focusCalled = false;
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
  querySelector(sel) {
    // Simple selector: matches tagName or .className or #id or [attr=val]
    const attrMatch = sel.match(/^\[([^\]=]+)=["']?([^"'\]]+)["']?\]$/);
    const idMatch = sel.match(/^#(.+)$/);
    const clsMatch = sel.match(/^\.(.+)$/);
    const tagMatch = /^[a-z]+$/i.test(sel) ? sel.toLowerCase() : null;
    return this._findFirst(child => {
      if (attrMatch) return child.getAttribute && child.getAttribute(attrMatch[1]) === attrMatch[2];
      if (idMatch) return child.id === idMatch[1];
      if (clsMatch) return (child.className || '').split(' ').includes(clsMatch[1]);
      if (tagMatch) return child.tagName === tagMatch;
      return false;
    });
  }
  _findFirst(pred) {
    for (const child of this.children) {
      if (pred(child)) return child;
      if (child._findFirst) {
        const found = child._findFirst(pred);
        if (found) return found;
      }
    }
    return null;
  }
  querySelectorAll(sel) {
    const results = [];
    const attrMatch = sel.match(/^\[([^\]=]+)=["']?([^"'\]]+)["']?\]$/);
    const tagParts = sel.split(',').map(s => s.trim().toLowerCase());
    this._findAll(child => {
      if (attrMatch) return child.getAttribute && child.getAttribute(attrMatch[1]) === attrMatch[2];
      return tagParts.includes(child.tagName || '');
    }, results);
    return results;
  }
  _findAll(pred, acc) {
    for (const child of this.children) {
      if (pred(child)) acc.push(child);
      if (child._findAll) child._findAll(pred, acc);
    }
  }
  closest() { return null; }
  get firstChild() { return this.children[0] || null; }
  remove() { this._removed = true; }
  contains(el) {
    if (el === this) return true;
    for (const child of this.children) {
      if (child === el) return true;
      if (child.contains && child.contains(el)) return true;
    }
    return false;
  }
  focus() { this._focusCalled = true; }
}

// ── Mock DOM globals ──────────────────────────────────────────────────────────

const _domStore = {};

const mockBody = new MockElement(null, 'body');

const mockDocument = {
  createElementNS(ns, tag) { return new MockElement(ns, tag); },
  createElement(tag) { return new MockElement(null, tag); },
  createTextNode(text) { return { nodeType: 3, textContent: text, nodeValue: text }; },
  getElementById(id) { return _domStore[id] || null; },
  head: new MockElement(null, 'head'),
  body: mockBody,
  querySelectorAll() { return []; },
  _keydownListeners: [],
  addEventListener(type, fn) {
    if (type === 'keydown') this._keydownListeners.push(fn);
  },
  removeEventListener(type, fn) {
    if (type === 'keydown') {
      const idx = this._keydownListeners.indexOf(fn);
      if (idx !== -1) this._keydownListeners.splice(idx, 1);
    }
  },
  activeElement: null,
  dispatchKeydown(key, shiftKey = false) {
    const e = { key, shiftKey, _prevented: false, preventDefault() { this._prevented = true; } };
    for (const fn of [...this._keydownListeners]) fn(e);
    return e;
  }
};

// ── Icon system (inline mirror of tc-library.js) ──────────────────────────────

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
  search: [
    { tag: 'circle', cx: '11', cy: '11', r: '8' },
    { tag: 'line', x1: '21', y1: '21', x2: '16.65', y2: '16.65' }
  ],
  clipboard: [
    { tag: 'rect', x: '9', y: '2', width: '6', height: '4', rx: '1' },
    { tag: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }
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
  folder: [
    { tag: 'path', d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }
  ],
  folderOpen: [
    { tag: 'path', d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
    { tag: 'path', d: 'M2 10h20' }
  ],
  calendar: [
    { tag: 'rect', x: '3', y: '4', width: '18', height: '18', rx: '2', ry: '2' },
    { tag: 'line', x1: '16', y1: '2', x2: '16', y2: '6' },
    { tag: 'line', x1: '8', y1: '2', x2: '8', y2: '6' },
    { tag: 'line', x1: '3', y1: '10', x2: '21', y2: '10' }
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

// ── Inline implementations of functions under test ────────────────────────────

/**
 * Mirrors the renderLessonsTab "not available" empty state from tc-library.js.
 * Returns the emptyCard element built via DOM construction.
 */
function buildLessonsNotAvailableCard() {
  const emptyCard = mockDocument.createElement('div');
  emptyCard.className = 'tc-card';
  emptyCard.style.cssText = 'text-align: center; padding: 48px 24px;';
  const iconWrap = mockDocument.createElement('div');
  iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:16px; color:rgba(255,255,255,.40);';
  iconWrap.appendChild(createIcon('bookOpen', 48));
  const heading = mockDocument.createElement('h3');
  heading.style.cssText = 'margin: 0 0 8px 0; font-size: 20px;';
  heading.textContent = 'Lessons index not available';
  const msg = mockDocument.createElement('p');
  msg.style.cssText = 'margin: 0; color: rgba(255,255,255,.60);';
  msg.textContent = 'Run the generator script to build the lessons index.';
  emptyCard.appendChild(iconWrap);
  emptyCard.appendChild(heading);
  emptyCard.appendChild(msg);
  return emptyCard;
}

/**
 * Mirrors the renderLessonsTab "no matches" empty state from tc-library.js.
 * Returns the emptyCard element built via DOM construction.
 */
function buildLessonsNoMatchCard() {
  const emptyCard = mockDocument.createElement('div');
  emptyCard.className = 'tc-card';
  emptyCard.style.cssText = 'text-align: center; padding: 48px 24px;';
  const iconWrap = mockDocument.createElement('div');
  iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:16px; color:rgba(255,255,255,.40);';
  iconWrap.appendChild(createIcon('search', 32));
  const msg = mockDocument.createElement('p');
  msg.style.cssText = 'margin: 0; color: rgba(255,255,255,.60);';
  msg.textContent = 'No lessons match your search.';
  emptyCard.appendChild(iconWrap);
  emptyCard.appendChild(msg);
  return emptyCard;
}

/**
 * Mirrors the filter/state context for lesson search persistence tests.
 */
function makeFilterContext(storage) {
  const filters = {
    assignments: { classFilter: 'All Classes', searchQuery: '', typeFilter: 'All', categoryFilter: 'All' },
    lessons: { searchQuery: '' }
  };
  const collapsedLanes = new Set(['analytics']);
  const hierarchyExpandState = new Map();

  function saveFilters() {
    try {
      const data = {
        assignments: { ...filters.assignments },
        lessons: { searchQuery: filters.lessons.searchQuery },
        collapsedLanes: Array.from(collapsedLanes).filter(v => typeof v === 'string'),
        hierarchyExpandState: Array.from(hierarchyExpandState.entries())
          .filter(([k]) => typeof k === 'string')
      };
      storage.setItem('rc_tc_library_filters_v1', JSON.stringify(data));
    } catch (_) { /* ignore */ }
  }

  function loadFilters() {
    try {
      const raw = storage.getItem('rc_tc_library_filters_v1');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.lessons && typeof data.lessons.searchQuery === 'string') {
        filters.lessons.searchQuery = data.lessons.searchQuery;
      }
      if (data.assignments) {
        if (typeof data.assignments.classFilter === 'string') filters.assignments.classFilter = data.assignments.classFilter;
        if (typeof data.assignments.searchQuery === 'string') filters.assignments.searchQuery = data.assignments.searchQuery;
        if (typeof data.assignments.typeFilter === 'string') filters.assignments.typeFilter = data.assignments.typeFilter;
        if (typeof data.assignments.categoryFilter === 'string') filters.assignments.categoryFilter = data.assignments.categoryFilter;
      }
    } catch (_) { /* ignore */ }
  }

  return { filters, collapsedLanes, hierarchyExpandState, saveFilters, loadFilters };
}

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

/**
 * Minimal version of showAssignmentDetail modal creation, mirroring the
 * ARIA + keyboard + focus logic added in PR 6.
 */
function buildDetailModal(doc, assignment) {
  const triggerElement = doc.activeElement;

  const overlay = doc.createElement('div');
  overlay.id = 'assignmentDetailOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'detailModalTitle');

  const card = doc.createElement('div');
  card.className = 'tc-card';

  const headerRow = doc.createElement('div');
  const titleEl = doc.createElement('h2');
  titleEl.id = 'detailModalTitle';
  titleEl.textContent = assignment.title || 'Untitled';
  const closeBtn = doc.createElement('button');
  closeBtn.id = 'closeDetailBtn';
  closeBtn.className = 'tc-btn detail-close-btn';
  closeBtn.setAttribute('aria-label', 'Close dialog');
  closeBtn.textContent = '\u2715 Close';
  headerRow.appendChild(titleEl);
  headerRow.appendChild(closeBtn);
  card.appendChild(headerRow);

  const issueBtn = doc.createElement('button');
  issueBtn.className = 'tc-btn issue-detail-btn';
  issueBtn.textContent = 'Issue to Class';
  card.appendChild(issueBtn);

  overlay.appendChild(card);
  doc.body.appendChild(overlay);

  closeBtn.focus();

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = overlay.querySelectorAll('button');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  doc.addEventListener('keydown', handleKeydown);

  function closeModal() {
    doc.removeEventListener('keydown', handleKeydown);
    overlay.remove();
    if (triggerElement && typeof triggerElement.focus === 'function') {
      triggerElement.focus();
    }
  }

  closeBtn.addEventListener = function(type, fn) {
    this._clickHandler = type === 'click' ? fn : this._clickHandler;
  };
  closeBtn.addEventListener('click', closeModal);

  overlay._closeModal = closeModal;
  overlay._closeBtn = closeBtn;
  overlay._titleEl = titleEl;
  overlay._handleKeydown = handleKeydown;

  return overlay;
}

// ── Test runner ───────────────────────────────────────────────────────────────

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

// ── Lessons Empty State DOM Structure ─────────────────────────────────────────
console.log('\n--- Lessons empty state DOM structure ---');

test('"not available" empty state — icon is SVG (createIcon, not emoji)', () => {
  const card = buildLessonsNotAvailableCard();
  // First child of card is iconWrap; first child of iconWrap is the SVG
  const iconWrap = card.children[0];
  assert.ok(iconWrap, 'iconWrap should exist');
  const svg = iconWrap.children[0];
  assert.ok(svg, 'SVG icon should exist inside iconWrap');
  assert.strictEqual(svg.namespaceURI, 'http://www.w3.org/2000/svg', 'icon should be SVG namespace');
});

test('"not available" empty state — icon is bookOpen (has 2 path children)', () => {
  const card = buildLessonsNotAvailableCard();
  const iconWrap = card.children[0];
  const svg = iconWrap.children[0];
  assert.ok(svg.children.length >= 2, 'bookOpen SVG should have path children');
});

test('"not available" empty state — heading text is correct', () => {
  const card = buildLessonsNotAvailableCard();
  const heading = card.children[1];
  assert.strictEqual(heading.tagName, 'h3', 'second child should be h3');
  assert.strictEqual(heading.textContent, 'Lessons index not available');
});

test('"not available" empty state — description text is correct', () => {
  const card = buildLessonsNotAvailableCard();
  const msg = card.children[2];
  assert.strictEqual(msg.tagName, 'p', 'third child should be p');
  assert.strictEqual(msg.textContent, 'Run the generator script to build the lessons index.');
});

test('"no matches" empty state — icon is SVG (createIcon, not emoji)', () => {
  const card = buildLessonsNoMatchCard();
  const iconWrap = card.children[0];
  const svg = iconWrap.children[0];
  assert.ok(svg, 'SVG icon should exist inside iconWrap');
  assert.strictEqual(svg.namespaceURI, 'http://www.w3.org/2000/svg', 'icon should be SVG namespace');
});

test('"no matches" empty state — description text is correct', () => {
  const card = buildLessonsNoMatchCard();
  const msg = card.children[1];
  assert.ok(msg, 'msg element should exist');
  assert.strictEqual(msg.textContent, 'No lessons match your search.');
});

// ── Lessons Search Persistence ────────────────────────────────────────────────
console.log('\n--- Lessons search persistence ---');

test('saveFilters persists lessons.searchQuery to localStorage', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.lessons.searchQuery = 'vocab';
  ctx.saveFilters();
  const raw = storage.getItem('rc_tc_library_filters_v1');
  assert.ok(raw, 'data should be saved');
  const data = JSON.parse(raw);
  assert.strictEqual(data.lessons.searchQuery, 'vocab');
});

test('loadFilters restores lessons.searchQuery from localStorage', () => {
  const storage = makeMockStorage();
  const ctx1 = makeFilterContext(storage);
  ctx1.filters.lessons.searchQuery = 'grammar';
  ctx1.saveFilters();

  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.lessons.searchQuery, 'grammar');
});

test('empty lessons.searchQuery saves and restores as empty string', () => {
  const storage = makeMockStorage();
  const ctx = makeFilterContext(storage);
  ctx.filters.lessons.searchQuery = '';
  ctx.saveFilters();
  const ctx2 = makeFilterContext(storage);
  ctx2.loadFilters();
  assert.strictEqual(ctx2.filters.lessons.searchQuery, '');
});

test('lesson search event listener in source calls saveFilters()', () => {
  // Verify the lesson search input handler in attachEventListeners calls saveFilters
  const handler = libSrc.match(/lessonSearch[\s\S]{0,200}saveFilters/);
  assert.ok(handler, 'lessonSearch input handler should call saveFilters()');
});

// ── Detail Modal Accessibility ────────────────────────────────────────────────
console.log('\n--- Detail modal accessibility ---');

test('modal overlay has role="dialog"', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  doc.activeElement = null;
  const overlay = buildDetailModal(doc, { id: 'a1', title: 'Test Assignment' });
  assert.strictEqual(overlay.getAttribute('role'), 'dialog');
});

test('modal overlay has aria-modal="true"', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  doc.activeElement = null;
  const overlay = buildDetailModal(doc, { id: 'a1', title: 'Test Assignment' });
  assert.strictEqual(overlay.getAttribute('aria-modal'), 'true');
});

test('modal overlay has aria-labelledby="detailModalTitle"', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  doc.activeElement = null;
  const overlay = buildDetailModal(doc, { id: 'a1', title: 'Test Assignment' });
  assert.strictEqual(overlay.getAttribute('aria-labelledby'), 'detailModalTitle');
});

test('title element has id="detailModalTitle"', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  doc.activeElement = null;
  const overlay = buildDetailModal(doc, { id: 'a1', title: 'My Assignment' });
  assert.strictEqual(overlay._titleEl.id, 'detailModalTitle');
  assert.strictEqual(overlay._titleEl.textContent, 'My Assignment');
});

test('Escape key closes the modal (removes overlay)', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  doc.activeElement = null;
  const overlay = buildDetailModal(doc, { id: 'a2', title: 'Escape Test' });
  assert.ok(!overlay._removed, 'overlay should not be removed yet');
  doc.dispatchKeydown('Escape');
  assert.ok(overlay._removed, 'overlay should be removed after Escape');
});

test('Escape key removes the keydown listener (no memory leak)', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  doc.activeElement = null;
  buildDetailModal(doc, { id: 'a3', title: 'Leak Test' });
  const countBefore = doc._keydownListeners.length;
  doc.dispatchKeydown('Escape');
  const countAfter = doc._keydownListeners.length;
  assert.ok(countAfter < countBefore, 'keydown listener should be removed on close');
});

test('focus returns to trigger element on modal close', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  const trigger = new MockElement(null, 'button');
  doc.activeElement = trigger;
  buildDetailModal(doc, { id: 'a4', title: 'Focus Restore Test' });
  doc.dispatchKeydown('Escape');
  assert.ok(trigger._focusCalled, 'trigger element should have received focus on close');
});

// ── Focus Trap ────────────────────────────────────────────────────────────────
console.log('\n--- Focus trap ---');

test('close button is focused on modal open', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  doc.activeElement = null;
  const overlay = buildDetailModal(doc, { id: 'a5', title: 'Focus Test' });
  assert.ok(overlay._closeBtn._focusCalled, 'close button should be focused on modal open');
});

test('Tab on last focusable element wraps to first', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  doc.activeElement = null;
  const overlay = buildDetailModal(doc, { id: 'a6', title: 'Tab Wrap Test' });

  // Simulate focus on the last button (issueBtn)
  const buttons = overlay.querySelectorAll('button');
  assert.ok(buttons.length >= 2, 'modal should have at least 2 focusable buttons');
  const last = buttons[buttons.length - 1];
  const first = buttons[0];
  doc.activeElement = last;

  const e = doc.dispatchKeydown('Tab', false);
  assert.ok(e._prevented, 'default should be prevented when Tab wraps from last to first');
  assert.ok(first._focusCalled, 'first focusable element should receive focus');
});

test('Shift+Tab on first focusable element wraps to last', () => {
  const doc = Object.create(mockDocument);
  doc._keydownListeners = [];
  doc.body = new MockElement(null, 'body');
  doc.activeElement = null;
  const overlay = buildDetailModal(doc, { id: 'a7', title: 'Shift-Tab Test' });

  const buttons = overlay.querySelectorAll('button');
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  doc.activeElement = first;

  const e = doc.dispatchKeydown('Tab', true); // shiftKey=true
  assert.ok(e._prevented, 'default should be prevented when Shift+Tab wraps from first to last');
  assert.ok(last._focusCalled, 'last focusable element should receive focus');
});

// ── innerHTML Safety Verification ─────────────────────────────────────────────
console.log('\n--- innerHTML safety ---');

/**
 * Extract a named function body from source by locating the next function
 * declaration at the same nesting level. Uses brace counting for robustness.
 */
function extractFuncBody(src, funcSignature) {
  const start = src.indexOf(funcSignature);
  if (start === -1) return null;
  let depth = 0;
  let inBody = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') { depth++; inBody = true; }
    else if (src[i] === '}') { depth--; }
    if (inBody && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start); // fallback: return rest of file
}

test('renderLessonsTab source has no innerHTML with non-empty string content', () => {
  const funcBody = extractFuncBody(libSrc, 'function renderLessonsTab()');
  assert.ok(funcBody, 'renderLessonsTab should exist in source');
  // Check for innerHTML = '<...' or innerHTML = "..." with content (not just '')
  const dangerousInnerHTML = funcBody.match(/innerHTML\s*=\s*['"`][^'"`]+['"`]/);
  assert.ok(!dangerousInnerHTML, 'renderLessonsTab should not use innerHTML to set content');
});

test('renderAnalyticsSection source has no lane emoji (📋🔄✅)', () => {
  const funcBody = extractFuncBody(libSrc, 'function renderAnalyticsSection(');
  assert.ok(funcBody, 'renderAnalyticsSection should exist');
  // Check for emoji surrogate pairs used for 📋 🔄 ✅ in laneItems
  const hasEmoji = /\\uD83D\\uDCCB|\\uD83D\\uDD04|\\u2705 (Finalized|Active|Upcoming)/.test(funcBody);
  assert.ok(!hasEmoji, 'renderAnalyticsSection lane items should not use emoji strings');
});

test('finalized tree source has no folder/document emoji (📂📁📄)', () => {
  // Check the whole file for these specific unicode escapes that were emoji
  const hasFolderEmoji = /\\uD83D\\uDCC2|\\uD83D\\uDCC1|\\uD83D\\uDCC4/.test(libSrc);
  assert.ok(!hasFolderEmoji, 'source should not contain folder/document emoji escape sequences');
});

test('renderUpcomingCard and renderCurrentCard source has no series/due emoji (📚📅)', () => {
  const hasSeriesEmoji = /\\uD83D\\uDCDA/.test(libSrc);
  const hasDueEmoji = /\\uD83D\\uDCC5/.test(libSrc);
  assert.ok(!hasSeriesEmoji, 'source should not contain 📚 emoji escape for series label');
  assert.ok(!hasDueEmoji, 'source should not contain 📅 emoji escape for due date');
});

test('ICON_PATHS in source contains "calendar" key', () => {
  assert.ok(libSrc.includes('calendar:'), 'ICON_PATHS should contain a calendar entry');
});

// ── createIcon Integration ────────────────────────────────────────────────────
console.log('\n--- createIcon integration ---');

test('createIcon("calendar") returns an SVG element', () => {
  const icon = createIcon('calendar');
  assert.ok(icon, 'icon should exist');
  assert.strictEqual(icon.namespaceURI, 'http://www.w3.org/2000/svg', 'should be SVG');
  assert.strictEqual(icon.getAttribute('width'), '16');
  assert.strictEqual(icon.getAttribute('height'), '16');
});

test('createIcon("calendar") SVG has expected child shapes', () => {
  const icon = createIcon('calendar');
  assert.ok(icon.children.length >= 3, 'calendar SVG should have at least 3 child elements');
});

test('createIcon("folderOpen") returns SVG with 2 child elements', () => {
  const icon = createIcon('folderOpen');
  assert.strictEqual(icon.namespaceURI, 'http://www.w3.org/2000/svg', 'should be SVG');
  assert.strictEqual(icon.children.length, 2, 'folderOpen should have 2 paths');
});

test('createIcon("bookOpen", 48) has width=48 and height=48', () => {
  const icon = createIcon('bookOpen', 48);
  assert.strictEqual(icon.getAttribute('width'), '48');
  assert.strictEqual(icon.getAttribute('height'), '48');
});

test('ICON_PATHS has calendar key with correct shape count', () => {
  assert.ok(Array.isArray(ICON_PATHS.calendar), 'calendar should be an array');
  assert.ok(ICON_PATHS.calendar.length >= 4, 'calendar should have 4 shapes (rect + 3 lines)');
  assert.strictEqual(ICON_PATHS.calendar[0].tag, 'rect', 'first shape should be rect');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
