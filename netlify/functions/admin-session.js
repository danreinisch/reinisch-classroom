// Login endpoint: verifies ADMIN_USER/ADMIN_PASS and sets a signed session cookie.
// Accepts POST as application/x-www-form-urlencoded or JSON { username, password }.
//
// Required env vars (Netlify → Environment variables):
// - ADMIN_USER (Secret ON, All scopes)
// - ADMIN_PASS (Secret ON, All scopes)
// - ADMIN_SESSION_SECRET (Secret ON, All scopes; random 32+ chars)
//
// Optional: MAX_AGE_HOURS (default 12)

const crypto = require('crypto');

const COOKIE_NAME = 'rc_admin_session';
const MAX_AGE_HOURS = Number(process.env.MAX_AGE_HOURS || 12);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'Method not allowed' });
  }

  const user = process.env.ADMIN_USER || '';
  const pass = process.env.ADMIN_PASS || '';
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  if (!user || !pass || !secret) {
    return json(503, { message: 'Admin not configured' });
  }

  let body = {};
  try {
    const ctype = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    if (ctype.includes('application/x-www-form-urlencoded')) {
      body = Object.fromEntries(new URLSearchParams(event.body || ''));
    } else {
      body = JSON.parse(event.body || '{}');
    }
  } catch {
    return json(400, { message: 'Invalid request body' });
  }

  const inUser = (body.username || '').trim();
  const inPass = (body.password || '').trim();
  if (inUser !== user || inPass !== pass) {
    return json(401, { message: 'Invalid credentials' });
  }

  // Create signed session token valid for MAX_AGE_HOURS
  const exp = Math.floor(Date.now() / 1000) + Math.max(1, MAX_AGE_HOURS) * 3600;
  const payload = { u: user, exp, n: crypto.randomBytes(8).toString('hex') };
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
  const token = b64url(payloadBuf) + '.' + b64url(signature);

  // Set HttpOnly session cookie and redirect to /admin
  return {
    statusCode: 302,
    headers: {
      Location: '/admin/',
      'Set-Cookie': serializeCookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: Math.max(1, MAX_AGE_HOURS) * 3600
      }),
      ...corsHeaders()
    }
  };
};

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
function json(status, data) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', ...corsHeaders() }, body: JSON.stringify(data) };
}
