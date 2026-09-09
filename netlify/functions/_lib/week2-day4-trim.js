'use strict';

const TARGET_SCHOOL_YEAR = 2026;
const TARGET_SOURCE_FILE = 'WEEK_02_UPLOAD (1).txt';
const TARGET_DAY_NUMBER = 4;

const TARGETS = Object.freeze([
  {
    className: 'Language Arts 1 SC',
    title: 'WEEK 2 — A Door Into Time — Chapters 4–6',
    expectedCount: 17,
  },
  {
    className: 'Language Arts 2 SC',
    title: 'WEEK 2 — Escape from Camp 14 — Chapters 2–4',
    expectedCount: 11,
  },
  {
    className: 'Language Arts 3 SC',
    title: 'WEEK 2 — 1984 — Truth, Language & Memory',
    expectedCount: 8,
  },
  {
    className: 'Language Arts 4 SC',
    title: 'WEEK 2 — Seeker — Chapters 4–6',
    expectedCount: 6,
  },
  {
    className: 'Life Skills Language Arts SC',
    title: 'WEEK 2 — Return from Kragdon-ah — Chapters 4–6',
    expectedCount: 5,
  },
  {
    className: 'Transitional Skills',
    title: 'WEEK 2 — Transitional Skills — Reading Simple Job Postings',
    expectedCount: 11,
  },
]);

const EXPECTED_TOTAL_ASSIGNMENTS = 58;
const EXPECTED_SAFE_TRIM_ASSIGNMENTS = 46;
const EXPECTED_THREE_DAY_ASSIGNMENTS = 11;
const EXPECTED_PRESERVED_ASSIGNMENTS = 1;

const EXPECTED_PRESERVED_ASSIGNMENT = Object.freeze({
  className: 'Language Arts 3 SC',
  title: 'WEEK 2 — 1984 — Truth, Language & Memory — S023',
  studentCode: 'S023',
  day4MetaCount: 1,
  day4ItemCount: 1,
  day4ItemRefs: Object.freeze(['WP_4']),
  removedPoints: 5,
  blockedReasons: Object.freeze([
    'day4_autosave_exists',
    'day4_submission_answer_exists',
    'day4_goal_evidence_exists',
    'manual_review_state_exists',
  ]),
});

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeInteger(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function getDay4Days(meta) {
  if (!meta || !Array.isArray(meta.days)) return [];
  return meta.days.filter(
    day => normalizeInteger(day && day.day_number) === TARGET_DAY_NUMBER
  );
}

function trimDay4Meta(meta) {
  if (!meta || !Array.isArray(meta.days)) {
    return { changed: false, meta: cloneJson(meta) };
  }

  const next = cloneJson(meta);
  const before = next.days.length;
  next.days = next.days.filter(
    day => normalizeInteger(day && day.day_number) !== TARGET_DAY_NUMBER
  );

  return {
    changed: next.days.length !== before,
    meta: next,
  };
}

function isDay4Item(item) {
  if (!item || typeof item !== 'object') return false;

  const metaDay =
    item.meta &&
    typeof item.meta === 'object'
      ? normalizeInteger(item.meta.day)
      : null;

  if (metaDay === TARGET_DAY_NUMBER) return true;

  const ref = String(item.item_ref || '').trim();
  return ref === 'WP_4' || /^4_\d+$/.test(ref);
}

function day4Items(items) {
  return (Array.isArray(items) ? items : []).filter(isDay4Item);
}

function day4ItemRefs(items) {
  return day4Items(items)
    .map(item => String(item.item_ref || '').trim())
    .filter(Boolean);
}

function isNonBlank(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(isNonBlank);
  if (typeof value === 'object') return Object.values(value).some(isNonBlank);
  return true;
}

function objectHasDay4Ref(obj, refs) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const refSet = new Set(Array.isArray(refs) ? refs : []);
  return Object.entries(obj).some(
    ([key, value]) => refSet.has(String(key)) && isNonBlank(value)
  );
}

