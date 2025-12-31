// Shared token utilities for dual-token session management
// Supports v4 access tokens (short-lived) and v1 refresh tokens (long-lived)
// Provides legacy cookie upgrade paths for v1/v2/v3 cookies

const crypto = require('crypto');

// Cookie names
const COOKIE_V4_ACCESS = 'rc_admin_session_v4';
const COOKIE_V1_REFRESH = 'rc_admin_refresh_v1';
const COOKIE_V3_LEGACY = 'rc_admin_session_v3';
const COOKIE_V2_LEGACY = 'rc_admin_session_v2';
const COOKIE_V1_LEGACY = 'rc_admin_session';

// Default TTLs
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 1800); // 30 minutes
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 86400); // 24 hours
const ACCEPT_LEGACY = String(process.env.ADMIN_ACCEPT_LEGACY || 'true').toLowerCase() === 'true';

/**
 * Encode a token with HMAC SHA-256 signature
 * @param {Object} payload - Token payload (u, exp, ver, n, roles, etc.)
 * @param {string} secret - HMAC secret
 * @returns {string} - Base64url encoded token
 */
function encodeToken(payload, secret) {
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
  return b64url(payloadBuf) + '.' + b64url(signature);
}

/**
 * Verify and decode a token
 * @param {string} token - Token to verify
 * @param {string} secret - HMAC secret
 * @returns {Object|null} - Decoded payload or null if invalid/expired
 */
function verifyToken(token, secret) {
  try {
    const dot = token.indexOf('.');
    if (dot <= 0) return null;

    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);

    const payloadBuf = b64urlDecode(payloadB64);
    const data = JSON.parse(payloadBuf.toString('utf8'));

    if (!data || typeof data.exp !== 'number') return null;

    const now = Math.floor(Date.now() / 1000);
    if (data.exp <= now) return null; // expired

    const expected = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
    const actual = b64urlDecode(sigB64);

    if (expected.length !== actual.length) return null;
    if (!crypto.timingSafeEqual(expected, actual)) return null;

    return data;
  } catch {
    return null;
  }
}

/**
 * Create access and refresh tokens for a user
 * @param {string} username - Username
 * @param {string} role - User role (admin, teacher)
 * @param {string} secret - HMAC secret
 * @param {Object} options - Custom TTLs (optional)
 * @returns {Object} - { accessToken, refreshToken, accessExp, refreshExp }
 */
function createTokenPair(username, role, secret, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const accessTTL = options.accessTTL || ACCESS_TOKEN_TTL_SECONDS;
  const refreshTTL = options.refreshTTL || REFRESH_TOKEN_TTL_SECONDS;

  const accessExp = now + accessTTL;
  const refreshExp = now + refreshTTL;

  const accessPayload = {
    u: username,
    role,
    exp: accessExp,
    ver: 'v4',
    n: crypto.randomBytes(8).toString('hex'),
    iat: now
  };

  const refreshPayload = {
    u: username,
    role,
    exp: refreshExp,
    ver: 'v1',
    jti: crypto.randomBytes(16).toString('hex'),
    iat: now
  };

  return {
    accessToken: encodeToken(accessPayload, secret),
    refreshToken: encodeToken(refreshPayload, secret),
    accessExp,
    refreshExp,
    accessTTL,
    refreshTTL
  };
}

/**
 * Refresh an access token using a valid refresh token
 * @param {string} refreshToken - Refresh token
 * @param {string} secret - HMAC secret
 * @param {Object} options - Custom access TTL (optional)
 * @returns {Object|null} - { accessToken, accessExp, accessTTL } or null if invalid
 */
function refreshAccessToken(refreshToken, secret, options = {}) {
  const refreshPayload = verifyToken(refreshToken, secret);
  if (!refreshPayload) return null;
  if (refreshPayload.ver !== 'v1') return null; // Must be refresh token

  const now = Math.floor(Date.now() / 1000);
  const accessTTL = options.accessTTL || ACCESS_TOKEN_TTL_SECONDS;
  const accessExp = now + accessTTL;

  const accessPayload = {
    u: refreshPayload.u,
    role: refreshPayload.role,
    exp: accessExp,
    ver: 'v4',
    n: crypto.randomBytes(8).toString('hex'),
    iat: now
  };

  return {
    accessToken: encodeToken(accessPayload, secret),
    accessExp,
    accessTTL
  };
}

/**
 * Parse cookies from request headers
 * @param {Object} headers - Request headers
 * @returns {Object} - Parsed cookies { access, refresh, legacy }
 */
