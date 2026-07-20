// Student submission details endpoint
// GET /.netlify/functions/student-submission-details?code=XXX&instance_id=YYY
// Auth: Requires code parameter (student must own the instance)
// Returns the submission feedback and per-item submission_answers with grading data
// so the student portal can display correct/incorrect highlighting and teacher notes.

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  requireStudent,
} = require('./_lib/student-auth');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-submission-details] [${requestId}] Request received`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      event,
      503,
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const params = event.queryStringParameters || {};
  const code = params.code;
  const instanceId = params.instance_id;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'code is required' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  if (!instanceId || typeof instanceId !== 'string' || instanceId.trim().length === 0) {
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'instance_id is required' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const codeNorm = code.trim().toUpperCase();

  const studentAuth =
    requireStudent(
      event,
      SESSION_SECRET,
      codeNorm
    );

  if (!studentAuth.ok) {
    return jsonResponse(
      event,
      studentAuth.statusCode,
      {
        ok: false,
        error: studentAuth.error,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Look up student by code
    const studentUrl = `${SUPABASE_URL}/rest/v1/students?select=id&code=eq.${encodeURIComponent(codeNorm)}&limit=1`;
    const studentResponse = await fetch(studentUrl, { headers });

    if (!studentResponse.ok) {
      throw new Error(`Student lookup failed: ${studentResponse.status}`);
    }

    const studentData = await studentResponse.json();
    if (!studentData || studentData.length === 0) {
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Student not found' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const studentId = studentData[0].id;

    // 2. Verify the instance belongs to this student (security: prevents accessing other students' data)
    const instanceUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,student_id&id=eq.${encodeURIComponent(instanceId)}&student_id=eq.${encodeURIComponent(studentId)}&limit=1`;
    const instanceResponse = await fetch(instanceUrl, { headers });

    if (!instanceResponse.ok) {
      throw new Error(`Instance lookup failed: ${instanceResponse.status}`);
    }

    const instanceData = await instanceResponse.json();
    if (!instanceData || instanceData.length === 0) {
      // Either instance doesn't exist or doesn't belong to this student
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Assignment not found' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    // 3. Get the most recent submission for this instance
    const submissionUrl = `${SUPABASE_URL}/rest/v1/submissions?select=id,feedback,score_total,score_auto,score_manual,review_status,submitted_at&instance_id=eq.${encodeURIComponent(instanceId)}&order=submitted_at.desc&limit=1`;
    const submissionResponse = await fetch(submissionUrl, { headers });

    if (!submissionResponse.ok) {
      throw new Error(`Submission lookup failed: ${submissionResponse.status}`);
    }

    const submissionData = await submissionResponse.json();
    if (!submissionData || submissionData.length === 0) {
      // No submission yet — return empty result (not an error)
      return jsonResponse(
        event,
        200,
        { ok: true, feedback: null, answers: [] },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const submission = submissionData[0];
    const submissionId = submission.id;

    // 4. Get submission_answers joined with assignment_items for grading data
    // Includes: item_ref, answer_type, meta (correct answer), raw_answer, is_correct,
    //           earned_points, max_points, teacher_note
    const answersUrl = `${SUPABASE_URL}/rest/v1/submission_answers?select=raw_answer,is_correct,earned_points,max_points,teacher_note,assignment_items!assignment_item_id(item_ref,answer_type,meta)&submission_id=eq.${encodeURIComponent(submissionId)}`;
    const answersResponse = await fetch(answersUrl, { headers });

    if (!answersResponse.ok) {
      throw new Error(`Answers lookup failed: ${answersResponse.status}`);
    }

    const rawAnswers = await answersResponse.json();

    // Flatten the joined data so each answer includes item_ref, correct_answer, answer_type
    const toNum = (v) => (v != null && v !== '' && !isNaN(Number(v))) ? Number(v) : null;
    const answers = (rawAnswers || []).map(row => {
      const item = Array.isArray(row.assignment_items)
        ? row.assignment_items[0]
        : row.assignment_items;
      return {
        item_ref: item ? item.item_ref : null,
        answer_type: item ? item.answer_type : null,
        correct_answer: (item && item.meta) ? (item.meta.correct || null) : null,
        raw_answer: row.raw_answer || null,
        is_correct: row.is_correct,
        earned_points: toNum(row.earned_points),
        max_points: toNum(row.max_points),
        teacher_note: row.teacher_note || null,
      };
    }).filter(a => a.item_ref != null);

    console.log(`[student-submission-details] [${requestId}] Returning ${answers.length} answers for submission ${submissionId}`);

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        feedback: submission.feedback || null,
        answers,
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-submission-details] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to fetch submission details' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
