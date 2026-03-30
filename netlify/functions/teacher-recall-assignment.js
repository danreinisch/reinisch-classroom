// Teacher recall assignment endpoint
// POST /.netlify/functions/teacher-recall-assignment
// Auth: Requires teacher session cookie
// Body: { assignment_id, student_ids?: string[], reason? }
//   - Without student_ids: recalls from ALL students (existing behaviour)
//   - With student_ids: recalls only from those specific students (partial recall)
// Returns: { ok, recalled_instances, recalled_submissions }

function getCurrentSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig, lookupActiveTeacherId } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-recall-assignment] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-recall-assignment] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-recall-assignment] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const sizeCheck = validateBodySize(event.body, 10);
  if (!sizeCheck.valid) {
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-recall-assignment] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-recall-assignment] [${requestId}] Authorized user: ${authResult.user.username}`);

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-recall-assignment] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { assignment_id, reason, student_ids } = parseResult.data;

  if (!assignment_id) {
    console.log(`[teacher-recall-assignment] [${requestId}] Missing assignment_id`);
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id is required' }, {}, requestId);
  }

  // assignment_id is a bigint in the DB — accept numeric strings or integers
  const assignmentIdStr = String(assignment_id).trim();
  if (!/^\d+$/.test(assignmentIdStr)) {
    console.log(`[teacher-recall-assignment] [${requestId}] Invalid assignment_id format`);
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id must be a positive integer' }, {}, requestId);
  }

  // Validate optional student_ids — must be a non-empty array of UUID strings when provided
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isPartialRecall = Array.isArray(student_ids) && student_ids.length > 0;

  if (student_ids !== undefined && student_ids !== null) {
    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return jsonResponse(event, 400, { ok: false, error: 'student_ids must be a non-empty array when provided' }, {}, requestId);
    }
    for (const sid of student_ids) {
      if (typeof sid !== 'string' || !uuidPattern.test(sid)) {
        return jsonResponse(event, 400, { ok: false, error: 'All student_ids must be valid UUID strings' }, {}, requestId);
      }
    }
  }

  console.log(`[teacher-recall-assignment] [${requestId}] Recalling assignment: ${assignmentIdStr}${isPartialRecall ? ` (partial: ${student_ids.length} student(s))` : ' (full recall)'}`);

  try {
    // Step 1: Fetch assignment metadata to preserve in recall_library before deletion
    const assignmentMetaUrl = `${SUPABASE_URL}/rest/v1/assignments?select=id,title,type,series,meta,school_year&id=eq.${assignmentIdStr}&limit=1`;

    console.log(`[teacher-recall-assignment] [${requestId}] Fetching assignment metadata`);

    const assignmentMetaResponse = await fetch(assignmentMetaUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    let assignmentMeta = null;
    if (assignmentMetaResponse.ok) {
      const rows = await assignmentMetaResponse.json().catch(() => []);
      assignmentMeta = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } else {
      console.warn(`[teacher-recall-assignment] [${requestId}] Could not fetch assignment metadata: ${assignmentMetaResponse.status}`);
    }

    // Step 1b: Verify the assignment's class belongs to the authenticated teacher
    const teacherUUID = await lookupActiveTeacherId();
    if (teacherUUID) {
      console.log(`[teacher-recall-assignment] [${requestId}] Resolved active teacher UUID: ${teacherUUID}`);
    } else {
      console.warn(`[teacher-recall-assignment] [${requestId}] No active teacher record found; ownership check will be unscoped`);
    }

    const assignmentSeries = assignmentMeta ? assignmentMeta.series : null;
    if (assignmentSeries) {
      let ownershipUrl;
      if (teacherUUID) {
        ownershipUrl = `${SUPABASE_URL}/rest/v1/classes?select=id&name=eq.${encodeURIComponent(assignmentSeries)}&teacher_id=eq.${encodeURIComponent(teacherUUID)}&limit=1`;
        console.log(`[teacher-recall-assignment] [${requestId}] Checking ownership: class "${assignmentSeries}" for teacher ${teacherUUID}`);
      } else {
        ownershipUrl = `${SUPABASE_URL}/rest/v1/classes?select=id&name=eq.${encodeURIComponent(assignmentSeries)}&limit=1`;
        console.log(`[teacher-recall-assignment] [${requestId}] Checking ownership (unscoped): class "${assignmentSeries}"`);
      }

      const ownershipResponse = await fetch(ownershipUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (ownershipResponse.ok) {
        const ownershipRows = await ownershipResponse.json();
        if (!Array.isArray(ownershipRows) || ownershipRows.length === 0) {
          console.warn(`[teacher-recall-assignment] [${requestId}] Ownership check failed: class "${assignmentSeries}" not found for this teacher`);
          return jsonResponse(event, 403, { ok: false, error: 'Assignment does not belong to your class' }, { 'Cache-Control': 'no-store' }, requestId);
        }
        console.log(`[teacher-recall-assignment] [${requestId}] Ownership verified: class "${assignmentSeries}" belongs to this teacher`);
      } else {
        console.warn(`[teacher-recall-assignment] [${requestId}] Ownership check query failed: ${ownershipResponse.status}; proceeding`);
      }
    } else {
      console.warn(`[teacher-recall-assignment] [${requestId}] Assignment has no series; skipping ownership check`);
    }

    // Step 2: Fetch assignment_instances to get their IDs
    // For partial recall, filter by both assignment_id and the target student_ids
    let instancesQueryUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id&assignment_id=eq.${assignmentIdStr}`;
    if (isPartialRecall) {
      const quotedStudentIds = student_ids.map(id => `"${id}"`).join(',');
      instancesQueryUrl += `&student_id=in.(${quotedStudentIds})`;
    }

    console.log(`[teacher-recall-assignment] [${requestId}] Fetching assignment instances`);

    const instancesQueryResponse = await fetch(instancesQueryUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!instancesQueryResponse.ok) {
      const errorText = await instancesQueryResponse.text();
      console.error(`[teacher-recall-assignment] [${requestId}] Failed to fetch instances: ${instancesQueryResponse.status} - ${errorText}`);
      throw new Error(`Failed to fetch assignment instances: ${instancesQueryResponse.status}`);
    }

    const instanceRows = await instancesQueryResponse.json();
    const instanceCount = Array.isArray(instanceRows) ? instanceRows.length : 0;

    console.log(`[teacher-recall-assignment] [${requestId}] Found ${instanceCount} instance(s) to recall`);

    let recalled_submissions = 0;

    if (instanceCount > 0) {
      const instanceIds = instanceRows.map(r => r.id);

      // Validate that all instance IDs are UUIDs before using them in the URL
      const validInstanceIds = instanceIds.filter(id => typeof id === 'string' && uuidPattern.test(id));

      if (validInstanceIds.length !== instanceIds.length) {
        console.warn(`[teacher-recall-assignment] [${requestId}] Skipping ${instanceIds.length - validInstanceIds.length} instance(s) with invalid ID format`);
      }

      if (validInstanceIds.length > 0) {
        const quotedIds = validInstanceIds.map(id => `"${id}"`).join(',');

        // Delete goal_data_points for these instances
        const deleteGoalDataPointsUrl = `${SUPABASE_URL}/rest/v1/goal_data_points?assignment_instance_id=in.(${quotedIds})`;
        console.log(`[teacher-recall-assignment] [${requestId}] Deleting goal_data_points for ${validInstanceIds.length} instance(s)`);
        const deleteGoalDataPointsResponse = await fetch(deleteGoalDataPointsUrl, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
        });
        if (!deleteGoalDataPointsResponse.ok) {
          const errorText = await deleteGoalDataPointsResponse.text();
          console.warn(`[teacher-recall-assignment] [${requestId}] Failed to delete goal_data_points: ${deleteGoalDataPointsResponse.status} - ${errorText}`);
        } else {
          console.log(`[teacher-recall-assignment] [${requestId}] Deleted goal_data_points for recalled instances`);
        }

        // Delete goal_progress entries linked to these instances
        const deleteGoalProgressUrl = `${SUPABASE_URL}/rest/v1/goal_progress?assignment_instance_id=in.(${quotedIds})`;
        console.log(`[teacher-recall-assignment] [${requestId}] Deleting goal_progress for ${validInstanceIds.length} instance(s)`);
        const deleteGoalProgressResponse = await fetch(deleteGoalProgressUrl, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
        });
        if (!deleteGoalProgressResponse.ok) {
          const errorText = await deleteGoalProgressResponse.text();
          console.warn(`[teacher-recall-assignment] [${requestId}] Failed to delete goal_progress: ${deleteGoalProgressResponse.status} - ${errorText}`);
        } else {
          console.log(`[teacher-recall-assignment] [${requestId}] Deleted goal_progress for recalled instances`);
        }

        // Delete submissions for these instances (foreign key order: submissions first)
        const deleteSubmissionsUrl = `${SUPABASE_URL}/rest/v1/submissions?instance_id=in.(${quotedIds})`;

        console.log(`[teacher-recall-assignment] [${requestId}] Deleting submissions for ${validInstanceIds.length} instance(s)`);

        const deleteSubmissionsResponse = await fetch(deleteSubmissionsUrl, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
        });

        if (!deleteSubmissionsResponse.ok) {
          const errorText = await deleteSubmissionsResponse.text();
          console.error(`[teacher-recall-assignment] [${requestId}] Failed to delete submissions: ${deleteSubmissionsResponse.status} - ${errorText}`);
          throw new Error(`Failed to delete submissions: ${deleteSubmissionsResponse.status}`);
        }

        const deletedSubmissions = await deleteSubmissionsResponse.json().catch(() => []);
        recalled_submissions = Array.isArray(deletedSubmissions) ? deletedSubmissions.length : 0;

        console.log(`[teacher-recall-assignment] [${requestId}] Deleted ${recalled_submissions} submission(s)`);
      }
    }

    // Step 3: Delete the targeted assignment_instances
    // For partial recall, scope deletion to the specific instance IDs already fetched
    let deleteInstancesUrl;
    if (isPartialRecall && instanceCount > 0) {
      const validInstanceIds = instanceRows
        .map(r => r.id)
        .filter(id => typeof id === 'string' && uuidPattern.test(id));
      const quotedInstanceIds = validInstanceIds.map(id => `"${id}"`).join(',');
      deleteInstancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?id=in.(${quotedInstanceIds})`;
    } else if (isPartialRecall && instanceCount === 0) {
      // Nothing to delete — skip the DELETE call
      deleteInstancesUrl = null;
    } else {
      deleteInstancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?assignment_id=eq.${assignmentIdStr}`;
    }

    let recalled_instances = 0;

    if (deleteInstancesUrl) {
      console.log(`[teacher-recall-assignment] [${requestId}] Deleting assignment instances`);

      const deleteInstancesResponse = await fetch(deleteInstancesUrl, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
      });

      if (!deleteInstancesResponse.ok) {
        const errorText = await deleteInstancesResponse.text();
        console.error(`[teacher-recall-assignment] [${requestId}] Failed to delete instances: ${deleteInstancesResponse.status} - ${errorText}`);
        throw new Error(`Failed to delete assignment instances: ${deleteInstancesResponse.status}`);
      }

      const deletedInstances = await deleteInstancesResponse.json().catch(() => []);
      recalled_instances = Array.isArray(deletedInstances) ? deletedInstances.length : 0;
    }

    console.log(`[teacher-recall-assignment] [${requestId}] Deleted ${recalled_instances} instance(s)`);

    // Step 4: Insert a record into recall_library to preserve assignment metadata
    // For partial recalls, note the recalled student IDs in the record
    if (assignmentMeta) {
      const recallRecord = {
        assignment_id: assignmentMeta.id,
        title: assignmentMeta.title || '',
        type: assignmentMeta.type || null,
        series: assignmentMeta.series || null,
        meta: assignmentMeta.meta || null,
        category: assignmentMeta.meta?.category || null,
        recalled_at: new Date().toISOString(),
        recalled_by: authResult.user.username,
        school_year: assignmentMeta.school_year || getCurrentSchoolYear(),
        reason: reason || null,
        created_at: new Date().toISOString(),
      };

      // For partial recalls, annotate the meta with partial recall info
      if (isPartialRecall) {
        recallRecord.meta = {
          ...(recallRecord.meta || {}),
          partial_recall: true,
          recalled_student_ids: student_ids,
        };
      }

      const insertRecallUrl = `${SUPABASE_URL}/rest/v1/recall_library`;
      const insertRecallResponse = await fetch(insertRecallUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(recallRecord),
      });

      if (!insertRecallResponse.ok) {
        // Log but do not fail the recall — the instances/submissions are already deleted
        const errorText = await insertRecallResponse.text();
        console.warn(`[teacher-recall-assignment] [${requestId}] Failed to insert recall_library record: ${insertRecallResponse.status} - ${errorText}`);
      } else {
        console.log(`[teacher-recall-assignment] [${requestId}] Recall library record created for assignment ${assignmentIdStr}`);
      }
    } else {
      console.warn(`[teacher-recall-assignment] [${requestId}] Skipping recall_library insert — assignment metadata not available`);
    }

    console.log(`[teacher-recall-assignment] [${requestId}] Recall complete: ${recalled_instances} instance(s), ${recalled_submissions} submission(s) removed`);

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        recalled_instances,
        recalled_submissions,
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-recall-assignment] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Failed to recall assignment' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
