// Teacher archive submission endpoint
// POST /.netlify/functions/teacher-archive-submission
// Auth: Requires teacher session cookie
// Body: { submission_id } - UUID of the finalized submission
// Returns: { ok: true, archive_id }
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

async function supaFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = text; }
  return { ok: res.ok, status: res.status, data };
}

exports.handler = async function (event) {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { error: 'Method not allowed' }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(event, 401, { error: 'Unauthorized' }, {}, requestId);
  }

  const sizeCheck = validateBodySize(event.body, 10);
  if (!sizeCheck.valid) {
    return jsonResponse(event, 413, { error: sizeCheck.error }, {}, requestId);
  }

  const parsed = safeJsonParse(event.body);
  if (!parsed.ok) {
    return jsonResponse(event, 400, { error: parsed.error }, {}, requestId);
  }

  const { submission_id } = parsed.data;
  if (!submission_id || typeof submission_id !== 'string') {
    return jsonResponse(event, 400, { error: 'submission_id is required' }, {}, requestId);
  }

  try {
    // 1. Fetch the submission
    const subRes = await supaFetch(
      `/rest/v1/submissions?id=eq.${encodeURIComponent(submission_id)}&select=id,instance_id,answers,score_auto,score_manual,score_total,feedback,submitted_at,review_status`
    );
    if (!subRes.ok || !Array.isArray(subRes.data) || subRes.data.length === 0) {
      return jsonResponse(event, 404, { error: 'Submission not found' }, {}, requestId);
    }
    const submission = subRes.data[0];

    // 2. Fetch the assignment instance (to get student_id, assignment_id, class_code)
    const instRes = await supaFetch(
      `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(submission.instance_id)}&select=id,assignment_id,student_id,settings`
    );
    if (!instRes.ok || !Array.isArray(instRes.data) || instRes.data.length === 0) {
      return jsonResponse(event, 404, { error: 'Assignment instance not found' }, {}, requestId);
    }
    const instance = instRes.data[0];

    // 3. Fetch the student (to get student_code)
    let stuRes = await supaFetch(
      `/rest/v1/students?id=eq.${encodeURIComponent(instance.student_id)}&select=id,code,class_code`
    );
    // If the class_code column doesn't exist in this deployment, retry without it
    if (!stuRes.ok && stuRes.status === 400) {
      const errMsg = typeof stuRes.data === 'object' ? (stuRes.data?.message || '') : String(stuRes.data || '');
      if (errMsg.includes('class_code') || errMsg.includes('42703')) {
        stuRes = await supaFetch(
          `/rest/v1/students?id=eq.${encodeURIComponent(instance.student_id)}&select=id,code`
        );
      }
    }
    if (!stuRes.ok || !Array.isArray(stuRes.data) || stuRes.data.length === 0) {
      return jsonResponse(event, 404, { error: 'Student not found' }, {}, requestId);
    }
    const student = stuRes.data[0];

    // 4. Fetch the assignment (to get title, class_name)
    const asgRes = await supaFetch(
      `/rest/v1/assignments?id=eq.${encodeURIComponent(instance.assignment_id)}&select=id,title,section`
    );
    if (!asgRes.ok || !Array.isArray(asgRes.data) || asgRes.data.length === 0) {
      return jsonResponse(event, 404, { error: 'Assignment not found' }, {}, requestId);
    }
    const assignment = asgRes.data[0];

    // 5. Fetch submission_answers for this submission
    const ansRes = await supaFetch(
      `/rest/v1/submission_answers?submission_id=eq.${encodeURIComponent(submission_id)}&select=assignment_item_id,raw_answer,is_correct,earned_points,max_points`
    );
    const rawAnswers = (ansRes.ok && Array.isArray(ansRes.data)) ? ansRes.data : [];

    // 6. Fetch assignment_items with their mappings for goal/DESE codes
    const itemIds = rawAnswers.map(a => a.assignment_item_id).filter(Boolean);
    let allGoalCodes = [];
    let allDeseCodes = [];

    if (itemIds.length > 0) {
      const itemIdsParam = itemIds.map(id => encodeURIComponent(id)).join(',');
      const mapRes = await supaFetch(
        `/rest/v1/assignment_item_mappings?item_id=in.(${itemIdsParam})&select=goal_codes,dese_codes`
      );
      if (mapRes.ok && Array.isArray(mapRes.data)) {
        const goalSet = new Set();
        const deseSet = new Set();
        mapRes.data.forEach(m => {
          (m.goal_codes || []).forEach(c => goalSet.add(c));
          (m.dese_codes || []).forEach(c => deseSet.add(c));
        });
        allGoalCodes = Array.from(goalSet);
        allDeseCodes = Array.from(deseSet);
      }
    }

    // 7. Build the archive record
    const archiveRecord = {
      submission_id: submission.id,
      student_id: instance.student_id,
      student_code: student.code,
      assignment_id: instance.assignment_id,
      title: assignment.title,
      class_name: student.class_code || assignment.section || null,
      answers: rawAnswers,
      score_auto: submission.score_auto,
      score_manual: submission.score_manual,
      score_total: submission.score_total,
      feedback: submission.feedback || null,
      iep_goal_codes: allGoalCodes,
      dese_standard_codes: allDeseCodes,
      submitted_at: submission.submitted_at,
      reviewed_at: new Date().toISOString(),
      archived_at: new Date().toISOString(),
    };

    // 8. Insert into submission_archives
    const insertRes = await supaFetch(
      `/rest/v1/submission_archives`,
      {
        method: 'POST',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify(archiveRecord),
      }
    );

    if (!insertRes.ok) {
      const errDetail = typeof insertRes.data === 'object' ? insertRes.data : { raw: String(insertRes.data) };
      console.error(`[teacher-archive-submission] [${requestId}] Insert failed:`, insertRes.status, errDetail);
      return jsonResponse(event, 500, { error: 'Failed to create archive', detail: errDetail, status: insertRes.status }, {}, requestId);
    }

    const inserted = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data;
    const archiveId = inserted?.id || null;

    console.log(`[teacher-archive-submission] [${requestId}] Archived submission ${submission_id} -> archive ${archiveId}`);
    return jsonResponse(event, 200, { ok: true, archive_id: archiveId }, {}, requestId);

  } catch (err) {
    console.error(`[teacher-archive-submission] [${requestId}] Unexpected error:`, err);
    return jsonResponse(event, 500, { error: 'Internal server error', detail: err.message || String(err) }, {}, requestId);
  }
};
