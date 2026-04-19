// Teacher session refresh endpoint
// POST /.netlify/functions/teacher-refresh
// Requires an existing valid tc HttpOnly cookie.
// Re-signs the JWT with the same payload (role, username, teacherId) and a fresh
// 8-hour expiry, then sets a new tc cookie.

console.log('[teacher-refresh] Module loaded successfully');

const { sign, teacherCookie, requireTeacher } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

const { SESSION_SECRET } = process.env;
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-refresh] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-refresh] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-refresh] [${requestId}] Server not configured: SESSION_SECRET missing`);
    return jsonResponse(event, 500, { error: 'Server not configured' }, {}, requestId);
  }

  // Body size guard — this endpoint expects an empty or near-empty body
  const bodySizeCheck = validateBodySize(event.body, 1);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-refresh] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Verify existing session
  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-refresh] [${requestId}] Unauthorized: no valid session`);
    return jsonResponse(event, 401, { ok: false, error: 'Session expired' }, {}, requestId);
  }

  // Re-sign with same payload fields, dropping iat/exp (sign() adds them fresh)
  const { iat, exp, ...payloadCore } = authResult.user;
  const newToken = sign(payloadCore, SESSION_SECRET, { expSec: SESSION_DURATION_SECONDS });

  // Match cookie secure flag to teacher-login.js: secure=false on localhost, true elsewhere
  const host = event.headers.host || '';
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const cookieHeader = teacherCookie('tc', newToken, {
    secure: !isLocalhost,
    maxAge: SESSION_DURATION_SECONDS,
  });

  // Decode the new token to extract exp for the response body
  const [, payloadB64] = newToken.split('.');
  const newPayload = JSON.parse(
    Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  );

  console.log(`[teacher-refresh] [${requestId}] Refreshed session for user: ${payloadCore.username}`);

  const securityHeaders = getSecurityHeaders(requestId);
  const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type']);

  return {
    statusCode: 200,
    headers: {
      ...securityHeaders,
      ...corsHeaders,
      'Set-Cookie': cookieHeader,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ok: true, exp: newPayload.exp }),
  };
};
