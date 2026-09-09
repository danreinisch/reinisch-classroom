'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  TARGET_SOURCE_FILE,
  TARGETS,
  buildAssignmentPlan,
  getDay4Days,
  hasDay4WorkInInstanceSettings,
  isDay4Item,
  matchesTargetAssignment,
  trimDay4Meta,
} = require('../netlify/functions/_lib/week2-day4-trim');

function assignment(overrides = {}) {
  return {
    id: 901,
    title: `${TARGETS[2].title} — S001`,
    school_year: 2026,
    meta: {
      source_file: 'WEEK_02_UPLOAD (1).txt',
      class_name: TARGETS[2].className,
      days: [
        { day_number: 1, type: 'questions', questions: [{ number: 1 }] },
        { day_number: 2, type: 'questions', questions: [{ number: 1 }] },
        { day_number: 3, type: 'questions', questions: [{ number: 1 }] },
        { day_number: 4, type: 'writing_prompt', prompt: 'Friday response' },
      ],
      logical_assignment_id: 'keep-me',
    },
    ...overrides,
  };
}

const items = [
  { id: 1, item_ref: '1_1', points: 7, meta: { day: 1 } },
  { id: 2, item_ref: '2_1', points: 7, meta: { day: 2 } },
  { id: 3, item_ref: '3_1', points: 7, meta: { day: 3 } },
  { id: 4, item_ref: 'WP_4', points: 5, meta: { day: 4, type: 'writing_prompt' } },
];

assert.strictEqual(
  TARGET_SOURCE_FILE,
  'WEEK_02_UPLOAD (1).txt',
  'trim must stay locked to the source filename observed in the live Week 2 diagnostic'
);
assert.strictEqual(TARGETS.length, 6, 'scope must stay locked to six intended class groups');
assert.strictEqual(
  TARGETS.reduce((sum, target) => sum + target.expectedCount, 0),
  58,
  'source-of-truth Week 2 upload contains 58 student assignment blocks'
);

assert.strictEqual(matchesTargetAssignment(assignment(), TARGETS[2]), true);
assert.strictEqual(matchesTargetAssignment(
  assignment({ title: 'WEEK 3 — nope' }),
  TARGETS[2]
), false);
assert.strictEqual(matchesTargetAssignment(
  assignment({
    meta: {
      ...assignment().meta,
      source_file: 'WEEK_02_UPLOAD.txt',
    },
  }),
  TARGETS[2]
), false, 'similar Week 2 filename without the observed (1) suffix must not match');
assert.strictEqual(matchesTargetAssignment(
  assignment({
    meta: {
      ...assignment().meta,
      source_file: 'WEEK_03_UPLOAD.txt',
    },
  }),
  TARGETS[2]
), false);

const original = assignment().meta;
const trimmed = trimDay4Meta(original);
assert.strictEqual(trimmed.changed, true);
assert.deepStrictEqual(trimmed.meta.days.map(d => d.day_number), [1, 2, 3]);
assert.strictEqual(trimmed.meta.logical_assignment_id, 'keep-me');
assert.deepStrictEqual(
  original.days.map(d => d.day_number),
  [1, 2, 3, 4],
  'trim helper must not mutate the original assignment meta object'
);
assert.strictEqual(getDay4Days(trimmed.meta).length, 0);

assert.strictEqual(isDay4Item(items[0]), false);
assert.strictEqual(isDay4Item(items[3]), true);

assert.strictEqual(
  hasDay4WorkInInstanceSettings(
    { answers: { '2_1': 'B' }, writing_response: '' },
    ['WP_4'],
    true
  ),
  false,
  'active Day 2 autosave must NOT block the Day 4 trim'
);

assert.strictEqual(
  hasDay4WorkInInstanceSettings(
    { answers: { '2_1': 'B' }, writing_response: 'worked ahead' },
    ['WP_4'],
    true
  ),
  true,
  'saved Day 4 writing must block the trim'
);

let plan = buildAssignmentPlan({
  assignment: assignment(),
  target: TARGETS[2],
  items,
  instances: [
    {
      id: 'inst-1',
      settings: {
        answers: { '1_1': 'A', '2_1': 'B' },
        writing_response: '',
      },
    },
  ],
  submissions: [],
  submissionAnswers: [],
  goalDataPoints: [],
  objectiveDataPoints: [],
  objectiveReviewDispositions: [],
});

assert.strictEqual(plan.eligible, true);
assert.strictEqual(plan.needsMutation, true);
assert.strictEqual(plan.blocked, false);
assert.deepStrictEqual(plan.day4ItemRefs, ['WP_4']);
assert.strictEqual(plan.removedPoints, 5);
assert.strictEqual(plan.remainingPoints, 21);

