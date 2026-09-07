'use strict';

const {
  reconcileAssignmentGoalProgress,
  reconcileAssignmentGoalDataPoints,
} = require('./assignment-evidence-reconciliation');

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function answerText(rawAnswer) {
  if (rawAnswer && typeof rawAnswer === 'object' && Object.prototype.hasOwnProperty.call(rawAnswer, 'value')) {
    const value = rawAnswer.value;
    return value === null || value === undefined ? null : String(value);
  }
  return rawAnswer === null || rawAnswer === undefined ? null : String(rawAnswer);
}

function goalCodesFor(item) {
  return [...new Set(Array.isArray(item?.goal_codes) ? item.goal_codes.filter(Boolean).map(String) : [])];
}

/**
 * Mirrors the legacy student-submit-answer Step 8 assignment-wide gate.
 *
 * The mixed-goal reconciler exists only to repair the hole created by this
 * gate. Fully auto-scoreable assignments continue through the existing
 * legacy path so we do not double-write or broaden this change unnecessarily.
 */
function hasLegacyBlockingConstructedItem(items) {
  return (Array.isArray(items) ? items : []).some((item) => {
    if (item?.answer_type !== 'constructed') return false;
    const meta = item?.meta && typeof item.meta === 'object' ? item.meta : {};
    const hasKeywords =
      (meta.scoring && Array.isArray(meta.scoring.keywords) && meta.scoring.keywords.length > 0) ||
      Array.isArray(meta.correct);
    const hasExactMatch = typeof meta.correct === 'string';
    return !hasKeywords && !hasExactMatch;
  });
}

/**
 * Build exact item-level parent evidence and per-goal rollups from the scored
 * submission answers that already exist in memory.
 *
 * Important mixed-assignment rule:
 * an unscored item blocks only the goal(s) mapped to that item. It must not
 * suppress valid evidence for unrelated auto-scored goals in the same
 * assignment.
 */
function buildScoredParentGoalEvidence({
  items,
  submissionAnswers,
  studentId,
  assignmentInstanceId,
  date,
  schoolYear,
}) {
  const answers = new Map(
    (Array.isArray(submissionAnswers) ? submissionAnswers : [])
      .filter((row) => row?.assignment_item_id !== null && row?.assignment_item_id !== undefined)
      .map((row) => [String(row.assignment_item_id), row])
  );

  const dataPointCandidates = [];
  const rollups = new Map();
  const blocked = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const codes = goalCodesFor(item);
    if (!codes.length || item?.id === null || item?.id === undefined) continue;

    const answer = answers.get(String(item.id));
    const earned = finite(answer?.earned_points);
    const max = finite(answer?.max_points) ?? finite(item?.points);

    if (!answer || earned === null || max === null || max <= 0) {
      codes.forEach((code) => blocked.add(code));
      continue;
    }

    const score = Math.round((earned / max) * 10000) / 100;
    const meta = item?.meta && typeof item.meta === 'object' ? item.meta : {};

    for (const goalCode of codes) {
      const current = rollups.get(goalCode) || { earned: 0, max: 0 };
      current.earned += earned;
      current.max += max;
      rollups.set(goalCode, current);

      dataPointCandidates.push({
        goal_code: goalCode,
        student_id: studentId,
        assignment_instance_id: assignmentInstanceId,
        item_id: item.id,
        question_text: meta.text ?? meta.prompt ?? null,
        choices: Array.isArray(meta.choices) ? meta.choices : null,
        student_answer: answerText(answer.raw_answer),
        correct_answer: meta.correct == null ? null : String(meta.correct),
        is_correct: typeof answer.is_correct === 'boolean' ? answer.is_correct : null,
        score,
        date,
        source: 'assignment',
        school_year: schoolYear,
      });
    }
  }

  return {
    dataPointCandidates,
    rollups: Object.fromEntries(rollups),
    blockedGoalCodes: [...blocked],
  };
}

async function fetchActiveGoals({ goalCodes, studentId, supabaseUrl, serviceRoleKey, fetchImpl = global.fetch }) {
  const codes = [...new Set(goalCodes.filter(Boolean).map(String))];
  if (!codes.length) return [];
  const encoded = codes.map(encodeURIComponent).join(',');
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/goals?student_id=eq.${encodeURIComponent(studentId)}` +
      `&code=in.(${encoded})&active=eq.true&or=(status.is.null,status.not.in.(closed,archived,Closed,Archived))&select=id,code`,
    {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!response.ok) throw new Error(`Active goal lookup failed: ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function reconcileScoredParentGoalEvidence({
  items,
  submissionAnswers,
  studentId,
  assignmentInstanceId,
  date,
  schoolYear,
  supabaseUrl,
  serviceRoleKey,
  fetchImpl = global.fetch,
}) {
  if (!hasLegacyBlockingConstructedItem(items)) {
    return {
      data_points: 0,
      progress: 0,
      blocked_goal_codes: [],
      handled_mixed_assignment: false,
    };
  }

  const built = buildScoredParentGoalEvidence({
    items,
    submissionAnswers,
    studentId,
    assignmentInstanceId,
    date,
    schoolYear,
  });

  const codes = [
    ...new Set([
      ...built.dataPointCandidates.map((row) => row.goal_code),
      ...Object.keys(built.rollups),
    ]),
  ];
  if (!codes.length) {
    return {
      data_points: 0,
      progress: 0,
      blocked_goal_codes: built.blockedGoalCodes,
      handled_mixed_assignment: true,
    };
  }

  const goals = await fetchActiveGoals({
    goalCodes: codes,
    studentId,
    supabaseUrl,
    serviceRoleKey,
    fetchImpl,
  });
  const goalIdByCode = new Map(goals.map((goal) => [String(goal.code), goal.id]));

  const rows = built.dataPointCandidates
    .map(({ goal_code, ...row }) => {
      const goalId = goalIdByCode.get(goal_code);
      return goalId ? { ...row, goal_id: goalId } : null;
    })
    .filter(Boolean);

  let dataPointCount = 0;
  if (rows.length) {
    const results = await reconcileAssignmentGoalDataPoints({
      rows,
      supabaseUrl,
      serviceRoleKey,
      fetchImpl,
    });
    dataPointCount = Array.isArray(results) ? results.length : rows.length;
  }

  const blocked = new Set(built.blockedGoalCodes);
  let progressCount = 0;
  for (const [goalCode, rollup] of Object.entries(built.rollups)) {
    if (blocked.has(goalCode) || !(rollup.max > 0)) continue;
    const goalId = goalIdByCode.get(goalCode);
    if (!goalId) continue;
    const value = Math.round((rollup.earned / rollup.max) * 10000) / 100;
    await reconcileAssignmentGoalProgress({
      row: {
        goal_id: goalId,
        student_id: studentId,
        date,
        value,
        source: 'assignment',
        collected_by: 'auto',
        assignment_instance_id: assignmentInstanceId,
        school_year: schoolYear,
      },
      supabaseUrl,
      serviceRoleKey,
      fetchImpl,
    });
    progressCount += 1;
  }

  return {
    data_points: dataPointCount,
    progress: progressCount,
    blocked_goal_codes: built.blockedGoalCodes,
    handled_mixed_assignment: true,
  };
}

module.exports = {
  buildScoredParentGoalEvidence,
  hasLegacyBlockingConstructedItem,
  reconcileScoredParentGoalEvidence,
};
