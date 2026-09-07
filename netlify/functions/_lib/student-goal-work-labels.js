"use strict";

const { chunks, readAllPages } = require("./goal-evidence-pages");
const text = (value) =>
  value == null ? null : Array.isArray(value) ? value.join(", ") : String(value);

// Enrich only already student-scoped, exact instance/item identities. No dates,
// titles or goal text are used to guess which work produced a check.
async function enrichGoalWork({ rows, instances, read, root, labelsOnly = false }) {
  const instanceIds = [...new Set(rows.map((row) => row.assignment_instance_id).filter(Boolean))];
  const scoped = instanceIds.map((id) => instances.get(String(id))).filter(Boolean);
  const assignmentIds = [
    ...new Set(scoped.map((row) => row.assignment_id).filter((id) => id != null)),
  ];
  const titles = new Map();
  for (const ids of chunks(assignmentIds)) {
    const assignments = await readAllPages(
      `${root}assignments?select=id,title&id=in.(${ids.map(encodeURIComponent).join(",")})&order=id`,
      read
    );
    for (const assignment of assignments) titles.set(String(assignment.id), assignment.title);
  }
  for (const instance of scoped)
    instance.assignment_title = titles.get(String(instance.assignment_id)) || null;

  if (labelsOnly)
    return rows.map((row) => ({
      ...row,
      assignment_title: instances.get(String(row.assignment_instance_id))?.assignment_title || null,
    }));
  const itemIds = [...new Set(rows.map((row) => row.item_id).filter((id) => id != null))];
  const items = new Map();
  for (const ids of chunks(itemIds)) {
    const fetched = await readAllPages(
      `${root}assignment_items?select=id,assignment_id,item_ref&id=in.(${ids.map(encodeURIComponent).join(",")})&order=id`,
      read
    );
    for (const item of fetched) items.set(String(item.id), item);
  }
  if (!itemIds.length) return rows;
  const latest = new Map();
  const releasedIds = scoped
    .filter((row) => ["Graded", "Reviewed"].includes(row.status))
    .map((row) => row.id);
  for (const ids of chunks(releasedIds)) {
    const submissions = await readAllPages(
      `${root}submissions?select=id,instance_id,submitted_at&instance_id=in.(${ids.map(encodeURIComponent).join(",")})&order=instance_id,submitted_at.desc,id.desc`,
      read
    );
    for (const submission of submissions) {
      if (!latest.has(String(submission.instance_id)))
        latest.set(String(submission.instance_id), submission);
    }
  }
  const answers = new Map();
  for (const ids of chunks([...latest.values()].map((row) => row.id))) {
    const fetched = await readAllPages(
      `${root}submission_answers?select=id,submission_id,assignment_item_id,raw_answer,teacher_note&submission_id=in.(${ids.map(encodeURIComponent).join(",")})&order=id`,
      read
    );
    for (const answer of fetched)
      answers.set(`${answer.submission_id}|${answer.assignment_item_id}`, answer);
  }
  return rows.map((row) => {
    const instance = instances.get(String(row.assignment_instance_id));
    const item = items.get(String(row.item_id));
    const sameItem = item && String(item.assignment_id) === String(instance?.assignment_id);
    const submission = latest.get(String(row.assignment_instance_id));
    const answer = sameItem && submission && answers.get(`${submission.id}|${row.item_id}`);
    // Reopened/replaced work must not attach a note to a different saved answer.
    const matches =
      answer &&
      text(answer.raw_answer?.value) !== null &&
      text(answer.raw_answer?.value) === text(row.student_answer);
    const staleAnswer = row.source === "assignment" && submission && (!answer || !matches);
    return {
      ...row,
      // Keep the recorded goal score authoritative, but don't present a prior
      // attempt's answer as work behind the current assignment checkpoint.
      ...(staleAnswer
        ? {
            question_text: null,
            choices: null,
            student_answer: null,
            correct_answer: null,
            is_correct: null,
            score: null,
          }
        : {}),
      assignment_title: instance?.assignment_title || null,
      question_ref: sameItem ? item.item_ref : null,
      teacher_feedback:
        matches && typeof answer.teacher_note === "string" ? answer.teacher_note : null,
    };
  });
}

module.exports = { enrichGoalWork };
