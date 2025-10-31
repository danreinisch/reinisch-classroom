// Session check endpoint: verifies signed cookie and returns 200 when logged in.
// Returns 401 when not authenticated or expired.

const crypto = require('crypto');

const COOKIE_NAME = 'rc_admin_session_v2'; // match the new cookie name

exports.handler = async (event) => {
  try {
    const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
    if (!secret) return json(503, { ok: false, message: 'Admin not configured' });

    const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
    const token = getCookie(cookieHeader, COOKIE_NAME);
    if (!token) return json(401, { ok: false, message: 'No session' });

    const ok = verifyToken(token, secret);
    if (!ok) return json(401, { ok: false, message: 'Invalid or expired session' });

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { ok: false, message: 'Server error' });
  }
};

function getCookie(header, name) {
  if (!header) return '';
  for (const part of header.split(/;\s*/)) {
    const [k, ...v] = part.split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

function verifyToken(token, secret) {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const payloadBuf = b64urlDecode(payloadB64);
  let data;
  try { data = JSON.parse(payloadBuf.toString('utf8')); } catch { return false; }

  if (!data || typeof data.exp !== 'number') return false;
  const now = Math.floor(Date.now() / 1000);
  if (data.exp <= now) return false;

  const expected = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
  const actual = b64urlDecode(sigB64);
  return crypto.timingSafeEqual(expected, actual);
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4;
  if (pad) str += '='.repeat(4 - pad);
  return Buffer.from(str, 'base64');
}

function json(status, data) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}
