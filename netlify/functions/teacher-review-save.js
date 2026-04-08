// Teacher review save endpoint
// POST /.netlify/functions/teacher-review-save
// Auth: Requires teacher session cookie
// Body: { action, ...params } — routes writes through service role key to bypass RLS
// Actions: save_score | save_grade | finalize | mark_reviewed

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
  try { data = JSON.parse(text); } catch (e) { data = text; if (text) console.warn('[teacher-review-save] supaFetch non-JSON response:', e.message); }
  return { ok: res.ok, status: res.status, data };
}

// Action: save_score
// Upsert a submission_answer row with earned_points / teacher_note
async function handleSaveScore(body, requestId) {
  const { submissionId, itemId, earnedPoints, teacherNote, rationale, aiSuggestedScore } = body;

  if (!submissionId || typeof submissionId !== 'string') {
    return { statusCode: 400, error: 'submissionId is required' };
  }
  if (!itemId || typeof itemId !== 'string') {
    return { statusCode: 400, error: 'itemId is required' };
  }
  if (earnedPoints === undefined || earnedPoints === null) {
    return { statusCode: 400, error: 'earnedPoints is required' };
  }

  // Check whether a row already exists so we can PATCH or POST
  const checkRes = await supaFetch(
    `/rest/v1/submission_answers?submission_id=eq.${encodeURIComponent(submissionId)}&assignment_item_id=eq.${encodeURIComponent(itemId)}&select=id`
  );
  if (!checkRes.ok) {
    console.error(`[teacher-review-save] [${requestId}] save_score check error:`, checkRes.status, checkRes.data);
    return { statusCode: 500, error: 'Failed to check existing answer' };
  }

  const existing = Array.isArray(checkRes.data) && checkRes.data.length > 0 ? checkRes.data[0] : null;

  const scored_at = new Date().toISOString();
  let result;

  if (existing) {
    // PATCH existing row — try with teacher_note first, fall back if column missing
    let payload = { earned_points: earnedPoints, teacher_note: teacherNote || '', scored_at };
    if (rationale) payload.rationale = rationale;
    if (aiSuggestedScore != null) payload.ai_suggested_score = aiSuggestedScore;
    result = await supaFetch(
      `/rest/v1/submission_answers?submission_id=eq.${encodeURIComponent(submissionId)}&assignment_item_id=eq.${encodeURIComponent(itemId)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }
    );
    // Fallback: retry without teacher_note if column not found (PGRST204 or message mentions it)
    if (!result.ok) {
      const errMsg = typeof result.data === 'object' ? (result.data?.message || result.data?.code || '') : String(result.data || '');
      if (result.data?.code === 'PGRST204' || errMsg.includes('teacher_note') || errMsg.includes('rationale') || errMsg.includes('ai_suggested_score')) {
        console.warn(`[teacher-review-save] [${requestId}] teacher_note column missing, retrying without it`);
        payload = { earned_points: earnedPoints, scored_at };
        result = await supaFetch(
          `/rest/v1/submission_answers?submission_id=eq.${encodeURIComponent(submissionId)}&assignment_item_id=eq.${encodeURIComponent(itemId)}`,
          { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }
        );
      }
    }
  } else {
    // POST new row — try with teacher_note first, fall back if column missing
    let payload = { submission_id: submissionId, assignment_item_id: itemId, earned_points: earnedPoints, teacher_note: teacherNote || '', scored_at };
    if (rationale) payload.rationale = rationale;
    if (aiSuggestedScore != null) payload.ai_suggested_score = aiSuggestedScore;
    result = await supaFetch(
      `/rest/v1/submission_answers`,
      { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }
    );
    if (!result.ok) {
      const errMsg = typeof result.data === 'object' ? (result.data?.message || result.data?.code || '') : String(result.data || '');
      if (result.data?.code === 'PGRST204' || errMsg.includes('teacher_note') || errMsg.includes('rationale') || errMsg.includes('ai_suggested_score')) {
        console.warn(`[teacher-review-save] [${requestId}] teacher_note column missing, retrying without it`);
        payload = { submission_id: submissionId, assignment_item_id: itemId, earned_points: earnedPoints, scored_at };
        result = await supaFetch(
          `/rest/v1/submission_answers`,
          { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }
        );
      }
    }
  }

  if (!result.ok) {
    console.error(`[teacher-review-save] [${requestId}] save_score write failed:`, result.status, result.data);
    return { statusCode: 500, error: 'Failed to save score', detail: result.data };
  }

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  console.log(`[teacher-review-save] [${requestId}] save_score OK submission=${submissionId} item=${itemId}`);
  return { statusCode: 200, data: row };
}

// Action: save_grade
// PATCH submissions + optionally PATCH assignment_instances
async function handleSaveGrade(body, requestId) {
  const { submissionId, scoreAuto, scoreManual, scoreTotal, status, gradedAt, gradedBy, feedback, instanceId } = body;

  if (!submissionId || typeof submissionId !== 'string') {
    return { statusCode: 400, error: 'submissionId is required' };
  }

  const updates = {};
  if (scoreAuto !== undefined) updates.score_auto = scoreAuto;
  if (scoreManual !== undefined) updates.score_manual = scoreManual;
  if (scoreTotal !== undefined) updates.score_total = scoreTotal;
  if (status !== undefined) updates.review_status = status === 'Graded' ? 'reviewed' : status.toLowerCase();
  if (gradedAt !== undefined) updates.graded_at = gradedAt;
  if (gradedBy !== undefined) updates.graded_by = gradedBy;
  if (feedback !== undefined) updates.feedback = feedback;

  let subRes = await supaFetch(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(updates) }
  );

  // Retry without grading columns if they don't exist in the schema yet
  if (!subRes.ok) {
    const errCode = subRes.data?.code || '';
    const errMsg = typeof subRes.data === 'object'
      ? (subRes.data?.message || subRes.data?.code || '')
      : String(subRes.data || '');
    const isGradingColumnError = (
      errCode === 'PGRST204' ||  // PostgREST column not found
      errCode === '42703' ||     // PostgreSQL undefined_column
      errMsg.includes('graded_at') ||
      errMsg.includes('graded_by') ||
      errMsg.includes('feedback')
    );
    if (isGradingColumnError) {
      console.warn(`[teacher-review-save] [${requestId}] grading columns missing, retrying without them`);
      const safeUpdates = {};
      if (updates.score_auto !== undefined) safeUpdates.score_auto = updates.score_auto;
      if (updates.score_manual !== undefined) safeUpdates.score_manual = updates.score_manual;
      if (updates.score_total !== undefined) safeUpdates.score_total = updates.score_total;
      if (updates.review_status !== undefined) safeUpdates.review_status = updates.review_status;
      subRes = await supaFetch(
        `/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}`,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(safeUpdates) }
      );
    }
  }

  if (!subRes.ok) {
    console.error(`[teacher-review-save] [${requestId}] save_grade submission update failed:`, subRes.status, subRes.data);
    return { statusCode: 500, error: 'Failed to save grade', detail: subRes.data };
  }

  // Optionally update instance status
  if (instanceId && typeof instanceId === 'string') {
    const instRes = await supaFetch(
      `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(instanceId)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'Graded' }) }
    );
    if (!instRes.ok) {
      console.warn(`[teacher-review-save] [${requestId}] save_grade instance update warning:`, instRes.status, instRes.data);
      // Non-fatal
    }
  }

  console.log(`[teacher-review-save] [${requestId}] save_grade OK submission=${submissionId}`);
  return { statusCode: 200, data: { ok: true } };
}

