'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  EXPECTED_PRESERVED_ASSIGNMENT,
  EXPECTED_SAFE_TRIM_ASSIGNMENTS,
  EXPECTED_THREE_DAY_ASSIGNMENTS,
  EXPECTED_TOTAL_ASSIGNMENTS,
  TARGET_SOURCE_FILE,
  TARGETS,
  buildAssignmentPlan,
  classifyTrimPlans,
  getDay4Days,
  hasDay4WorkInInstanceSettings,
  isDay4Item,
  isExpectedPreservedPlan,
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
assert.strictEqual(EXPECTED_TOTAL_ASSIGNMENTS, 58);
assert.strictEqual(EXPECTED_SAFE_TRIM_ASSIGNMENTS, 46);
assert.strictEqual(EXPECTED_THREE_DAY_ASSIGNMENTS, 11);
assert.strictEqual(EXPECTED_PRESERVED_ASSIGNMENT.studentCode, 'S023');
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

let safePlan = buildAssignmentPlan({
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

assert.strictEqual(safePlan.eligible, true);
assert.strictEqual(safePlan.needsMutation, true);
assert.strictEqual(safePlan.blocked, false);
assert.deepStrictEqual(safePlan.day4ItemRefs, ['WP_4']);
assert.strictEqual(safePlan.removedPoints, 5);
assert.strictEqual(safePlan.remainingPoints, 21);

let plan = buildAssignmentPlan({
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

const preservedPlan = buildAssignmentPlan({
  assignment: assignment({
    id: 923,
    title: EXPECTED_PRESERVED_ASSIGNMENT.title,
  }),
  target: TARGETS[2],
  items,
  instances: [
    {
      id: 'inst-s023',
      settings: {
        answers: { '1_1': 'A', '2_1': 'B', '3_1': 'C' },
        writing_response: 'Completed Friday response',
      },
    },
  ],
  submissions: [
    {
      review_status: 'finalized',
      score_manual: null,
      graded_at: '2026-09-09T15:00:00Z',
      answers: { '1_1': 'A', '2_1': 'B', '3_1': 'C' },
    },
  ],
  submissionAnswers: [{ assignment_item_id: 4 }],
  goalDataPoints: [{ item_id: 4 }],
  objectiveDataPoints: [],
  objectiveReviewDispositions: [],
});

assert.strictEqual(preservedPlan.blocked, true);
assert.strictEqual(isExpectedPreservedPlan(preservedPlan), true);
assert.deepStrictEqual(
  [...preservedPlan.blockedReasons].sort(),
  [...EXPECTED_PRESERVED_ASSIGNMENT.blockedReasons].sort(),
  'S023 preservation must remain locked to the exact observed evidence state'
);
assert.strictEqual(
  isExpectedPreservedPlan({
    ...preservedPlan,
    blockedReasons: [...preservedPlan.blockedReasons, 'day4_objective_evidence_exists'],
  }),
  false,
  'an additional S023 blocker must require a new preview/diagnosis rather than being silently accepted'
);

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
const threeDayPlan = buildAssignmentPlan({
  assignment: tsAssignment,
  target: tsTarget,
  items: [
    { id: 11, item_ref: '1_1', points: 1, meta: { day: 1 } },
    { id: 12, item_ref: '2_1', points: 1, meta: { day: 2 } },
    { id: 13, item_ref: '3_1', points: 1, meta: { day: 3 } },
  ],
});
assert.strictEqual(threeDayPlan.blocked, false);
assert.strictEqual(threeDayPlan.needsMutation, false);

const exactContractPlans = [
  ...Array.from({ length: EXPECTED_SAFE_TRIM_ASSIGNMENTS }, (_, index) => ({
    ...safePlan,
    assignmentId: `safe-${index + 1}`,
  })),
  ...Array.from({ length: EXPECTED_THREE_DAY_ASSIGNMENTS }, (_, index) => ({
    ...threeDayPlan,
    assignmentId: `three-${index + 1}`,
  })),
  preservedPlan,
];

let classification = classifyTrimPlans(exactContractPlans);
assert.strictEqual(classification.applyReady, true);
assert.strictEqual(classification.initialReady, true);
assert.strictEqual(classification.postHideReady, false);
assert.strictEqual(classification.safeTrimPlans.length, 46);
assert.strictEqual(classification.alreadyThreeDayPlans.length, 11);
assert.strictEqual(classification.preservedPlans.length, 1);
assert.strictEqual(classification.unexpectedBlockedPlans.length, 0);

const unexpectedBlockedPlan = {
  ...safePlan,
  assignmentId: 'safe-1',
  blocked: true,
  blockedReasons: ['day4_autosave_exists'],
};
classification = classifyTrimPlans([
  unexpectedBlockedPlan,
  ...exactContractPlans.slice(1),
]);
assert.strictEqual(classification.applyReady, false);
assert.strictEqual(classification.unexpectedBlockedPlans.length, 1);
assert.strictEqual(
  classification.preservedPlans.length,
  1,
  'S023 remains preserved even when another assignment becomes unsafe'
);

// Post-hide transition: zero-item Language Arts assignments become fully
// three-day as soon as metadata is hidden, while assignments with a Day-4
// scoring item still need item deletion. That mixed state must be accepted by
// the internal race-check, but the fully completed state must not be treated
// as another apply-ready starting point.
const postHideLanguageArtsPlans = Array.from(
  { length: EXPECTED_SAFE_TRIM_ASSIGNMENTS },
  (_, index) => {
    const keepsItem = index < 30;
    return {
      ...safePlan,
      assignmentId: `post-hide-${index + 1}`,
      day4MetaCount: 0,
      needsMutation: keepsItem,
      day4ItemCount: keepsItem ? 1 : 0,
      day4ItemIds: keepsItem ? [`item-${index + 1}`] : [],
      day4ItemRefs: keepsItem ? ['WP_4'] : [],
      removedPoints: keepsItem ? 5 : 0,
    };
  }
);
classification = classifyTrimPlans([
  ...postHideLanguageArtsPlans,
  ...Array.from({ length: EXPECTED_THREE_DAY_ASSIGNMENTS }, (_, index) => ({
    ...threeDayPlan,
    assignmentId: `post-hide-ts-${index + 1}`,
  })),
  preservedPlan,
]);
assert.strictEqual(classification.initialReady, false);
assert.strictEqual(classification.postHideReady, true);
assert.strictEqual(classification.applyReady, true);
assert.strictEqual(classification.unexpectedBlockedPlans.length, 0);

const fullyCompletedLanguageArtsPlans = postHideLanguageArtsPlans.map(planRow => ({
  ...planRow,
  needsMutation: false,
  day4ItemCount: 0,
  day4ItemIds: [],
  day4ItemRefs: [],
  removedPoints: 0,
}));
classification = classifyTrimPlans([
  ...fullyCompletedLanguageArtsPlans,
  ...Array.from({ length: EXPECTED_THREE_DAY_ASSIGNMENTS }, (_, index) => ({
    ...threeDayPlan,
    assignmentId: `completed-ts-${index + 1}`,
  })),
  preservedPlan,
]);
assert.strictEqual(classification.initialReady, false);
assert.strictEqual(classification.postHideReady, false);
assert.strictEqual(classification.applyReady, false);

const endpointSource = fs.readFileSync(
  path.join(__dirname, '..', 'netlify', 'functions', '_lib', 'teacher-week2-day4-trim-core.js'),
  'utf8'
);
assert.match(endpointSource, /PRODUCTION_HOSTS/);
assert.match(endpointSource, /freshState = await collectTrimState/);
assert.match(endpointSource, /postHideState = await collectTrimState/);
assert.match(endpointSource, /Day 1–3[\s\S]*autosaves are intentionally ignored/i);
assert.match(
  endpointSource,
  /entry\.plan\.needsMutation && !entry\.plan\.blocked/,
  'apply path must exclude every blocked assignment, including preserved S023'
);
assert.match(
  endpointSource,
  /Metadata was restored; no Day 4 items were deleted/,
  'post-hide race guard must restore metadata before refusing deletion'
);
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
assert.match(uiSource, /PRESERVE: completed Day 4 work\/evidence/);
assert.match(uiSource, /46 safe Language Arts assignments/);
assert.match(uiSource, /Student assignment instances updated/);

console.log('week2-day4-trim regression tests passed');