function hasDay4WorkInInstanceSettings(settings, refs, hasWritingPrompt) {
  if (!settings || typeof settings !== 'object') return false;

  if (objectHasDay4Ref(settings.answers, refs)) return true;

  if (hasWritingPrompt && isNonBlank(settings.writing_response)) {
    return true;
  }

  const retry =
    settings.retry_config &&
    typeof settings.retry_config === 'object'
      ? settings.retry_config
      : null;

  if (retry && objectHasDay4Ref(retry.original_answers, refs)) return true;

  return false;
}

function hasDay4WorkInSubmissionAnswers(answers, refs) {
  return objectHasDay4Ref(answers, refs);
}

function matchesTargetAssignment(assignment, target) {
  if (!assignment || !target) return false;

  const year = normalizeInteger(assignment.school_year);
  if (year !== TARGET_SCHOOL_YEAR) return false;

  const assignmentTitle = String(assignment.title || '').trim();
  const targetTitle = String(target.title || '').trim();
  const titleMatches =
    assignmentTitle === targetTitle ||
    (
      assignmentTitle.startsWith(`${targetTitle} — S`) &&
      /^S\d{3}$/.test(
        assignmentTitle.slice(`${targetTitle} — `.length)
      )
    );

  if (!titleMatches) return false;

  const meta = assignment.meta;
  if (!meta || typeof meta !== 'object') return false;

  if (String(meta.source_file || '') !== TARGET_SOURCE_FILE) return false;

  if (
    meta.class_name &&
    String(meta.class_name) !== target.className
  ) {
    return false;
  }

  return Array.isArray(meta.days);
}

function rowItemId(row) {
  if (!row || typeof row !== 'object') return null;
  const raw =
    row.assignment_item_id != null
      ? row.assignment_item_id
      : row.item_id;
  return raw == null ? null : String(raw);
}

function isManualReviewState(submission) {
  if (!submission || typeof submission !== 'object') return false;
  if (submission.score_manual != null) return true;
  if (submission.graded_at) return true;

  const reviewStatus = String(submission.review_status || '').toLowerCase();
  return (
    reviewStatus === 'in_progress' ||
    reviewStatus === 'reviewed' ||
    reviewStatus === 'finalized' ||
    reviewStatus === 'returned'
  );
}