// Action: finalize
// PATCH submissions with scores + review_status, PATCH assignment_instances with Reviewed
async function handleFinalize(body, requestId) {
  const { submissionId, scoreAuto, scoreManual, scoreTotal, instanceId } = body;

  if (!submissionId || typeof submissionId !== 'string') {
    return { statusCode: 400, error: 'submissionId is required' };
  }

  const subRes = await supaFetch(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ score_auto: scoreAuto, score_manual: scoreManual, score_total: scoreTotal, review_status: 'finalized' })
    }
  );

  if (!subRes.ok) {
    console.error(`[teacher-review-save] [${requestId}] finalize submission update failed:`, subRes.status, subRes.data);
    return { statusCode: 500, error: 'Failed to finalize submission', detail: subRes.data };
  }

  // Update instance status if provided
  const iid = instanceId || await lookupInstanceId(submissionId, requestId);
  if (iid) {
    const instRes = await supaFetch(
      `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(iid)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'Reviewed' }) }
    );
    if (!instRes.ok) {
      console.warn(`[teacher-review-save] [${requestId}] finalize instance update warning:`, instRes.status, instRes.data);
      // Non-fatal
    }
  }

  console.log(`[teacher-review-save] [${requestId}] finalize OK submission=${submissionId}`);
  return { statusCode: 200, data: { ok: true } };
}

// Action: set_in_progress
// PATCH submissions review_status to 'in_progress' using service role key
async function handleSetInProgress(body, requestId) {
  const { submissionId } = body;

  if (!submissionId || typeof submissionId !== 'string') {
    return { statusCode: 400, error: 'submissionId is required' };
  }

  const subRes = await supaFetch(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ review_status: 'in_progress' }) }
  );

  if (!subRes.ok) {
    console.error(`[teacher-review-save] [${requestId}] set_in_progress submission update failed:`, subRes.status, subRes.data);
    return { statusCode: 500, error: 'Failed to set in_progress', detail: subRes.data };
  }

  console.log(`[teacher-review-save] [${requestId}] set_in_progress OK submission=${submissionId}`);
  return { statusCode: 200, data: { ok: true } };
}

// Action: reopen
// PATCH submissions review_status back to 'pending', PATCH assignment_instances to 'In Progress'
async function handleReopen(body, requestId) {
  const { submissionId } = body;

  if (!submissionId || typeof submissionId !== 'string') {
    return { statusCode: 400, error: 'submissionId is required' };
  }

  const subRes = await supaFetch(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ review_status: 'pending' })
    }
  );

  if (!subRes.ok) {
    console.error(`[teacher-review-save] [${requestId}] reopen submission update failed:`, subRes.status, subRes.data);
    return { statusCode: 500, error: 'Failed to reopen submission', detail: subRes.data };
  }

  const iid = await lookupInstanceId(submissionId, requestId);
  if (iid) {
    const instRes = await supaFetch(
      `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(iid)}`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'In Progress' }) }
    );
    if (!instRes.ok) {
      console.warn(`[teacher-review-save] [${requestId}] reopen instance update warning:`, instRes.status, instRes.data);
      // Non-fatal
    }
  }

  console.log(`[teacher-review-save] [${requestId}] reopen OK submission=${submissionId}`);
  return { statusCode: 200, data: { ok: true } };
}

// Action: mark_reviewed
// PATCH submissions review_status to 'reviewed', PATCH assignment_instances to Reviewed
async function handleMarkReviewed(body, requestId) {
  const { submissionId, instanceId } = body;

  if (!submissionId || typeof submissionId !== 'string') {
    return { statusCode: 400, error: 'submissionId is required' };
  }

  const subRes = await supaFetch(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ review_status: 'reviewed' }) }
  );

  if (!subRes.ok) {
    console.error(`[teacher-review-save] [${requestId}] mark_reviewed submission update failed:`, subRes.status, subRes.data);
    return { statusCode: 500, error: 'Failed to mark reviewed', detail: subRes.data };
  }

  const iid = instanceId || await lookupInstanceId(submissionId, requestId);
  if (iid) {
    const instRes = await supaFetch(
      `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(iid)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'Reviewed' }) }
    );
    if (!instRes.ok) {
      console.warn(`[teacher-review-save] [${requestId}] mark_reviewed instance update warning:`, instRes.status, instRes.data);
      // Non-fatal
    }
  }

  console.log(`[teacher-review-save] [${requestId}] mark_reviewed OK submission=${submissionId}`);
  return { statusCode: 200, data: { ok: true } };
}

