'use strict';

const assert =
  require('node:assert/strict');

const {
  validateReviewObjectiveOutcomes,
  buildReviewObjectiveOutcomeRows,
} = require(
  '../netlify/functions/_lib/objective-review-evidence-writer'
);

console.log(
  'Running 5E2B mixed objective review outcome helper tests...'
);

const mappings = [
  {
    objective_id:
      '11111111-1111-4111-8111-111111111111',
    component_label:
      'Topic/Claim',
    objective_max:
      1,
    component_order:
      1,
  },
  {
    objective_id:
      '22222222-2222-4222-8222-222222222222',
    component_label:
      'Supporting Details',
    objective_max:
      3,
    component_order:
      2,
  },
  {
    objective_id:
      '33333333-3333-4333-8333-333333333333',
    component_label:
      'Conclusion',
    objective_max:
      1,
    component_order:
      3,
  },
];

const mixed =
  validateReviewObjectiveOutcomes({
    mappings,
    components: [
      {
        componentOrder: 1,
        disposition: 'scored',
        earned: 1,
      },
      {
        componentOrder: 2,
        disposition:
          'not_scorable',
      },
      {
        componentOrder: 3,
        disposition: 'scored',
        earned: 0,
      },
    ],
  });

assert.equal(
  mixed.length,
  3
);

assert.equal(
  mixed[0].disposition,
  'scored'
);

assert.equal(
  mixed[0].objective_earned,
  1
);

assert.equal(
  mixed[1].disposition,
  'not_scorable'
);

assert.equal(
  mixed[1].objective_earned,
  null
);

assert.equal(
  mixed[2].disposition,
  'scored'
);

assert.equal(
  mixed[2].objective_earned,
  0,
  'explicit scored 0 must remain real measured evidence'
);

console.log(
  '✓ mixed scored / Not Scorable / measured-zero set validates'
);

const rows =
  buildReviewObjectiveOutcomeRows({
    validatedOutcomes:
      mixed,
    studentId:
      '44444444-4444-4444-8444-444444444444',
    assignmentInstanceId:
      '55555555-5555-4555-8555-555555555555',
    itemId:
      201,
    questionText:
      'Write one paragraph.',
    studentAnswer:
      {
        value:
          'Student response',
      },
    teacherNote:
      'Teacher note',
    date:
      '2026-08-27',
    schoolYear:
      '2026-2027',
  });

assert.equal(
  rows.length,
  3
);

assert.deepEqual(
  rows[1],
  {
    objective_id:
      '22222222-2222-4222-8222-222222222222',
    disposition:
      'not_scorable',
  },
  'Not Scorable RPC outcome must contain identity/disposition only'
);

assert.equal(
  rows[2].objective_earned,
  0
);

assert.equal(
  rows[2].objective_max,
  1
);

assert.equal(
  rows[2].evidence_type,
  'written_component'
);

console.log(
  '✓ Not Scorable builds no fake evidence payload'
);

assert.throws(
  () =>
    validateReviewObjectiveOutcomes({
      mappings,
      components: [
        {
          componentOrder: 1,
          disposition:
            'not_scorable',
          earned:
            0,
        },
        {
          componentOrder: 2,
          disposition:
            'not_scorable',
        },
        {
          componentOrder: 3,
          disposition:
            'not_scorable',
        },
      ],
    }),
  /must not include an earned value/
);

console.log(
  '✓ Not Scorable cannot smuggle a fake zero'
);

assert.throws(
  () =>
    validateReviewObjectiveOutcomes({
      mappings,
      components: [
        {
          componentOrder: 1,
          disposition:
            'scored',
          earned:
            1,
        },
        {
          componentOrder: 2,
          disposition:
            'not_scorable',
        },
      ],
    }),
  /Complete objective component review is required/
);

console.log(
  '✓ incomplete objective outcome set is rejected'
);

assert.throws(
  () =>
    validateReviewObjectiveOutcomes({
      mappings,
      components: [
        {
          componentOrder: 1,
          disposition:
            'scored',
          earned:
            1,
          objective_id:
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
        {
          componentOrder: 2,
          disposition:
            'not_scorable',
        },
        {
          componentOrder: 3,
          disposition:
            'scored',
          earned:
            1,
        },
      ],
    }),
  /must not supply objective identity/
);

console.log(
  '✓ browser still cannot supply objective identity/max/label'
);

const legacy =
  validateReviewObjectiveOutcomes({
    mappings: [
      mappings[0],
    ],
    components: [
      {
        componentOrder:
          1,
        earned:
          1,
      },
    ],
  });

assert.equal(
  legacy[0].disposition,
  'scored'
);

assert.equal(
  legacy[0].objective_earned,
  1
);

console.log(
  '✓ older cached numeric-only Review clients remain backward compatible'
);

console.log('');
console.log(
  '5E2B MIXED OBJECTIVE OUTCOME HELPER: PASS'
);