plan = buildAssignmentPlan({
  assignment: assignment(),
  target: TARGETS[2],
  items,
  instances: [
    {
      id: 'inst-1',
      settings: {
        answers: { '2_1': 'B' },
        writing_response: 'Friday response already started',
      },
    },
  ],
});
assert.ok(plan.blockedReasons.includes('day4_autosave_exists'));

plan = buildAssignmentPlan({
  assignment: assignment(),
  target: TARGETS[2],
  items,
  submissionAnswers: [{ assignment_item_id: 4 }],
});
assert.ok(plan.blockedReasons.includes('day4_submission_answer_exists'));

plan = buildAssignmentPlan({
  assignment: assignment(),
  target: TARGETS[2],
  items,
  goalDataPoints: [{ item_id: 4 }],
});
assert.ok(plan.blockedReasons.includes('day4_goal_evidence_exists'));

plan = buildAssignmentPlan({
  assignment: assignment(),
  target: TARGETS[2],
  items,
  objectiveDataPoints: [{ item_id: 4 }],
});
assert.ok(plan.blockedReasons.includes('day4_objective_evidence_exists'));

plan = buildAssignmentPlan({
  assignment: assignment(),
  target: TARGETS[2],
  items,
  objectiveReviewDispositions: [{ item_id: 4 }],
});
assert.ok(plan.blockedReasons.includes('day4_objective_review_exists'));

plan = buildAssignmentPlan({
  assignment: assignment(),
  target: TARGETS[2],
  items,
  submissions: [
    { review_status: 'finalized', score_manual: null, answers: { '1_1': 'A' } },
  ],
});
assert.ok(plan.blockedReasons.includes('manual_review_state_exists'));

const tsTarget = TARGETS.find(t => t.className === 'Transitional Skills');
const tsAssignment = {
  id: 902,
  title: tsTarget.title,
  school_year: 2026,
  meta: {
    source_file: 'WEEK_02_UPLOAD (1).txt',
    class_name: 'Transitional Skills',
    days: [
      { day_number: 1, type: 'questions' },
      { day_number: 2, type: 'questions' },
      { day_number: 3, type: 'questions' },
    ],
  },
};
plan = buildAssignmentPlan({
  assignment: tsAssignment,
  target: tsTarget,
  items: [
    { id: 11, item_ref: '1_1', points: 1, meta: { day: 1 } },
    { id: 12, item_ref: '2_1', points: 1, meta: { day: 2 } },
    { id: 13, item_ref: '3_1', points: 1, meta: { day: 3 } },
  ],
});
assert.strictEqual(plan.blocked, false);
assert.strictEqual(plan.needsMutation, false);

const endpointSource = fs.readFileSync(
  path.join(__dirname, '..', 'netlify', 'functions', 'teacher-week2-day4-trim.js'),
  'utf8'
);
assert.match(endpointSource, /PRODUCTION_HOSTS/);
assert.match(endpointSource, /freshState = await collectTrimState/);
assert.match(endpointSource, /Day 1–3[\s\S]*autosaves are intentionally ignored/i);
assert.doesNotMatch(
  endpointSource,
  /patchJson\(\s*`assignment_instances/i,
  'trim endpoint must never PATCH assignment_instances'
);
assert.doesNotMatch(
  endpointSource,
  /deleteRows\(\s*`assignment_instances/i,
  'trim endpoint must never DELETE assignment_instances'
);
assert.match(endpointSource, /goal_data_points\?select=id,item_id/);
assert.match(endpointSource, /objective_data_points\?select=id,item_id/);
assert.match(endpointSource, /objective_review_dispositions\?select=id,item_id/);
assert.match(endpointSource, /submission_answers\?select=id,submission_id,assignment_item_id/);

const diagnosticSource = fs.readFileSync(
  path.join(__dirname, '..', 'netlify', 'functions', 'teacher-week2-day4-diagnostic.js'),
  'utf8'
);
assert.doesNotMatch(
  diagnosticSource,
  /method:\s*['"](?:PATCH|POST|DELETE)['"]/i,
  'diagnostic endpoint must remain read-only'
);

const uiSource = fs.readFileSync(
  path.join(__dirname, '..', 'site', 'web', 'week2-day4-trim.js'),
  'utf8'
);
assert.match(uiSource, /Deploy preview: read-only by design/);
assert.match(uiSource, /Student assignment instances updated: 0/);

console.log('week2-day4-trim regression tests passed');
