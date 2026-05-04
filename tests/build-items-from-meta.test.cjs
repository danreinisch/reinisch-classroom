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

  // Canonical key set must NOT include top-level 'scoring'
  assert.ok(
    !first.split(',').includes('scoring'),
    'Top-level key set must NOT include "scoring" — scoring lives in meta.scoring'
  );
  assert.strictEqual(
    first,
    'answer_type,assignment_id,dese_codes,goal_codes,item_ref,meta,points',
    'Canonical key set must be exactly {assignment_id, answer_type, dese_codes, goal_codes, item_ref, meta, points}'
  );

  console.log('✓ Test 1 passed: Week 13 mixed day — uniform top-level key set');
}

// ── Test 2: FIB scoring in meta.scoring; MC/TF have no top-level scoring ──────

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

  // MC item: no top-level scoring key
  assert.ok(!('scoring' in items[0]), 'MC item must NOT have top-level scoring key');
  // TF item: no top-level scoring key
  assert.ok(!('scoring' in items[1]), 'TF item must NOT have top-level scoring key');

  // FIB item 1: scoring lives in meta.scoring, not top-level
  const fib1 = items[2];
  assert.ok(!('scoring' in fib1), 'FIB item must NOT have top-level scoring key');
  assert.deepStrictEqual(
    fib1.meta.scoring.keywords,
    ['cloth', 'blanket cloth', 'blankets', 'fabric'],
    'FIB meta.scoring.keywords should equal accepted array'
  );
  assert.strictEqual(fib1.meta.scoring.min_keywords, 1, 'FIB meta.scoring.min_keywords must be 1 when accepted present');

  // FIB item 2: scoring in meta.scoring
  const fib2 = items[3];
  assert.ok(!('scoring' in fib2), 'FIB2 item must NOT have top-level scoring key');
  assert.deepStrictEqual(fib2.meta.scoring.keywords, ['couch', 'sofa']);
  assert.strictEqual(fib2.meta.scoring.min_keywords, 1);

  console.log('✓ Test 2 passed: FIB scoring in meta.scoring; MC/TF have no top-level scoring');
}

// ── Test 3: Writing prompt day — no top-level scoring, uniform keys ───────────

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
  assert.ok(!('scoring' in items[0]), 'writing-prompt item must NOT have top-level scoring key');

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

  console.log('✓ Test 3 passed: Writing prompt — no top-level scoring, uniform keys');
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

// ── Test 5: Path B (HTML manifest) — no top-level scoring, uniform keys ───────

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
    assert.ok(!('scoring' in item), `Path B item ${item.item_ref} must NOT have top-level scoring key`);
  }

  const signatures = items.map(keySignature);
  const first = signatures[0];
  assert.ok(
    signatures.every(s => s === first),
    `All Path B items must have identical top-level keys.\nGot:\n${signatures.join('\n')}`
  );

  console.log('✓ Test 5 passed: Path B HTML manifest — no top-level scoring, uniform keys');
}

// ── Test 6: Week 13 realistic integration — 3 days × 8 questions, 6 FIB ───────
// Shape mirrors week13_lost_in_kragdon-ah.docx: each day has Q1–Q4 MC, Q5–Q6 T/F, Q7–Q8 FIB.

