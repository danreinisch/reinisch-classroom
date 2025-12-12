// Session check endpoint: verifies signed cookie and returns 200 when logged in.
// Returns 401 when not authenticated or expired.
// Supports v4 access tokens, v1 refresh tokens, and legacy v1/v2/v3 cookies.
//
// Enhanced error handling:
// - Returns structured error responses with specific codes
// - Gracefully handles missing or malformed headers
// - Provides detailed error messages for debugging

const { verifySession, createErrorResponse } = require('./_lib/token-utils');

exports.handler = async (event) => {
  try {
    // Gracefully handle missing headers first
    if (!event.headers) {
      console.error('[admin-session-check] Missing headers object');
      return createErrorResponse(
        'INVALID_REQUEST',
        'Invalid request format',
        false,
        400
      );
    }

    const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
    
    // Check for missing configuration
    if (!secret) {
      console.error('[admin-session-check] Missing ADMIN_SESSION_SECRET');
      return createErrorResponse(
        'SERVER_NOT_CONFIGURED',
        'Admin authentication not configured',
        false,
        503
      );
    }

    // Verify session using shared utility (supports v4, v1 refresh, and legacy tokens)
    const result = verifySession(event.headers, secret);

    if (!result.valid) {
      return createErrorResponse(
        'NO_VALID_SESSION',
        'No valid session found',
        false,
        401
      );
    }

    // Session is valid
    const response = { ok: true };
    
    // Include upgrade hint if using legacy token
    if (result.needsUpgrade) {
      response.needsUpgrade = true;
      response.legacyVersion = result.legacyVersion;
      console.log('[admin-session-check] Legacy token detected:', result.legacyVersion);
    }

    // Include refresh hint if access token expired but refresh is valid
    if (result.needsRefresh) {
      response.needsRefresh = true;
      console.log('[admin-session-check] Access token expired, refresh available');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify(response)
    };
  } catch (e) {
    console.error('[admin-session-check] Unexpected error:', e.message);
    return createErrorResponse(
      'SERVER_ERROR',
      'Internal server error',
      true,
      500
    );
  }
};
