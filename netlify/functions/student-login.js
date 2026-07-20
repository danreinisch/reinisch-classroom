// Student login endpoint for server-side password verification
// Verifies student credentials against Supabase using RPC
// Used by hub student sign-in and student portal to avoid exposing service keys client-side

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

const {
  getSupabaseConfig,
  parseBooleanRpcResponse,
} = require('./_lib/supa');

const {
  createStudentSessionCookie,
} = require('./_lib/student-auth');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

function studentLoginSuccess(event, requestId, code) {
  if (!SESSION_SECRET) {
    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error: 'Server not configured',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const host =
    event.headers?.host ||
    event.headers?.Host ||
    '';

  const isLocalhost =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1');

  const sessionCookie =
    createStudentSessionCookie(
      code,
      SESSION_SECRET,
      {
        secure: !isLocalhost,
      }
    );

  return {
    statusCode: 200,
    headers: {
      ...getSecurityHeaders(requestId),
      ...getCorsHeaders(
        event,
        ['POST', 'OPTIONS'],
        ['Content-Type']
      ),
      'Set-Cookie': sessionCookie,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      ok: true,
      code,
      name: code,
    }),
  };
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-login] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'POST') {
    console.log(`[student-login] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-login] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event, 
      503, 
      { ok: false, error: 'Authentication service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    console.error(`[student-login] [${requestId}] Invalid JSON:`, err);
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Invalid request body' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const { code, password } = body;

  // Validate input
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    console.log(`[student-login] [${requestId}] Missing or invalid code`);
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Student code is required' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  if (!password || typeof password !== 'string') {
    console.log(`[student-login] [${requestId}] Missing or invalid password`);
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Password is required' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Normalize student code to uppercase
  const codeNorm = code.trim().toUpperCase();

  try {
    // Call verify_student_password RPC with correct parameter names
    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/verify_student_password`;
    
    console.log(`[student-login] [${requestId}] Verifying credentials for code:`, codeNorm);
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_code: codeNorm,
        p_password: password  // Use p_password, not p_plain
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[student-login] [${requestId}] RPC error - status:`, response.status);
      
      // Check for specific error messages (don't log full error text as it may contain sensitive info)
      if (errorText.includes('Account inactive')) {
        console.log(`[student-login] [${requestId}] Account inactive`);
        return jsonResponse(
          event,
          403,
          { ok: false, error: 'Account inactive. Please contact teacher.' },
          { 'Cache-Control': 'no-store' },
          requestId
        );
      }
      
      // Check if it's a server/config error vs auth error
      if (response.status >= 500) {
        console.error(`[student-login] [${requestId}] Server error from Supabase:`, response.status);
        return jsonResponse(
          event,
          503,
          { ok: false, error: 'Authentication service unavailable' },
          { 'Cache-Control': 'no-store' },
          requestId
        );
      }
      
      // Generic RPC failure - treat as invalid credentials (don't reveal DB details)
      console.log(`[student-login] [${requestId}] RPC returned error`);
      return jsonResponse(
        event,
        401,
        { ok: false, error: 'Invalid credentials' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    // Parse RPC response - handle various PostgREST formats
    const rpcResult = await response.json();
    const isValid = parseBooleanRpcResponse(rpcResult);
    
    if (isValid === true) {
      console.log(`[student-login] [${requestId}] Login successful`);
      
      // Return code as name (post-PII removal, students only have code)
      return studentLoginSuccess(
        event,
        requestId,
        codeNorm
      );
    }

    // verify_student_password returned false — try verify_user_password as fallback
    // (handles the case where password was written to app_users but not student_passwords)
    console.log(`[student-login] [${requestId}] verify_student_password returned false, trying fallback`);
    const fallbackUrl = `${SUPABASE_URL}/rest/v1/rpc/verify_user_password`;
    const fallbackResponse = await fetch(fallbackUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_username: codeNorm, p_password: password })
    });

    if (fallbackResponse.ok) {
      const fallbackResult = await fallbackResponse.json();
      // verify_user_password returns TABLE rows (user objects), not booleans
      if (Array.isArray(fallbackResult) && fallbackResult.length > 0 &&
          typeof fallbackResult[0] === 'object' && fallbackResult[0] !== null) {
        console.log(`[student-login] [${requestId}] Login successful via fallback`);
        return studentLoginSuccess(
          event,
          requestId,
          codeNorm
        );
      }
    }

    console.log(`[student-login] [${requestId}] Invalid credentials`);
    return jsonResponse(
      event,
      401,
      { ok: false, error: 'Invalid credentials' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
    
  } catch (err) {
    console.error(`[student-login] [${requestId}] Error:`, err.message);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Authentication failed' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
