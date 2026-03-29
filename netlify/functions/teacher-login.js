// Teacher login endpoint
// POST body: { username, password }
// Authenticates against Supabase app_users table (roles: teacher, admin)
// Sets HttpOnly cookie if credentials are valid

// Module initialization log (printed once per cold start)
console.log('[teacher-login] Module loaded successfully');

const { sign, teacherCookie } = require('./_lib/auth');
const { rpc, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, lookupActiveTeacherId } = require('./_lib/supa');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
  validateStringField,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

// Session configuration
const SESSION_DURATION_HOURS = 8;
const SESSION_DURATION_SECONDS = SESSION_DURATION_HOURS * 60 * 60;
const THROTTLE_WINDOW_SECONDS = 60; // 1 minute window for throttling
const INVALID_CREDS_DELAY_MS = 150 + Math.floor(Math.random() * 150); // 150-300ms delay

const { SESSION_SECRET } = process.env;

// P0.1: Enhanced module-level diagnostics (no secrets logged)
console.log('[teacher-login] Environment check:', {
  SUPABASE_URL: !!SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
  SESSION_SECRET: !!SESSION_SECRET,
});

exports.handler = async (event) => {
  // P0.1: Top-level try-catch to prevent uncaught exceptions (502 errors)
  try {
    return await handleTeacherLogin(event);
  } catch (error) {
    // Catch-all for any uncaught errors
    const requestId = generateRequestId();
    console.error(`[teacher-login] [${requestId}] Uncaught error:`, {
      message: error.message,
      stack: error.stack,
    });
    return jsonResponse(event, 500, { error: 'Internal server error' }, {}, requestId);
  }
};

