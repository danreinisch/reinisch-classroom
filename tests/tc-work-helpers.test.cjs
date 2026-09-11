// Unit tests for tc-work.js helper logic
// Tests: readDrafts() resilience, formatWhen() edge cases, Work command-center lifecycle contract
// Run with: node tests/tc-work-helpers.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── readDrafts helpers (mirror logic from tc-work.js) ────────────────────────

const STORAGE_KEY = 'rc_tc_work_drafts_v1';

// Simulate readDrafts() with a mock localStorage getter
function readDrafts(rawStorageValue) {
  try {
    const arr = rawStorageValue ? JSON.parse(rawStorageValue) : [];
    if (!Array.isArray(arr)) return [];
    // Filter out non-object entries (corrupted data, null, strings, numbers, nested arrays)
    return arr.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item));
  } catch (_) {
    return [];
  }
}

// ── formatWhen helper (mirror logic from tc-work.js) ─────────────────────────

function safeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function formatWhen(v) {
  const s = safeStr(v);
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s; // return raw string if unparseable
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  } catch (_) {
    return s;
  }
}

// ── Work command-center lifecycle mirror ─────────────────────────────────────

const TERMINAL_STATUSES = new Set(['Graded', 'Reviewed']);

function dateMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function deriveWorkStatus(draft, instances, lifecycleReady, now) {
  if (!draft.issuedAt) {
    const releaseMs = dateMs(draft.releaseAt);
    const scheduled =
      !!draft.autoRelease &&
      releaseMs !== null &&
      releaseMs > now;
    return scheduled ? 'scheduled' : 'draft';
  }

  const assignmentId = String(draft.assignmentId || '');
  const linked = assignmentId
    ? instances.filter(instance => String(instance.assignment_id || '') === assignmentId)
    : [];

  if (
    lifecycleReady &&
    linked.length > 0 &&
    linked.every(instance => TERMINAL_STATUSES.has(String(instance.status || '')))
  ) {
    return 'completed';
  }

  return 'active';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

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

// --- readDrafts() resilience ---
console.log('\n--- readDrafts() localStorage resilience ---');

test('valid drafts array is returned as-is', () => {
  const drafts = [{ id: 'd1', title: 'Test' }, { id: 'd2', title: 'Test 2' }];
  const result = readDrafts(JSON.stringify(drafts));
  assert.deepStrictEqual(result, drafts);
});

test('corrupted JSON returns empty array', () => {
  const result = readDrafts('{not valid json[[[');
  assert.deepStrictEqual(result, []);
});

test('null raw value returns empty array', () => {
  const result = readDrafts(null);
  assert.deepStrictEqual(result, []);
});

test('undefined raw value returns empty array', () => {
  const result = readDrafts(undefined);
  assert.deepStrictEqual(result, []);
});

test('empty string raw value returns empty array', () => {
  const result = readDrafts('');
  assert.deepStrictEqual(result, []);
});

test('non-array JSON (object) returns empty array', () => {
  const result = readDrafts('{"key": "value"}');
  assert.deepStrictEqual(result, []);
});

test('non-array JSON (string) returns empty array', () => {
  const result = readDrafts('"just a string"');
  assert.deepStrictEqual(result, []);
});

test('null entries in array are filtered out', () => {
  const raw = JSON.stringify([null, { id: 'd1', title: 'Valid' }, null]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'd1');
});

test('string entries in array are filtered out', () => {
  const raw = JSON.stringify(['foo', { id: 'd1' }, 'bar']);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'd1');
});

test('number entries in array are filtered out', () => {
  const raw = JSON.stringify([42, { id: 'd1' }, 99]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
});

test('nested arrays in array are filtered out', () => {
  const raw = JSON.stringify([[1, 2, 3], { id: 'd1' }]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'd1');
});

test('boolean entries in array are filtered out', () => {
  const raw = JSON.stringify([true, false, { id: 'd1' }]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 1);
});

test('mixed valid and invalid entries — only valid objects preserved', () => {
  const raw = JSON.stringify([
    { id: 'd1', title: 'Good' },
    null,
    'bad string',
    42,
    [1, 2],
    { id: 'd2', title: 'Also Good' }
  ]);
  const result = readDrafts(raw);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].id, 'd1');
  assert.strictEqual(result[1].id, 'd2');
});

test('empty array returns empty array', () => {
  const result = readDrafts('[]');
  assert.deepStrictEqual(result, []);
});

// --- formatWhen() ---
console.log('\n--- formatWhen() helper ---');

test('null returns fallback "—"', () => {
  assert.strictEqual(formatWhen(null), '—');
});

test('undefined returns fallback "—"', () => {
  assert.strictEqual(formatWhen(undefined), '—');
});

test('empty string returns fallback "—"', () => {
  assert.strictEqual(formatWhen(''), '—');
});

test('valid ISO date string returns formatted string', () => {
  const result = formatWhen('2025-06-15T10:30:00Z');
  assert.ok(typeof result === 'string' && result.length > 0, 'should return non-empty string');
  assert.ok(result !== '—', 'should not return fallback');
  assert.ok(!result.includes('NaN'), 'should not contain NaN');
});

test('invalid date string returns the raw input unchanged', () => {
  const result = formatWhen('not-a-date');
  assert.strictEqual(result, 'not-a-date');
});

