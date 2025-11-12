// Teacher login endpoint
// POST body: { username, password }
// Authenticates against Supabase app_users table (roles: teacher, admin)
// Sets HttpOnly cookie if credentials are valid
const { sign, teacherCookie } = require('./_lib/auth');
const { rpc, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('./_lib/supa');

// Session configuration
const SESSION_DURATION_HOURS = 8;
const SESSION_DURATION_SECONDS = SESSION_DURATION_HOURS * 60 * 60;
const THROTTLE_WINDOW_SECONDS = 60; // 1 minute window for throttling

const { SESSION_SECRET } = process.env;

// CORS configuration
// Note: Allows all origins (*) for development/testing
// For production, consider restricting to specific domain(s):
// 'Access-Control-Allow-Origin': 'https://yourdomain.com'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SESSION_SECRET) {
    console.error('[teacher-login] Server not configured: Missing required Supabase or session configuration');
    return { 
      statusCode: 500, 
      headers: CORS, 
      body: JSON.stringify({ error: 'Server not configured' })
    };
  }

  try {
    const { username, password } = JSON.parse(event.body || '{}');
    
    // Validate credentials (no logging of actual values for security)
    if (!username || !password) {
      return { 
        statusCode: 401, 
        headers: CORS, 
        body: JSON.stringify({ error: 'Username and password required' })
      };
    }

    // Dev bootstrap: allow 'teacher_local' on localhost only
    const host = event.headers.host || event.headers.Host || '';
    const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    
    if (username === 'teacher_local' && isLocalhost) {
      // Accept any password for teacher_local on localhost (dev only)
      const token = sign({ role: 'teacher', username: 'teacher_local' }, SESSION_SECRET, { expSec: SESSION_DURATION_SECONDS });
      const setCookie = teacherCookie('tc', token, { secure: false, maxAge: SESSION_DURATION_SECONDS });
      
      console.log('[teacher-login] Dev mode: teacher_local login on localhost');
      
      return {
        statusCode: 200,
        headers: { 
          ...CORS, 
          'Set-Cookie': setCookie, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ ok: true, username: 'teacher_local' }),
      };
    }

    // Check throttling (per-IP attempt limit via cookie)
    const clientIp = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'] || 'unknown';
    const throttleResult = checkThrottle(event, clientIp);
    if (!throttleResult.allowed) {
      console.log('[teacher-login] Throttled login attempt from', clientIp);
      return {
        statusCode: 429,
        headers: CORS,
        body: JSON.stringify({ error: 'Too many attempts. Please try again in a moment.' })
      };
    }
    
    // Verify credentials via Supabase RPC
    const verifyRes = await rpc('verify_user_password', {
      p_username: username,
      p_password: password
    });

    if (!verifyRes.ok) {
      console.error('[teacher-login] Supabase RPC error - status:', verifyRes.status);
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ error: 'Authentication service unavailable' })
      };
    }

    const users = await verifyRes.json();
    
    // verify_user_password returns empty array if credentials invalid
    if (!Array.isArray(users) || users.length === 0) {
      console.log('[teacher-login] Invalid credentials attempt for username:', username);
      // Set throttle cookie
      return { 
        statusCode: 401, 
        headers: { 
          ...CORS,
          'Set-Cookie': createThrottleCookie(clientIp)
        }, 
        body: JSON.stringify({ error: 'Invalid username or password' })
      };
    }

    const user = users[0];
    
    // Only allow teacher or admin roles
    if (user.role !== 'teacher' && user.role !== 'admin') {
      console.log('[teacher-login] User has invalid role for teacher login:', user.role);
      return {
        statusCode: 403,
        headers: CORS,
        body: JSON.stringify({ error: 'Access denied' })
      };
    }
    
    // Credentials valid - create session token
    const token = sign({ role: user.role, username: user.username }, SESSION_SECRET, { expSec: SESSION_DURATION_SECONDS });
    const setCookie = teacherCookie('tc', token, { secure: true, maxAge: SESSION_DURATION_SECONDS });

    console.log('[teacher-login] Successful login for user:', user.username, 'role:', user.role);
    
    return {
      statusCode: 200,
      headers: { 
        ...CORS, 
        'Set-Cookie': setCookie, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ ok: true, username: user.username }),
    };
  } catch (e) {
    console.error('[teacher-login] Error processing request:', e.message);
    return { 
      statusCode: 400, 
      headers: CORS, 
      body: JSON.stringify({ error: 'Bad request' })
    };
  }
};

// Simple per-IP throttling using cookies
function checkThrottle(event, clientIp) {
  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
  const throttleCookie = getCookie(cookieHeader, 'tc_throttle');
  
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
  return `tc_throttle=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${THROTTLE_WINDOW_SECONDS}`;
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