async function handleTeacherLogin(event) {
  const requestId = generateRequestId();
  const host = event.headers.host || 'unknown';
  const origin = event.headers.origin || 'none';
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  const bodyLength = event.body ? event.body.length : 0;
  
  // P0.1: Enhanced request logging
  console.log(`[teacher-login] [${requestId}] Request received:`, {
    host,
    origin,
    contentType,
    bodyLength,
    method: event.httpMethod,
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-login] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type (moved from below to avoid duplicate declaration)
  if (!contentType.includes('application/json')) {
    console.log(`[teacher-login] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Validate body size
  const bodySizeCheck = validateBodySize(event.body, 10);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-login] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { error: 'Request body too large' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-login] [${requestId}] Server not configured: Missing required Supabase configuration`);
    return jsonResponse(event, 500, { error: 'Server not configured' }, {}, requestId);
  }

  // Check if SESSION_SECRET is configured (explicit diagnostic)
  if (!SESSION_SECRET) {
    console.error(`[teacher-login] [${requestId}] Server not configured: SESSION_SECRET environment variable is missing`);
    return jsonResponse(event, 500, { error: 'Server not configured: SESSION_SECRET missing' }, {}, requestId);
  }

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-login] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { username, password } = parseResult.data;
  
  // Validate username field
  const usernameValidation = validateStringField(username, 'username', 1, 64);
  if (!usernameValidation.valid) {
    console.log(`[teacher-login] [${requestId}] Invalid username: ${usernameValidation.error}`);
    return jsonResponse(event, 400, { error: usernameValidation.error }, {}, requestId);
  }

  // Validate password field
  const passwordValidation = validateStringField(password, 'password', 1, 64);
  if (!passwordValidation.valid) {
    console.log(`[teacher-login] [${requestId}] Invalid password field format`);
    return jsonResponse(event, 400, { error: passwordValidation.error }, {}, requestId);
  }

  // Dev bootstrap: allow 'teacher_local' on localhost only
  // Host variable already declared at function start
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  
  if (username === 'teacher_local' && isLocalhost) {
    // Accept any password for teacher_local on localhost (dev only)
    const teacherIdDev = await lookupActiveTeacherId();
    console.log(`[teacher-login] [${requestId}] Dev mode: teacher_local teacherId: ${teacherIdDev ? teacherIdDev : 'none (lookupActiveTeacherId returned null)'}`);
    const token = sign({ role: 'teacher', username: 'teacher_local', teacherId: teacherIdDev }, SESSION_SECRET, { expSec: SESSION_DURATION_SECONDS });
    const setCookie = teacherCookie('tc', token, { secure: false, maxAge: SESSION_DURATION_SECONDS });
    
    console.log(`[teacher-login] [${requestId}] Dev mode: teacher_local login on localhost`);
    console.log(`[teacher-login] [${requestId}] Set-Cookie header will be sent (secure=false for localhost)`);
    
    const securityHeaders = getSecurityHeaders(requestId);
    const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type']);
    
    return {
      statusCode: 200,
      headers: { 
        ...securityHeaders,
        ...corsHeaders,
        'Set-Cookie': setCookie, 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ok: true, username: 'teacher_local' }),
    };
  }

  // Check throttling (per-IP attempt limit via cookie)
  const clientIp = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'] || 'unknown';
  const throttleResult = checkThrottle(event, clientIp);
  if (!throttleResult.allowed) {
    console.log(`[teacher-login] [${requestId}] Throttled login attempt from`, clientIp);
    return jsonResponse(event, 429, { error: 'Too many attempts. Please try again in a moment.' }, {}, requestId);
  }
  
  try {
    // Verify credentials via Supabase RPC
    const verifyRes = await rpc('verify_user_password', {
      p_username: username,
      p_password: password
    });

    // P0.1: Enhanced RPC error logging
    if (!verifyRes.ok) {
      console.error(`[teacher-login] [${requestId}] Supabase RPC error:`, {
        status: verifyRes.status,
        statusText: verifyRes.statusText,
      });
      
      // Try to parse error body (truncate to prevent log spam)
      try {
        const errorText = await verifyRes.text();
        const truncated = errorText.length > 500 ? errorText.substring(0, 500) + '...' : errorText;
        console.error(`[teacher-login] [${requestId}] RPC error body:`, truncated);
      } catch (parseErr) {
        console.error(`[teacher-login] [${requestId}] Could not parse RPC error body`);
      }
      
      return jsonResponse(event, 500, { error: 'Authentication service unavailable' }, {}, requestId);
    }

    const users = await verifyRes.json();
    
    // verify_user_password returns empty array if credentials invalid
    if (!Array.isArray(users) || users.length === 0) {
      console.log(`[teacher-login] [${requestId}] Invalid credentials attempt for username:`, username);
      
      // Add fixed delay to reduce brute-force timing attacks
      await new Promise(resolve => setTimeout(resolve, INVALID_CREDS_DELAY_MS));
      
      // Set throttle cookie
      const securityHeaders = getSecurityHeaders(requestId);
      const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type']);
      
      return { 
        statusCode: 401, 
        headers: { 
          ...securityHeaders,
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Set-Cookie': createThrottleCookie(clientIp)
        }, 
        body: JSON.stringify({ error: 'Invalid username or password' })
      };
    }

    const user = users[0];
    
    // Only allow teacher or admin roles
    if (user.role !== 'teacher' && user.role !== 'admin') {
      console.log(`[teacher-login] [${requestId}] User has invalid role for teacher login:`, user.role);
      return jsonResponse(event, 403, { error: 'Access denied' }, {}, requestId);
    }
    
    // Credentials valid - look up teacher UUID to embed in JWT for split-by-student issuance
    const teacherId = await lookupActiveTeacherId();
    if (teacherId) {
      console.log(`[teacher-login] [${requestId}] Resolved active teacher UUID: ${teacherId}`);
    } else {
      console.warn(`[teacher-login] [${requestId}] No active teacher record found; teacherId will not be embedded in JWT`);
    }

    // Create session token with teacherId (may be null if no teacher record found)
    const token = sign({ role: user.role, username: user.username, teacherId }, SESSION_SECRET, { expSec: SESSION_DURATION_SECONDS });
    const setCookie = teacherCookie('tc', token, { secure: true, maxAge: SESSION_DURATION_SECONDS });

    console.log(`[teacher-login] [${requestId}] Successful login for user:`, user.username, 'role:', user.role, 'teacherId:', teacherId ? 'present' : 'none');
    console.log(`[teacher-login] [${requestId}] Set-Cookie header will be sent (secure=true, SameSite=Lax, HttpOnly, Path=/)`);
    
    const securityHeaders = getSecurityHeaders(requestId);
    const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type']);
    
    return {
      statusCode: 200,
      headers: { 
        ...securityHeaders,
        ...corsHeaders,
        'Set-Cookie': setCookie, 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ok: true, username: user.username }),
    };
  } catch (e) {
    console.error(`[teacher-login] [${requestId}] Error processing request:`, e.message);
    return jsonResponse(event, 500, { error: 'Authentication service error' }, {}, requestId);
  }
}

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
