// Teacher login endpoint
// POST body: { username, password }
// Uses Supabase RPC verify_user_password to authenticate
// Accepts roles: teacher, admin
// Sets HttpOnly cookie with SESSION_SECRET signing
const { sign, teacherCookie, getCookie } = require('./_lib/auth');
const { rest, jsonRes } = require('./_lib/supa');

// Session configuration
const SESSION_DURATION_HOURS = 8;
const SESSION_DURATION_SECONDS = SESSION_DURATION_HOURS * 60 * 60;

// Login attempt throttling configuration
const MAX_ATTEMPTS = 5;
const THROTTLE_WINDOW_SECONDS = 60;
const ATTEMPT_COOKIE_NAME = 'tc_attempts';

const { SESSION_SECRET } = process.env;
const SUPABASE_URL = process.env.SUPABASE_URL_RUNTIME || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY_RUNTIME || process.env.SUPABASE_SERVICE_KEY;

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
  if (!SESSION_SECRET) {
    console.error('[teacher-login] Server not configured: Missing SESSION_SECRET');
    return { 
      statusCode: 500, 
      headers: CORS, 
      body: JSON.stringify({ error: 'Server not configured' })
    };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[teacher-login] Supabase not configured: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return { 
      statusCode: 500, 
      headers: CORS, 
      body: JSON.stringify({ error: 'Authentication service not configured' })
    };
  }

  try {
    const { username, password } = JSON.parse(event.body || '{}');
    
    // Validate input
    if (!username || !password) {
      return { 
        statusCode: 401, 
        headers: CORS, 
        body: JSON.stringify({ error: 'Username and password required' })
      };
    }

    // Check login attempt throttling
    const attemptCookie = getCookie(event, ATTEMPT_COOKIE_NAME);
    if (attemptCookie) {
      try {
        const attempts = JSON.parse(Buffer.from(attemptCookie, 'base64').toString('utf8'));
        if (attempts.count >= MAX_ATTEMPTS && Date.now() - attempts.ts < THROTTLE_WINDOW_SECONDS * 1000) {
          console.log('[teacher-login] Too many attempts from client');
          return {
            statusCode: 429,
            headers: CORS,
            body: JSON.stringify({ error: 'Too many login attempts. Please wait a moment.' })
          };
        }
      } catch (err) {
        // Invalid cookie, ignore
      }
    }

    // Verify credentials via Supabase RPC
    const response = await rest('/rest/v1/rpc/verify_user_password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_username: username.trim().toLowerCase(),
        p_password: password
      })
    });

    const result = await jsonRes(response);

    if (!result.ok || !result.data || result.data.length === 0) {
      console.log('[teacher-login] Invalid credentials attempt for user:', username);
      
      // Update attempt cookie
      const newAttempts = {
        count: (attemptCookie ? JSON.parse(Buffer.from(attemptCookie, 'base64').toString('utf8')).count || 0 : 0) + 1,
        ts: Date.now()
      };
      const attemptCookieValue = Buffer.from(JSON.stringify(newAttempts)).toString('base64');
      
      return { 
        statusCode: 401, 
        headers: { 
          ...CORS,
          'Set-Cookie': teacherCookie(ATTEMPT_COOKIE_NAME, attemptCookieValue, { 
            secure: true, 
            maxAge: THROTTLE_WINDOW_SECONDS 
          })
        }, 
        body: JSON.stringify({ error: 'Invalid username or password' })
      };
    }

    const user = result.data[0];
    
    // Check if role is teacher or admin
    if (user.role !== 'teacher' && user.role !== 'admin') {
      console.log('[teacher-login] User', username, 'does not have teacher or admin role:', user.role);
      return {
        statusCode: 403,
        headers: CORS,
        body: JSON.stringify({ error: 'Access denied: insufficient permissions' })
      };
    }

    // Credentials valid - create session token
    const token = sign({ role: user.role, username: user.username }, SESSION_SECRET, { expSec: SESSION_DURATION_SECONDS });
    const setCookie = teacherCookie('tc', token, { secure: true, maxAge: SESSION_DURATION_SECONDS });
    
    // Clear attempt cookie on successful login
    const clearAttemptCookie = teacherCookie(ATTEMPT_COOKIE_NAME, '', { secure: true, maxAge: 0 });

    console.log('[teacher-login] Successful login for user:', username, 'with role:', user.role);
    
    return {
      statusCode: 200,
      headers: { 
        ...CORS, 
        'Set-Cookie': [setCookie, clearAttemptCookie].join(', '),
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ ok: true, username: user.username, role: user.role }),
    };
  } catch (e) {
    console.error('[teacher-login] Error processing request:', e.message);
    return { 
      statusCode: 500, 
      headers: CORS, 
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
