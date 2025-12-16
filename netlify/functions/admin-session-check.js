// netlify/functions/admin-session-check.js
// Checks for an active admin session cookie and responds accordingly.
//
// NOTE: Login now sets rc_admin_session_v4. This endpoint must accept v4 first,
// then fall back to v3, v2, and legacy cookie names.

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

// Cookie name preference order (newest -> oldest)
const COOKIE_NAMES = [
  'rc_admin_session_v4',
  'rc_admin_session_v3',
  'rc_admin_session_v2',
  // legacy
  'rc_admin_session',
];

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((part) => {
    const [rawName, ...rest] = part.trim().split('=');
    if (!rawName) return;
    const name = rawName;
    const value = rest.join('=');
    cookies[name] = decodeURIComponent(value || '');
  });

  return cookies;
}

function getSessionTokenFromRequest(event) {
  const header = event.headers?.cookie || event.headers?.Cookie;
  const cookies = parseCookies(header);

  for (const name of COOKIE_NAMES) {
    if (cookies[name]) return { name, token: cookies[name] };
  }

  return { name: null, token: null };
}

exports.handler = async (event) => {
  try {
    const { token } = getSessionTokenFromRequest(event);

    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ ok: false, error: 'No admin session cookie found' }),
      };
    }

    if (!JWT_SECRET) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'Missing ADMIN_JWT_SECRET' }),
      };
    }

    // Verify the JWT session cookie
    jwt.verify(token, JWT_SECRET);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: 'Invalid admin session' }),
    };
  }
};