// Action: return_for_revision
// For re-issued assignments with retry_config: mark submission as 'returned' and reset instance to 'Assigned'.
// Skips createResubmission so that an already-used resubmission_count does not block the operation.
async function handleReturnForRevision(body, requestId) {
  const { submissionId, instanceId, feedback, gradedBy } = body;

  if (!submissionId || typeof submissionId !== 'string') {
    return { statusCode: 400, error: 'submissionId is required' };
  }

  const subPatch = { review_status: 'returned', graded_at: new Date().toISOString() };
  if (feedback !== undefined) subPatch.feedback = feedback || null;
  if (gradedBy !== undefined) subPatch.graded_by = gradedBy || null;

  const subRes = await supaFetch(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(subPatch)
    }
  );

  if (!subRes.ok) {
    console.error(`[teacher-review-save] [${requestId}] return_for_revision submission update failed:`, subRes.status, subRes.data);
    return { statusCode: 500, error: 'Failed to return submission for revision', detail: subRes.data };
  }

  // Reset instance status to Assigned so the student can see it again in retry mode
  const iid = instanceId || await lookupInstanceId(submissionId, requestId);
  if (iid) {
    const instRes = await supaFetch(
      `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(iid)}`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'Assigned' }) }
    );
    if (!instRes.ok) {
      console.error(`[teacher-review-save] [${requestId}] return_for_revision instance status reset FAILED — student may not see the assignment: status=${instRes.status}`, instRes.data);
    }
  }

  console.log(`[teacher-review-save] [${requestId}] return_for_revision OK submission=${submissionId}`);
  return { statusCode: 200, data: { ok: true } };
}

