// Teacher session verification endpoint
// GET - verifies HttpOnly cookie and returns session status
const { requireTeacher } = require('./_lib/auth');

const { SESSION_SECRET } = process.env;

// CORS configuration
// Note: Allows all origins (*) for development/testing
// For production, consider restricting to specific domain(s):
// 'Access-Control-Allow-Origin': 'https://yourdomain.com'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  // Check if environment variable is configured
  if (!SESSION_SECRET) {
    console.error('[teacher-session] Server not configured: Missing SESSION_SECRET');
    return { 
      statusCode: 500, 
      headers: CORS, 
      body: JSON.stringify({ error: 'Server not configured' })
    };
  }

  // Verify session
  const result = requireTeacher(event, SESSION_SECRET);
  
  if (!result.ok) {
    return {
      statusCode: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Unauthorized' })
    };
  }
  
  // Session is valid
  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      ok: true, 
      role: result.user.role,
      username: result.user.username 
    })
  };
};
