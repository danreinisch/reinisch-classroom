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

  // Trim env values to avoid hidden whitespace mismatches
  const userEnv = (process.env.ADMIN_USER || '').trim();
  const passEnv = (process.env.ADMIN_PASS || '').trim();
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();

  if (!userEnv || !passEnv || !secret) {
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

  if (!safeEqual(inUser, userEnv) || !safeEqual(inPass, passEnv)) {
    // Safe diagnostic (no secrets): log only lengths
    console.log('admin-session invalid credentials', {
      uLen: inUser.length, envULen: userEnv.length,
      pLen: inPass.length, envPLen: passEnv.length
    });
    return json(401, { message: 'Invalid credentials' });
  }

  // Create signed session token valid for MAX_AGE_HOURS
  const exp = Math.floor(Date.now() / 1000) + Math.max(1, MAX_AGE_HOURS) * 3600;
  const payload = { u: userEnv, exp, n: crypto.randomBytes(8).toString('hex') };
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
  const token = b64url(payloadBuf) + '.' + b64url(signature);

  return {
    statusCode: 302,
    headers: {
      // If you want “login every time,” you can redirect to /admin/?s=1 as discussed earlier.
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

function safeEqual(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

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