// Helper: look up instance_id for a submission via service role key
async function lookupInstanceId(submissionId, requestId) {
  const res = await supaFetch(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}&select=instance_id`
  );
  if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
    console.warn(`[teacher-review-save] [${requestId}] Could not look up instance_id for submission=${submissionId}`);
    return null;
  }
  return res.data[0]?.instance_id || null;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-review-save] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { error: 'Method not allowed' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[teacher-review-save] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-review-save] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-review-save] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { error: 'Unauthorized' }, {}, requestId);
  }

  const sizeCheck = validateBodySize(event.body, 50);
  if (!sizeCheck.valid) {
    return jsonResponse(event, 413, { error: sizeCheck.error }, {}, requestId);
  }

  const parsed = safeJsonParse(event.body);
  if (!parsed.ok) {
    return jsonResponse(event, 400, { error: parsed.error }, {}, requestId);
  }

  const body = parsed.data;
  const { action } = body;

  if (!action || typeof action !== 'string') {
    return jsonResponse(event, 400, { error: 'action is required' }, {}, requestId);
  }

  let result;
  switch (action) {
    case 'save_score':
      result = await handleSaveScore(body, requestId);
      break;
    case 'save_grade':
      result = await handleSaveGrade(body, requestId);
      break;
    case 'finalize':
      result = await handleFinalize(body, requestId);
      break;
    case 'reopen':
      result = await handleReopen(body, requestId);
      break;
    case 'mark_reviewed':
      result = await handleMarkReviewed(body, requestId);
      break;
    case 'return_for_revision':
      result = await handleReturnForRevision(body, requestId);
      break;
    case 'set_in_progress':
      result = await handleSetInProgress(body, requestId);
      break;
    default:
      console.log(`[teacher-review-save] [${requestId}] Unknown action: ${action}`);
      return jsonResponse(event, 400, { error: `Unknown action: ${action}` }, {}, requestId);
  }

  if (result.error) {
    return jsonResponse(event, result.statusCode || 500, { error: result.error, detail: result.detail }, {}, requestId);
  }

  return jsonResponse(event, result.statusCode || 200, result.data, {}, requestId);
};