test('numeric timestamp string is handled', () => {
  const result = formatWhen('1749000000000');
  assert.ok(typeof result === 'string');
  assert.ok(!result.includes('NaN'));
});

test('date-only string "2025-01-01" is handled', () => {
  const result = formatWhen('2025-01-01');
  assert.ok(typeof result === 'string' && result.length > 0);
  assert.ok(result !== '—', 'should not return fallback for valid date');
});

// --- command-center lifecycle semantics ---
console.log('\n--- Work command-center lifecycle semantics ---');

const NOW = Date.parse('2026-09-10T12:00:00Z');

test('unissued ordinary draft stays in Drafts', () => {
  assert.strictEqual(
    deriveWorkStatus({ issuedAt: null, autoRelease: false }, [], true, NOW),
    'draft'
  );
});

test('future auto-release draft is Scheduled', () => {
  assert.strictEqual(
    deriveWorkStatus(
      {
        issuedAt: null,
        autoRelease: true,
        releaseAt: '2026-09-15T12:00:00Z'
      },
      [],
      true,
      NOW
    ),
    'scheduled'
  );
});

test('issued assignment with unfinished student work remains Active', () => {
  assert.strictEqual(
    deriveWorkStatus(
      { issuedAt: '2026-09-09T12:00:00Z', assignmentId: 44 },
      [
        { assignment_id: 44, status: 'Reviewed' },
        { assignment_id: 44, status: 'Submitted' }
      ],
      true,
      NOW
    ),
    'active'
  );
});

test('all Graded/Reviewed instances hand assignment off to Library', () => {
  assert.strictEqual(
    deriveWorkStatus(
      { issuedAt: '2026-09-09T12:00:00Z', assignmentId: 44 },
      [
        { assignment_id: 44, status: 'Reviewed' },
        { assignment_id: 44, status: 'Graded' }
      ],
      true,
      NOW
    ),
    'completed'
  );
});

test('failed lifecycle read fails open in Work instead of hiding assignment', () => {
  assert.strictEqual(
    deriveWorkStatus(
      { issuedAt: '2026-09-09T12:00:00Z', assignmentId: 44 },
      [
        { assignment_id: 44, status: 'Reviewed' },
        { assignment_id: 44, status: 'Graded' }
      ],
      false,
      NOW
    ),
    'active'
  );
});

test('no matching assignment instances never falsely marks work Completed', () => {
  assert.strictEqual(
    deriveWorkStatus(
      { issuedAt: '2026-09-09T12:00:00Z', assignmentId: 44 },
      [{ assignment_id: 45, status: 'Reviewed' }],
      true,
      NOW
    ),
    'active'
  );
});

// --- command-center source contract ---
console.log('\n--- Work command-center source contract ---');

const qolPath = path.join(__dirname, '../site/web/tc-work-qol.js');
const qol = fs.readFileSync(qolPath, 'utf8');

test('approved Work command-center launch actions are present', () => {
  assert.ok(qol.includes('New Assignment'));
  assert.ok(qol.includes('Import Assignment'));
  assert.ok(qol.includes('Build, prepare, schedule, and issue assignments.'));
});

test('Work exposes Drafts, Scheduled, Active, and completed Library handoff', () => {
  assert.ok(qol.includes('Drafts'));
  assert.ok(qol.includes('Scheduled'));
  assert.ok(qol.includes('Active'));
  assert.ok(qol.includes('Completed Assignments'));
  assert.ok(qol.includes('/teacher/library/'));
});

test('completed lifecycle uses the same Graded/Reviewed terminal semantics as Library', () => {
  assert.ok(qol.includes('new Set(["Graded", "Reviewed"])'));
  assert.ok(qol.includes('instances.every'));
  assert.ok(qol.includes('return "completed"'));
});

test('Work reads assignment-instance lifecycle through one existing adapter call', () => {
  const matches = qol.match(/db\.listAssignmentInstances\(\)/g) || [];
  assert.strictEqual(matches.length, 1);
  assert.ok(qol.includes('await import("/web/data-adapter.js")'));
});

test('lifecycle read failure keeps work visible instead of falsely moving it', () => {
  assert.ok(qol.includes('state.lifecycleReady = false'));
  assert.ok(qol.includes('completed work will remain visible'));
});

test('batch-first rendering and compact filters are implemented', () => {
  assert.ok(qol.includes('draft.batchId'));
  assert.ok(qol.includes('Search assignments, students, classes'));
  assert.ok(qol.includes('All Classes'));
  assert.ok(qol.includes('All Statuses'));
});

test('secondary operations move behind Workspace Tools / row overflow menus', () => {
  assert.ok(qol.includes('Workspace Tools'));
  assert.ok(qol.includes('More assignment actions'));
  assert.ok(qol.includes('View Progress'));
  assert.ok(qol.includes('Issue Ready'));
});

test('existing Work engine remains the action source', () => {
  assert.ok(qol.includes('window.__rcRenderTable'));
  assert.ok(!qol.includes('supabase.from('));
  assert.ok(!qol.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('✗ Some tc-work-helpers tests failed!');
  process.exit(1);
} else {
  console.log('✓ All tc-work-helpers tests passed!');
}
