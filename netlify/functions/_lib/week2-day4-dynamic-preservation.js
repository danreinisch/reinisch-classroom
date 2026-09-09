'use strict';

const EXPECTED_TOTAL_ASSIGNMENTS = 58;
const EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS = 47;
const EXPECTED_TRANSITIONAL_SKILLS_ASSIGNMENTS = 11;

const DAY4_WORK_REASONS = Object.freeze([
  'day4_autosave_exists',
  'day4_submission_json_exists',
  'day4_submission_answer_exists',
  'day4_goal_evidence_exists',
  'day4_objective_evidence_exists',
  'day4_objective_review_exists',
]);

const PRESERVATION_ALLOWED_REASONS = new Set([
  ...DAY4_WORK_REASONS,
  'manual_review_state_exists',
]);

function hasDay4WorkEvidence(plan) {
  const reasons = Array.isArray(plan && plan.blockedReasons)
    ? plan.blockedReasons.map(String)
    : [];
  return reasons.some(reason => DAY4_WORK_REASONS.includes(reason));
}

function isDynamicPreservedPlan(plan) {
  if (!plan || plan.blocked !== true || plan.needsMutation !== true) {
    return false;
  }

  if (plan.className === 'Transitional Skills') return false;

  const reasons = Array.isArray(plan.blockedReasons)
    ? plan.blockedReasons.map(String)
    : [];

  if (reasons.length === 0 || !hasDay4WorkEvidence(plan)) return false;

  return reasons.every(reason => PRESERVATION_ALLOWED_REASONS.has(reason));
}

function classifyDynamicPlans(plans) {
  const allPlans = Array.isArray(plans) ? plans.filter(Boolean) : [];
  const languageArtsPlans = allPlans.filter(
    plan => plan.className !== 'Transitional Skills'
  );
  const transitionalSkillsPlans = allPlans.filter(
    plan => plan.className === 'Transitional Skills'
  );
  const blockedPlans = allPlans.filter(plan => plan.blocked === true);
  const preservedPlans = blockedPlans.filter(isDynamicPreservedPlan);
  const unexpectedBlockedPlans = blockedPlans.filter(
    plan => !isDynamicPreservedPlan(plan)
  );
  const safeTrimPlans = languageArtsPlans.filter(
    plan => plan.needsMutation === true && plan.blocked !== true
  );
  const alreadyThreeDayPlans = allPlans.filter(
    plan => plan.needsMutation !== true && plan.blocked !== true
  );
  const safeLanguageArtsPlans = languageArtsPlans.filter(
    plan => plan.blocked !== true
  );

  const transitionalSkillsReady = (
    transitionalSkillsPlans.length === EXPECTED_TRANSITIONAL_SKILLS_ASSIGNMENTS &&
    transitionalSkillsPlans.every(
      plan => plan.blocked !== true && plan.needsMutation !== true
    )
  );

  const initialReady = (
    allPlans.length === EXPECTED_TOTAL_ASSIGNMENTS &&
    languageArtsPlans.length === EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS &&
    transitionalSkillsReady &&
    unexpectedBlockedPlans.length === 0 &&
    safeTrimPlans.length + preservedPlans.length ===
      EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS &&
    languageArtsPlans.every(
      plan => isDynamicPreservedPlan(plan) ||
        (plan.blocked !== true && plan.needsMutation === true)
    )
  );

  const postHideReady = (
    allPlans.length === EXPECTED_TOTAL_ASSIGNMENTS &&
    languageArtsPlans.length === EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS &&
    transitionalSkillsReady &&
    unexpectedBlockedPlans.length === 0 &&
    safeLanguageArtsPlans.length + preservedPlans.length ===
      EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS &&
    safeLanguageArtsPlans.every(plan => Number(plan.day4MetaCount) === 0)
  );

  const completedReady = (
    allPlans.length === EXPECTED_TOTAL_ASSIGNMENTS &&
    languageArtsPlans.length === EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS &&
    transitionalSkillsReady &&
    unexpectedBlockedPlans.length === 0 &&
    safeTrimPlans.length === 0 &&
    languageArtsPlans.every(
      plan => isDynamicPreservedPlan(plan) ||
        (plan.blocked !== true && plan.needsMutation !== true)
    )
  );

  return {
    initialReady,
    postHideReady,
    completedReady,
    allPlans,
    languageArtsPlans,
    transitionalSkillsPlans,
    blockedPlans,
    preservedPlans,
    unexpectedBlockedPlans,
    safeTrimPlans,
    alreadyThreeDayPlans,
    safeLanguageArtsPlans,
  };
}

function publicPlan(plan) {
  return {
    assignment_id: plan.assignmentId,
    class_name: plan.className,
    title: plan.title,
    needs_mutation: plan.needsMutation,
    blocked: plan.blocked,
    preserved: isDynamicPreservedPlan(plan),
    blocked_reasons: Array.isArray(plan.blockedReasons)
      ? plan.blockedReasons
      : [],
    day4_meta_sections: plan.day4MetaCount,
    day4_items: plan.day4ItemCount,
    removed_points: plan.removedPoints,
    remaining_points: plan.remainingPoints,
    student_instances: plan.instanceCount,
  };
}

function summarizeDynamicState(state, previewToken) {
  const classification = classifyDynamicPlans(state && state.plans);
  const missingTargets = Array.isArray(state && state.missingTargets)
    ? state.missingTargets
    : [];

  return {
    classification,
    summary: {
      target_groups: 6,
      matched_assignments: classification.allPlans.length,
      total_day4_assignments:
        classification.safeTrimPlans.length + classification.preservedPlans.length,
      assignments_needing_trim: classification.safeTrimPlans.length,
      preserved_day4_assignments: classification.preservedPlans.length,
      already_three_day: classification.alreadyThreeDayPlans.length,
      transitional_skills_three_day:
        classification.transitionalSkillsPlans.filter(
          plan => plan.blocked !== true && plan.needsMutation !== true
        ).length,
      blocked_assignments: classification.blockedPlans.length,
      unexpected_blocked_assignments:
        classification.unexpectedBlockedPlans.length,
      apply_ready:
        missingTargets.length === 0 && classification.initialReady,
      completed_state:
        missingTargets.length === 0 && classification.completedReady,
      missing_targets: missingTargets,
      plans: classification.allPlans.map(publicPlan),
      preview_token: previewToken,
    },
  };
}

module.exports = {
  DAY4_WORK_REASONS,
  EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS,
  EXPECTED_TOTAL_ASSIGNMENTS,
  EXPECTED_TRANSITIONAL_SKILLS_ASSIGNMENTS,
  classifyDynamicPlans,
  hasDay4WorkEvidence,
  isDynamicPreservedPlan,
  publicPlan,
  summarizeDynamicState,
};
