'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running Teacher Review objective evidence writer helper tests...\n'
);

const repoRoot =
  path.resolve(__dirname, '..');

const helperPath =
  path.join(
    repoRoot,
    'netlify',
    'functions',
    '_lib',
    'objective-review-evidence-writer.js'
  );

assert.ok(
  fs.existsSync(helperPath),
  '5B2 RED: review objective writer helper is not implemented yet'
);

const {
  validateReviewObjectiveComponents,
  buildReviewObjectiveEvidenceRows,
} = require(helperPath);

assert.strictEqual(
  typeof validateReviewObjectiveComponents,
  'function',
  '5B2 writer must export validateReviewObjectiveComponents'
);

assert.strictEqual(
  typeof buildReviewObjectiveEvidenceRows,
  'function',
  '5B2 writer must export buildReviewObjectiveEvidenceRows'
);

const mappings = [
  {
    item_id: 701,
    objective_id:
      '11111111-1111-4111-8111-111111111111',
    component_label:
      'Compound sentence',
    objective_max: 1,
    component_order: 1,
  },
  {
    item_id: 701,
    objective_id:
      '22222222-2222-4222-8222-222222222222',
    component_label:
      'Transition word',
    objective_max: 1,
    component_order: 2,
  },
  {
    item_id: 701,
    objective_id:
      '33333333-3333-4333-8333-333333333333',
    component_label:
      'Conclusion sentence',
    objective_max: 1,
    component_order: 3,
  },
  {
    item_id: 701,
    objective_id:
      '44444444-4444-4444-8444-444444444444',
    component_label:
      'Adjective use',
    objective_max: 1,
    component_order: 4,
  },
];

{
  const validated =
    validateReviewObjectiveComponents({
      mappings,
      components: [
        { componentOrder: 1, earned: 1 },
        { componentOrder: 2, earned: 0 },
        { componentOrder: 3, earned: 1 },
        { componentOrder: 4, earned: 1 },
      ],
    });

  assert.deepStrictEqual(
    validated.map(row => ({
      objective_id:
        row.objective_id,
      component_label:
        row.component_label,
      objective_max:
        row.objective_max,
      component_order:
        row.component_order,
      objective_earned:
        row.objective_earned,
    })),
    [
      {
        objective_id:
          '11111111-1111-4111-8111-111111111111',
        component_label:
          'Compound sentence',
        objective_max: 1,
        component_order: 1,
        objective_earned: 1,
      },
      {
        objective_id:
          '22222222-2222-4222-8222-222222222222',
        component_label:
          'Transition word',
        objective_max: 1,
        component_order: 2,
        objective_earned: 0,
      },
      {
        objective_id:
          '33333333-3333-4333-8333-333333333333',
        component_label:
          'Conclusion sentence',
        objective_max: 1,
        component_order: 3,
        objective_earned: 1,
      },
      {
        objective_id:
          '44444444-4444-4444-8444-444444444444',
        component_label:
          'Adjective use',
        objective_max: 1,
        component_order: 4,
        objective_earned: 1,
      },
    ],
    'server-owned mappings must determine objective identity, label, max, and order'
  );

  console.log(
    '✓ complete teacher-entered component set resolves through authoritative mappings'
  );
}

{
  assert.throws(
    () =>
      validateReviewObjectiveComponents({
        mappings,
        components: [
          {
            componentOrder: 1,
            earned: 1,
            objectiveId:
              'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
          { componentOrder: 2, earned: 0 },
          { componentOrder: 3, earned: 1 },
          { componentOrder: 4, earned: 1 },
        ],
      }),
    /objective|identity|browser|caller/i,
    'browser-supplied objective identity must be rejected'
  );

  console.log(
    '✓ browser cannot supply or override objective identity'
  );
}

{
  assert.throws(
    () =>
      validateReviewObjectiveComponents({
        mappings,
        components: [
          { componentOrder: 1, earned: 1 },
          { componentOrder: 2, earned: 0 },
          { componentOrder: 4, earned: 1 },
        ],
      }),
    /complete|missing|component/i,
    'missing mapped component must fail loudly'
  );

  console.log(
    '✓ incomplete mapped component set is rejected'
  );
}

{
  assert.throws(
    () =>
      validateReviewObjectiveComponents({
        mappings,
        components: [
          { componentOrder: 1, earned: 1 },
          { componentOrder: 2, earned: 0 },
          { componentOrder: 2, earned: 1 },
          { componentOrder: 4, earned: 1 },
        ],
      }),
    /duplicate|component|order/i,
    'duplicate component order must fail loudly'
  );

  console.log(
    '✓ duplicate component order is rejected'
  );
}

{
  assert.throws(
    () =>
      validateReviewObjectiveComponents({
        mappings,
        components: [
          { componentOrder: 1, earned: 2 },
          { componentOrder: 2, earned: 0 },
          { componentOrder: 3, earned: 1 },
          { componentOrder: 4, earned: 1 },
        ],
      }),
    /max|range|earned/i,
    'earned value above authoritative objective max must fail'
  );

  console.log(
    '✓ objective earned value cannot exceed server-owned max'
  );
}

{
  const validated =
    validateReviewObjectiveComponents({
      mappings,
      components: [
        { componentOrder: 1, earned: 1 },
        { componentOrder: 2, earned: 0 },
        { componentOrder: 3, earned: 1 },
        { componentOrder: 4, earned: 1 },
      ],
    });

  const rows =
    buildReviewObjectiveEvidenceRows({
      validatedComponents:
        validated,
      studentId:
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      assignmentInstanceId:
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      itemId:
        701,
      questionText:
        'Write one organized paragraph about the topic.',
      studentAnswer:
        'The student wrote a paragraph.',
      teacherNote:
        'Good organization.',
      date:
        '2026-08-23',
      schoolYear:
        '2026-2027',
    });

  assert.strictEqual(
    rows.length,
    4
  );

  for (const row of rows) {
    assert.strictEqual(
      row.student_id,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );

    assert.strictEqual(
      row.assignment_instance_id,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );

    assert.strictEqual(
      row.item_id,
      701
    );

    assert.strictEqual(
      row.question_text,
      'Write one organized paragraph about the topic.'
    );

    assert.strictEqual(
      row.student_answer,
      'The student wrote a paragraph.'
    );

    assert.strictEqual(
      row.notes,
      'Good organization.'
    );

    assert.strictEqual(
      row.evidence_type,
      'written_component'
    );

    assert.strictEqual(
      row.source,
      'assignment'
    );

    assert.strictEqual(
      row.date,
      '2026-08-23'
    );

    assert.strictEqual(
      row.school_year,
      '2026-2027'
    );

    assert.strictEqual(
      row.choices,
      null
    );

    assert.strictEqual(
      row.correct_answer,
      null
    );

    assert.strictEqual(
      row.is_correct,
      null
    );

    assert.ok(
      !Object.prototype.hasOwnProperty.call(
        row,
        'earned_points'
      ),
      'objective evidence must never copy the academic earned_points field'
    );
  }

  assert.strictEqual(
    rows[1].objective_earned,
    0,
    'measured objective zero must remain real evidence'
  );

  console.log(
    '✓ written objective evidence preserves provenance without academic point coupling'
  );
}

console.log('');
console.log(
  'OBJECTIVE REVIEW EVIDENCE WRITER HELPER: PASS'
);
