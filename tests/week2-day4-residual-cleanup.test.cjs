'use strict';

const assert = require('assert');

const {
  assessResidualCleanup,
  currentResidualEntries,
  currentResidualItemIds,
  residualSummary,
} = require('../netlify/functions/_lib/teacher-week2-day4-residual-core');

function donePlan(code) {
  return {
    assignmentId: `done-${code}`,
    className: 'Language Arts 1 SC',
    title: `WEEK 2 — done — ${code}`,
    blocked: false,
    blockedReasons: [],
    needsMutation: false,
    day4MetaCount: 0,
    day4ItemCount: 0,
    day4ItemIds: [],
    day4ItemRefs: [],
    removedPoints: 0,
    remainingPoints: 21,
    instanceCount: 1,
  };
}

function residualPlan(code) {
  return {
    assignmentId: `residual-${code}`,
    className: 'Language Arts 1 SC',
    title: `WEEK 2 — A Door Into Time — Chapters 4–6 — ${code}`,
    blocked: false,
    blockedReasons: [],
    needsMutation: true,
    day4MetaCount: 0,
    day4ItemCount: 1,
    day4ItemIds: [`item-${code}`],
    day4ItemRefs: ['WP_4'],
    removedPoints: 5,
    remainingPoints: 21,
    instanceCount: 1,
  };
}

function preservePlan(code, reasons) {
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

const preserves = [
  preservePlan('S023', [
    'day4_autosave_exists',
    'day4_submission_answer_exists',
    'day4_goal_evidence_exists',
    'manual_review_state_exists',
  ]),
  preservePlan('S040', [
    'day4_autosave_exists',
    'day4_submission_answer_exists',
  ]),
  preservePlan('S026', [
    'day4_autosave_exists',
    'day4_submission_answer_exists',
  ]),
];

const completedLanguageArts = Array.from(
  { length: 42 },
  (_, index) => donePlan(`S${String(index + 1).padStart(3, '0')}`)
);
const residuals = [residualPlan('S052'), residualPlan('S053')];
const transitionalSkills = Array.from({ length: 11 }, (_, index) => tsPlan(index + 1));

function stateFrom(plans) {
  return {
    plans,
    entries: plans.map(plan => ({
      assignment: { id: plan.assignmentId, meta: { days: [] } },
      target: { className: plan.className },
      plan,
    })),
    missingTargets: [],
    token: 'residual-token',
  };
}

const liveResidualState = stateFrom([
  ...completedLanguageArts,
  ...residuals,
  ...preserves,
  ...transitionalSkills,
]);

let assessment = assessResidualCleanup(liveResidualState);
assert.strictEqual(assessment.residualReady, true);
assert.strictEqual(assessment.residualPlans.length, 2);
assert.strictEqual(assessment.classification.preservedPlans.length, 3);
assert.strictEqual(assessment.classification.transitionalSkillsPlans.length, 11);
assert.strictEqual(assessment.classification.unexpectedBlockedPlans.length, 0);
assert.deepStrictEqual(
  currentResidualItemIds(liveResidualState).sort(),
  ['item-S052', 'item-S053']
);
assert.strictEqual(currentResidualEntries(liveResidualState).length, 2);

let summary = residualSummary(liveResidualState).summary;
assert.strictEqual(summary.apply_ready, true);
assert.strictEqual(summary.residual_cleanup_ready, true);
assert.strictEqual(summary.residual_cleanup_assignments, 2);
assert.strictEqual(summary.residual_cleanup_items, 2);
assert.strictEqual(summary.assignments_needing_trim, 2);
assert.strictEqual(summary.preserved_day4_assignments, 3);

// If one residual assignment gains genuine Day-4 work between scans, it must
// turn into a preserve case and disappear from the deletion list automatically.
const s052NowPreserved = preservePlan('S052', [
  'day4_autosave_exists',
  'day4_submission_answer_exists',
]);
const oneResidualState = stateFrom([
  ...completedLanguageArts,
  residualPlan('S053'),
  ...preserves,
  s052NowPreserved,
  ...transitionalSkills,
]);
assessment = assessResidualCleanup(oneResidualState);
assert.strictEqual(assessment.residualReady, true);
assert.strictEqual(assessment.residualPlans.length, 1);
assert.strictEqual(assessment.classification.preservedPlans.length, 4);
assert.deepStrictEqual(currentResidualItemIds(oneResidualState), ['item-S053']);

// A manual-review-only blocker is not student Day-4 work and must fail closed.
const manualOnly = {
  ...residualPlan('S052'),
  blocked: true,
  blockedReasons: ['manual_review_state_exists'],
};
const unsafeState = stateFrom([
  ...completedLanguageArts,
  manualOnly,
  residualPlan('S053'),
  ...preserves,
  ...transitionalSkills,
]);
assessment = assessResidualCleanup(unsafeState);
assert.strictEqual(assessment.residualReady, false);
assert.strictEqual(assessment.classification.unexpectedBlockedPlans.length, 1);

// Residual cleanup must never reopen/hide metadata again. If a candidate still
// has Day-4 metadata, the cleanup-only contract is not valid.
const metadataStillPresent = {
  ...residualPlan('S052'),
  day4MetaCount: 1,
};
const wrongShapeState = stateFrom([
  ...completedLanguageArts,
  metadataStillPresent,
  residualPlan('S053'),
  ...preserves,
  ...transitionalSkills,
]);
assessment = assessResidualCleanup(wrongShapeState);
assert.strictEqual(assessment.residualReady, false);

// Once the two ghost items are gone, the normal completed-state contract wins
// and the residual gate must stop offering Apply.
const fullyCompletedState = stateFrom([
  ...completedLanguageArts,
  donePlan('S052'),
  donePlan('S053'),
  ...preserves,
  ...transitionalSkills,
]);
assessment = assessResidualCleanup(fullyCompletedState);
assert.strictEqual(assessment.residualReady, false);
assert.strictEqual(assessment.classification.completedReady, true);

console.log('week2-day4 residual cleanup tests passed');
