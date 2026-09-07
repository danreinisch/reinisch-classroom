'use strict';

const assert = require('node:assert/strict');
const {
  buildScoredParentGoalEvidence,
  hasLegacyBlockingConstructedItem,
} = require('../netlify/functions/_lib/scored-parent-goal-evidence');

const mixedItems = [
  {
    id: 101,
    points: 1,
    goal_codes: ['S001.CG1'],
    meta: { text: 'Question one', correct: 'B', choices: ['A', 'B'] },
  },
  {
    id: 102,
    points: 1,
    goal_codes: ['S001.CG1'],
    meta: { text: 'Question two', correct: 'C', choices: ['A', 'B', 'C'] },
  },
  {
    id: 103,
    points: 5,
    goal_codes: ['S001.CG2'],
    answer_type: 'constructed',
    meta: { text: 'Written response' },
  },
];

assert.equal(
  hasLegacyBlockingConstructedItem(mixedItems),
  true,
  'teacher-reviewed constructed work must activate the mixed-assignment repair path'
);
assert.equal(
  hasLegacyBlockingConstructedItem([
    { id: 1, answer_type: 'mcq', meta: { correct: 'A' } },
    { id: 2, answer_type: 'constructed', meta: { correct: '1.00' } },
  ]),
  false,
  'fully auto-scoreable assignments must remain on the existing legacy path'
);

const built = buildScoredParentGoalEvidence({
  items: mixedItems,
  submissionAnswers: [
    {
      assignment_item_id: 101,
      raw_answer: { value: 'B' },
      is_correct: true,
      earned_points: 1,
      max_points: 1,
    },
    {
      assignment_item_id: 102,
      raw_answer: { value: 'A' },
      is_correct: false,
      earned_points: 0,
      max_points: 1,
    },
    {
      assignment_item_id: 103,
      raw_answer: { value: 'Draft awaiting teacher review' },
      is_correct: null,
      earned_points: null,
      max_points: 5,
    },
  ],
  studentId: 'student-1',
  assignmentInstanceId: 'instance-1',
  date: '2026-09-07',
  schoolYear: 2026,
});

assert.deepEqual(
  built.blockedGoalCodes,
  ['S001.CG2'],
  'an unscored constructed response must block only its own mapped goal'
);
assert.equal(
  built.dataPointCandidates.length,
  2,
  'the two scored CG1 questions must still produce item-level evidence'
);
assert.deepEqual(
  built.rollups['S001.CG1'],
  { earned: 1, max: 2 },
  'CG1 must retain its independent scored rollup'
);
assert.equal(
  built.rollups['S001.CG2'],
  undefined,
  'an unscored goal must not receive a fabricated rollup'
);
assert.equal(built.dataPointCandidates[0].score, 100);
assert.equal(built.dataPointCandidates[1].score, 0);

const reviewed = buildScoredParentGoalEvidence({
  items: [
    { id: 201, points: 5, goal_codes: ['S001.CG2'], meta: { text: 'Written response' } },
  ],
  submissionAnswers: [
    {
      assignment_item_id: 201,
      raw_answer: { value: 'Five-sentence response' },
      is_correct: null,
      earned_points: 4,
      max_points: 5,
    },
  ],
  studentId: 'student-1',
  assignmentInstanceId: 'instance-2',
  date: '2026-09-07',
  schoolYear: 2026,
});

assert.deepEqual(reviewed.blockedGoalCodes, []);
assert.deepEqual(reviewed.rollups['S001.CG2'], { earned: 4, max: 5 });
assert.equal(reviewed.dataPointCandidates[0].score, 80);

console.log('✓ mixed assignments preserve scored goal evidence without inventing unscored progress');
