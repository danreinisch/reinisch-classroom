// Login endpoint: verifies credentials via Supabase RPC verify_user_password and sets a signed session cookie.
// Accepts POST as application/x-www-form-urlencoded or JSON { username, password }.
//
// Required env vars (Netlify → Environment variables; Functions + Runtime scopes):
// - ADMIN_SESSION_SECRET (Secret ON; random 32+ chars) — used to sign session cookies
// - SUPABASE_URL (runtime only)
// - SUPABASE_SERVICE_ROLE_KEY (runtime only)
//
// Optional:
// - MAX_AGE_SECONDS (defaults to 300) — how long the session cookie lasts. Default is 5 minutes.

const crypto = require('crypto');
const { rest, jsonRes } = require('./_lib/supa');

const COOKIE_NAME = 'rc_admin_session_v3'; // new name for Supabase-backed auth
const MAX_AGE_SECONDS = Number(process.env.MAX_AGE_SECONDS || 300);
const ALLOWED_ROLES = new Set(['admin', 'teacher']);

exports.handler = async (event) => {
  // Allow preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' } };
  }

  // Redirect non-POST back to login
  if (event.httpMethod !== 'POST') {
    return redirect('/admin-login');
  }

  // Check required env vars
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!secret || !supabaseUrl || !supabaseKey) {
    console.error('admin-session: Missing required env vars');
    return redirect('/admin-login?e=1');
  }

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

  if (!inUser || !inPass) {
    return redirect('/admin-login?e=1');
  }

  // Call Supabase RPC to verify credentials
  let userInfo;
  try {
    const res = await rest('/rest/v1/rpc/verify_user_password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_username: inUser, p_password: inPass })
    });
    const result = await jsonRes(res);
    
    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
      console.log('admin-session: Authentication failed for user', inUser);
      return redirect('/admin-login?e=1');
    }
    
    userInfo = result.data[0];
  } catch (err) {
    console.error('admin-session: Supabase RPC error', err);
    return redirect('/admin-login?e=1');
  }

  // Check if user role is allowed
  if (!userInfo.role || !ALLOWED_ROLES.has(userInfo.role)) {
    console.log('admin-session: User role not allowed', { username: inUser, role: userInfo.role });
    return redirect('/admin-login?e=1');
  }

  // Create signed session token with role included
  const exp = Math.floor(Date.now() / 1000) + Math.max(1, MAX_AGE_SECONDS);
  const payload = { 
    u: userInfo.username, 
    r: userInfo.role,
    exp, 
    n: crypto.randomBytes(8).toString('hex') 
  };
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
        maxAge: Math.max(1, MAX_AGE_SECONDS)
      }),
      'Cache-Control': 'no-store'
    }
  };
};

function redirect(to) {
  return { statusCode: 302, headers: { Location: to, 'Cache-Control': 'no-store' } };
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
