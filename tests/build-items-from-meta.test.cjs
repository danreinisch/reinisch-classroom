// Unit tests for netlify/functions/_lib/build-items.js → buildItemsFromMeta
// Run with: node tests/build-items-from-meta.test.cjs

'use strict';

const assert = require('assert');
const { buildItemsFromMeta } = require('../netlify/functions/_lib/build-items.js');

// ── Helper ────────────────────────────────────────────────────────────────────

function keySignature(item) {
  return Object.keys(item).sort().join(',');
}

// ── Test 1: Week 13 mixed day — uniform top-level key set ────────────────────

{
  const meta = {
    days: [
      {
        day_number: 1,
        type: 'questions',
        questions: [
          // 3 MC questions
          { number: 1, type: 'mcq', text: 'MC Q1?', choices: ['A', 'B', 'C'], correct: 'A', points: 1 },
          { number: 2, type: 'mcq', text: 'MC Q2?', choices: ['A', 'B', 'C'], correct: 'B', points: 1 },
          { number: 3, type: 'mcq', text: 'MC Q3?', choices: ['A', 'B', 'C'], correct: 'C', points: 1 },
          // 2 T/F questions
          { number: 4, type: 'boolean', text: 'TF Q4?', correct: true, points: 1 },
          { number: 5, type: 'boolean', text: 'TF Q5?', correct: false, points: 1 },
          // 2 FIB questions with accepted alternatives
          {
            number: 6,
            type: 'fill_in_blank',
            text: 'Fill in: ___',
            accepted: ['cloth', 'blanket cloth', 'blankets'],
            points: 1,
          },
          {
            number: 7,
            type: 'fill_in_blank',
            text: 'Fill in: ___',
            accepted: ['couch', 'sofa'],
            points: 1,
          },
        ],
      },
    ],
  };

  const items = buildItemsFromMeta(42, meta);
  assert.strictEqual(items.length, 7, 'should produce 7 items');

  const signatures = items.map(keySignature);
  const first = signatures[0];
  assert.ok(
    signatures.every(s => s === first),
    `All items must have identical top-level keys.\nGot: ${signatures.join('\n')}`
  );

  // Ensure scoring is present in the key set
  assert.ok(
    first.split(',').includes('scoring'),
    'Top-level key set must include "scoring"'
  );

  console.log('✓ Test 1 passed: Week 13 mixed day — uniform top-level key set');
}

// ── Test 2: FIB scoring preserved; MC/TF scoring === null ────────────────────

{
  const meta = {
    days: [
      {
        day_number: 1,
        type: 'questions',
        questions: [
          { number: 1, type: 'mcq', text: 'MC?', choices: ['A', 'B'], correct: 'A', points: 1 },
          { number: 2, type: 'boolean', text: 'TF?', correct: true, points: 1 },
          {
            number: 3,
            type: 'fill_in_blank',
            text: 'FIB?',
            accepted: ['cloth', 'blanket cloth', 'blankets', 'fabric'],
            points: 1,
          },
          {
            number: 4,
            type: 'fill_in_blank',
            text: 'FIB2?',
            accepted: ['couch', 'sofa'],
            points: 1,
          },
        ],
      },
    ],
  };

  const items = buildItemsFromMeta(42, meta);

  // MC item: scoring === null
  assert.strictEqual(items[0].scoring, null, 'MC item scoring must be null');
  // TF item: scoring === null
  assert.strictEqual(items[1].scoring, null, 'TF item scoring must be null');

  // FIB item 1: scoring has keywords equal to accepted array, min_keywords === 1
  const fib1 = items[2];
  assert.deepStrictEqual(
    fib1.scoring.keywords,
    ['cloth', 'blanket cloth', 'blankets', 'fabric'],
    'FIB scoring.keywords should equal accepted array'
  );
  assert.strictEqual(fib1.scoring.min_keywords, 1, 'FIB min_keywords must be 1 when accepted present');

  // FIB item 2: scoring present
  const fib2 = items[3];
  assert.deepStrictEqual(fib2.scoring.keywords, ['couch', 'sofa']);
  assert.strictEqual(fib2.scoring.min_keywords, 1);

  console.log('✓ Test 2 passed: FIB scoring preserved; MC/TF scoring === null');
}

