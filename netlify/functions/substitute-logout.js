// Substitute logout endpoint
// POST request
// Clears substitute session cookie

console.log('[substitute-logout] Module loaded successfully');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[substitute-logout] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[substitute-logout] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  try {
    console.log(`[substitute-logout] [${requestId}] Clearing substitute session`);

    // Create cookie with immediate expiry
    const clearCookie =
      'sub_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';

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
    console.error(`[substitute-logout] [${requestId}] Error processing request:`, e.message);
    return jsonResponse(event, 500, { error: 'Logout service error' }, {}, requestId);
  }
};
