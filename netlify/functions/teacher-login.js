// Teacher login endpoint
// POST body: { username, password }
// Sets HttpOnly cookie if credentials match TEACHER_USERNAME and TEACHER_PASSWORD
const { sign, teacherCookie } = require('./_lib/auth');

// Session configuration
const SESSION_DURATION_HOURS = 8;
const SESSION_DURATION_SECONDS = SESSION_DURATION_HOURS * 60 * 60;

const { TEACHER_USERNAME, TEACHER_PASSWORD, SESSION_SECRET } = process.env;

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
  if (!TEACHER_USERNAME || !TEACHER_PASSWORD || !SESSION_SECRET) {
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
    
    if (username !== TEACHER_USERNAME || password !== TEACHER_PASSWORD) {
      console.log('[teacher-login] Invalid credentials attempt');
      return { 
        statusCode: 401, 
        headers: CORS, 
        body: JSON.stringify({ error: 'Invalid username or password' })
      };
    }
    
    // Credentials valid - create session token
    const token = sign({ role: 'teacher', username }, SESSION_SECRET, { expSec: SESSION_DURATION_SECONDS });
    const setCookie = teacherCookie('tc', token, { secure: true, maxAge: SESSION_DURATION_SECONDS });

    console.log('[teacher-login] Successful login');
    
    return {
      statusCode: 200,
      headers: { 
        ...CORS, 
        'Set-Cookie': setCookie, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ ok: true, username }),
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