{
  const week13Meta = {
    days: [
      {
        day_number: 1,
        type: 'questions',
        questions: [
          { number: 1, type: 'mcq', text: 'D1 Q1?', choices: ['A','B','C','D'], correct: 'B', points: 1, goal_codes: ['S011.13.1-1'] },
          { number: 2, type: 'mcq', text: 'D1 Q2?', choices: ['A','B','C','D'], correct: 'A', points: 1, goal_codes: ['S011.13.1-1'] },
          { number: 3, type: 'mcq', text: 'D1 Q3?', choices: ['A','B','C','D'], correct: 'C', points: 1, goal_codes: ['S011.13.1-2'] },
          { number: 4, type: 'mcq', text: 'D1 Q4?', choices: ['A','B','C','D'], correct: 'D', points: 1, goal_codes: ['S011.13.1-2'] },
          { number: 5, type: 'boolean', text: 'D1 Q5?', correct: true, points: 1, goal_codes: ['S011.13.1-3'] },
          { number: 6, type: 'boolean', text: 'D1 Q6?', correct: false, points: 1, goal_codes: ['S011.13.1-3'] },
          { number: 7, type: 'fill_in_blank', text: 'D1 Q7 ___', accepted: ['cloth', 'fabric', 'material'], points: 1, goal_codes: ['S011.13.1-4'] },
          { number: 8, type: 'fill_in_blank', text: 'D1 Q8 ___', accepted: ['couch', 'sofa', 'settee'], points: 1, goal_codes: ['S011.13.1-4'] },
        ],
      },
      {
        day_number: 2,
        type: 'questions',
        questions: [
          { number: 9,  type: 'mcq', text: 'D2 Q9?',  choices: ['A','B','C','D'], correct: 'A', points: 1, goal_codes: ['S011.13.2-1'] },
          { number: 10, type: 'mcq', text: 'D2 Q10?', choices: ['A','B','C','D'], correct: 'B', points: 1, goal_codes: ['S011.13.2-1'] },
          { number: 11, type: 'mcq', text: 'D2 Q11?', choices: ['A','B','C','D'], correct: 'C', points: 1, goal_codes: ['S011.13.2-2'] },
          { number: 12, type: 'mcq', text: 'D2 Q12?', choices: ['A','B','C','D'], correct: 'D', points: 1, goal_codes: ['S011.13.2-2'] },
          { number: 13, type: 'boolean', text: 'D2 Q13?', correct: true, points: 1, goal_codes: ['S011.13.2-3'] },
          { number: 14, type: 'boolean', text: 'D2 Q14?', correct: false, points: 1, goal_codes: ['S011.13.2-3'] },
          { number: 15, type: 'fill_in_blank', text: 'D2 Q15 ___', accepted: ['shelter', 'refuge', 'haven'], points: 1, goal_codes: ['S011.13.2-4'] },
          { number: 16, type: 'fill_in_blank', text: 'D2 Q16 ___', accepted: ['ancient', 'old', 'aged'], points: 1, goal_codes: ['S011.13.2-4'] },
        ],
      },
      {
        day_number: 3,
        type: 'questions',
        questions: [
          { number: 17, type: 'mcq', text: 'D3 Q17?', choices: ['A','B','C','D'], correct: 'B', points: 1, goal_codes: ['S011.13.3-1'] },
          { number: 18, type: 'mcq', text: 'D3 Q18?', choices: ['A','B','C','D'], correct: 'C', points: 1, goal_codes: ['S011.13.3-1'] },
          { number: 19, type: 'mcq', text: 'D3 Q19?', choices: ['A','B','C','D'], correct: 'A', points: 1, goal_codes: ['S011.13.3-2'] },
          { number: 20, type: 'mcq', text: 'D3 Q20?', choices: ['A','B','C','D'], correct: 'D', points: 1, goal_codes: ['S011.13.3-2'] },
          { number: 21, type: 'boolean', text: 'D3 Q21?', correct: false, points: 1, goal_codes: ['S011.13.3-3'] },
          { number: 22, type: 'boolean', text: 'D3 Q22?', correct: true, points: 1, goal_codes: ['S011.13.3-3'] },
          { number: 23, type: 'fill_in_blank', text: 'D3 Q23 ___', accepted: ['brave', 'courageous', 'bold'], points: 1, goal_codes: ['S011.13.3-4'] },
          { number: 24, type: 'fill_in_blank', text: 'D3 Q24 ___', accepted: ['escape', 'flee', 'run away'], points: 1, goal_codes: ['S011.13.3-4'] },
        ],
      },
    ],
  };

  const items = buildItemsFromMeta('test-assign-id', week13Meta);
  assert.strictEqual(items.length, 24, 'Week 13 should produce exactly 24 items (3 days × 8 questions)');

  // All 24 rows must share the same top-level key set
  const signatures = items.map(keySignature);
  const first = signatures[0];
  assert.ok(
    signatures.every(s => s === first),
    `All 24 Week 13 rows must have identical top-level keys.\nGot:\n${[...new Set(signatures)].join('\n')}`
  );
  assert.strictEqual(
    first,
    'answer_type,assignment_id,dese_codes,goal_codes,item_ref,meta,points',
    'Canonical key set must be exactly 7 keys with no top-level scoring'
  );

  // 6 FIB items: Day 1 Q7,Q8; Day 2 Q15,Q16; Day 3 Q23,Q24
  const fibItems = items.filter(it => it.answer_type === 'constructed');
  assert.strictEqual(fibItems.length, 6, 'Should have exactly 6 FIB (constructed) items');

  for (const fib of fibItems) {
    assert.ok(!('scoring' in fib), `FIB item ${fib.item_ref} must NOT have top-level scoring`);
    assert.ok(fib.meta.scoring, `FIB item ${fib.item_ref} must have meta.scoring`);
    assert.ok(Array.isArray(fib.meta.scoring.keywords) && fib.meta.scoring.keywords.length > 0,
      `FIB item ${fib.item_ref} must have non-empty meta.scoring.keywords`);
    assert.strictEqual(fib.meta.scoring.min_keywords, 1,
      `FIB item ${fib.item_ref} meta.scoring.min_keywords must be 1`);
  }

  // Spot-check specific FIB keyword arrays
  const d1q7 = items.find(it => it.item_ref === '1_7');
  assert.deepStrictEqual(d1q7.meta.scoring.keywords, ['cloth', 'fabric', 'material']);

  const d2q15 = items.find(it => it.item_ref === '2_15');
  assert.deepStrictEqual(d2q15.meta.scoring.keywords, ['shelter', 'refuge', 'haven']);

  const d3q24 = items.find(it => it.item_ref === '3_24');
  assert.deepStrictEqual(d3q24.meta.scoring.keywords, ['escape', 'flee', 'run away']);

  console.log('✓ Test 6 passed: Week 13 integration — 24 items, uniform keys, 6 FIB with meta.scoring');
}

