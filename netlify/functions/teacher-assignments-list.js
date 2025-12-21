// Teacher assignments list endpoint
// GET /.netlify/functions/teacher-assignments-list
// Auth: Requires teacher session cookie
// Returns: List of assignments with fields for issuing dropdown
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-assignments-list] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'GET') {
    console.log(`[teacher-assignments-list] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[teacher-assignments-list] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event, 
      503, 
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Check if SESSION_SECRET is configured
  if (!SESSION_SECRET) {
    console.error(`[teacher-assignments-list] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  // Verify teacher session
  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-assignments-list] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-assignments-list] [${requestId}] Authorized user: ${authResult.user.username}`);

  try {
    // Query assignments table with fields needed for issuing dropdown
    const assignmentsUrl = `${SUPABASE_URL}/rest/v1/assignments?select=id,title,type,series,page,created_at&order=created_at.desc`;
    
    console.log(`[teacher-assignments-list] [${requestId}] Fetching assignments`);
    
    const assignmentsResponse = await fetch(assignmentsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!assignmentsResponse.ok) {
      console.error(`[teacher-assignments-list] [${requestId}] Supabase query failed with status: ${assignmentsResponse.status}`);
      throw new Error(`Assignments query failed: ${assignmentsResponse.status}`);
    }

    const assignments = await assignmentsResponse.json();
    
    console.log(`[teacher-assignments-list] [${requestId}] Successfully fetched ${assignments.length} assignments`);
    
    return jsonResponse(
      event,
      200,
      { ok: true, assignments: assignments || [] },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-assignments-list] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to fetch assignments' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
