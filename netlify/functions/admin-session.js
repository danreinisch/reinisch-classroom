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
const THROTTLE_WINDOW_SECONDS = 60; // 1 minute window for throttling
const INVALID_CREDS_DELAY_MS = 150 + Math.floor(Math.random() * 150); // 150-300ms delay

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

  // Check throttling (per-IP attempt limit via cookie)
  const clientIp = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'] || 'unknown';
  const throttleResult = checkThrottle(event, clientIp);
  if (!throttleResult.allowed) {
    console.log('[admin-session] Throttled login attempt from', clientIp);
    return redirect('/admin-login?e=1');
  }

  // Verify credentials via Supabase RPC
  try {
    const verifyRes = await rpc('verify_user_password', {
      p_username: inUser,
      p_password: inPass
    });

    if (!verifyRes.ok) {
      console.error('[admin-session] Supabase RPC error - status:', verifyRes.status);
      return redirect('/admin-login?e=1');
    }

    const users = await verifyRes.json();
    
    // verify_user_password returns empty array if credentials invalid
    if (!Array.isArray(users) || users.length === 0) {
      console.log('[admin-session] Invalid credentials attempt for username:', inUser);
      
      // Add fixed delay to reduce brute-force timing attacks
      await new Promise(resolve => setTimeout(resolve, INVALID_CREDS_DELAY_MS));
      
      // Set throttle cookie and redirect
      return {
        statusCode: 302,
        headers: {
          Location: '/admin-login?e=1',
          'Set-Cookie': createThrottleCookie(clientIp),
          'Cache-Control': 'no-store'
        }
      };
    }

    const user = users[0];
    
    // Only allow teacher or admin roles for admin panel
    if (user.role !== 'teacher' && user.role !== 'admin') {
      console.log('[admin-session] User has invalid role for admin access:', user.role);
      return redirect('/admin-login?e=1');
    }

    // Create signed session token
    // Note: Password verification already completed via Supabase bcrypt check above.
    // This HMAC is for session token integrity, not password hashing.
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

// Simple per-IP throttling using cookies
function checkThrottle(event, clientIp) {
  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
  const throttleCookie = getCookie(cookieHeader, 'admin_throttle');
  
  if (!throttleCookie) {
    return { allowed: true };
  }

  // Check if throttle is still active
  try {
    const [timestamp, ip] = throttleCookie.split('_');
    const throttleTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    
    if (ip === hashIp(clientIp) && (now - throttleTime) < THROTTLE_WINDOW_SECONDS) {
      return { allowed: false };
    }
  } catch (e) {
    // Invalid cookie, allow
  }
  
  return { allowed: true };
}

function createThrottleCookie(clientIp) {
  const timestamp = Math.floor(Date.now() / 1000);
  const value = `${timestamp}_${hashIp(clientIp)}`;
  return `admin_throttle=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${THROTTLE_WINDOW_SECONDS}`;
}

function getCookie(header, name) {
  if (!header) return '';
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const [k, ...v] = part.split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

// Simple hash for IP (not cryptographic, just for cookie storage)
function hashIp(ip) {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
