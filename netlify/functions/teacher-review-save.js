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

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

async function readAuthorizationRows(path, label, requestId) {
  const result = await supaFetch(path);

  if (!result.ok) {
    console.error(
      `[teacher-review-save] [${requestId}] ${label} failed:`,
      result.status,
      result.data
    );

    return {
      ok: false,
      statusCode: 500,
      error: 'Authorization check failed',
      rows: [],
    };
  }

  return {
    ok: true,
    rows: Array.isArray(result.data) ? result.data : [],
  };
}

async function authorizeReviewMutation(body, teacherId, requestId) {
  const submissionId = body && body.submissionId;

  if (!isUuid(submissionId)) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Invalid submissionId',
    };
  }

  const submissionResult = await readAuthorizationRows(
    '/rest/v1/submissions' +
      '?select=id,instance_id' +
      `&id=eq.${encodeURIComponent(submissionId)}` +
      '&limit=1',
    'Submission authorization query',
    requestId
  );

  if (!submissionResult.ok) return submissionResult;

  const submission = submissionResult.rows[0];

  if (!submission || !isUuid(submission.instance_id)) {
    return {
      ok: false,
      statusCode: 404,
      error: 'Submission not found',
    };
  }

  const instanceId = submission.instance_id;

  const instanceResult = await readAuthorizationRows(
    '/rest/v1/assignment_instances' +
      '?select=id,student_id,assignment_id' +
      `&id=eq.${encodeURIComponent(instanceId)}` +
      '&limit=1',
    'Assignment instance authorization query',
    requestId
  );

  if (!instanceResult.ok) return instanceResult;

  const instance = instanceResult.rows[0];

  if (
    !instance ||
    !isUuid(instance.id) ||
    !isUuid(instance.student_id) ||
    instance.assignment_id === null ||
    instance.assignment_id === undefined
  ) {
    return {
      ok: false,
      statusCode: 404,
      error: 'Submission not found',
    };
  }

  const studentId = instance.student_id;
  const assignmentId = String(instance.assignment_id);

  const assignmentResult = await readAuthorizationRows(
    '/rest/v1/assignments' +
      '?select=id,class_id,type,meta' +
      `&id=eq.${encodeURIComponent(assignmentId)}` +
      '&limit=1',
    'Assignment authorization query',
    requestId
  );

  if (!assignmentResult.ok) return assignmentResult;

  const assignment = assignmentResult.rows[0];

  if (!assignment || !isUuid(assignment.class_id)) {
    return {
      ok: false,
      statusCode: 404,
      error: 'Submission not found',
    };
  }

  const classId = assignment.class_id;

  const classResult = await readAuthorizationRows(
    '/rest/v1/classes' +
      '?select=id' +
      `&id=eq.${encodeURIComponent(classId)}` +
      `&teacher_id=eq.${encodeURIComponent(teacherId)}` +
      '&limit=1',
    'Class ownership authorization query',
    requestId
  );

  if (!classResult.ok) return classResult;

  if (classResult.rows.length === 0) {
    return {
      ok: false,
      statusCode: 404,
      error: 'Submission not found',
    };
  }

  const enrollmentResult = await readAuthorizationRows(
    '/rest/v1/class_enrollments' +
      '?select=class_id,student_id,active' +
      `&class_id=eq.${encodeURIComponent(classId)}` +
      `&student_id=eq.${encodeURIComponent(studentId)}` +
      '&active=eq.true' +
      '&limit=1',
    'Class enrollment authorization query',
    requestId
  );

  if (!enrollmentResult.ok) return enrollmentResult;

  if (enrollmentResult.rows.length === 0) {
    return {
      ok: false,
      statusCode: 404,
      error: 'Submission not found',
    };
  }


  const assignmentMeta =
    assignment.meta &&
    typeof assignment.meta === 'object' &&
    !Array.isArray(assignment.meta)
      ? assignment.meta
      : {};

  // Canonical MANUAL grades are completed teacher-entered results.
  // They remain visible in Gradebook/history but never re-enter the
  // digital Teacher Review mutation or goal-evidence workflow.
  if (assignmentMeta.manual === true) {
    return {
      ok: false,
      statusCode: 409,
      error: 'Manual grades are read-only in Teacher Review',
    };
  }

  // PAPER records are teacher-entered evidence. Once the full canonical
  // teacher/class/student authorization chain succeeds, keep them read-only
  // inside the digital Review mutation workflow.
  if (assignment.type === 'paper') {
    return {
      ok: false,
      statusCode: 409,
      error: 'Paper evidence is read-only in Teacher Review',
    };
  }

  if (body.action === 'save_score') {
    if (!body.itemId || typeof body.itemId !== 'string') {
      return {
        ok: false,
        statusCode: 400,
        error: 'itemId is required',
      };
    }

    const itemResult = await readAuthorizationRows(
      '/rest/v1/assignment_items' +
        '?select=id,assignment_id' +
        `&id=eq.${encodeURIComponent(body.itemId)}` +
        `&assignment_id=eq.${encodeURIComponent(assignmentId)}` +
        '&limit=1',
      'Assignment item authorization query',
      requestId
    );

    if (!itemResult.ok) return itemResult;

    if (itemResult.rows.length === 0) {
      return {
        ok: false,
        statusCode: 404,
        error: 'Submission not found',
      };
    }
  }

  return {
    ok: true,
    context: {
      submissionId,
      instanceId,
      studentId,
      assignmentId,
      classId,
    },
  };
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

  // Update instance status — use caller-provided instanceId or look it up from the DB
  const iid = (instanceId && typeof instanceId === 'string') ? instanceId : await lookupInstanceId(submissionId, requestId);
  if (iid) {
    const instRes = await supaFetch(
      `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(iid)}`,
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
  const { submissionId, instanceId } = body;

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

  const iid = (instanceId && typeof instanceId === 'string') ? instanceId : await lookupInstanceId(submissionId, requestId);
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
// Mark submission as 'returned', reset instance to 'Assigned', and build retry_config so the
// student sees Revision Mode (correct answers locked + green, incorrect answers pre-filled + red).
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

  const submissionRow = Array.isArray(subRes.data) && subRes.data.length > 0 ? subRes.data[0] : null;
  const scoreTotal = submissionRow ? submissionRow.score_total : null;

  // Reset instance status to Assigned so the student can see it again in revision mode
  const iid = instanceId || await lookupInstanceId(submissionId, requestId);
  if (iid) {
    const instRes = await supaFetch(
      `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(iid)}`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'Assigned' }) }
    );
    if (!instRes.ok) {
      console.error(`[teacher-review-save] [${requestId}] return_for_revision instance status reset FAILED — student may not see the assignment: status=${instRes.status}`, instRes.data);
    }

    // Build retry_config from submission_answers so the portal can show Revision Mode
    try {
      // 1. Fetch all submission_answers for this submission
      const answersRes = await supaFetch(
        `/rest/v1/submission_answers?submission_id=eq.${encodeURIComponent(submissionId)}&select=assignment_item_id,is_correct,raw_answer`
      );
      const subAnswers = (answersRes.ok && Array.isArray(answersRes.data)) ? answersRes.data : [];

      if (subAnswers.length === 0) {
        console.warn(`[teacher-review-save] [${requestId}] return_for_revision: no submission_answers found for submission=${submissionId} — skipping retry_config build`);
      } else {
        // 2. Fetch the assignment_id from the instance
        const instDetailRes = await supaFetch(
          `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(iid)}&select=assignment_id,settings`
        );
        const instDetail = (instDetailRes.ok && Array.isArray(instDetailRes.data) && instDetailRes.data.length > 0)
          ? instDetailRes.data[0]
          : null;

        if (!instDetail || !instDetail.assignment_id) {
          console.warn(`[teacher-review-save] [${requestId}] return_for_revision: could not fetch instance detail for iid=${iid}`);
        } else {
          const { assignment_id: assignmentId, settings: existingSettings } = instDetail;

          // 3. Fetch assignment_items to build item_id → item_ref lookup
          const itemsRes = await supaFetch(
            `/rest/v1/assignment_items?assignment_id=eq.${encodeURIComponent(assignmentId)}&select=id,item_ref`
          );
          const allItems = (itemsRes.ok && Array.isArray(itemsRes.data)) ? itemsRes.data : [];

          const itemRefById = {};
          for (const item of allItems) {
            if (item.id && item.item_ref) itemRefById[item.id] = item.item_ref;
          }

          // 4. Build retry_config
          const lockedQuestionIds = [];
          const originalAnswers = {};
          for (const ans of subAnswers) {
            const itemRef = itemRefById[ans.assignment_item_id];
            if (!itemRef) continue;
            const answerVal = ans.raw_answer && ans.raw_answer.value != null
              ? String(ans.raw_answer.value)
              : null;
            if (answerVal !== null) {
              // Include ALL answers (correct + incorrect) so the student can see what they picked
              originalAnswers[itemRef] = answerVal;
            }
            if (ans.is_correct === true) {
              lockedQuestionIds.push(itemRef);
            }
          }

          const retryConfig = {
            locked_question_ids: lockedQuestionIds,
            original_answers: originalAnswers,
            original_score: scoreTotal != null ? Math.round(scoreTotal) : null,
            retry_initiated_at: new Date().toISOString(),
            revision_mode: true,
          };

          // 5. PATCH the instance to store retry_config and pre-populate answers
          const updatedSettings = { ...(existingSettings || {}), retry_config: retryConfig, answers: originalAnswers };
          const configPatchRes = await supaFetch(
            `/rest/v1/assignment_instances?id=eq.${encodeURIComponent(iid)}`,
            {
              method: 'PATCH',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({ settings: updatedSettings }),
            }
          );
          if (!configPatchRes.ok) {
            console.error(`[teacher-review-save] [${requestId}] return_for_revision: failed to save retry_config to instance settings:`, configPatchRes.status, configPatchRes.data);
          } else {
            console.log(`[teacher-review-save] [${requestId}] return_for_revision: retry_config saved — locked=${lockedQuestionIds.length} correct, total=${Object.keys(originalAnswers).length} answers`);
          }
        }
      }
    } catch (retryConfigErr) {
      // Non-fatal: log the error but still return success so the student is unblocked
      console.error(`[teacher-review-save] [${requestId}] return_for_revision: unexpected error building retry_config (non-fatal):`, retryConfigErr);
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

  const teacherId = authResult.user && authResult.user.teacherId;
  if (!isUuid(teacherId)) {
    console.log(`[teacher-review-save] [${requestId}] Missing signed teacherId`);
    return jsonResponse(event, 403, { error: 'Forbidden' }, {}, requestId);
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

  const allowedActions = new Set([
    'save_score',
    'save_grade',
    'finalize',
    'reopen',
    'mark_reviewed',
    'return_for_revision',
    'set_in_progress',
  ]);

  if (!allowedActions.has(action)) {
    console.log(`[teacher-review-save] [${requestId}] Unknown action: ${action}`);
    return jsonResponse(event, 400, { error: `Unknown action: ${action}` }, {}, requestId);
  }

  const authorization = await authorizeReviewMutation(
    body,
    teacherId,
    requestId
  );

  if (!authorization.ok) {
    return jsonResponse(
      event,
      authorization.statusCode || 500,
      { error: authorization.error || 'Authorization failed' },
      {},
      requestId
    );
  }

  // Caller-provided instanceId is intentionally non-authoritative.
  // Every instance mutation receives the canonical instance derived from
  // the authorized submission.
  const authorizedBody = {
    ...body,
    submissionId: authorization.context.submissionId,
    instanceId: authorization.context.instanceId,
  };

  let result;
  switch (action) {
    case 'save_score':
      result = await handleSaveScore(authorizedBody, requestId);
      break;
    case 'save_grade':
      result = await handleSaveGrade(authorizedBody, requestId);
      break;
    case 'finalize':
      result = await handleFinalize(authorizedBody, requestId);
      break;
    case 'reopen':
      result = await handleReopen(authorizedBody, requestId);
      break;
    case 'mark_reviewed':
      result = await handleMarkReviewed(authorizedBody, requestId);
      break;
    case 'return_for_revision':
      result = await handleReturnForRevision(authorizedBody, requestId);
      break;
    case 'set_in_progress':
      result = await handleSetInProgress(authorizedBody, requestId);
      break;
    default:
      return jsonResponse(event, 400, { error: 'Unknown action' }, {}, requestId);
  }

  if (result.error) {
    return jsonResponse(event, result.statusCode || 500, { error: result.error, detail: result.detail }, {}, requestId);
  }

  return jsonResponse(event, result.statusCode || 200, result.data, {}, requestId);
};
