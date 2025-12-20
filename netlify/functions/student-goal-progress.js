// Student goal progress endpoint - returns goal progress entries for a student
// GET /.netlify/functions/student-goal-progress?code=XXX
// Auth: Requires code parameter
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-goal-progress] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'GET') {
    console.log(`[student-goal-progress] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-goal-progress] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event, 
      503, 
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Parse query params
  const params = event.queryStringParameters || {};
  const code = params.code;

  // Validate input
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    console.log(`[student-goal-progress] [${requestId}] Missing or invalid code`);
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Student code is required' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Normalize student code to uppercase
  const codeNorm = code.trim().toUpperCase();

  try {
    // First, get student ID from code
    const studentUrl = `${SUPABASE_URL}/rest/v1/students?select=id&code=eq.${encodeURIComponent(codeNorm)}&limit=1`;
    
    console.log(`[student-goal-progress] [${requestId}] Looking up student ID for code:`, codeNorm);
    
    const studentResponse = await fetch(studentUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!studentResponse.ok) {
      throw new Error(`Student lookup failed: ${studentResponse.status}`);
    }

    const studentData = await studentResponse.json();
    
    if (!studentData || studentData.length === 0) {
      console.log(`[student-goal-progress] [${requestId}] Student not found:`, codeNorm);
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Student not found' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const studentId = studentData[0].id;

    // Fetch goal progress for this student with joined goal data
    const progressUrl = `${SUPABASE_URL}/rest/v1/goal_progress?select=*,goals!inner(code,desc,goal_area)&student_id=eq.${studentId}&order=date.desc`;
    
    console.log(`[student-goal-progress] [${requestId}] Fetching goal progress for student ID:`, studentId);
    
    const progressResponse = await fetch(progressUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!progressResponse.ok) {
      throw new Error(`Progress query failed: ${progressResponse.status}`);
    }

    const progress = await progressResponse.json();
    
    // Flatten the response to include goal data at top level for easier consumption
    const flattened = (progress || []).map(entry => ({
      id: entry.id,
      goal_id: entry.goal_id,
      goal_code: entry.goals.code,
      goal_desc: entry.goals.desc,
      goal_area: entry.goals.goal_area || 'Uncategorized',
      student_id: entry.student_id,
      student_code: codeNorm,
      class_id: entry.class_id,
      date: entry.date,
      value: entry.value,
      percent: entry.value, // Alias for backward compatibility
      source: entry.source,
      collected_by: entry.collected_by,
      created_at: entry.created_at
    }));
    
    console.log(`[student-goal-progress] [${requestId}] Successfully fetched ${flattened.length} progress entries`);
    
    return jsonResponse(
      event,
      200,
      { ok: true, progress: flattened },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-goal-progress] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to fetch goal progress' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
