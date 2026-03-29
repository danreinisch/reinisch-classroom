// Teacher assignment instances endpoint
// GET /.netlify/functions/teacher-assignment-instances?assignment_id=168
// Auth: Requires teacher session cookie
// Returns: { ok, instances: [{ instance_id, student_id, student_code, student_name, status, assigned_at }] }

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig, lookupActiveTeacherId } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-assignment-instances] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-assignment-instances] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-assignment-instances] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-assignment-instances] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-assignment-instances] [${requestId}] Authorized user: ${authResult.user.username}`);

  const params = event.queryStringParameters || {};
  const { assignment_id } = params;

  if (!assignment_id) {
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id query parameter is required' }, {}, requestId);
  }

  const assignmentIdStr = String(assignment_id).trim();
  if (!/^\d+$/.test(assignmentIdStr)) {
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id must be a positive integer' }, {}, requestId);
  }

  console.log(`[teacher-assignment-instances] [${requestId}] Fetching instances for assignment: ${assignmentIdStr}`);

  try {
    // Step 0: Fetch assignment row to verify it exists and retrieve series for ownership check
    const assignmentLookupUrl = `${SUPABASE_URL}/rest/v1/assignments?select=id,series&id=eq.${assignmentIdStr}&limit=1`;
    const assignmentLookupResponse = await fetch(assignmentLookupUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!assignmentLookupResponse.ok) {
      throw new Error(`Failed to verify assignment: ${assignmentLookupResponse.status}`);
    }
    const assignmentLookupRows = await assignmentLookupResponse.json();
    if (!Array.isArray(assignmentLookupRows) || assignmentLookupRows.length === 0) {
      return jsonResponse(event, 404, { ok: false, error: `Assignment ${assignmentIdStr} not found` }, { 'Cache-Control': 'no-store' }, requestId);
    }

    const assignmentRow = assignmentLookupRows[0];
    console.log(`[teacher-assignment-instances] [${requestId}] Assignment found: id=${assignmentRow.id}, series="${assignmentRow.series}"`);

    // Step 0b: Verify the assignment's class belongs to the authenticated teacher
    const teacherUUID = await lookupActiveTeacherId();
    if (teacherUUID) {
      console.log(`[teacher-assignment-instances] [${requestId}] Resolved active teacher UUID: ${teacherUUID}`);
    } else {
      console.warn(`[teacher-assignment-instances] [${requestId}] No active teacher record found; ownership check will be unscoped`);
    }

    const assignmentSeries = assignmentRow.series;
    if (assignmentSeries) {
      let ownershipUrl;
      if (teacherUUID) {
        ownershipUrl = `${SUPABASE_URL}/rest/v1/classes?select=id&name=eq.${encodeURIComponent(assignmentSeries)}&teacher_id=eq.${encodeURIComponent(teacherUUID)}&limit=1`;
        console.log(`[teacher-assignment-instances] [${requestId}] Checking ownership: class "${assignmentSeries}" for teacher ${teacherUUID}`);
      } else {
        ownershipUrl = `${SUPABASE_URL}/rest/v1/classes?select=id&name=eq.${encodeURIComponent(assignmentSeries)}&limit=1`;
        console.log(`[teacher-assignment-instances] [${requestId}] Checking ownership (unscoped): class "${assignmentSeries}"`);
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
          console.warn(`[teacher-assignment-instances] [${requestId}] Ownership check failed: class "${assignmentSeries}" not found for this teacher`);
          return jsonResponse(event, 403, { ok: false, error: 'Assignment does not belong to your class' }, { 'Cache-Control': 'no-store' }, requestId);
        }
        console.log(`[teacher-assignment-instances] [${requestId}] Ownership verified: class "${assignmentSeries}" belongs to this teacher`);
      } else {
        console.warn(`[teacher-assignment-instances] [${requestId}] Ownership check query failed: ${ownershipResponse.status}; proceeding`);
      }
    } else {
      console.warn(`[teacher-assignment-instances] [${requestId}] Assignment has no series; skipping ownership check`);
    }

    // Fetch instances joined with student info
    const instancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,student_id,status,assigned_at,students(code,name)&assignment_id=eq.${assignmentIdStr}&order=students(code).asc`;

    const instancesResponse = await fetch(instancesUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!instancesResponse.ok) {
      const errorText = await instancesResponse.text();
      console.error(`[teacher-assignment-instances] [${requestId}] Failed to fetch instances: ${instancesResponse.status} - ${errorText}`);
      throw new Error(`Failed to fetch instances: ${instancesResponse.status}`);
    }

    const rows = await instancesResponse.json();

    const instances = (Array.isArray(rows) ? rows : []).map(row => ({
      instance_id: row.id,
      student_id: row.student_id,
      student_code: row.students?.code || '',
      student_name: row.students?.name || row.students?.code || '',
      status: row.status || 'Assigned',
      assigned_at: row.assigned_at || null,
    }));

    // Sort by student_code for consistent display
    instances.sort((a, b) => (a.student_code || '').localeCompare(b.student_code || ''));

    console.log(`[teacher-assignment-instances] [${requestId}] Found ${instances.length} instance(s)`);

    return jsonResponse(
      event,
      200,
      { ok: true, instances },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-assignment-instances] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Failed to fetch assignment instances' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
