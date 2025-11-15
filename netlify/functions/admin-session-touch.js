// Lightweight session touch endpoint
// Extends access token TTL if it's close to expiration (< 5 minutes remaining)
// Returns current session info without unnecessary refresh

const {
  verifySession,
  refreshAccessToken,
  createErrorResponse,
  serializeCookie,
  COOKIE_V4_ACCESS,
  parseCookies
} = require('./_lib/token-utils');

const REFRESH_THRESHOLD_SECONDS = Number(process.env.SESSION_TOUCH_THRESHOLD || 300); // 5 minutes

exports.handler = async (event) => {
  // Allow preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { 'Cache-Control': 'no-store' }
    };
  }

  // Support both GET and POST
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Method not allowed',
      false,
      405
    );
  }

  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!secret) {
    console.error('[admin-session-touch] Missing ADMIN_SESSION_SECRET');
    return createErrorResponse(
      'SERVER_ERROR',
      'Server configuration error',
      false,
      503
    );
  }

  const sessionInfo = verifySession(event.headers, secret);

  if (!sessionInfo.valid) {
    return createErrorResponse(
      'SESSION_EXPIRED',
      'Session expired or invalid',
      true,
      401
    );
  }

  const { payload, remainingTTL, needsRefresh } = sessionInfo;
  const responseHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  // If remaining TTL is below threshold and we have refresh token, auto-refresh
  if (remainingTTL < REFRESH_THRESHOLD_SECONDS || needsRefresh) {
    const cookies = parseCookies(event.headers);
    
    if (cookies.refresh) {
      const result = refreshAccessToken(cookies.refresh, secret);
      
      if (result) {
        console.log('[admin-session-touch] Auto-refreshed access token (remaining:', remainingTTL, 's < threshold:', REFRESH_THRESHOLD_SECONDS, 's)');
        
        responseHeaders['Set-Cookie'] = serializeCookie(COOKIE_V4_ACCESS, result.accessToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
          path: '/',
          maxAge: result.accessTTL
        });

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({
            ok: true,
            touched: true,
            refreshed: true,
            username: payload.u,
            role: payload.role,
            expiresIn: result.accessTTL,
            expiresAt: result.accessExp
          })
        };
      }
    }
  }

  // No refresh needed, return current session info
  return {
    statusCode: 200,
    headers: responseHeaders,
    body: JSON.stringify({
      ok: true,
      touched: true,
      refreshed: false,
      username: payload.u,
      role: payload.role,
      expiresIn: remainingTTL,
      expiresAt: payload.exp
    })
  };
};