function parseCookies(headers) {
  const cookieHeader = headers.cookie || headers.Cookie || '';
  
  return {
    access: getCookie(cookieHeader, COOKIE_V4_ACCESS),
    refresh: getCookie(cookieHeader, COOKIE_V1_REFRESH),
    legacy: {
      v3: getCookie(cookieHeader, COOKIE_V3_LEGACY),
      v2: getCookie(cookieHeader, COOKIE_V2_LEGACY),
      v1: getCookie(cookieHeader, COOKIE_V1_LEGACY)
    }
  };
}

/**
 * Verify session and handle legacy upgrade
 * @param {Object} headers - Request headers
 * @param {string} secret - HMAC secret
 * @returns {Object} - { valid, payload, needsUpgrade, legacyVersion, remainingTTL }
 */
function verifySession(headers, secret) {
  const cookies = parseCookies(headers);
  
  // Try v4 access token first
  if (cookies.access) {
    const payload = verifyToken(cookies.access, secret);
    if (payload && payload.ver === 'v4') {
      const remainingTTL = payload.exp - Math.floor(Date.now() / 1000);
      return { valid: true, payload, needsUpgrade: false, remainingTTL };
    }
  }

  // Try refresh token if access expired
  if (cookies.refresh) {
    const payload = verifyToken(cookies.refresh, secret);
    if (payload && payload.ver === 'v1') {
      const remainingTTL = payload.exp - Math.floor(Date.now() / 1000);
      return { 
        valid: true, 
        payload, 
        needsUpgrade: false, 
        needsRefresh: true, 
        remainingTTL 
      };
    }
  }

  // Try legacy cookies if enabled
  if (ACCEPT_LEGACY) {
    const legacyChecks = [
      { token: cookies.legacy.v3, version: 'v3' },
      { token: cookies.legacy.v2, version: 'v2' },
      { token: cookies.legacy.v1, version: 'v1' }
    ];

    for (const { token, version } of legacyChecks) {
      if (token) {
        const payload = verifyToken(token, secret);
        if (payload) {
          const remainingTTL = payload.exp - Math.floor(Date.now() / 1000);
          return { 
            valid: true, 
            payload, 
            needsUpgrade: true, 
            legacyVersion: version,
            remainingTTL
          };
        }
      }
    }
  }

  return { valid: false, needsUpgrade: false };
}

/**
 * Serialize a cookie with security attributes
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {Object} options - Cookie options
 * @returns {string} - Serialized Set-Cookie header value
 */
function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  // Domain attribute intentionally omitted (breaks Netlify deploy previews).
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

/**
 * Create Set-Cookie headers for token pair
 * @param {string} accessToken - Access token
 * @param {string} refreshToken - Refresh token
 * @param {number} accessTTL - Access token TTL in seconds
 * @param {number} refreshTTL - Refresh token TTL in seconds
 * @returns {Array<string>} - Array of Set-Cookie header values
 */
function createTokenCookies(accessToken, refreshToken, accessTTL, refreshTTL) {
  return [
    serializeCookie(COOKIE_V4_ACCESS, accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: accessTTL
    }),
    serializeCookie(COOKIE_V1_REFRESH, refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: refreshTTL
    })
  ];
}

/**
 * Create structured error response
 * @param {string} code - Error code (e.g., SESSION_EXPIRED, INVALID_SESSION)
 * @param {string} message - Human-readable message
 * @param {boolean} retryable - Whether the client should retry
 * @param {number} status - HTTP status code
 * @returns {Object} - Response object
 */
function createErrorResponse(code, message, retryable = false, status = 401) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({ code, message, retryable })
  };
}

/**
 * Get a cookie value from cookie header
 * @param {string} header - Cookie header string
 * @param {string} name - Cookie name
 * @returns {string} - Cookie value or empty string
 */
function getCookie(header, name) {
  if (!header) return '';
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const [k, ...v] = part.split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

/**
 * Base64url encode
 */
function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Base64url decode
 */
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4;
  if (pad) str += '='.repeat(4 - pad);
  return Buffer.from(str, 'base64');
}

module.exports = {
  // Constants
  COOKIE_V4_ACCESS,
  COOKIE_V1_REFRESH,
  COOKIE_V3_LEGACY,
  COOKIE_V2_LEGACY,
  COOKIE_V1_LEGACY,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  ACCEPT_LEGACY,
  
  // Core functions
  encodeToken,
  verifyToken,
  createTokenPair,
  refreshAccessToken,
  parseCookies,
  verifySession,
  serializeCookie,
  createTokenCookies,
  createErrorResponse,
  getCookie,
  b64url,
  b64urlDecode
};