// ── Test 7: written_response question → answer_type='written_response', correct=null ──

{
  const meta = {
    days: [
      {
        day_number: 1,
        type: 'questions',
        questions: [
          { number: 1, type: 'mcq', text: 'Q1?', choices: ['A', 'B', 'C', 'D'], correct: 'B', points: 1 },
          { number: 2, type: 'boolean', text: 'Q2?', correct: 'A', points: 1 },
          {
            number: 25,
            type: 'written_response',
            text: 'WRITING PROMPT: Describe your perfect day.',
            choices: [],
            correct: '',
            hint: '',
            goal_codes: ['S014.12.2'],
            dese_codes: ['MLS: W.1.A.9-12.a'],
            points: 1,
          },
        ],
      },
    ],
  };

  const items = buildItemsFromMeta(531, meta);
  assert.strictEqual(items.length, 3, 'Should produce 3 items');

  const wrItem = items.find(it => it.item_ref === '1_25');
  assert.ok(wrItem, 'Should have item 1_25');
  assert.strictEqual(wrItem.answer_type, 'written_response', 'Q25 answer_type should be written_response');
  assert.strictEqual(wrItem.meta.correct, null, 'Q25 meta.correct should be null (not empty string)');
  assert.strictEqual(wrItem.meta.text, 'WRITING PROMPT: Describe your perfect day.', 'Q25 text preserved');
  assert.deepStrictEqual(wrItem.goal_codes, ['S014.12.2'], 'goal_codes preserved');

  // MCQ item still has correct answer
  const mcqItem = items.find(it => it.item_ref === '1_1');
  assert.strictEqual(mcqItem.answer_type, 'mcq', 'Q1 should still be mcq');
  assert.strictEqual(mcqItem.meta.correct, 'B', 'Q1 correct answer preserved');

  console.log('✓ Test 7 passed: written_response question → answer_type=written_response, correct=null');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\nAll build-items-from-meta tests passed.');
