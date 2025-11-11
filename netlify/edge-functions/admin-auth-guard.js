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

const COOKIE_NAME = 'rc_admin_session_v3'; // updated for Supabase-backed auth
const ALGO = { name: 'HMAC', hash: 'SHA-256' };
const ALLOWED_ROLES = new Set(['admin', 'teacher']);

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
  const secret = context.env?.ADMIN_SESSION_SECRET;
  if (!secret) {
    return unauthorized();
  }

  // Check signed session cookie
  const token = getCookie(request.headers.get('cookie') || '', COOKIE_NAME);
  if (!token) return redirectToLogin();

  try {
    const payload = await verifyToken(token, secret);
    if (!payload) return redirectToLogin();
    
    // Validate role is allowed
    if (!payload.r || !ALLOWED_ROLES.has(payload.r)) {
      console.log('admin-auth-guard: Invalid role', payload.r);
      return redirectToLogin();
    }
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
// payload = JSON { u: string, r: string, exp: number (epoch seconds), n: string }
async function verifyToken(token, secret) {
  const idx = token.indexOf('.');
  if (idx <= 0) return null;
  const payloadB64 = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);

  const payloadRaw = b64urlDecode(payloadB64);
  const data = JSON.parse(new TextDecoder().decode(payloadRaw));

  if (!data || typeof data.exp !== 'number') return null;
  const now = Math.floor(Date.now() / 1000);
  if (data.exp <= now) return null; // expired

  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    ALGO,
    key,
    b64urlToBytes(sigB64),
    payloadRaw
  );
  return valid ? data : null;
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
