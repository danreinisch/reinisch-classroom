'use strict';

const assert = require('assert');

const {
  DAY4_WORK_REASONS,
  EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS,
  EXPECTED_TOTAL_ASSIGNMENTS,
  EXPECTED_TRANSITIONAL_SKILLS_ASSIGNMENTS,
  classifyDynamicPlans,
  hasDay4WorkEvidence,
  isDynamicPreservedPlan,
  summarizeDynamicState,
} = require('../netlify/functions/_lib/week2-day4-dynamic-preservation');

function safePlan(index) {
  return {
    assignmentId: `safe-${index}`,
    className: 'Language Arts 2 SC',
    title: `WEEK 2 — Escape from Camp 14 — Chapters 2–4 — S${String(index).padStart(3, '0')}`,
    blocked: false,
    blockedReasons: [],
    needsMutation: true,
    day4MetaCount: 1,
    day4ItemCount: 1,
    day4ItemIds: [`item-${index}`],
    day4ItemRefs: ['WP_4'],
    removedPoints: 5,
    remainingPoints: 21,
    instanceCount: 1,
  };
}

function preservedPlan(code, reasons) {
  return {
    assignmentId: `preserve-${code}`,
    className: code === 'S023' ? 'Language Arts 3 SC' : 'Language Arts 2 SC',
    title: `WEEK 2 — preserved — ${code}`,
    blocked: true,
    blockedReasons: reasons,
    needsMutation: true,
    day4MetaCount: 1,
    day4ItemCount: 1,
    day4ItemIds: [`item-${code}`],
    day4ItemRefs: ['WP_4'],
    removedPoints: 5,
    remainingPoints: 21,
    instanceCount: 1,
  };
}

function tsPlan(index) {
  return {
    assignmentId: `ts-${index}`,
    className: 'Transitional Skills',
    title: `WEEK 2 — Transitional Skills — S${String(index).padStart(3, '0')}`,
    blocked: false,
    blockedReasons: [],
    needsMutation: false,
    day4MetaCount: 0,
    day4ItemCount: 0,
    day4ItemIds: [],
    day4ItemRefs: [],
    removedPoints: 0,
    remainingPoints: 3,
    instanceCount: 1,
  };
}

assert.strictEqual(EXPECTED_TOTAL_ASSIGNMENTS, 58);
assert.strictEqual(EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS, 47);
assert.strictEqual(EXPECTED_TRANSITIONAL_SKILLS_ASSIGNMENTS, 11);
assert.ok(DAY4_WORK_REASONS.includes('day4_autosave_exists'));
assert.ok(DAY4_WORK_REASONS.includes('day4_submission_answer_exists'));

const s023 = preservedPlan('S023', [
  'day4_autosave_exists',
  'day4_submission_answer_exists',
  'day4_goal_evidence_exists',
  'manual_review_state_exists',
]);
const s040 = preservedPlan('S040', [
  'day4_autosave_exists',
  'day4_submission_answer_exists',
]);

assert.strictEqual(hasDay4WorkEvidence(s023), true);
assert.strictEqual(hasDay4WorkEvidence(s040), true);
assert.strictEqual(isDynamicPreservedPlan(s023), true);
assert.strictEqual(isDynamicPreservedPlan(s040), true);

const manualOnly = preservedPlan('S099', ['manual_review_state_exists']);
assert.strictEqual(hasDay4WorkEvidence(manualOnly), false);
assert.strictEqual(isDynamicPreservedPlan(manualOnly), false);

const unknownBlocker = preservedPlan('S098', [
  'day4_autosave_exists',
  'mystery_blocker',
]);
assert.strictEqual(isDynamicPreservedPlan(unknownBlocker), false);

const twoPreserves = [
  ...Array.from({ length: 45 }, (_, index) => safePlan(index + 1)),
  s023,
  s040,
  ...Array.from({ length: 11 }, (_, index) => tsPlan(index + 1)),
];
let classification = classifyDynamicPlans(twoPreserves);
assert.strictEqual(classification.initialReady, true);
assert.strictEqual(classification.safeTrimPlans.length, 45);
assert.strictEqual(classification.preservedPlans.length, 2);
assert.strictEqual(classification.transitionalSkillsPlans.length, 11);
assert.strictEqual(classification.unexpectedBlockedPlans.length, 0);

let summary = summarizeDynamicState(
  { plans: twoPreserves, missingTargets: [] },
  'token-45-2'
).summary;
assert.strictEqual(summary.apply_ready, true);
assert.strictEqual(summary.assignments_needing_trim, 45);
assert.strictEqual(summary.preserved_day4_assignments, 2);
assert.strictEqual(summary.transitional_skills_three_day, 11);
assert.strictEqual(summary.preview_token, 'token-45-2');

const thirdPreserve = preservedPlan('S041', ['day4_autosave_exists']);
const threePreserves = [
  ...Array.from({ length: 44 }, (_, index) => safePlan(index + 1)),
  s023,
  s040,
  thirdPreserve,
  ...Array.from({ length: 11 }, (_, index) => tsPlan(index + 1)),
];
classification = classifyDynamicPlans(threePreserves);
assert.strictEqual(classification.initialReady, true);
assert.strictEqual(classification.safeTrimPlans.length, 44);
assert.strictEqual(classification.preservedPlans.length, 3);
assert.strictEqual(classification.unexpectedBlockedPlans.length, 0);

const withUnexpected = [...twoPreserves];
withUnexpected[0] = {
  ...withUnexpected[0],
  blocked: true,
  blockedReasons: ['manual_review_state_exists'],
};
classification = classifyDynamicPlans(withUnexpected);
assert.strictEqual(classification.initialReady, false);
assert.strictEqual(classification.unexpectedBlockedPlans.length, 1);

const postHide = twoPreserves.map(plan => {
  if (plan.blocked || plan.className === 'Transitional Skills') return plan;
  const keepsItem = Number(plan.assignmentId.split('-')[1]) <= 30;
  return {
    ...plan,
    day4MetaCount: 0,
    needsMutation: keepsItem,
    day4ItemCount: keepsItem ? 1 : 0,
    day4ItemIds: keepsItem ? plan.day4ItemIds : [],
    day4ItemRefs: keepsItem ? ['WP_4'] : [],
  };
});
classification = classifyDynamicPlans(postHide);
assert.strictEqual(classification.initialReady, false);
assert.strictEqual(classification.postHideReady, true);
assert.strictEqual(classification.preservedPlans.length, 2);

const completed = postHide.map(plan => {
  if (plan.blocked || plan.className === 'Transitional Skills') return plan;
  return {
    ...plan,
    needsMutation: false,
    day4ItemCount: 0,
    day4ItemIds: [],
    day4ItemRefs: [],
  };
});
classification = classifyDynamicPlans(completed);
assert.strictEqual(classification.completedReady, true);
assert.strictEqual(classification.safeTrimPlans.length, 0);
assert.strictEqual(classification.preservedPlans.length, 2);

console.log('week2-day4 dynamic preservation tests passed');
