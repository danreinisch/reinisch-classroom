// Edge guard: requires a valid signed session cookie to access /admin/*
// Session Hardening (v4): Supports dual-token with auto-refresh
// If access token expired but refresh valid, issues new access token (sliding window)
//
// Required env vars (Netlify → Environment variables):
// - ADMIN_SESSION_SECRET (random 32+ char string, used to sign cookies)
//
// Optional:
// - ADMIN_ACCEPT_LEGACY (default true) - Accept legacy v1/v2/v3 cookies
// - ADMIN_SESSION_LOG (default 0) - Enable diagnostic logging
//
// Note: This guard protects:
//   - /admin and /admin/*
//   - /.netlify/functions/incremental-deploy
// It allows these without a session:
//   - /admin-login (login page and its assets)
//   - /edge-ping (health check)
//
// Token versions supported:
//   - v4 (access token, short-lived ~30min)
//   - v1 refresh (refresh token, long-lived ~24h)
//   - v3/v2/v1 (legacy, if ADMIN_ACCEPT_LEGACY=true)

const COOKIE_V4_ACCESS = 'rc_admin_session_v4';
const COOKIE_V1_REFRESH = 'rc_admin_refresh_v1';
const COOKIE_V3_LEGACY = 'rc_admin_session_v3';
const COOKIE_V2_LEGACY = 'rc_admin_session_v2';
const COOKIE_V1_LEGACY = 'rc_admin_session';
const ALGO = { name: 'HMAC', hash: 'SHA-256' };
const ACCESS_TOKEN_TTL_SECONDS = 1800; // 30 minutes (must match token-utils default)

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Allow the login page and health check without a session
  // Note: /admin-not-configured is kept accessible for backwards compatibility
  if (path === '/admin-login' || path.startsWith('/admin-login/')
      || path === '/admin-not-configured' || path.startsWith('/admin-not-configured/')
      || path === '/edge-ping') {
    return context.next();
  }

  // Only guard these routes
  const isAdminArea = path === '/admin' || path.startsWith('/admin/');
  const isUploadFn  = path === '/.netlify/functions/incremental-deploy';
  if (!isAdminArea && !isUploadFn) {
    return context.next();
  }

  // If ADMIN_SESSION_SECRET not configured, redirect to login page
  // The login page will display a setup-required message via admin-session-check
  const configured = !!(context.env?.ADMIN_SESSION_SECRET);
  if (!configured) {
    return redirectToLogin();
  }

  const acceptLegacy = String(context.env?.ADMIN_ACCEPT_LEGACY || 'true').toLowerCase() === 'true';
  const enableLog = String(context.env?.ADMIN_SESSION_LOG || '0').trim() === '1';
  const isApiRequest = request.headers.get('accept')?.includes('application/json');

  // Parse cookies
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = {
    access: getCookie(cookieHeader, COOKIE_V4_ACCESS),
    refresh: getCookie(cookieHeader, COOKIE_V1_REFRESH),
    legacy: {
      v3: getCookie(cookieHeader, COOKIE_V3_LEGACY),
      v2: getCookie(cookieHeader, COOKIE_V2_LEGACY),
      v1: getCookie(cookieHeader, COOKIE_V1_LEGACY)
    }
  };

  const secret = context.env.ADMIN_SESSION_SECRET;

  // Try v4 access token first
  if (cookies.access) {
    try {
      const payload = await verifyToken(cookies.access, secret);
      if (payload && payload.ver === 'v4') {
        // Valid access token
        if (enableLog) {
          const remainingTTL = payload.exp - Math.floor(Date.now() / 1000);
          console.log('[admin-auth-guard] Valid v4 access token, remaining:', remainingTTL, 's');
        }
        return addDiagnosticHeader(context.next(), 'valid-v4');
      }
    } catch {
      // Invalid access token, try refresh
    }
  }

  // Access token missing/expired, try refresh token
  if (cookies.refresh) {
    try {
      const refreshPayload = await verifyToken(cookies.refresh, secret);
      if (refreshPayload && refreshPayload.ver === 'v1') {
        // Refresh token valid, issue new access token (sliding window)
        const newAccess = await createAccessToken(refreshPayload, secret);
        
        if (enableLog) {
          console.log('[admin-auth-guard] Auto-refreshed access token via refresh token');
        }

        // Set new access cookie and continue
        const response = context.next();
        response.headers.set('Set-Cookie', serializeCookie(COOKIE_V4_ACCESS, newAccess.token, {
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
          path: '/',
          maxAge: ACCESS_TOKEN_TTL_SECONDS
        }));
        return addDiagnosticHeader(response, 'refreshed');
      }
    } catch {
      // Refresh token invalid
    }
  }

  // Try legacy cookies if enabled
  if (acceptLegacy) {
    const legacyChecks = [
      { token: cookies.legacy.v3, version: 'v3' },
      { token: cookies.legacy.v2, version: 'v2' },
      { token: cookies.legacy.v1, version: 'v1' }
    ];

    for (const { token, version } of legacyChecks) {
      if (token) {
        try {
          const payload = await verifyToken(token, secret);
          if (payload) {
            if (enableLog) {
              console.log('[admin-auth-guard] Legacy session detected (version:', version, '), allowing access');
            }
            return addDiagnosticHeader(context.next(), 'legacy-' + version);
          }
        } catch {
          // Invalid legacy token
        }
      }
    }
  }

  // No valid session found
  if (isApiRequest) {
    return unauthorizedJson('SESSION_EXPIRED', 'Session expired or invalid', true);
  }
  return redirectToLogin();
};

function redirectToLogin() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin-login',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex'
    }
  });
}

function redirectToNotConfigured() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin-not-configured/',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex'
    }
  });
}

function unauthorized() {
  return new Response('Admin not configured', {
    status: 503,
    headers: { 
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex'
    }
  });
}

function unauthorizedJson(code, message, retryable) {
  return new Response(JSON.stringify({ code, message, retryable }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

function addDiagnosticHeader(response, status) {
  response.headers.set('X-Admin-Session', status);
  return response;
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

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

// Token format: <b64url(payload)>.<b64url(signature)>
// payload = JSON { u: string, exp: number (epoch seconds), ver: string, ... }
async function verifyToken(token, secret) {
  try {
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
  } catch {
    return null;
  }
}

// Create a new access token from refresh payload
async function createAccessToken(refreshPayload, secret) {
  const now = Math.floor(Date.now() / 1000);
  const accessExp = now + ACCESS_TOKEN_TTL_SECONDS;

  const payload = {
    u: refreshPayload.u,
    role: refreshPayload.role,
    exp: accessExp,
    ver: 'v4',
    n: generateNonce(),
    iat: now
  };

  const payloadBuf = new TextEncoder().encode(JSON.stringify(payload));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(ALGO, key, payloadBuf);

  return {
    token: b64urlEncode(payloadBuf) + '.' + b64urlEncode(new Uint8Array(signature)),
    exp: accessExp
  };
}

function generateNonce() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function importKey(secret) {
  const enc = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', enc, ALGO, false, ['sign', 'verify']);
}

function b64urlToBytes(b64url) {
  return b64urlDecode(b64url); // returns Uint8Array
}

function b64urlEncode(bytes) {
  const bin = Array.from(bytes, b => String.fromCharCode(b)).join('');
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
