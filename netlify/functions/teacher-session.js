// GET -> verifies teacher session via HttpOnly cookie
const { requireTeacher } = require('./_lib/auth');
const { SESSION_SECRET } = process.env;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const secret = SESSION_SECRET; 
  if (!secret) return { statusCode: 500, headers: CORS, body: 'Server not configured' };

  const check = requireTeacher(event, secret); 
  if (!check.ok) return { statusCode: 401, headers: CORS, body: 'Unauthorized' };

  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, user: { role: 'teacher' } }) };
};
