// Edge guard: requires a valid signed session cookie to access /admin/*
// If missing/invalid, redirects to /admin-login.
//
// Required env vars (Netlify → Environment variables):
// - ADMIN_SESSION_SECRET (random 32+ char string, used to sign cookies)
//
// Note: This guard protects:
//   - /admin and /admin/*
//   - /.netlify/functions/incremental-deploy
// It allows these without a session:
//   - /admin-login (login page and its assets)
//   - /edge-ping (health check)
//
// Cookie versions supported: v3 (Supabase-based), v2, v1 (legacy)

const COOKIE_NAME_V3 = 'rc_admin_session_v3';
const COOKIE_NAME_V2 = 'rc_admin_session_v2';
const COOKIE_NAME_LEGACY = 'rc_admin_session';
const ALGO = { name: 'HMAC', hash: 'SHA-256' };

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Allow the login page and health check without a session
  if (path === '/admin-login' || path.startsWith('/admin-login/')
      || path === '/edge-ping') {
    return context.next();
  }

  // Only guard these routes
  const isAdminArea = path === '/admin' || path.startsWith('/admin/');
  const isUploadFn  = path === '/.netlify/functions/incremental-deploy';
  if (!isAdminArea && !isUploadFn) {
    return context.next();
  }

  // If ADMIN_SESSION_SECRET not configured, fail closed
  const configured = !!(context.env?.ADMIN_SESSION_SECRET);
  if (!configured) {
    return unauthorized();
  }

  // Check signed session cookie (try v3, then v2, then legacy)
  const cookieHeader = request.headers.get('cookie') || '';
  let token = getCookie(cookieHeader, COOKIE_NAME_V3);
  if (!token) token = getCookie(cookieHeader, COOKIE_NAME_V2);
  if (!token) token = getCookie(cookieHeader, COOKIE_NAME_LEGACY);
  
  if (!token) return redirectToLogin();

  try {
    const ok = await verifyToken(token, context.env.ADMIN_SESSION_SECRET);
    if (!ok) return redirectToLogin();
  } catch {
    return redirectToLogin();
  }

  // Valid session → allow
  return context.next();
};

function redirectToLogin() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin-login',
      'Cache-Control': 'no-store'
    }
  });
}

function unauthorized() {
  return new Response('Admin not configured', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function getCookie(header, name) {
  if (!header) return '';
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    const [k, ...v] = p.split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

// Token format: <b64url(payload)>.<b64url(signature)>
// payload = JSON { u: string, exp: number (epoch seconds), n: string }
async function verifyToken(token, secret) {
  const idx = token.indexOf('.');
  if (idx <= 0) return false;
  const payloadB64 = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);

  const payloadRaw = b64urlDecode(payloadB64);
  const data = JSON.parse(new TextDecoder().decode(payloadRaw));

  if (!data || typeof data.exp !== 'number') return false;
  const now = Math.floor(Date.now() / 1000);
  if (data.exp <= now) return false; // expired

  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    ALGO,
    key,
    b64urlToBytes(sigB64),
    payloadRaw
  );
  return !!valid;
}

async function importKey(secret) {
  const enc = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', enc, ALGO, false, ['sign', 'verify']);
}

function b64urlToBytes(b64url) {
  return b64urlDecode(b64url); // returns Uint8Array
}

function b64urlDecode(str) {
  // Add padding and replace URL chars
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
