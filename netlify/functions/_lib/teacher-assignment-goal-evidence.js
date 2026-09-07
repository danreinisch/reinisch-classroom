"use strict";

const { readAllPages, chunks } = require("./goal-evidence-pages");
const { reconcileAssignmentGoalDataPoints } = require("./assignment-evidence-reconciliation");

const finite = (value) =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const answerText = (value) =>
  value == null ? null : Array.isArray(value) ? value.join(", ") : String(value);

/** Called only after teacher-goal-progress has authorized the student, goal,
 * instance, class and enrollment. Question content comes from stored work,
 * never from the browser's rollup payload. Parent progress math is unchanged. */
async function reconcileTeacherAssignmentEvidence({
  instance,
  goals,
  progressRows,
  supabaseUrl,
  serviceRoleKey,
  fetchImpl = global.fetch,
}) {
  if (!instance?.id || instance.settings?.non_instructional === true || !progressRows.length)
    return [];
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  async function read(url) {
    const response = await fetchImpl(url, { method: "GET", headers });
    if (!response.ok) throw new Error(`Teacher goal evidence lookup failed: ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid teacher goal evidence response");
    return rows;
  }
  const root = `${supabaseUrl}/rest/v1/`;
  const submissions = await read(
    `${root}submissions?select=id,instance_id&instance_id=eq.${encodeURIComponent(instance.id)}&order=submitted_at.desc,id.desc&limit=1`
  );
  const submission = submissions[0];
  // A manual assignment grade can legitimately have no question-level work.
  if (!submission) return [];
  if (String(submission.instance_id) !== String(instance.id))
    throw new Error("Submission instance mismatch");

  const [answers, items] = await Promise.all([
    readAllPages(
      `${root}submission_answers?select=id,submission_id,assignment_item_id,raw_answer,earned_points,max_points,is_correct&submission_id=eq.${encodeURIComponent(submission.id)}&order=id`,
      read
    ),
    readAllPages(
      `${root}assignment_items?select=id,assignment_id,goal_codes,points,meta&assignment_id=eq.${encodeURIComponent(instance.assignment_id)}&order=id`,
      read
    ),
  ]);
  const itemIds = items.map((item) => item.id);
  const mappings = [];
  for (const ids of chunks(itemIds)) {
    mappings.push(
      ...(await readAllPages(
        `${root}assignment_item_mappings?select=item_id,goal_codes&item_id=in.(${ids.map(encodeURIComponent).join(",")})&order=item_id`,
        read
      ))
    );
  }
  const codesByItem = new Map(mappings.map((row) => [String(row.item_id), row.goal_codes]));
  const answersByItem = new Map(
    answers
      .filter((row) => String(row.submission_id) === String(submission.id))
      .map((row) => [String(row.assignment_item_id), row])
  );
  const progressByGoal = new Map(progressRows.map((row) => [String(row.goal_id), row]));
  const goalByCode = new Map(
    goals
      .filter((goal) => String(goal.student_id) === String(instance.student_id))
      .map((goal) => [goal.code, goal])
  );
  const rows = [];
  for (const item of items) {
    if (String(item.assignment_id) !== String(instance.assignment_id)) continue;
    const answer = answersByItem.get(String(item.id));
    if (!answer || !finite(answer.earned_points)) continue;
    const max = finite(item.points) ? Number(item.points) : Number(answer.max_points);
    if (!(max > 0)) continue;
    const codes =
      Array.isArray(item.goal_codes) && item.goal_codes.length
        ? item.goal_codes
        : codesByItem.get(String(item.id));
    for (const code of new Set(Array.isArray(codes) ? codes : [])) {
      const goal = goalByCode.get(code);
      const progress = goal && progressByGoal.get(String(goal.id));
      if (!progress) continue;
      rows.push({
        goal_id: goal.id,
        student_id: instance.student_id,
        assignment_instance_id: instance.id,
        item_id: item.id,
        date: progress.date,
        school_year: progress.school_year,
        source: "assignment",
        question_text: item.meta?.text || null,
        choices: Array.isArray(item.meta?.choices) ? item.meta.choices : null,
        student_answer: answerText(answer.raw_answer?.value),
        correct_answer: answerText(item.meta?.correct),
        is_correct: typeof answer.is_correct === "boolean" ? answer.is_correct : null,
        score: Math.round((Number(answer.earned_points) / max) * 100),
      });
    }
  }
  return reconcileAssignmentGoalDataPoints({ rows, supabaseUrl, serviceRoleKey, fetchImpl });
}

module.exports = { reconcileTeacherAssignmentEvidence };
