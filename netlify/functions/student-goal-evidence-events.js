'use strict';

/**
 * Student-facing goal evidence timeline.
 *
 * Read-only. Official goal/progress math remains owned by the existing
 * student-goal-explanations pipeline. This endpoint answers a different
 * question: "What discrete evidence events exist behind this goal?"
 *
 * One returned event represents one stored question/objective evidence row,
 * or (when no item-level evidence exists) one legitimate recorded progress
 * check. Assignment answer review remains gated by Reviewed/Graded status.
 */

const { createHmac } = require('node:crypto');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');
const { getSupabaseConfig } = require('./_lib/supa');
const { requireStudent } = require('./_lib/student-auth');
const { readAllPages } = require('./_lib/goal-evidence-pages');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STUDENT_PATTERN = /^S\d{3}$/;
const GOAL_PATTERN = /^S\d{3}\.CG\d+$/;

function headers() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function read(url) {
  const response = await fetch(url, { method: 'GET', headers: headers() });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GET failed ${response.status}: ${body}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function released(instance) {
  const status = String(instance?.status || '').trim();
  return status === 'Graded' || status === 'Reviewed';
}

function normalizeRange(params) {
  const quarter = String(params?.quarter || '').trim().toUpperCase();
  const start = String(params?.start || '').trim();
  const end = String(params?.end || '').trim();
  if (!/^Q[1-4]$/.test(quarter) || !DATE_PATTERN.test(start) || !DATE_PATTERN.test(end) || start > end) {
    return null;
  }
  return { quarter, start, end };
}

function inFilter(values) {
  return values.map((value) => encodeURIComponent(String(value))).join(',');
}

function compareEvents(a, b) {
  if (a.date !== b.date) return String(a.date || '').localeCompare(String(b.date || ''));
  if (a.created_at !== b.created_at) return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  return String(a.key || '').localeCompare(String(b.key || ''));
}

function statusFor(event) {
  if (event.question_text) {
    if (event.source === 'assignment' && !event.answer_review_available) return 'Review pending';
    if (event.is_correct === true) return 'Correct';
    if (event.is_correct === false) return 'Review this answer';
    if (finite(event.score) !== null && event.score < 100) return 'Review this work';
    return 'Reviewed';
  }
  if (event.kind === 'objective' && finite(event.score) !== null) {
    return event.score >= 100 ? 'Skill demonstrated' : 'Review this skill';
  }
  return 'Recorded check';
}

exports.handler = async (event) => {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, { 'Cache-Control': 'no-store' }, requestId);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SESSION_SECRET) {
    return jsonResponse(event, 200, { ok: true, available: false, reason: 'not_configured', events: [] }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const params = event.queryStringParameters || {};
  const code = String(params.code || '').trim().toUpperCase();
  const goalCode = String(params.goal_code || '').trim().toUpperCase();
  const range = normalizeRange(params);

  if (!STUDENT_PATTERN.test(code) || !GOAL_PATTERN.test(goalCode) || !goalCode.startsWith(`${code}.`) || !range) {
    return jsonResponse(event, 400, { ok: false, error: 'Valid student, goal, quarter, start, and end are required' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const auth = requireStudent(event, SESSION_SECRET, code);
  if (!auth.ok) {
    return jsonResponse(event, auth.statusCode, { ok: false, error: auth.error }, { 'Cache-Control': 'no-store' }, requestId);
  }

  try {
    const students = await read(
      `${SUPABASE_URL}/rest/v1/students?select=id&code=eq.${encodeURIComponent(code)}&limit=1`
    );
    if (!students.length) {
      return jsonResponse(event, 404, { ok: false, error: 'Student not found' }, { 'Cache-Control': 'no-store' }, requestId);
    }
    const studentId = students[0].id;

    const goals = await read(
      `${SUPABASE_URL}/rest/v1/goals?select=id,code,goal_area,measurement_type&student_id=eq.${encodeURIComponent(studentId)}` +
      `&code=eq.${encodeURIComponent(goalCode)}&active=eq.true&or=(status.is.null,status.not.in.(closed,archived,Closed,Archived))&limit=1`
    );
    if (!goals.length) {
      return jsonResponse(event, 404, { ok: false, error: 'Goal unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
    }
    const goal = goals[0];

    const objectives = await readAllPages(
      `${SUPABASE_URL}/rest/v1/goal_objectives?select=id,objective_number,objective_text,code&student_id=eq.${encodeURIComponent(studentId)}` +
      `&parent_goal_id=eq.${encodeURIComponent(goal.id)}&active=eq.true&order=objective_number.asc,id.asc`,
      read
    );
    const objectiveIds = objectives.map((row) => row.id).filter(Boolean);

    const [parentPoints, progressRows, objectivePoints] = await Promise.all([
      readAllPages(
        `${SUPABASE_URL}/rest/v1/goal_data_points?select=id,goal_id,assignment_instance_id,item_id,question_text,choices,student_answer,correct_answer,is_correct,date,source,created_at,score` +
        `&student_id=eq.${encodeURIComponent(studentId)}&goal_id=eq.${encodeURIComponent(goal.id)}` +
        `&date=gte.${range.start}&date=lte.${range.end}&order=date.asc,created_at.asc,id.asc`,
        read
      ),
      readAllPages(
        `${SUPABASE_URL}/rest/v1/goal_progress?select=id,goal_id,assignment_instance_id,date,value,source,collected_by,created_at` +
        `&student_id=eq.${encodeURIComponent(studentId)}&goal_id=eq.${encodeURIComponent(goal.id)}` +
        `&date=gte.${range.start}&date=lte.${range.end}&order=date.asc,created_at.asc,id.asc`,
        read
      ),
      objectiveIds.length
        ? readAllPages(
            `${SUPABASE_URL}/rest/v1/objective_data_points?select=id,objective_id,assignment_instance_id,item_id,objective_earned,objective_max,question_text,choices,student_answer,correct_answer,is_correct,component_label,support_level,evidence_type,source,date,created_at` +
            `&student_id=eq.${encodeURIComponent(studentId)}&objective_id=in.(${inFilter(objectiveIds)})` +
            `&date=gte.${range.start}&date=lte.${range.end}&order=date.asc,created_at.asc,id.asc`,
            read
          )
        : Promise.resolve([]),
    ]);

    const allRows = [...parentPoints, ...progressRows, ...objectivePoints];
    const instanceIds = [...new Set(allRows.map((row) => row.assignment_instance_id).filter(Boolean).map(String))];
    const instances = instanceIds.length
      ? await readAllPages(
          `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,status,settings,assignment_id&student_id=eq.${encodeURIComponent(studentId)}` +
          `&id=in.(${inFilter(instanceIds)})&order=id.asc`,
          read
        )
      : [];
    const instanceMap = new Map(instances.map((row) => [String(row.id), row]));

    const assignmentIds = [...new Set(instances.map((row) => row.assignment_id).filter((value) => value !== null && value !== undefined).map(String))];
    const assignments = assignmentIds.length
      ? await readAllPages(
          `${SUPABASE_URL}/rest/v1/assignments?select=id,title&id=in.(${inFilter(assignmentIds)})&order=id.asc`,
          read
        )
      : [];
    const assignmentMap = new Map(assignments.map((row) => [String(row.id), row]));

    const itemIds = [...new Set([...parentPoints, ...objectivePoints].map((row) => row.item_id).filter((value) => value !== null && value !== undefined).map(String))];
    const items = itemIds.length
      ? await readAllPages(
          `${SUPABASE_URL}/rest/v1/assignment_items?select=id,item_ref,meta&id=in.(${inFilter(itemIds)})&order=id.asc`,
          read
        )
      : [];
    const itemMap = new Map(items.map((row) => [String(row.id), row]));
    const objectiveMap = new Map(objectives.map((row) => [String(row.id), row]));

    const safeInstance = (row) => {
      if (!row.assignment_instance_id) return null;
      return instanceMap.get(String(row.assignment_instance_id)) || null;
    };
    const isInstructional = (row) => safeInstance(row)?.settings?.non_instructional !== true;
    const titleFor = (row) => {
      const instance = safeInstance(row);
      return instance ? assignmentMap.get(String(instance.assignment_id))?.title || null : null;
    };
    const refFor = (...parts) => createHmac('sha256', SESSION_SECRET).update(JSON.stringify([studentId, goal.id, ...parts])).digest('hex');

    const parentQuestionEvents = parentPoints.filter(isInstructional).map((row) => {
      const instance = safeInstance(row);
      const canReview = row.source !== 'assignment' || released(instance);
      const item = itemMap.get(String(row.item_id));
      const score = finite(row.score) ?? (row.is_correct === true ? 100 : row.is_correct === false ? 0 : null);
      const eventRow = {
        key: refFor('parent', row.id),
        kind: 'question',
        date: row.date,
        created_at: row.created_at,
        source: row.source || null,
        assignment_instance_id: row.assignment_instance_id || null,
        assignment_title: titleFor(row),
        item_ref: item?.item_ref || null,
        question_text: row.question_text || item?.meta?.text || null,
        choices: row.choices || item?.meta?.choices || null,
        student_answer: row.student_answer ?? null,
        answer_review_available: canReview,
        correct_answer: canReview ? (row.correct_answer ?? item?.meta?.correct ?? null) : null,
        is_correct: canReview && typeof row.is_correct === 'boolean' ? row.is_correct : null,
        score,
        objective_number: null,
        objective_text: null,
        component_label: null,
      };
      eventRow.status = statusFor(eventRow);
      return eventRow;
    });

    const objectiveEvents = objectivePoints.filter(isInstructional).map((row) => {
      const instance = safeInstance(row);
      const canReview = row.source !== 'assignment' || released(instance);
      const item = itemMap.get(String(row.item_id));
      const objective = objectiveMap.get(String(row.objective_id));
      const earned = finite(row.objective_earned);
      const max = finite(row.objective_max);
      const score = earned !== null && max !== null && max > 0 ? Math.round((earned / max) * 1000) / 10 : null;
      const eventRow = {
        key: refFor('objective', row.id),
        kind: 'objective',
        date: row.date,
        created_at: row.created_at,
        source: row.source || null,
        assignment_instance_id: row.assignment_instance_id || null,
        assignment_title: titleFor(row),
        item_ref: item?.item_ref || null,
        question_text: row.question_text || item?.meta?.text || null,
        choices: row.choices || item?.meta?.choices || null,
        student_answer: row.student_answer ?? null,
        answer_review_available: canReview,
        correct_answer: canReview ? (row.correct_answer ?? item?.meta?.correct ?? null) : null,
        is_correct: canReview && typeof row.is_correct === 'boolean' ? row.is_correct : null,
        score,
        objective_earned: earned,
        objective_max: max,
        objective_number: objective?.objective_number ?? null,
        objective_text: objective?.objective_text ?? null,
        component_label: row.component_label || null,
        support_level: row.support_level || null,
        evidence_type: row.evidence_type || null,
      };
      eventRow.status = statusFor(eventRow);
      return eventRow;
    });

    // Objective evidence is the more precise source when a goal has active
    // child objectives. Parent question evidence remains the fallback for
    // legacy/objective-unavailable cases; do not double-count both streams.
    const preciseEvents = objectiveEvents.length ? objectiveEvents : parentQuestionEvents;
    const coveredAssignments = new Set(
      preciseEvents.map((row) => row.assignment_instance_id).filter(Boolean).map(String)
    );

    const progressEvents = progressRows
      .filter(isInstructional)
      .filter((row) => !row.assignment_instance_id || !coveredAssignments.has(String(row.assignment_instance_id)))
      .map((row) => {
        const eventRow = {
          key: refFor('progress', row.id),
          kind: 'progress',
          date: row.date,
          created_at: row.created_at,
          source: row.source || null,
          assignment_instance_id: row.assignment_instance_id || null,
          assignment_title: titleFor(row),
          item_ref: null,
          question_text: null,
          choices: null,
          student_answer: null,
          answer_review_available: false,
          correct_answer: null,
          is_correct: null,
          score: finite(row.value),
          objective_number: null,
          objective_text: null,
          component_label: null,
          collected_by: row.collected_by || null,
        };
        eventRow.status = statusFor(eventRow);
        return eventRow;
      });

    const events = [...preciseEvents, ...progressEvents].sort(compareEvents).map(({ created_at, assignment_instance_id, ...row }) => row);
    const skills = objectives.map((row) => ({
      objective_number: row.objective_number,
      objective_text: row.objective_text || null,
      code: row.code || null,
    }));

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        available: true,
        quarter: range,
        goal: {
          code: goal.code,
          goal_area: goal.goal_area || null,
          measurement_type: goal.measurement_type || null,
        },
        counts: {
          total: events.length,
          question: events.filter((row) => Boolean(row.question_text)).length,
          recorded_check: events.filter((row) => row.kind === 'progress').length,
        },
        skills,
        events,
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (error) {
    console.error(`[student-goal-evidence-events] [${requestId}]`, error);
    return jsonResponse(
      event,
      200,
      { ok: true, available: false, reason: 'query_failed', events: [] },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