function buildAssignmentPlan({
  assignment,
  target,
  items = [],
  instances = [],
  submissions = [],
  submissionAnswers = [],
  goalDataPoints = [],
  objectiveDataPoints = [],
  objectiveReviewDispositions = [],
}) {
  if (!matchesTargetAssignment(assignment, target)) {
    return {
      assignmentId: assignment && assignment.id != null ? String(assignment.id) : null,
      eligible: false,
      needsMutation: false,
      blocked: true,
      blockedReasons: ['target_identity_mismatch'],
    };
  }

  const d4Days = getDay4Days(assignment.meta);
  const d4Items = day4Items(items);
  const d4Ids = d4Items
    .map(item => item && item.id != null ? String(item.id) : null)
    .filter(Boolean);
  const d4Refs = d4Items
    .map(item => String(item.item_ref || '').trim())
    .filter(Boolean);

  const hasWritingPrompt =
    d4Days.some(day => String(day && day.type || '').toLowerCase() === 'writing_prompt') ||
    d4Refs.includes('WP_4');

  const d4IdSet = new Set(d4Ids);
  const blockedReasons = [];

  const instanceDay4Work = (Array.isArray(instances) ? instances : []).filter(
    instance => hasDay4WorkInInstanceSettings(
      instance && instance.settings,
      d4Refs,
      hasWritingPrompt
    )
  );

  if (instanceDay4Work.length > 0) {
    blockedReasons.push('day4_autosave_exists');
  }

  const submissionJsonDay4Work = (Array.isArray(submissions) ? submissions : []).filter(
    submission => hasDay4WorkInSubmissionAnswers(
      submission && submission.answers,
      d4Refs
    )
  );

  if (submissionJsonDay4Work.length > 0) {
    blockedReasons.push('day4_submission_json_exists');
  }

  const normalizedDay4Answers = (Array.isArray(submissionAnswers) ? submissionAnswers : []).filter(
    row => {
      const id = rowItemId(row);
      return id != null && d4IdSet.has(id);
    }
  );

  if (normalizedDay4Answers.length > 0) {
    blockedReasons.push('day4_submission_answer_exists');
  }

  const day4GoalEvidence = (Array.isArray(goalDataPoints) ? goalDataPoints : []).filter(
    row => {
      const id = rowItemId(row);
      return id != null && d4IdSet.has(id);
    }
  );

  if (day4GoalEvidence.length > 0) {
    blockedReasons.push('day4_goal_evidence_exists');
  }

  const day4ObjectiveEvidence = (Array.isArray(objectiveDataPoints) ? objectiveDataPoints : []).filter(
    row => {
      const id = rowItemId(row);
      return id != null && d4IdSet.has(id);
    }
  );

  if (day4ObjectiveEvidence.length > 0) {
    blockedReasons.push('day4_objective_evidence_exists');
  }

  const day4ObjectiveDispositions = (
    Array.isArray(objectiveReviewDispositions)
      ? objectiveReviewDispositions
      : []
  ).filter(row => {
    const id = rowItemId(row);
    return id != null && d4IdSet.has(id);
  });

  if (day4ObjectiveDispositions.length > 0) {
    blockedReasons.push('day4_objective_review_exists');
  }

  const manuallyReviewed = (Array.isArray(submissions) ? submissions : [])
    .filter(isManualReviewState);

  if (manuallyReviewed.length > 0) {
    blockedReasons.push('manual_review_state_exists');
  }

  const removedPoints = d4Items.reduce(
    (sum, item) => sum + (Number(item && item.points) || 0),
    0
  );

  const remainingPoints = (Array.isArray(items) ? items : [])
    .filter(item => !isDay4Item(item))
    .reduce(
      (sum, item) => sum + (Number(item && item.points) || 0),
      0
    );

  const needsMutation = d4Days.length > 0 || d4Items.length > 0;

  return {
    assignmentId: String(assignment.id),
    className: target.className,
    title: String(assignment.title || target.title),
    eligible: true,
    needsMutation,
    blocked: blockedReasons.length > 0,
    blockedReasons,
    day4MetaCount: d4Days.length,
    day4ItemIds: d4Ids,
    day4ItemRefs: d4Refs,
    day4ItemCount: d4Items.length,
    removedPoints,
    remainingPoints,
    hasWritingPrompt,
    instanceCount: Array.isArray(instances) ? instances.length : 0,
    day4AutosaveCount: instanceDay4Work.length,
    day4SubmissionJsonCount: submissionJsonDay4Work.length,
    day4SubmissionAnswerCount: normalizedDay4Answers.length,
    day4GoalEvidenceCount: day4GoalEvidence.length,
    day4ObjectiveEvidenceCount: day4ObjectiveEvidence.length,
    day4ObjectiveReviewCount: day4ObjectiveDispositions.length,
    manualReviewCount: manuallyReviewed.length,
  };
}

