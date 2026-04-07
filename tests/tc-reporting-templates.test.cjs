// Unit tests for report template management in tc-reporting.js
// Tests: localStorage key, template functions (save/load/delete), QuotaExceededError handling,
//        template UI presence in renderTab6, template controls in renderTab5, rcPrompt in rc-modal.
// Run with: node tests/tc-reporting-templates.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'site', 'web', 'tc-reporting.js');
const modalPath = path.join(__dirname, '..', 'site', 'web', 'rc-modal.js');
const htmlPath = path.join(__dirname, '..', 'site', 'teacher', 'reporting', 'index.html');

const src = fs.readFileSync(srcPath, 'utf8');
const modalSrc = fs.readFileSync(modalPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

// Search window sizes for source-scan tests
const RENDER_TAB5_SEARCH_SIZE = 5000;
const RENDER_TAB6_SEARCH_SIZE = 14000;

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

// ── Mock localStorage ─────────────────────────────────────────────────────────

function makeMockStorage(opts = {}) {
  const store = {};
  return {
    getItem(key) {
      if (opts.getThrows) throw opts.getThrows;
      return store[key] !== undefined ? store[key] : null;
    },
    setItem(key, value) {
      if (opts.setThrows) throw opts.setThrows;
      store[key] = value;
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      for (const k in store) delete store[k];
    },
    _store: store,
  };
}

// ── Build a minimal context that mirrors the template management functions ─────

const REPORT_TEMPLATES_KEY = 'rc_report_templates';
const MAX_REPORT_TEMPLATES = 20;

function makeTemplateContext(storage) {
  function loadReportTemplates() {
    try {
      const raw = storage.getItem(REPORT_TEMPLATES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveReportTemplate(name, config) {
    try {
      const templates = loadReportTemplates();
      const updated = [{ name, ...config }, ...templates.filter((t) => t.name !== name)]
        .slice(0, MAX_REPORT_TEMPLATES);
      storage.setItem(REPORT_TEMPLATES_KEY, JSON.stringify(updated));
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('[tc-reporting] localStorage quota exceeded — report template not saved');
      }
      return false;
    }
  }

  function deleteReportTemplate(name) {
    try {
      const templates = loadReportTemplates();
      storage.setItem(REPORT_TEMPLATES_KEY, JSON.stringify(templates.filter((t) => t.name !== name)));
      return true;
    } catch (e) {
      return false;
    }
  }

  return { loadReportTemplates, saveReportTemplate, deleteReportTemplate };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n--- localStorage key and constants ---');

test('REPORT_TEMPLATES_KEY constant is defined in tc-reporting.js', () => {
  assert.ok(
    src.includes("'rc_report_templates'") || src.includes('"rc_report_templates"'),
    'REPORT_TEMPLATES_KEY should be rc_report_templates'
  );
});

test('MAX_REPORT_TEMPLATES constant limits to 20 templates', () => {
  assert.ok(
    src.includes('MAX_REPORT_TEMPLATES = 20') || src.includes('MAX_REPORT_TEMPLATES=20'),
    'MAX_REPORT_TEMPLATES should be 20'
  );
});

console.log('\n--- Template management functions exist ---');

test('loadReportTemplates function is defined', () => {
  assert.ok(
    src.includes('function loadReportTemplates(') || src.includes('loadReportTemplates ='),
    'loadReportTemplates should be defined'
  );
});

test('saveReportTemplate function is defined', () => {
  assert.ok(
    src.includes('function saveReportTemplate(') || src.includes('saveReportTemplate ='),
    'saveReportTemplate should be defined'
  );
});

test('deleteReportTemplate function is defined', () => {
  assert.ok(
    src.includes('function deleteReportTemplate(') || src.includes('deleteReportTemplate ='),
    'deleteReportTemplate should be defined'
  );
});

test('buildTemplateOptionsHtml function is defined', () => {
  assert.ok(
    src.includes('function buildTemplateOptionsHtml(') || src.includes('buildTemplateOptionsHtml ='),
    'buildTemplateOptionsHtml should be defined'
  );
});

console.log('\n--- saveReportTemplate error handling ---');

test('saveReportTemplate catches QuotaExceededError by name', () => {
  const saveIdx = src.indexOf('function saveReportTemplate(');
  assert.ok(saveIdx !== -1, 'saveReportTemplate not found in source');
  const saveSection = src.slice(saveIdx, saveIdx + 800);
  assert.ok(
    saveSection.includes('QuotaExceededError'),
    'saveReportTemplate should handle QuotaExceededError by name'
  );
});

test('saveReportTemplate catches error by code 22', () => {
  const saveIdx = src.indexOf('function saveReportTemplate(');
  const saveSection = src.slice(saveIdx, saveIdx + 800);
  assert.ok(
    saveSection.includes('.code === 22'),
    'saveReportTemplate should handle error code 22'
  );
});

test('saveReportTemplate does not throw on QuotaExceededError', () => {
  const quota = new Error('QuotaExceededError');
  quota.name = 'QuotaExceededError';
  const storage = makeMockStorage({ setThrows: quota });
  const ctx = makeTemplateContext(storage);
  assert.doesNotThrow(
    () => ctx.saveReportTemplate('Test', { audienceMode: 'parent' }),
    'saveReportTemplate should not throw on QuotaExceededError'
  );
});

test('saveReportTemplate returns false on storage error', () => {
  const quota = new Error('QuotaExceededError');
  quota.name = 'QuotaExceededError';
  const storage = makeMockStorage({ setThrows: quota });
  const ctx = makeTemplateContext(storage);
  const result = ctx.saveReportTemplate('Test', {});
  assert.strictEqual(result, false, 'saveReportTemplate should return false on storage error');
});

test('saveReportTemplate returns true on success', () => {
  const storage = makeMockStorage();
  const ctx = makeTemplateContext(storage);
  const result = ctx.saveReportTemplate('Q4 Parent Reports', { audienceMode: 'parent', dateRange: 'Q4' });
  assert.strictEqual(result, true, 'saveReportTemplate should return true on success');
});

console.log('\n--- Template round-trip: save / load / delete ---');

test('saved template is loaded by loadReportTemplates', () => {
  const storage = makeMockStorage();
  const ctx = makeTemplateContext(storage);
  ctx.saveReportTemplate('Q4 Parent', { audienceMode: 'parent', dateRange: 'Q4', outputFormat: 'print' });
  const templates = ctx.loadReportTemplates();
  assert.strictEqual(templates.length, 1, 'Should have 1 template');
  assert.strictEqual(templates[0].name, 'Q4 Parent', 'Template name should match');
  assert.strictEqual(templates[0].audienceMode, 'parent', 'audienceMode should be preserved');
  assert.strictEqual(templates[0].dateRange, 'Q4', 'dateRange should be preserved');
  assert.strictEqual(templates[0].outputFormat, 'print', 'outputFormat should be preserved');
});

test('saving a template with same name overwrites existing', () => {
  const storage = makeMockStorage();
  const ctx = makeTemplateContext(storage);
  ctx.saveReportTemplate('My Template', { audienceMode: 'parent' });
  ctx.saveReportTemplate('My Template', { audienceMode: 'admin' });
  const templates = ctx.loadReportTemplates();
  assert.strictEqual(templates.length, 1, 'Should still have 1 template after overwrite');
  assert.strictEqual(templates[0].audienceMode, 'admin', 'Should have updated audienceMode');
});

test('multiple templates can be saved and loaded in order (newest first)', () => {
  const storage = makeMockStorage();
  const ctx = makeTemplateContext(storage);
  ctx.saveReportTemplate('Alpha', { dateRange: 'Q1' });
  ctx.saveReportTemplate('Beta', { dateRange: 'Q2' });
  ctx.saveReportTemplate('Gamma', { dateRange: 'Q3' });
  const templates = ctx.loadReportTemplates();
  assert.strictEqual(templates.length, 3);
  assert.strictEqual(templates[0].name, 'Gamma', 'Newest template should be first');
  assert.strictEqual(templates[2].name, 'Alpha', 'Oldest template should be last');
});

test('deleteReportTemplate removes the named template', () => {
  const storage = makeMockStorage();
  const ctx = makeTemplateContext(storage);
  ctx.saveReportTemplate('Keep Me', { dateRange: 'Q1' });
  ctx.saveReportTemplate('Delete Me', { dateRange: 'Q2' });
  ctx.deleteReportTemplate('Delete Me');
  const templates = ctx.loadReportTemplates();
  assert.strictEqual(templates.length, 1, 'Should have 1 template after delete');
  assert.strictEqual(templates[0].name, 'Keep Me', 'Remaining template should be "Keep Me"');
});

test('deleteReportTemplate returns true on success', () => {
  const storage = makeMockStorage();
  const ctx = makeTemplateContext(storage);
  ctx.saveReportTemplate('T1', {});
  const result = ctx.deleteReportTemplate('T1');
  assert.strictEqual(result, true, 'deleteReportTemplate should return true on success');
});

test('loadReportTemplates returns empty array when nothing saved', () => {
  const storage = makeMockStorage();
  const ctx = makeTemplateContext(storage);
  const templates = ctx.loadReportTemplates();
  assert.ok(Array.isArray(templates), 'loadReportTemplates should return an array');
  assert.strictEqual(templates.length, 0, 'Should return empty array when nothing saved');
});

test('loadReportTemplates returns empty array on parse error', () => {
  const storage = {
    getItem() { return '{not valid json['; },
    setItem() {},
    removeItem() {},
    clear() {},
  };
  const ctx = makeTemplateContext(storage);
  const templates = ctx.loadReportTemplates();
  assert.ok(Array.isArray(templates), 'Should return array even on JSON error');
  assert.strictEqual(templates.length, 0, 'Should return empty array on parse error');
});

test('MAX_REPORT_TEMPLATES limits saved templates to 20', () => {
  const storage = makeMockStorage();
  const ctx = makeTemplateContext(storage);
  for (let i = 0; i < 25; i++) {
    ctx.saveReportTemplate(`Template ${i}`, { dateRange: 'Q1' });
  }
  const templates = ctx.loadReportTemplates();
  assert.ok(templates.length <= 20, `Should have at most 20 templates, got ${templates.length}`);
});

console.log('\n--- Tab 6 template UI in renderTab6 ---');

test('renderTab6 includes tab6TemplateSelect dropdown', () => {
  const fnIdx = src.indexOf('function renderTab6(');
  assert.ok(fnIdx !== -1, 'renderTab6 not found');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB6_SEARCH_SIZE);
  assert.ok(fnSection.includes('tab6TemplateSelect'), 'renderTab6 should include tab6TemplateSelect');
});

test('renderTab6 includes tab6SaveTemplateBtn', () => {
  const fnIdx = src.indexOf('function renderTab6(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB6_SEARCH_SIZE);
  assert.ok(fnSection.includes('tab6SaveTemplateBtn'), 'renderTab6 should include tab6SaveTemplateBtn');
});

test('renderTab6 includes tab6DeleteTemplateBtn', () => {
  const fnIdx = src.indexOf('function renderTab6(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB6_SEARCH_SIZE);
  assert.ok(fnSection.includes('tab6DeleteTemplateBtn'), 'renderTab6 should include tab6DeleteTemplateBtn');
});

test('renderTab6 calls buildTemplateOptionsHtml', () => {
  const fnIdx = src.indexOf('function renderTab6(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB6_SEARCH_SIZE);
  assert.ok(fnSection.includes('buildTemplateOptionsHtml()'), 'renderTab6 should call buildTemplateOptionsHtml()');
});

test('renderTab6 template save uses rcPrompt', () => {
  const fnIdx = src.indexOf('function renderTab6(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB6_SEARCH_SIZE);
  assert.ok(fnSection.includes('rcPrompt'), 'renderTab6 template save should use rcPrompt');
});

test('renderTab6 template delete uses rcConfirm with danger', () => {
  const fnIdx = src.indexOf('function renderTab6(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB6_SEARCH_SIZE);
  assert.ok(fnSection.includes('danger: true') || fnSection.includes("danger:true"), 'renderTab6 delete should use danger confirm');
});

test('renderTab6 template section appears before selection mode', () => {
  const fnIdx = src.indexOf('function renderTab6(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB6_SEARCH_SIZE);
  const templatePos = fnSection.indexOf('tab6TemplateSelect');
  const modePos = fnSection.indexOf('tab6ModeGroup');
  assert.ok(templatePos < modePos, 'Template row should appear before Selection Mode row in renderTab6');
});

console.log('\n--- Tab 5 template UI in HTML ---');

test('index.html has batchTemplateSelect dropdown', () => {
  assert.ok(html.includes('batchTemplateSelect'), 'index.html should have batchTemplateSelect');
});

test('index.html has batchSaveTemplateBtn', () => {
  assert.ok(html.includes('batchSaveTemplateBtn'), 'index.html should have batchSaveTemplateBtn');
});

test('index.html has batchDeleteTemplateBtn', () => {
  assert.ok(html.includes('batchDeleteTemplateBtn'), 'index.html should have batchDeleteTemplateBtn');
});

test('template controls appear before batchQuarterSelect in HTML', () => {
  const templatePos = html.indexOf('batchTemplateSelect');
  const quarterPos = html.indexOf('batchQuarterSelect');
  assert.ok(
    templatePos !== -1 && quarterPos !== -1 && templatePos < quarterPos,
    'Template controls should appear before quarter selector in Tab 5 HTML'
  );
});

console.log('\n--- Tab 5 template wiring in renderTab5 ---');

test('renderTab5 populates batchTemplateSelect', () => {
  const fnIdx = src.indexOf('function renderTab5(');
  assert.ok(fnIdx !== -1, 'renderTab5 not found');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB5_SEARCH_SIZE);
  assert.ok(fnSection.includes('batchTemplateSelect'), 'renderTab5 should handle batchTemplateSelect');
});

test('renderTab5 wires batchSaveTemplateBtn', () => {
  const fnIdx = src.indexOf('function renderTab5(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB5_SEARCH_SIZE);
  assert.ok(fnSection.includes('batchSaveTemplateBtn'), 'renderTab5 should wire batchSaveTemplateBtn');
});

test('renderTab5 wires batchDeleteTemplateBtn', () => {
  const fnIdx = src.indexOf('function renderTab5(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB5_SEARCH_SIZE);
  assert.ok(fnSection.includes('batchDeleteTemplateBtn'), 'renderTab5 should wire batchDeleteTemplateBtn');
});

test('renderTab5 applies quarter from template when loading', () => {
  const fnIdx = src.indexOf('function renderTab5(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB5_SEARCH_SIZE);
  assert.ok(
    fnSection.includes("tab5State.quarter = quarter") || fnSection.includes("tab5State.quarter=quarter"),
    'renderTab5 should apply quarter from loaded template'
  );
});

test('renderTab5 derives quarter from dateRange (Q1-Q4) when loading cross-tab template', () => {
  const fnIdx = src.indexOf('function renderTab5(');
  const fnSection = src.slice(fnIdx, fnIdx + RENDER_TAB5_SEARCH_SIZE);
  assert.ok(
    fnSection.includes("tpl.dateRange"),
    'renderTab5 should check tpl.dateRange as a fallback quarter source'
  );
});

console.log('\n--- rcPrompt in rc-modal.js ---');

test('rcPrompt function is defined in rc-modal.js', () => {
  assert.ok(
    modalSrc.includes('function rcPrompt(') || modalSrc.includes('rcPrompt ='),
    'rcPrompt should be defined in rc-modal.js'
  );
});

test('rcPrompt is exported as window.rcPrompt', () => {
  assert.ok(
    modalSrc.includes('window.rcPrompt = rcPrompt') || modalSrc.includes('window.rcPrompt=rcPrompt'),
    'rcPrompt should be exported as window.rcPrompt'
  );
});

test('rcPrompt has a text input element', () => {
  const fnIdx = modalSrc.indexOf('function rcPrompt(');
  assert.ok(fnIdx !== -1, 'rcPrompt not found in rc-modal.js');
  const fnSection = modalSrc.slice(fnIdx, fnIdx + 2000);
  assert.ok(fnSection.includes('type="text"') || fnSection.includes("type='text'"), 'rcPrompt should include a text input');
});

test('rcPrompt handles Enter key to confirm', () => {
  const fnIdx = modalSrc.indexOf('function rcPrompt(');
  const fnSection = modalSrc.slice(fnIdx, fnIdx + 2000);
  assert.ok(fnSection.includes("'Enter'") || fnSection.includes('"Enter"'), 'rcPrompt should handle Enter key');
});

test('rcPrompt handles Escape key to cancel', () => {
  const fnIdx = modalSrc.indexOf('function rcPrompt(');
  const fnSection = modalSrc.slice(fnIdx, fnIdx + 2000);
  assert.ok(fnSection.includes("'Escape'") || fnSection.includes('"Escape"'), 'rcPrompt should handle Escape key');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('\n✗ Some tc-reporting-templates tests FAILED');
  process.exit(1);
} else {
  console.log('\n✅ All tc-reporting-templates tests passed');
}
