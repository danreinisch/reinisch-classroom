// POST { username, password } -> sets HttpOnly cookie if valid
const { sign, teacherCookie } = require('./_lib/auth');
const { TEACHER_USERNAME, TEACHER_PASSWORD, SESSION_SECRET, URL } = process.env;

// Use environment-based CORS origin for security
// In production, Netlify sets URL automatically. Only fallback to * for local dev.
const ALLOWED_ORIGIN = URL || (process.env.NODE_ENV === 'production' ? '' : '*');
const CORS = { 
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  // In production, require environment variables to be set
  const USER = TEACHER_USERNAME;
  const PASS = TEACHER_PASSWORD;
  const SECRET = SESSION_SECRET;

  if (!SECRET) return { statusCode: 500, headers: CORS, body: 'Server not configured - SESSION_SECRET required' };
  if (!USER || !PASS) return { statusCode: 500, headers: CORS, body: 'Server not configured - credentials required' };

  try {
    const { username, password } = JSON.parse(event.body || '{}');
    if (!username || !password) return { statusCode: 400, headers: CORS, body: 'Missing credentials' };
    if (username !== USER || password !== PASS) return { statusCode: 401, headers: CORS, body: 'Invalid credentials' };

    const token = sign({ role: 'teacher', user: username }, SECRET, { expSec: 60 * 60 * 8 });
    const setCookie = teacherCookie('tc', token, { secure: true, maxAge: 60 * 60 * 8 });

    return { statusCode: 200, headers: { ...CORS, 'Set-Cookie': setCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (e) { 
    console.error('[teacher-login] Error:', e);
    return { statusCode: 400, headers: CORS, body: 'Bad request' }; 
  }
};