function sameStringSet(actual, expected) {
  const a = [...new Set(Array.isArray(actual) ? actual.map(String) : [])].sort();
  const b = [...new Set(Array.isArray(expected) ? expected.map(String) : [])].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isExpectedPreservedPlan(plan) {
  if (!plan || plan.blocked !== true || plan.needsMutation !== true) return false;

  return (
    plan.className === EXPECTED_PRESERVED_ASSIGNMENT.className &&
    plan.title === EXPECTED_PRESERVED_ASSIGNMENT.title &&
    Number(plan.day4MetaCount) === EXPECTED_PRESERVED_ASSIGNMENT.day4MetaCount &&
    Number(plan.day4ItemCount) === EXPECTED_PRESERVED_ASSIGNMENT.day4ItemCount &&
    Number(plan.removedPoints) === EXPECTED_PRESERVED_ASSIGNMENT.removedPoints &&
    sameStringSet(plan.day4ItemRefs, EXPECTED_PRESERVED_ASSIGNMENT.day4ItemRefs) &&
    sameStringSet(plan.blockedReasons, EXPECTED_PRESERVED_ASSIGNMENT.blockedReasons)
  );
}

function classifyTrimPlans(plans) {
  const safePlans = Array.isArray(plans) ? plans : [];
  const blockedPlans = safePlans.filter(plan => plan && plan.blocked === true);
  const preservedPlans = blockedPlans.filter(isExpectedPreservedPlan);
  const unexpectedBlockedPlans = blockedPlans.filter(
    plan => !isExpectedPreservedPlan(plan)
  );
  const safeTrimPlans = safePlans.filter(
    plan => plan && plan.needsMutation === true && plan.blocked !== true
  );
  const alreadyThreeDayPlans = safePlans.filter(
    plan => plan && plan.needsMutation !== true && plan.blocked !== true
  );
  const safeLanguageArtsPlans = safePlans.filter(
    plan =>
      plan &&
      plan.blocked !== true &&
      plan.className !== 'Transitional Skills'
  );
  const transitionalSkillsPlans = safePlans.filter(
    plan =>
      plan &&
      plan.blocked !== true &&
      plan.className === 'Transitional Skills'
  );

  const initialReady = (
    safePlans.length === EXPECTED_TOTAL_ASSIGNMENTS &&
    safeTrimPlans.length === EXPECTED_SAFE_TRIM_ASSIGNMENTS &&
    alreadyThreeDayPlans.length === EXPECTED_THREE_DAY_ASSIGNMENTS &&
    preservedPlans.length === EXPECTED_PRESERVED_ASSIGNMENTS &&
    unexpectedBlockedPlans.length === 0
  );

  // During Apply, Day 4 metadata is hidden from all 46 safe Language Arts
  // assignments before item deletion. Assignments that never had a Day-4
  // scoring item immediately become three-day at that point, while others
  // still report needsMutation because their Day-4 item remains. This exact
  // transition shape is safe only while at least one Day-4 item still exists;
  // the fully completed state therefore does not masquerade as apply-ready.
  const postHideReady = (
    safePlans.length === EXPECTED_TOTAL_ASSIGNMENTS &&
    preservedPlans.length === EXPECTED_PRESERVED_ASSIGNMENTS &&
    unexpectedBlockedPlans.length === 0 &&
    safeLanguageArtsPlans.length === EXPECTED_SAFE_TRIM_ASSIGNMENTS &&
    transitionalSkillsPlans.length === EXPECTED_THREE_DAY_ASSIGNMENTS &&
    transitionalSkillsPlans.every(plan => plan.needsMutation !== true) &&
    safeLanguageArtsPlans.every(plan => Number(plan.day4MetaCount) === 0) &&
    safeLanguageArtsPlans.some(plan => plan.needsMutation === true)
  );

  return {
    applyReady: initialReady || postHideReady,
    initialReady,
    postHideReady,
    blockedPlans,
    preservedPlans,
    unexpectedBlockedPlans,
    safeTrimPlans,
    alreadyThreeDayPlans,
  };
}

module.exports = {
  EXPECTED_PRESERVED_ASSIGNMENT,
  EXPECTED_PRESERVED_ASSIGNMENTS,
  EXPECTED_SAFE_TRIM_ASSIGNMENTS,
  EXPECTED_THREE_DAY_ASSIGNMENTS,
  EXPECTED_TOTAL_ASSIGNMENTS,
  TARGET_DAY_NUMBER,
  TARGET_SCHOOL_YEAR,
  TARGET_SOURCE_FILE,
  TARGETS,
  buildAssignmentPlan,
  classifyTrimPlans,
  day4ItemRefs,
  getDay4Days,
  hasDay4WorkInInstanceSettings,
  hasDay4WorkInSubmissionAnswers,
  isDay4Item,
  isExpectedPreservedPlan,
  isNonBlank,
  matchesTargetAssignment,
  sameStringSet,
  trimDay4Meta,
};
