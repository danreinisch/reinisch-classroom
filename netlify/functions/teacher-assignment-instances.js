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
const { getSupabaseConfig } = require('./_lib/supa');

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
