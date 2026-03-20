// Teacher recall assignment endpoint
// POST /.netlify/functions/teacher-recall-assignment
// Auth: Requires teacher session cookie
// Body: { assignment_id }
// Returns: { ok, recalled_instances, recalled_submissions }

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

  const { assignment_id } = parseResult.data;

  if (!assignment_id || typeof assignment_id !== 'string') {
    console.log(`[teacher-recall-assignment] [${requestId}] Missing or invalid assignment_id`);
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id is required and must be a string' }, {}, requestId);
  }

  // Basic UUID format validation to prevent injection
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(assignment_id)) {
    console.log(`[teacher-recall-assignment] [${requestId}] Invalid assignment_id format`);
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id must be a valid UUID' }, {}, requestId);
  }

  console.log(`[teacher-recall-assignment] [${requestId}] Recalling assignment: ${assignment_id}`);

  try {
    // Step 1: Fetch assignment_instances for this assignment to get their IDs
    const instancesQueryUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id&assignment_id=eq.${encodeURIComponent(assignment_id)}`;

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
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validInstanceIds = instanceIds.filter(id => typeof id === 'string' && uuidPattern.test(id));

      if (validInstanceIds.length !== instanceIds.length) {
        console.warn(`[teacher-recall-assignment] [${requestId}] Skipping ${instanceIds.length - validInstanceIds.length} instance(s) with invalid ID format`);
      }

      if (validInstanceIds.length > 0) {
        // Step 2: Delete submissions for these instances (foreign key order: submissions first)
        const quotedIds = validInstanceIds.map(id => `"${id}"`).join(',');
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

    // Step 3: Delete assignment_instances for this assignment
    const deleteInstancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?assignment_id=eq.${encodeURIComponent(assignment_id)}`;

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
    const recalled_instances = Array.isArray(deletedInstances) ? deletedInstances.length : 0;

    console.log(`[teacher-recall-assignment] [${requestId}] Deleted ${recalled_instances} instance(s)`);

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
