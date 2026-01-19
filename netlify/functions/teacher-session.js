// Teacher session verification endpoint
// GET - verifies HttpOnly cookie and returns session status
const { requireTeacher } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  const host = event.headers.host || 'unknown';
  const origin = event.headers.origin || 'none';
  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
  const hasTcCookie = cookieHeader.includes('tc=');
  
  console.log(`[teacher-session] [${requestId}] Request received - host: ${host}, origin: ${origin}, tc cookie present: ${hasTcCookie}`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'GET') {
    console.log(`[teacher-session] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if environment variable is configured
  if (!SESSION_SECRET) {
    console.error(`[teacher-session] [${requestId}] Server not configured: SESSION_SECRET environment variable is missing`);
    return jsonResponse(event, 500, { error: 'Server not configured: SESSION_SECRET missing' }, {}, requestId);
  }

  // Verify session
  const result = requireTeacher(event, SESSION_SECRET);
  
  if (!result.ok) {
    console.log(`[teacher-session] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }
  
  // Session is valid
  // Normalize admin role to teacher for Hub compatibility
  const normalizedRole = result.user.role === 'admin' ? 'teacher' : result.user.role;
  
  console.log(`[teacher-session] [${requestId}] Valid session for user:`, result.user.username, 
    `(role: ${result.user.role}, normalized: ${normalizedRole})`);
  
  return jsonResponse(event, 200, { 
    ok: true, 
    role: normalizedRole,
    raw_role: result.user.role,
    username: result.user.username 
  }, {}, requestId);
};

// __RC_WRAP_HANDLER__
// Prevent Netlify 502s by catching unexpected exceptions and returning JSON.
const __rc_orig_handler = exports.handler;
exports.handler = async function(event, context) {
  try {
    return await __rc_orig_handler(event, context);
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : String(e);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'teacher_session_exception', message: msg.slice(0, 200) }, null, 2)
    };
  }
};

