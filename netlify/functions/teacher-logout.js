// Teacher logout endpoint
// POST request
// Clears teacher session cookie

console.log('[teacher-logout] Module loaded successfully');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-logout] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-logout] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  try {
    console.log(`[teacher-logout] [${requestId}] Clearing teacher session`);

    // Create cookie with immediate expiry
    const clearCookie = 'tc=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';

    const securityHeaders = getSecurityHeaders(requestId);
    const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type']);

    return {
      statusCode: 200,
      headers: {
        ...securityHeaders,
        ...corsHeaders,
        'Set-Cookie': clearCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ok: true, message: 'Logged out successfully' }),
    };
  } catch (e) {
    console.error(`[teacher-logout] [${requestId}] Error processing request:`, e.message);
    return jsonResponse(event, 500, { error: 'Logout service error' }, {}, requestId);
  }
};
