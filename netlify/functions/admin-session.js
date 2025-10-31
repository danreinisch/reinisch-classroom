// Login endpoint: verifies ADMIN_USER/ADMIN_PASS and sets a signed session cookie.
// Accepts POST as application/x-www-form-urlencoded or JSON { username, password }.
//
// Required env vars (Netlify → Environment variables; Functions + Runtime scopes):
// - ADMIN_USER (Secret ON)
// - ADMIN_PASS (Secret ON)
// - ADMIN_SESSION_SECRET (Secret ON; random 32+ chars)
//
// Optional:
// - MAX_AGE_SECONDS (defaults to 5) — how long the session cookie lasts. Keep it very short to force login each visit.

const crypto = require('crypto');

const COOKIE_NAME = 'rc_admin_session_v2'; // new name to invalidate any old sessions
const MAX_AGE_SECONDS = Number(process.env.MAX_AGE_SECONDS || 5);

exports.handler = async (event) => {
  // Allow preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' } };
  }

  // Redirect non-POST back to login
  if (event.httpMethod !== 'POST') {
    return redirect('/admin-login');
  }

  // Trim env values
  const userEnv = (process.env.ADMIN_USER || '').trim();
  const passEnv = (process.env.ADMIN_PASS || '').trim();
  const secret  = (process.env.ADMIN_SESSION_SECRET || '').trim();

  if (!userEnv || !passEnv || !secret) return redirect('/admin-login?e=1');

  // Robust body parsing (handles base64, form, and JSON)
  let inUser = '', inPass = '';
  try {
    const ctype = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    let raw = event.body || '';
    if (event.isBase64Encoded) {
      try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch {}
    }
    if (ctype.includes('application/x-www-form-urlencoded')) {
      const obj = Object.fromEntries(new URLSearchParams(raw || ''));
      inUser = (obj.username || '').trim();
      inPass = (obj.password || '').trim();
    } else {
      const obj = JSON.parse(raw || '{}');
      inUser = (obj.username || '').trim();
      inPass = (obj.password || '').trim();
    }
  } catch {
    return redirect('/admin-login?e=1');
  }

  if (!safeEqual(inUser, userEnv) || !safeEqual(inPass, passEnv)) {
    // Safe diagnostics (no secrets)
    console.log('admin-session invalid credentials', {
      uLen: inUser.length, envULen: userEnv.length,
      pLen: inPass.length, envPLen: passEnv.length
    });
    return redirect('/admin-login?e=1');
  }

  // Create signed session token with very short lifetime
  const exp = Math.floor(Date.now() / 1000) + Math.max(1, MAX_AGE_SECONDS);
  const payload = { u: userEnv, exp, n: crypto.randomBytes(8).toString('hex') };
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
  const token = b64url(payloadBuf) + '.' + b64url(signature);

  return {
    statusCode: 302,
    headers: {
      Location: '/admin/',
      'Set-Cookie': serializeCookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: Math.max(1, MAX_AGE_SECONDS) // keep tiny to force login each visit
      }),
      'Cache-Control': 'no-store'
    }
  };
};

function redirect(to) {
  return { statusCode: 302, headers: { Location: to, 'Cache-Control': 'no-store' } };
}

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
  if (opts.maxAge)   parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain)   parts.push(`Domain=${opts.domain}`);
  if (opts.path)     parts.push(`Path=${opts.path}`);
  if (opts.expires)  parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure)   parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}
