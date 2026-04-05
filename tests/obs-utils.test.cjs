// Unit tests for site/web/obs-utils.js
// Covers: parseObservationNotes, formatObservationValue, buildObservationNotes
// Run with: node tests/obs-utils.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Load source ───────────────────────────────────────────────────────────────

const srcPath = path.join(__dirname, '..', 'site', 'web', 'obs-utils.js');
const rawSrc = fs.readFileSync(srcPath, 'utf8');

// Strip ES module export keywords so we can evaluate in a CommonJS context
const cjsSrc = rawSrc
  .replace(/^export\s+function\s+/gm, 'function ')
  .replace(/^export\s+/gm, '');

const sandbox = { module: { exports: {} } };
vm.runInNewContext(
  cjsSrc + `
  module.exports = { parseObservationNotes, formatObservationValue, buildObservationNotes };
`,
  sandbox
);

const { parseObservationNotes, formatObservationValue, buildObservationNotes } = sandbox.module.exports;

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

// ── parseObservationNotes ─────────────────────────────────────────────────────

console.log('\n--- parseObservationNotes ---');

test('returns null for null/undefined input', () => {
  assert.strictEqual(parseObservationNotes(null), null);
  assert.strictEqual(parseObservationNotes(undefined), null);
  assert.strictEqual(parseObservationNotes(''), null);
});

test('returns null for non-observation notes', () => {
  assert.strictEqual(parseObservationNotes('Some plain text note'), null);
  assert.strictEqual(parseObservationNotes('80% on reading task'), null);
  assert.strictEqual(parseObservationNotes('[other:prefix:data]'), null);
});

test('parses session_outcome notes', () => {
  const result = parseObservationNotes('[obs:session_outcome:met]');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'session_outcome');
  assert.strictEqual(result.rawData, 'met');
  assert.strictEqual(result.userNote, '');
});

test('parses session_outcome not_met', () => {
  const result = parseObservationNotes('[obs:session_outcome:not_met]');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'session_outcome');
  assert.strictEqual(result.rawData, 'not_met');
  assert.strictEqual(result.userNote, '');
});

test('parses session_outcome not_addressed', () => {
  const result = parseObservationNotes('[obs:session_outcome:not_addressed]');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'session_outcome');
  assert.strictEqual(result.rawData, 'not_addressed');
  assert.strictEqual(result.userNote, '');
});

test('parses session_outcome with user note', () => {
  const result = parseObservationNotes('[obs:session_outcome:met] Student was very engaged');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'session_outcome');
  assert.strictEqual(result.rawData, 'met');
  assert.strictEqual(result.userNote, 'Student was very engaged');
});

test('parses tally notes', () => {
  const result = parseObservationNotes('[obs:tally:3/5]');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'tally');
  assert.strictEqual(result.rawData, '3/5');
  assert.strictEqual(result.userNote, '');
});

test('parses tally with user note', () => {
  const result = parseObservationNotes('[obs:tally:2/4] Needed extra time');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'tally');
  assert.strictEqual(result.rawData, '2/4');
  assert.strictEqual(result.userNote, 'Needed extra time');
});

test('parses prompt_count notes', () => {
  const result = parseObservationNotes('[obs:prompt_count:2]');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'prompt_count');
  assert.strictEqual(result.rawData, '2');
  assert.strictEqual(result.userNote, '');
});

test('parses checklist notes', () => {
  const result = parseObservationNotes('[obs:checklist:Behavior A=met,Behavior B=not_met]');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'checklist');
  assert.strictEqual(result.rawData, 'Behavior A=met,Behavior B=not_met');
  assert.strictEqual(result.userNote, '');
});

test('parses checklist not_addressed', () => {
  const result = parseObservationNotes('[obs:checklist:not_addressed]');
  assert.ok(result !== null);
  assert.strictEqual(result.category, 'checklist');
  assert.strictEqual(result.rawData, 'not_addressed');
  assert.strictEqual(result.userNote, '');
});

test('preserves behavior names with special characters in rawData', () => {
  const result = parseObservationNotes("[obs:checklist:Follow adult's request=met]");
  assert.ok(result !== null);
  assert.ok(result.rawData.includes("Follow adult's request"));
  assert.ok(!result.rawData.includes('&#39;'), 'rawData should NOT contain HTML entities');
});

// ── formatObservationValue ────────────────────────────────────────────────────

console.log('\n--- formatObservationValue ---');

test('returns fallback for non-observation entry without notes', () => {
  assert.strictEqual(formatObservationValue({ value: 80 }), '80');
  assert.strictEqual(formatObservationValue({ value: null }), '—');
  assert.strictEqual(formatObservationValue({}), '—');
});

test('session_outcome met', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:session_outcome:met]' }), 'Met');
});

test('session_outcome not_met', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:session_outcome:not_met]' }), 'Not Met');
});

test('session_outcome not_addressed', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:session_outcome:not_addressed]' }), 'Not Addressed');
});

test('session_outcome na (legacy alias) returns Not Addressed', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:session_outcome:na]' }), 'Not Addressed');
});

test('session_outcome not_applicable returns N/A', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:session_outcome:not_applicable]' }), 'N/A');
});

test('tally formats as "X of Y (Z%)"', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:tally:3/5]', value: 60 }), '3 of 5 (60%)');
});

test('tally with 0 opportunities', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:tally:0/0]', value: null }), '0 of 0 (—)');
});

test('prompt_count 1 (singular)', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:prompt_count:1]' }), '1 prompt');
});

test('prompt_count 0 (plural)', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:prompt_count:0]' }), '0 prompts');
});

