// Student goals endpoint - returns IEP goals for a student
// GET /.netlify/functions/student-goals?code=XXX
// Auth: Requires code parameter
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

const {
  getObjectivesForParentGoal,
} = require('./_lib/goal-objective-catalog');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-goals] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'GET') {
    console.log(`[student-goals] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-goals] [${requestId}] Supabase not configured`);
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
    console.log(`[student-goals] [${requestId}] Missing or invalid code`);
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

  try {
    // First, get student ID from code
    const studentUrl = `${SUPABASE_URL}/rest/v1/students?select=id&code=eq.${encodeURIComponent(codeNorm)}&limit=1`;
    
    console.log(`[student-goals] [${requestId}] Looking up student ID for code:`, codeNorm);
    
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
      console.log(`[student-goals] [${requestId}] Student not found:`, codeNorm);
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Student not found' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const studentId = studentData[0].id;

    // Now fetch goals for this student — active=eq.true excludes archived/replaced goal versions;
    // the or() filter excludes goals explicitly marked closed/archived while preserving null status
    const goalsUrl = `${SUPABASE_URL}/rest/v1/goals?select=*&student_id=eq.${studentId}&active=eq.true&or=(status.is.null,status.not.in.(closed,archived,Closed,Archived))&order=code`;
    
    console.log(`[student-goals] [${requestId}] Fetching active goals for student ID:`, studentId);
    
    const goalsResponse = await fetch(goalsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!goalsResponse.ok) {
      const errorBody = await goalsResponse.text();
      console.error(`[student-goals] [${requestId}] Goals query failed: ${goalsResponse.status}`, errorBody);
      throw new Error(`Goals query failed: ${goalsResponse.status} - ${errorBody}`);
    }

    const goals = await goalsResponse.json();

    const goalsWithObjectives =
      (goals || []).map(goal => {
        const objectives =
          getObjectivesForParentGoal(
            goal.code,
            codeNorm
          );

        return objectives.length > 0
          ? {
              ...goal,
              objectives: objectives,
            }
          : goal;
      });
    
    console.log(`[student-goals] [${requestId}] Successfully fetched ${goals.length} active goals (active=true + status filter applied)`);
    
    return jsonResponse(
      event,
      200,
      { ok: true, goals: goalsWithObjectives },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-goals] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to fetch student goals' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
