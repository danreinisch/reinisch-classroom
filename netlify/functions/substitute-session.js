// Substitute session check endpoint
// GET request
// Checks if substitute has valid session cookie
// Returns { ok: true, role: 'substitute' } if valid

console.log('[substitute-session] Module loaded successfully');

const { verify } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[substitute-session] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    console.log(`[substitute-session] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if session secret is configured
  if (!SESSION_SECRET) {
    console.error(`[substitute-session] [${requestId}] Server not configured: Missing session secret`);
    return jsonResponse(event, 500, { error: 'Server not configured' }, {}, requestId);
  }

  try {
    // Extract cookie
    const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
    const token = getCookie(cookieHeader, 'sub_session');

    if (!token) {
      console.log(`[substitute-session] [${requestId}] No session cookie found`);
      return jsonResponse(event, 401, { error: 'Not authenticated' }, {}, requestId);
    }

    // Verify token
    const payload = verify(token, SESSION_SECRET);

    if (!payload || payload.role !== 'substitute') {
      console.log(`[substitute-session] [${requestId}] Invalid session token`);
      return jsonResponse(event, 401, { error: 'Invalid session' }, {}, requestId);
    }

    console.log(`[substitute-session] [${requestId}] Valid substitute session`);

    return jsonResponse(event, 200, { ok: true, role: 'substitute' }, {}, requestId);
  } catch (e) {
    console.error(`[substitute-session] [${requestId}] Error processing request:`, e.message);
    return jsonResponse(event, 401, { error: 'Session verification failed' }, {}, requestId);
  }
};

// Helper to extract cookie value
function getCookie(header, name) {
  if (!header) return '';
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const [k, ...v] = part.split('=');
    if (k === name) return v.join('=');
  }
  return '';
}
