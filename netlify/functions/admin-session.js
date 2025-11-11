// Login endpoint: verifies credentials via Supabase and sets a signed session cookie.
// Accepts POST as application/x-www-form-urlencoded or JSON { username, password }.
//
// Required env vars (Netlify → Environment variables; Functions + Runtime scopes):
// - ADMIN_SESSION_SECRET (Secret ON; random 32+ chars)
// - SUPABASE_URL (or SUPABASE_URL_RUNTIME)
// - SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY_RUNTIME)
//
// Optional:
// - MAX_AGE_SECONDS (defaults to 28800 = 8 hours) — how long the session cookie lasts.

const crypto = require('crypto');
const { rpc, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('./_lib/supa');

const COOKIE_NAME = 'rc_admin_session_v3'; // new version for Supabase-based auth
const MAX_AGE_SECONDS = Number(process.env.MAX_AGE_SECONDS || 28800); // 8 hours default

exports.handler = async (event) => {
  // Allow preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' } };
  }

  // Redirect non-POST back to login
  if (event.httpMethod !== 'POST') {
    return redirect('/admin-login');
  }

  // Check if Supabase is configured
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !secret) {
    console.error('[admin-session] Missing Supabase or session configuration');
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

  // Verify credentials via Supabase RPC
  try {
    const verifyRes = await rpc('verify_user_password', {
      p_username: inUser,
      p_password: inPass
    });

    if (!verifyRes.ok) {
      console.error('[admin-session] Supabase RPC error:', verifyRes.status);
      return redirect('/admin-login?e=1');
    }

    const users = await verifyRes.json();
    
    // verify_user_password returns empty array if credentials invalid
    if (!Array.isArray(users) || users.length === 0) {
      console.log('[admin-session] Invalid credentials attempt for username:', inUser);
      return redirect('/admin-login?e=1');
    }

    const user = users[0];
    
    // Only allow teacher or admin roles for admin panel
    if (user.role !== 'teacher' && user.role !== 'admin') {
      console.log('[admin-session] User has invalid role for admin access:', user.role);
      return redirect('/admin-login?e=1');
    }

    // Create signed session token
    const exp = Math.floor(Date.now() / 1000) + Math.max(1, MAX_AGE_SECONDS);
    const payload = { 
      u: user.username, 
      role: user.role,
      exp, 
      n: crypto.randomBytes(8).toString('hex') 
    };
    const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
    const token = b64url(payloadBuf) + '.' + b64url(signature);

    console.log('[admin-session] Successful login for user:', user.username, 'role:', user.role);

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
  } catch (e) {
    console.error('[admin-session] Error during authentication:', e.message);
    return redirect('/admin-login?e=1');
  }
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
