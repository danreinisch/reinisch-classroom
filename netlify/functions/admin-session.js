// Login endpoint: verifies credentials via Supabase and sets dual-token session cookies.
// Accepts POST as application/x-www-form-urlencoded or JSON { username, password }.
//
// Session Hardening (v4):
// - Issues two cookies: rc_admin_session_v4 (access, 30min) + rc_admin_refresh_v1 (refresh, 24h)
// - Access token for API requests, refresh token for silent renewal
// - Supports legacy cookie upgrade (v1/v2/v3 → v4+refresh on next login)
//
// Required env vars (Netlify → Environment variables; Functions + Runtime scopes):
// - ADMIN_SESSION_SECRET (Secret ON; random 32+ chars)
// - SUPABASE_URL (or SUPABASE_URL_RUNTIME)
// - SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY_RUNTIME)
//
// Optional:
// - ACCESS_TOKEN_TTL_SECONDS (default 1800 = 30 minutes)
// - REFRESH_TOKEN_TTL_SECONDS (default 86400 = 24 hours)

const crypto = require('crypto');
const { rpc, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('./_lib/supa');
const { createTokenPair, createTokenCookies } = require('./_lib/token-utils');

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
    const missing = [];
    if (!SUPABASE_URL) missing.push('SUPABASE_URL/SUPABASE_URL_RUNTIME');
    if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY_RUNTIME');
    if (!secret) missing.push('ADMIN_SESSION_SECRET');
    console.error('[admin-session] Missing env vars:', missing.join(', '));
    return redirect('/admin-login?e=cfg');
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
  } catch (parseErr) {
    console.error('[admin-session] Body parsing failed:', parseErr.message);
    return redirect('/admin-login?e=parse');
  }

  if (!inUser || !inPass) {
    console.error('[admin-session] Missing username or password in request body');
    return redirect('/admin-login?e=parse');
  }

  // Check throttling (per-IP attempt limit via cookie)
  const clientIp = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'] || 'unknown';
  const throttleResult = checkThrottle(event, clientIp);
  if (!throttleResult.allowed) {
    console.log('[admin-session] Throttled login attempt from', clientIp);
    return redirect('/admin-login?e=throttle');
  }

  // Verify credentials via Supabase RPC
  try {
    const rpcFunctionName = 'verify_user_password';
    const verifyRes = await rpc(rpcFunctionName, {
      p_username: inUser,
      p_password: inPass
    });

    if (!verifyRes.ok) {
      console.error('[admin-session] Supabase RPC error - function:', rpcFunctionName, 'status:', verifyRes.status);
      
      // Log sanitized response body for debugging
      try {
        const responseText = await verifyRes.text();
        const truncatedResponse = responseText.substring(0, 500);
        console.error('[admin-session] RPC response body (truncated):', truncatedResponse);
      } catch (bodyErr) {
        console.error('[admin-session] Could not read RPC response body:', bodyErr.message);
      }
      
      return redirect(`/admin-login?e=rpc${verifyRes.status}`);
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
          Location: '/admin-login?e=creds',
          'Set-Cookie': createThrottleCookie(clientIp),
          'Cache-Control': 'no-store'
        }
      };
    }

    const user = users[0];
    
    // Only allow teacher or admin roles for admin panel
    if (user.role !== 'teacher' && user.role !== 'admin') {
      console.log('[admin-session] User has invalid role for admin access:', user.role);
      return redirect('/admin-login?e=role');
    }

    // Create dual-token session (access + refresh)
    const tokens = createTokenPair(user.username, user.role, secret);

    console.log('[admin-session] Successful login for user:', user.username, 'role:', user.role);
    console.log('[admin-session] Issued v4 access token (TTL:', tokens.accessTTL, 's) + v1 refresh token (TTL:', tokens.refreshTTL, 's)');

    // Set both cookies
    const cookies = createTokenCookies(
      tokens.accessToken,
      tokens.refreshToken,
      tokens.accessTTL,
      tokens.refreshTTL
    );

    return {
      statusCode: 302,
      headers: {
        Location: '/admin/',
        'Set-Cookie': cookies,
        'Cache-Control': 'no-store'
      }
    };
  } catch (e) {
    console.error('[admin-session] Error during authentication:', e.message);
    console.error('[admin-session] Error stack:', e.stack);
    return redirect('/admin-login?e=1');
  }
};

function redirect(to) {
  return { statusCode: 302, headers: { Location: to, 'Cache-Control': 'no-store' } };
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