test('prompt_count 3 (plural)', () => {
  assert.strictEqual(formatObservationValue({ notes: '[obs:prompt_count:3]' }), '3 prompts');
});

test('checklist shows met/total', () => {
  const result = formatObservationValue({ notes: '[obs:checklist:A=met,B=not_met,C=met]' });
  assert.strictEqual(result, '2/3 behaviors met');
});

test('checklist all met', () => {
  const result = formatObservationValue({ notes: '[obs:checklist:A=met,B=met]' });
  assert.strictEqual(result, '2/2 behaviors met');
});

test('checklist not_addressed returns Not Addressed', () => {
  const result = formatObservationValue({ notes: '[obs:checklist:not_addressed]' });
  assert.strictEqual(result, 'Not Addressed');
});

// ── buildObservationNotes ─────────────────────────────────────────────────────

console.log('\n--- buildObservationNotes ---');

test('session_outcome met', () => {
  const result = buildObservationNotes('session_outcome', { response: 'met' });
  assert.strictEqual(result, '[obs:session_outcome:met]');
});

test('session_outcome not_met', () => {
  const result = buildObservationNotes('session_outcome', { response: 'not_met' });
  assert.strictEqual(result, '[obs:session_outcome:not_met]');
});

test('session_outcome defaults to not_addressed when no response', () => {
  const result = buildObservationNotes('session_outcome', {});
  assert.strictEqual(result, '[obs:session_outcome:not_addressed]');
});

test('session_outcome appends user note', () => {
  const result = buildObservationNotes('session_outcome', { response: 'met' }, 'Great session');
  assert.strictEqual(result, '[obs:session_outcome:met] Great session');
});

test('tally builds correct prefix', () => {
  const result = buildObservationNotes('tally', { successful: 3, opportunities: 5 });
  assert.strictEqual(result, '[obs:tally:3/5]');
});

test('tally defaults to 0/0 when no data', () => {
  const result = buildObservationNotes('tally', {});
  assert.strictEqual(result, '[obs:tally:0/0]');
});

test('prompt_count builds correct prefix', () => {
  const result = buildObservationNotes('prompt_count', { promptCount: 2 });
  assert.strictEqual(result, '[obs:prompt_count:2]');
});

test('prompt_count defaults to 0', () => {
  const result = buildObservationNotes('prompt_count', {});
  assert.strictEqual(result, '[obs:prompt_count:0]');
});

test('behavior_checklist builds correct prefix', () => {
  const result = buildObservationNotes('behavior_checklist', {
    subBehaviors: ['Behavior A', 'Behavior B', 'Behavior C'],
    checkedBehaviors: [true, false, true],
  });
  assert.strictEqual(result, '[obs:checklist:Behavior A=met,Behavior B=not_met,Behavior C=met]');
});

test('behavior_checklist with empty sub_behaviors', () => {
  const result = buildObservationNotes('behavior_checklist', { subBehaviors: [], checkedBehaviors: [] });
  assert.strictEqual(result, '[obs:checklist:]');
});

test('behavior_checklist does NOT HTML-encode apostrophes', () => {
  const result = buildObservationNotes('behavior_checklist', {
    subBehaviors: ["Follow adult's request"],
    checkedBehaviors: [true],
  });
  assert.ok(!result.includes('&#39;'), 'Must not HTML-encode apostrophes');
  assert.ok(!result.includes('&amp;'), 'Must not HTML-encode ampersands');
  assert.strictEqual(result, "[obs:checklist:Follow adult's request=met]");
});

test('behavior_checklist does NOT HTML-encode ampersands', () => {
  const result = buildObservationNotes('behavior_checklist', {
    subBehaviors: ['Wait & listen'],
    checkedBehaviors: [false],
  });
  assert.ok(!result.includes('&amp;'), 'Must not HTML-encode ampersands');
  assert.strictEqual(result, '[obs:checklist:Wait & listen=not_met]');
});

// ── Round-trip tests ──────────────────────────────────────────────────────────

console.log('\n--- Round-trip: buildObservationNotes → parseObservationNotes ---');

test('session_outcome round-trip', () => {
  const notes = buildObservationNotes('session_outcome', { response: 'met' }, 'Good');
  const parsed = parseObservationNotes(notes);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed.category, 'session_outcome');
  assert.strictEqual(parsed.rawData, 'met');
  assert.strictEqual(parsed.userNote, 'Good');
});

test('tally round-trip', () => {
  const notes = buildObservationNotes('tally', { successful: 4, opportunities: 5 });
  const parsed = parseObservationNotes(notes);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed.category, 'tally');
  assert.strictEqual(parsed.rawData, '4/5');
});

test('prompt_count round-trip', () => {
  const notes = buildObservationNotes('prompt_count', { promptCount: 1 });
  const parsed = parseObservationNotes(notes);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed.category, 'prompt_count');
  assert.strictEqual(parsed.rawData, '1');
});

test('behavior_checklist round-trip with special characters', () => {
  const notes = buildObservationNotes('behavior_checklist', {
    subBehaviors: ["Follow adult's request", 'Wait & listen'],
    checkedBehaviors: [true, false],
  });
  const parsed = parseObservationNotes(notes);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed.category, 'checklist');
  assert.ok(parsed.rawData.includes("Follow adult's request=met"), 'Apostrophe preserved in round-trip');
  assert.ok(parsed.rawData.includes('Wait & listen=not_met'), 'Ampersand preserved in round-trip');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n✗ Some obs-utils tests FAILED');
  process.exit(1);
}
console.log('\n✅ All obs-utils tests passed');
