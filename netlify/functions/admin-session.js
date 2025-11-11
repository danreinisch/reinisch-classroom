// Login endpoint: verifies admin credentials via Supabase RPC verify_user_password and sets a signed session cookie.
// Accepts POST as application/x-www-form-urlencoded or JSON { username, password }.
//
// Required env vars (Netlify → Environment variables; Functions + Runtime scopes):
// - SUPABASE_URL (or SUPABASE_URL_RUNTIME) - Supabase project URL
// - SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_KEY_RUNTIME) - Supabase service role key
// - ADMIN_SESSION_SECRET (Secret ON; random 32+ chars) - Used to sign session cookies
//
// Optional:
// - ADMIN_SESSION_MAX_AGE (defaults to 300) — session cookie lifetime in seconds (minimum 60)
// - SUPABASE_URL_RUNTIME - Runtime override for SUPABASE_URL (takes precedence)
// - SUPABASE_SERVICE_KEY_RUNTIME - Runtime override for SUPABASE_SERVICE_KEY (takes precedence)

const crypto = require('crypto');

const COOKIE_NAME = 'rc_admin_session_v3'; // new name for Supabase-based auth
const DEFAULT_MAX_AGE = 300; // 5 minutes default session
const MIN_MAX_AGE = 60; // minimum 1 minute

// Resolve Supabase configuration with runtime override support
function resolveSupabaseConfig() {
  const url = (process.env.SUPABASE_URL_RUNTIME || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_KEY_RUNTIME || process.env.SUPABASE_SERVICE_KEY || '').trim();
  return { url, key };
}

// Get session max age from env or use default
function getMaxAge() {
  const envValue = process.env.ADMIN_SESSION_MAX_AGE;
  if (!envValue) return DEFAULT_MAX_AGE;
  const parsed = Number(envValue);
  if (isNaN(parsed) || parsed < MIN_MAX_AGE) {
    console.warn(`Invalid ADMIN_SESSION_MAX_AGE: ${envValue}, using default ${DEFAULT_MAX_AGE}`);
    return DEFAULT_MAX_AGE;
  }
  return parsed;
}

const MAX_AGE_SECONDS = getMaxAge();

exports.handler = async (event) => {
  // Allow preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' } };
  }

  // Redirect non-POST back to login
  if (event.httpMethod !== 'POST') {
    return redirect('/admin-login');
  }

  // Check required configuration
  const { url: supabaseUrl, key: supabaseKey } = resolveSupabaseConfig();
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();

  if (!supabaseUrl || !supabaseKey || !secret) {
    console.error('admin-session: Missing required config', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      hasSecret: !!secret
    });
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
    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/verify_user_password`;
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        p_username: inUser,
        p_password: inPass
      })
    });

    if (!response.ok) {
      console.error('admin-session: Supabase RPC failed', { status: response.status });
      return redirect('/admin-login?e=1');
    }

    const users = await response.json();
    
    // Check if we got a valid user back (verify_user_password returns array)
    if (!Array.isArray(users) || users.length === 0) {
      console.log('admin-session: Invalid credentials', { username: inUser });
      return redirect('/admin-login?e=1');
    }

    const user = users[0];
    
    // Only allow admin role
    if (user.role !== 'admin') {
      console.log('admin-session: Non-admin login attempt', { username: inUser, role: user.role });
      return redirect('/admin-login?e=1');
    }

    // Create signed session token
    const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
    const payload = { 
      u: user.username, 
      r: user.role,
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
          maxAge: MAX_AGE_SECONDS
        }),
        'Cache-Control': 'no-store'
      }
    };
  } catch (error) {
    console.error('admin-session: Error during authentication', { error: error.message });
    return redirect('/admin-login?e=1');
  }
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
