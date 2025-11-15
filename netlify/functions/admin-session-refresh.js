// Explicit session refresh endpoint
// Uses refresh token to issue a new access token (sliding window)
// Returns JSON with new expiry and success status

const {
  parseCookies,
  verifyToken,
  refreshAccessToken,
  createErrorResponse,
  serializeCookie,
  COOKIE_V4_ACCESS
} = require('./_lib/token-utils');

exports.handler = async (event) => {
  // Allow preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { 'Cache-Control': 'no-store' }
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Method not allowed',
      false,
      405
    );
  }

  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!secret) {
    console.error('[admin-session-refresh] Missing ADMIN_SESSION_SECRET');
    return createErrorResponse(
      'SERVER_ERROR',
      'Server configuration error',
      false,
      503
    );
  }

  const cookies = parseCookies(event.headers);

  // Must have a refresh token
  if (!cookies.refresh) {
    return createErrorResponse(
      'NO_REFRESH_TOKEN',
      'No refresh token found',
      false,
      401
    );
  }

  // Attempt to refresh access token
  const result = refreshAccessToken(cookies.refresh, secret);
  
  if (!result) {
    return createErrorResponse(
      'INVALID_REFRESH_TOKEN',
      'Refresh token is invalid or expired',
      false,
      401
    );
  }

  console.log('[admin-session-refresh] Refreshed access token, new TTL:', result.accessTTL, 's');

  // Set new access cookie
  const accessCookie = serializeCookie(COOKIE_V4_ACCESS, result.accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: result.accessTTL
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': accessCookie,
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      refreshed: true,
      expiresIn: result.accessTTL,
      expiresAt: result.accessExp
    })
  };
};
