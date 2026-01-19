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