// ── Test 3: Writing prompt day — uniform keys, scoring: null ─────────────────

{
  const wpMeta = {
    days: [
      {
        day_number: 1,
        type: 'writing_prompt',
        prompt: 'Write about something.',
        structure: ['Start with a topic sentence.'],
        hints: ['Think carefully.'],
        goal_codes: ['S001.11.1'],
        dese_codes: ['MLS.W.1.A'],
        points: 5,
      },
    ],
  };

  const items = buildItemsFromMeta(42, wpMeta);
  assert.strictEqual(items.length, 1, 'should produce 1 writing-prompt item');
  assert.strictEqual(items[0].scoring, null, 'writing-prompt scoring must be null');

  // Build a reference signature from a mixed-day to compare key sets
  const mixedMeta = {
    days: [
      {
        day_number: 2,
        type: 'questions',
        questions: [
          { number: 1, type: 'mcq', text: 'MC?', choices: ['A', 'B'], correct: 'A', points: 1 },
        ],
      },
    ],
  };
  const mixedItems = buildItemsFromMeta(42, mixedMeta);
  assert.strictEqual(
    keySignature(items[0]),
    keySignature(mixedItems[0]),
    'writing-prompt item must have same top-level key set as question item'
  );

  console.log('✓ Test 3 passed: Writing prompt — uniform keys, scoring: null');
}

// ── Test 4: Mixed questions-day + writing-prompt-day — uniform key sets ───────

{
  const meta = {
    days: [
      {
        day_number: 1,
        type: 'questions',
        questions: [
          { number: 1, type: 'mcq', text: 'MC?', choices: ['A', 'B'], correct: 'A', points: 1 },
          { number: 2, type: 'fill_in_blank', text: 'FIB?', accepted: ['dog', 'cat'], points: 1 },
        ],
      },
      {
        day_number: 2,
        type: 'writing_prompt',
        prompt: 'Write a response.',
        structure: ['Paragraph 1.'],
        hints: [],
        points: 5,
      },
    ],
  };

  const items = buildItemsFromMeta(99, meta);
  assert.strictEqual(items.length, 3, 'should produce 3 items total');

  const signatures = items.map(keySignature);
  const first = signatures[0];
  assert.ok(
    signatures.every(s => s === first),
    `All items in mixed assignment must have identical top-level keys.\nGot:\n${signatures.join('\n')}`
  );

  console.log('✓ Test 4 passed: Mixed questions + writing-prompt — uniform key sets');
}

// ── Test 5: Path B (HTML manifest) — scoring: null, uniform keys ──────────────

{
  const meta = {
    questions: [
      { q_ref: 'Q1', label: 'Question 1', answer_type: 'mcq', points: 1, default_goal_codes: ['G1'], default_dese_codes: [], correct: 'A' },
      { q_ref: 'Q2', label: 'Question 2', answer_type: 'boolean', points: 1, default_goal_codes: [], default_dese_codes: ['MLS.1'], correct: true },
      { q_ref: 'Q3', label: 'Question 3', answer_type: 'constructed', points: 2, default_goal_codes: [], default_dese_codes: [] },
    ],
  };

  const items = buildItemsFromMeta(77, meta);
  assert.strictEqual(items.length, 3, 'should produce 3 HTML manifest items');

  for (const item of items) {
    assert.strictEqual(item.scoring, null, `Path B item ${item.item_ref} scoring must be null`);
  }

  const signatures = items.map(keySignature);
  const first = signatures[0];
  assert.ok(
    signatures.every(s => s === first),
    `All Path B items must have identical top-level keys.\nGot:\n${signatures.join('\n')}`
  );

  console.log('✓ Test 5 passed: Path B HTML manifest — scoring: null, uniform keys');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\nAll build-items-from-meta tests passed.');
