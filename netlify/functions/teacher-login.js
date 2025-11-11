// Teacher login endpoint
// POST body: { username, password }
// Verifies credentials via Supabase RPC and sets HttpOnly cookie
const { sign, teacherCookie } = require('./_lib/auth');
const { rpc } = require('./_lib/supa');

// Session configuration
const SESSION_DURATION_HOURS = 8;
const SESSION_DURATION_SECONDS = SESSION_DURATION_HOURS * 60 * 60;

const { SESSION_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

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

  // Check if environment variables are configured
  if (!SESSION_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[teacher-login] Server not configured: Missing required environment variables');
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
    
    // Verify credentials via Supabase RPC
    const { ok, data } = await rpc('verify_user_password', {
      p_username: username,
      p_password: password
    });

    if (!ok) {
      console.error('[teacher-login] Supabase RPC error:', data);
      return { 
        statusCode: 502, 
        headers: CORS, 
        body: JSON.stringify({ error: 'Authentication service error' })
      };
    }

    // Check if user was found and has appropriate role
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[teacher-login] Invalid credentials attempt for username:', username);
      return { 
        statusCode: 401, 
        headers: CORS, 
        body: JSON.stringify({ error: 'Invalid username or password' })
      };
    }

    const user = data[0];
    
    // Accept both 'teacher' and 'admin' roles for Teacher Center access
    if (user.role !== 'teacher' && user.role !== 'admin') {
      console.log('[teacher-login] Access denied - invalid role:', user.role);
      return { 
        statusCode: 401, 
        headers: CORS, 
        body: JSON.stringify({ error: 'Invalid username or password' })
      };
    }
    
    // Credentials valid - create session token
    const token = sign({ role: user.role, username: user.username }, SESSION_SECRET, { expSec: SESSION_DURATION_SECONDS });
    const setCookie = teacherCookie('tc', token, { secure: true, maxAge: SESSION_DURATION_SECONDS });

    console.log('[teacher-login] Successful login for user:', username, 'role:', user.role);
    
    return {
      statusCode: 200,
      headers: { 
        ...CORS, 
        'Set-Cookie': setCookie, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ ok: true, username: user.username, role: user.role }),
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
