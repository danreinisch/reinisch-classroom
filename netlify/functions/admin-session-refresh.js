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
  // RC_PREVIEW_TC_BYPASS_V1
  // Deploy previews: if TC cookie is valid (SESSION_SECRET), don't demand a separate admin-session cookie.
  try {
    const hdrs = event && event.headers ? event.headers : {};
    const host = String(hdrs['x-forwarded-host'] || hdrs.host || '');
    const isPreview = /deploy-preview-/.test(host) || host.includes('--') || host === 'localhost';

    if (isPreview) {
      const { requireTeacher } = require('./_lib/auth');
      const secret = String(process.env.SESSION_SECRET || '').trim();

      if (secret) {
        const tc = requireTeacher(event, secret);
        if (tc && tc.ok && tc.user && (tc.user.role === 'admin' || tc.user.role === 'teacher')) {
          const now = Math.floor(Date.now() / 1000);
          const ttl = tc.user.exp ? Math.max(0, tc.user.exp - now) : 0;

          return {
            statusCode: 200,
            headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
            body: JSON.stringify(
              { ok: true, source: 'tc', role: tc.user.role, username: tc.user.username, accessTTL: ttl },
              null,
              2
            ),
          };
        }
      }
    }
  } catch (e) {
    // fall through to existing logic
  }

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
