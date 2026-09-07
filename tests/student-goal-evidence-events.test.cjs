'use strict';

const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://evidence-events.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-key';
process.env.SESSION_SECRET = 'synthetic-student-evidence-secret';

const { handler } = require('../netlify/functions/student-goal-evidence-events');
const { createStudentSessionCookie } = require('../netlify/functions/_lib/student-auth');

const studentId = '11111111-1111-4111-8111-111111111111';
const goalId = '22222222-2222-4222-8222-222222222222';
const instanceId = '33333333-3333-4333-8333-333333333333';
const objectiveId = '44444444-4444-4444-8444-444444444444';
const studentCode = 'S001';
const goalCode = 'S001.CG1';

let db;

function reset({ objective = false, status = 'Assigned' } = {}) {
  db = {
    students: [{ id: studentId, code: studentCode }],
    goals: [{
      id: goalId,
      code: goalCode,
      student_id: studentId,
      goal_area: 'Reading Comprehension',
      measurement_type: 'Accuracy',
      active: true,
    }],
    goal_objectives: objective
      ? [{
          id: objectiveId,
          student_id: studentId,
          parent_goal_id: goalId,
          code: 'S001.CG1.O1',
          objective_number: 1,
          objective_text: 'Identify the main idea.',
          active: true,
        }]
      : [],
    goal_data_points: objective
      ? []
      : [{
          id: 'parent-point',
          goal_id: goalId,
          student_id: studentId,
          assignment_instance_id: instanceId,
          item_id: 101,
          question_text: 'Which detail states the main idea?',
          choices: ['A', 'B'],
          student_answer: 'A',
          correct_answer: 'B',
          is_correct: false,
          score: 0,
          source: 'assignment',
          date: '2026-09-03',
          created_at: '2026-09-03T16:00:00Z',
        }],
    objective_data_points: objective
      ? [{
          id: 'objective-point',
          objective_id: objectiveId,
          student_id: studentId,
          assignment_instance_id: instanceId,
          item_id: 101,
          objective_earned: 0,
          objective_max: 1,
          question_text: 'Which detail states the main idea?',
          choices: ['A', 'B'],
          student_answer: 'A',
          correct_answer: 'B',
          is_correct: false,
          component_label: 'Main idea',
          source: 'assignment',
          date: '2026-09-03',
          created_at: '2026-09-03T16:00:00Z',
        }]
      : [],
    goal_progress: [],
    assignment_instances: [{
      id: instanceId,
      student_id: studentId,
      assignment_id: 42,
      status,
      settings: {},
    }],
    assignments: [{ id: 42, title: 'WEEK 1 — Synthetic Reading — S001' }],
    assignment_items: [{
      id: 101,
      item_ref: '1_1',
      meta: {
        text: 'Which detail states the main idea?',
        choices: ['A', 'B'],
        correct: 'B',
      },
    }],
  };
}

function response(rows, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => structuredClone(rows),
    text: async () => JSON.stringify(rows),
  };
}

global.fetch = async (target) => {
  const url = new URL(target);
  assert.equal(url.origin, 'https://evidence-events.test');
  const table = url.pathname.split('/').at(-1);
  assert.ok(Object.prototype.hasOwnProperty.call(db, table), `Unexpected table ${table}`);
  return response(db[table]);
};

function event() {
  return {
    httpMethod: 'GET',
    headers: {
      cookie: createStudentSessionCookie(studentCode, process.env.SESSION_SECRET).split(';')[0],
    },
    queryStringParameters: {
      code: studentCode,
      goal_code: goalCode,
      quarter: 'Q1',
      start: '2026-08-16',
      end: '2026-10-17',
    },
  };
}

async function readOne() {
  const result = await handler(event());
  assert.equal(result.statusCode, 200, result.body);
  const body = JSON.parse(result.body);
  assert.equal(body.ok, true);
  assert.equal(body.available, true);
  assert.equal(body.events.length, 1);
  return body.events[0];
}

(async () => {
  reset({ objective: false, status: 'Assigned' });
  let row = await readOne();
  assert.equal(row.question_text, 'Which detail states the main idea?');
  assert.equal(row.student_answer, 'A', 'the student may see their own submitted response');
  assert.equal(row.answer_review_available, false);
  assert.equal(row.correct_answer, null);
  assert.equal(row.is_correct, null);
  assert.equal(row.score, null, 'unreleased parent evidence must not leak the score');
  assert.equal(row.status, 'Review pending');

  db.assignment_instances[0].status = 'Reviewed';
  row = await readOne();
  assert.equal(row.answer_review_available, true);
  assert.equal(row.correct_answer, 'B');
  assert.equal(row.is_correct, false);
  assert.equal(row.score, 0);
  assert.equal(row.status, 'Review this answer');
  console.log('✓ parent evidence hides result/score until answer review is released');

  reset({ objective: true, status: 'Submitted' });
  row = await readOne();
  assert.equal(row.kind, 'objective');
  assert.equal(row.answer_review_available, false);
  assert.equal(row.correct_answer, null);
  assert.equal(row.is_correct, null);
  assert.equal(row.score, null);
  assert.equal(row.objective_earned, null);
  assert.equal(row.objective_max, null);
  assert.equal(row.status, 'Review pending');

  db.assignment_instances[0].status = 'Reviewed';
  row = await readOne();
  assert.equal(row.answer_review_available, true);
  assert.equal(row.correct_answer, 'B');
  assert.equal(row.is_correct, false);
  assert.equal(row.score, 0);
  assert.equal(row.objective_earned, 0);
  assert.equal(row.objective_max, 1);
  assert.equal(row.status, 'Review this answer');
  console.log('✓ objective evidence hides result/skill score until answer review is released');
})();
