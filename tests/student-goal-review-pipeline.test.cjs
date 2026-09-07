"use strict";
const assert = require("node:assert/strict");
process.env.SUPABASE_URL = "https://goal-review.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-key";
process.env.SESSION_SECRET = "synthetic-goal-review-session";
const { handler: save } = require("../netlify/functions/teacher-goal-progress");
const { handler: explain } = require("../netlify/functions/student-goal-explanations");
const { sign } = require("../netlify/functions/_lib/auth");
const { createStudentSessionCookie } = require("../netlify/functions/_lib/student-auth");
const { readAllPages } = require("../netlify/functions/_lib/goal-evidence-pages");
const {
  reconcileTeacherAssignmentEvidence,
} = require("../netlify/functions/_lib/teacher-assignment-goal-evidence");
const id = (n) =>
  `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const student = { id: id(1), code: "S001", active: true, class_id: id(3) };
const goal = {
  id: id(2),
  code: "S001.CG1",
  student_id: student.id,
  active: true,
  status: "Open",
  measurement_type: "Accuracy",
};
const teacher = id(4);
const instance = {
  id: id(5),
  assignment_id: 42,
  student_id: student.id,
  status: "Reviewed",
  settings: {},
};
const submission = { id: id(6), instance_id: instance.id, submitted_at: "2026-09-06T12:00:00Z" };
const range = { quarter: "Q1", start: "2026-08-16", end: "2026-10-17" };
let db, calls, failResource;
function reset() {
  db = {
    students: [{ ...student }],
    goals: [{ ...goal }],
    classes: [{ id: id(3), code: "LA1", teacher_id: teacher }],
    class_enrollments: [{ student_id: student.id, class_id: id(3), active: true }],
    assignments: [{ id: 42, class_id: id(3), title: "Synthetic evidence practice" }],
    assignment_instances: [{ ...instance, settings: {} }],
    submissions: [{ ...submission }],
    assignment_items: [
      {
        id: 101,
        assignment_id: 42,
        item_ref: "Q1",
        goal_codes: [],
        points: 2,
        meta: {
          text: "Which detail supports the claim?",
          choices: ["First detail", "Second detail"],
          correct: "B",
        },
      },
      {
        id: 102,
        assignment_id: 42,
        item_ref: "Q2",
        goal_codes: [goal.code],
        points: 4,
        meta: { text: "Explain why the detail supports the claim." },
      },
      {
        id: 103,
        assignment_id: 42,
        item_ref: "Q3",
        goal_codes: [goal.code],
        points: 2,
        meta: { text: "Unscored writing" },
      },
      {
        id: 104,
        assignment_id: 99,
        item_ref: "Foreign",
        goal_codes: [goal.code],
        points: 1,
        meta: { text: "Never include this item" },
      },
    ],
    assignment_item_mappings: [{ item_id: 101, goal_codes: [goal.code, "S999.CG1"] }],
    submission_answers: [
      {
        id: "a1",
        submission_id: submission.id,
        assignment_item_id: 101,
        raw_answer: { value: "A" },
        earned_points: 0,
        max_points: 2,
        is_correct: false,
        teacher_note: "Look for a detail that explains the claim.",
      },
      {
        id: "a2",
        submission_id: submission.id,
        assignment_item_id: 102,
        raw_answer: { value: "My explanation" },
        earned_points: 3,
        max_points: 4,
        is_correct: null,
        teacher_note: "Add an example from the text.",
      },
      {
        id: "a3",
        submission_id: submission.id,
        assignment_item_id: 103,
        raw_answer: { value: "Waiting" },
        earned_points: null,
        max_points: 2,
      },
      {
        id: "a4",
        submission_id: submission.id,
        assignment_item_id: 104,
        raw_answer: { value: "Foreign" },
        earned_points: 1,
        max_points: 1,
      },
    ],
    goal_progress: [],
    goal_data_points: [],
    goal_objectives: [],
    objective_data_points: [],
  };
  calls = [];
  failResource = null;
}
const response = (rows, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => structuredClone(rows),
  text: async () => JSON.stringify(rows),
});
function matches(row, params) {
  return [...params].every(([key, value]) => {
    if (["select", "order", "limit", "offset", "or"].includes(key)) return true;
    if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
    if (value.startsWith("in.("))
      return value.slice(4, -1).replaceAll('"', "").split(",").includes(String(row[key]));
    if (value.startsWith("gte.")) return String(row[key]) >= value.slice(4);
    if (value.startsWith("lte.")) return String(row[key]) <= value.slice(4);
    if (value === "is.null") return row[key] == null;
    return true;
  });
}
global.fetch = async (target, init = {}) => {
  const url = new URL(target);
  const table = url.pathname.split("/").at(-1);
  const method = init.method || "GET";
  calls.push({ url, table, method });
  assert.equal(url.origin, "https://goal-review.test", "No external requests");
  if (table === failResource) return response({ error: "Synthetic failure" }, 503);
  assert.ok(db[table], `Unexpected table ${table}`);
  if (method === "GET") {
    let rows = db[table].filter((row) => matches(row, url.searchParams));
    const order = (url.searchParams.get("order") || "").split(",");
    rows.sort((a, b) => {
      for (const spec of order) {
        const [key, direction] = spec.split(".");
        const diff = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
        if (diff) return direction === "desc" ? -diff : diff;
      }
      return 0;
    });
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 1000);
    return response(rows.slice(offset, offset + limit));
  }
  const body = JSON.parse(init.body);
  if (method === "POST") {
    const rows = (Array.isArray(body) ? body : [body]).map((row, i) => ({
      id: `${table}-${db[table].length + i}`,
      created_at: "2026-09-06T15:00:00Z",
      ...row,
    }));
    db[table].push(...rows);
    return response(rows);
  }
  if (method === "PATCH") {
    const rows = db[table].filter((row) => matches(row, url.searchParams));
    rows.forEach((row) => Object.assign(row, body));
    return response(rows);
  }
  throw new Error(`Unexpected mutation ${method}`);
};
const saveEvent = () => ({
  httpMethod: "POST",
  headers: {
    "content-type": "application/json",
    cookie: `tc=${sign({ role: "teacher", teacherId: teacher }, process.env.SESSION_SECRET)}`,
  },
  body: JSON.stringify({
    action: "insert",
    student_code: student.code,
    goal_code: goal.code,
    class_code: "LA1",
    date: "2026-09-06",
    value: 50,
    source: "assignment",
    assignment_instance_id: instance.id,
  }),
});
const studentEvent = (extra = {}) => ({
  httpMethod: "GET",
  headers: {
    cookie: createStudentSessionCookie(student.code, process.env.SESSION_SECRET).split(";")[0],
  },
  queryStringParameters: { code: student.code, ...range, ...extra },
});
async function bundle(extra) {
  const result = await explain(studentEvent(extra));
  return { status: result.statusCode, ...JSON.parse(result.body) };
}

(async () => {
  reset();
  const first = await save(saveEvent());
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(db.goal_progress.length, 1);
  assert.equal(db.goal_data_points.length, 2, "Only scored, own-goal, own-assignment questions");
  assert.equal(db.goal_data_points[0].score, 0, "Measured zero survives");
  assert.equal(db.goal_data_points[1].score, 75);
  let data = await bundle({ view: "detail", goal_code: goal.code });
  assert.equal(data.available, true);
  const input = data.goals[0].calculation.inputs[0];
  assert.equal(data.goals[0].percentage, 50, "Canonical parent value unchanged");
  assert.equal(input.assignment_title, "Synthetic evidence practice");
  const q1 = input.evidence.find((q) => q.question_ref === "Q1");
  assert.equal(q1.student_answer, "A");
  assert.equal(q1.correct_answer, "B");
  assert.equal(q1.teacher_feedback, "Look for a detail that explains the claim.");
  assert.equal(q1.is_correct, false);
  assert.ok(!JSON.stringify(data).includes(instance.id), "Internal provenance stays server-side");
  console.log(
    "✓ teacher-reviewed mixed assignment reaches student question review with exact provenance"
  );

  db.submission_answers[0].earned_points = 2;
  await save(saveEvent());
  assert.equal(db.goal_progress.length, 1);
  assert.equal(db.goal_data_points.length, 2);
  assert.equal(db.goal_data_points.find((row) => row.item_id === 101).score, 100);
  console.log("✓ repeated review updates the same check and question rows");

  db.assignment_instances[0].status = "Submitted";
  data = await bundle({ view: "detail", goal_code: goal.code });
  for (const question of data.goals[0].calculation.inputs[0].evidence) {
    assert.equal(question.answer_review_available, false);
    assert.equal(question.correct_answer, null);
    assert.equal(question.score, null);
    assert.equal(question.teacher_feedback, null);
  }
  db.assignment_instances[0].status = "Reviewed";
  db.submission_answers[0].raw_answer.value = "A new attempt";
  data = await bundle({ view: "detail", goal_code: goal.code });
  assert.equal(
    data.goals[0].calculation.inputs[0].evidence.find((q) => q.question_ref === "Q1")
      .teacher_feedback,
    null
  );
  assert.equal(
    data.goals[0].calculation.inputs[0].evidence.find((q) => q.question_ref === "Q1")
      .student_answer,
    null
  );
  console.log(
    "✓ pending review and changed answers cannot expose released feedback from another answer"
  );

  calls = [];
  data = await bundle({ view: "summary" });
  assert.equal(data.goals[0].percentage, 50);
  assert.deepEqual(data.goals[0].calculation.inputs[0].evidence, []);
  assert.ok(
    !calls.some((call) =>
      ["goal_data_points", "submission_answers", "assignment_items"].includes(call.table)
    )
  );
  const foreign = await bundle({ view: "detail", goal_code: "S999.CG1" });
  assert.equal(foreign.status, 404);
  calls = [];
  const timeline = await bundle({ view: "timeline", goal_code: goal.code });
  const checkpoint = timeline.goals[0].calculation.inputs[0];
  assert.match(checkpoint.work_ref, /^[a-f0-9]{64}$/);
  assert.equal(checkpoint.assignment_title, "Synthetic evidence practice");
  assert.deepEqual(checkpoint.evidence, []);
  assert.ok(!calls.some((call) => ["goal_data_points", "submission_answers"].includes(call.table)));
  const work = await bundle({ view: "work", goal_code: goal.code, work_ref: checkpoint.work_ref });
  assert.equal(work.work.evidence.length, 2);
  assert.equal(work.goals, undefined, "Only the selected work is returned");
  assert.ok(
    calls
      .filter((call) => call.table === "goal_data_points")
      .every((call) => call.url.searchParams.get("assignment_instance_id") === `eq.${instance.id}`)
  );
  const unknownWork = await bundle({ view: "work", goal_code: goal.code, work_ref: "fabricated" });
  assert.equal(unknownWork.status, 404);
  console.log(
    "✓ timeline contains no answers; opaque, student-scoped selection loads one assignment only"
  );
  console.log("✓ overview skips question reads and detail requests remain student scoped");

  reset();
  failResource = "submission_answers";
  const failed = await save(saveEvent());
  assert.ok(failed.statusCode >= 400);
  assert.equal(db.goal_progress.length, 0);
  reset();
  db.assignment_instances[0].settings.non_instructional = true;
  await save(saveEvent());
  assert.equal(db.goal_data_points.length, 0);
  reset();
  db.submissions = [];
  await save(saveEvent());
  assert.equal(db.goal_progress.length, 1);
  assert.equal(db.goal_data_points.length, 0);
  console.log(
    "✓ failed evidence reads cannot report a successful new check; unlinked manual grades stay valid"
  );

  reset();
  db.goal_progress = Array.from({ length: 1205 }, (_, i) => ({
    id: `p${String(i).padStart(4, "0")}`,
    student_id: student.id,
    goal_id: goal.id,
    source: "manual",
    date: "2026-09-06",
    created_at: "2026-09-06T12:00:00Z",
    value: i < 1000 ? 0 : 100,
  }));
  data = await bundle({ view: "summary" });
  assert.equal(data.goals[0].calculation.inputs.length, 1205);
  assert.equal(data.goals[0].percentage, 17, "Includes records beyond the default 1,000-row limit");
  assert.equal(calls.filter((call) => call.table === "goal_progress").length, 3);
  let attempts = 0;
  await assert.rejects(
    readAllPages("https://goal-review.test/data?order=id", async () => {
      if (++attempts === 1) return Array(500).fill({});
      throw new Error("Later page failed");
    })
  );
  console.log(
    "✓ 1,205 checks produce a complete quarter average; failed later pages never return partial math"
  );
  reset();
  db.goal_progress = [
    {
      id: "parent",
      goal_id: goal.id,
      student_id: student.id,
      assignment_instance_id: instance.id,
      date: "2026-09-06",
      value: 75,
      source: "assignment",
    },
  ];
  db.goal_data_points = Array.from({ length: 1205 }, (_, i) => ({
    id: `d${i}`,
    item_id: i,
    goal_id: goal.id,
    student_id: student.id,
    assignment_instance_id: instance.id,
    date: "2026-09-06",
    source: "assignment",
    question_text: `Synthetic question ${i}`,
    student_answer: "A",
  }));
  data = await bundle();
  assert.equal(data.goals[0].calculation.inputs[0].evidence.length, 1205);
  reset();
  db.goal_objectives = [
    {
      id: "objective-one",
      code: "S001.CG1.O1",
      student_code: student.code,
      student_id: student.id,
      parent_goal_id: goal.id,
      parent_goal_code: goal.code,
      objective_number: 1,
      objective_text: "Use evidence.",
      active: true,
    },
  ];
  db.objective_data_points = Array.from({ length: 1205 }, (_, i) => ({
    id: `o${i}`,
    objective_id: "objective-one",
    student_id: student.id,
    date: "2026-09-06",
    source: "manual",
    objective_earned: i < 1000 ? 0 : 1,
    objective_max: 1,
  }));
  data = await bundle({ view: "summary" });
  assert.equal(data.goals[0].source, "objective_rollup");
  assert.equal(data.goals[0].objectives[0].evidence_count, 1205);
  assert.equal(data.goals[0].objectives[0].max, 1205);
  assert.equal(data.goals[0].percentage, 17.01);
  assert.deepEqual(data.goals[0].objectives[0].evidence, []);
  const objectiveTimeline = await bundle({ view: "timeline", goal_code: goal.code });
  const objectivePoint = objectiveTimeline.goals[0].objectives[0].evidence[0];
  assert.match(objectivePoint.work_ref, /^[a-f0-9]{64}$/);
  assert.equal(objectivePoint.student_answer, undefined);
  const objectiveWork = await bundle({
    view: "work",
    goal_code: goal.code,
    work_ref: objectivePoint.work_ref,
  });
  assert.equal(objectiveWork.work.evidence.length, 1);
  console.log(
    "✓ both parent question evidence and objective calculations include all 1,205 records"
  );

  reset();
  db.submissions.push({
    id: "latest-submission",
    instance_id: instance.id,
    submitted_at: "2026-09-07T12:00:00Z",
  });
  db.submission_answers.push({
    id: "latest-answer",
    submission_id: "latest-submission",
    assignment_item_id: 101,
    raw_answer: { value: "B" },
    earned_points: 2,
    max_points: 2,
    is_correct: true,
  });
  await reconcileTeacherAssignmentEvidence({
    instance,
    goals: [goal],
    progressRows: [{ goal_id: goal.id, date: "2026-09-07", school_year: "2026-27" }],
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: "synthetic-key",
  });
  assert.equal(db.goal_data_points.length, 1);
  assert.equal(db.goal_data_points[0].student_answer, "B");
  console.log(
    "✓ the latest submission is used without borrowing scored items from an older attempt"
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
