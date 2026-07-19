// Student profile endpoint - returns minimal student record
// GET /.netlify/functions/student-profile?code=XXX
// Auth: Requires code parameter matching rc_auth token
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

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-profile] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'GET') {
    console.log(`[student-profile] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-profile] [${requestId}] Supabase not configured`);
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
    console.log(`[student-profile] [${requestId}] Missing or invalid code`);
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
    // Query Supabase REST API for student profile
    // Select minimal fields: code, name (if exists), class_id
    const url = `${SUPABASE_URL}/rest/v1/students?select=code,name,class_id&code=eq.${encodeURIComponent(codeNorm)}&limit=1`;
    
    console.log(`[student-profile] [${requestId}] Fetching profile for code:`, codeNorm);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[student-profile] [${requestId}] Supabase error:`, response.status, errorText);
      throw new Error(`Supabase query failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.log(`[student-profile] [${requestId}] Student not found:`, codeNorm);
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Student not found' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const student = data[0];
    console.log(`[student-profile] [${requestId}] Successfully fetched profile for:`, codeNorm);
    
    return jsonResponse(
      event,
      200,
      { 
        ok: true, 
        profile: {
          code: student.code,
          name: student.name || student.code, // Fallback to code if name not available
          class_id: student.class_id || null
        }
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-profile] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to fetch student profile' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
