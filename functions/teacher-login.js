// POST body: { password }
// Sets HttpOnly cookie if password matches TEACHER_PASSWORD
const { sign, teacherCookie } = require('./_lib/auth');

const { TEACHER_PASSWORD, SESSION_SECRET } = process.env;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  if (!TEACHER_PASSWORD || !SESSION_SECRET) {
    return { statusCode: 500, headers: CORS, body: 'Server not configured' };
  }

  try {
    const { password } = JSON.parse(event.body || '{}');
    if (!password || password !== TEACHER_PASSWORD) {
      return { statusCode: 401, headers: CORS, body: 'Invalid password' };
    }
    const token = sign({ role: 'teacher' }, SESSION_SECRET, { expSec: 60 * 60 * 8 });
    const setCookie = teacherCookie('tc', token, { secure: true, maxAge: 60 * 60 * 8 });

    return {
      statusCode: 200,
      headers: { ...CORS, 'Set-Cookie': setCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: 'Bad request' };
  }
};
